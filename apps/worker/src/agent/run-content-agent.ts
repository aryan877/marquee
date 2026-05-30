import { Effect, Duration, Schedule } from 'effect';
import { Agent, Runner, type FunctionTool } from '@openai/agents';
import { ProgressStep } from '@marquee/shared/progress';
import { AppConfig } from '../config.js';
import { Supabase } from '../lib/supabase.js';
import { Llm } from '../lib/llm.js';
import { AgentBudget } from '../lib/agent-budget.js';
import { JobStream } from '../ws/job-stream.js';
import { makeEmitter } from '../pipelines/progress.js';
import type { PipelineContext } from '../pipelines/types.js';
import { makeOpenRouterProvider } from './provider.js';
import { makeContentAgentTools } from './tools.js';
import type { ContentAgentState } from './types.js';

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export const runContentAgent = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const sb = yield* Supabase;
    const llm = yield* Llm;
    const budget = yield* AgentBudget;
    const stream = yield* JobStream;
    const rpc = sb.client.rpc.bind(sb.client) as unknown as Rpc;
    const emit = makeEmitter({ jobId: ctx.job.id, stream, sb });
    const state: ContentAgentState = { ctx, emit, artifacts: [], toolCalls: 0, finalized: false };

    yield* Effect.tryPromise(() => sb.client.rpc('update_content_job_status', { p_job_id: ctx.job.id, p_status: 'GENERATING' }));
    yield* emit(ProgressStep.AgentStart, `Starting content agent for ${ctx.brand.name}`, 0.03, {
      model: cfg.openrouterModel,
      content_type: ctx.job.content_type,
      mode: llm.isReady ? 'agent' : 'fallback',
    });

    const lease = ctx.queue?.msgId
      ? extendLease(rpc, ctx.queue.msgId, cfg.vtSeconds).pipe(Effect.repeat(Schedule.spaced(Duration.seconds(Math.max(20, Math.floor(cfg.vtSeconds / 3))))))
      : Effect.void;
    const heartbeat = emit(ProgressStep.AgentHeartbeat, 'Agent still working', null, { tool_calls: state.toolCalls }).pipe(
      Effect.repeat(Schedule.spaced(Duration.seconds(60))),
    );

    yield* Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.forkScoped(lease.pipe(Effect.catchAll(() => Effect.void)));
        yield* Effect.forkScoped(heartbeat.pipe(Effect.catchAll(() => Effect.void)));
        yield* runAgentOrFallback(ctx, state).pipe(
          Effect.timeoutFail({ duration: Duration.seconds(cfg.agentMaxJobSeconds), onTimeout: () => new Error('Agent job timed out') }),
        );
      }),
    );

    if (!state.finalized) {
      const artifact = state.artifacts.find((a) => a.role === 'draft' && a.url);
      if (!artifact) return yield* Effect.fail(new Error('Agent produced no artifact'));
      yield* finalizeFallback(sb, state, artifact.id);
    }

    yield* budget.record({
      jobId: ctx.job.id,
      provider: 'openrouter',
      model: cfg.openrouterModel,
      purpose: 'agent-run',
      estimatedCostUsd: 0.01,
      metadata: { tool_calls: state.toolCalls },
    });
  });

const runAgentOrFallback = (ctx: PipelineContext, state: ContentAgentState) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const llm = yield* Llm;
    const provider = makeOpenRouterProvider(cfg);
    const tools = yield* makeContentAgentTools(state);
    const input = buildAgentInput(ctx);

    if (!llm.isReady || !provider) {
      yield* state.emit(ProgressStep.AgentPlan, 'OpenRouter missing; using deterministic local agent fallback', 0.12, { reason: 'missing_openrouter_key' }) as Effect.Effect<void, never, never>;
      return yield* localFallback(ctx, tools);
    }

    const agent = new Agent({
      name: 'Marquee Content Agent',
      instructions: buildInstructions(ctx),
      model: cfg.openrouterModel,
      modelSettings: {
        temperature: 0.7,
        maxTokens: 900,
        parallelToolCalls: false,
        toolChoice: 'auto',
      },
      tools,
    });

    yield* state.emit(ProgressStep.AgentPlan, 'Agent planning creative draft', 0.1, { max_iterations: cfg.agentMaxIterations }) as Effect.Effect<void, never, never>;
    const runner = new Runner({
      modelProvider: provider,
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      toolExecution: { maxFunctionToolConcurrency: 1 },
    });
    const result = yield* Effect.tryPromise({
      try: () => runner.run(agent, input, { maxTurns: cfg.agentMaxIterations * 4 }),
      catch: (err) => new Error(`content agent failed: ${String(err)}`),
    });
    yield* state.emit(ProgressStep.AgentPlan, 'Agent finished', 0.95, { final_output: String(result.finalOutput ?? '').slice(0, 240) }) as Effect.Effect<void, never, never>;
  }).pipe(
    Effect.catchAll((err) =>
      Effect.gen(function* () {
        yield* state.emit(ProgressStep.AgentRevise, 'Agent runner failed; using local fallback', 0.14, { error: err.message }) as Effect.Effect<void, never, never>;
        return yield* localFallback(ctx, yield* makeContentAgentTools(state));
      }),
    ),
  );

type LocalTool = FunctionTool<unknown, any, any>;
type ToolInvoker = (input: unknown) => Promise<unknown>;

const localFallback = (ctx: PipelineContext, tools: LocalTool[]) =>
  Effect.tryPromise(async () => {
    const toolMap = buildToolMap(tools);
    if (ctx.job.content_type === 'VIDEO' || ctx.job.content_type === 'REEL') {
      const renderVideoDraft = requireTool(toolMap, 'render_video_draft');
      const reviewArtifact = requireTool(toolMap, 'review_artifact');
      const finalizeArtifact = requireTool(toolMap, 'finalize_artifact');
      const topic = ctx.job.topic ?? `${ctx.brand.name} in five moves`;
      const draft = JSON.parse(String(await renderVideoDraft({
        lines: [
          { text: `POV: ${topic} just entered the chat.`, emotion: 'happy' },
          { text: 'Everyone had a spreadsheet. The cat had vibes.', emotion: 'smug' },
          { text: 'Then the plan got weirdly simple.', emotion: 'confused' },
          { text: 'Ship the useful bit. Skip the committee.', emotion: 'rage' },
          { text: `That is the ${ctx.brand.name} move.`, emotion: 'happy' },
        ],
        caption: `${topic}. From ${ctx.brand.handle ?? ctx.brand.name}.`,
        hashtags: ['#marquee', '#cats', '#brand'],
        iteration: 1,
      })));
      await reviewArtifact({ artifact_id: draft.id, iteration: 1 });
      await finalizeArtifact({ artifact_id: draft.id, caption: `${topic}. From ${ctx.brand.handle ?? ctx.brand.name}.`, hashtags: ['#marquee', '#cats', '#brand'] });
      return;
    }
    const renderPosterDraft = requireTool(toolMap, 'render_poster_draft');
    const reviewArtifact = requireTool(toolMap, 'review_artifact');
    const finalizeArtifact = requireTool(toolMap, 'finalize_artifact');
    const topic = ctx.job.topic ?? ctx.brand.name;
    const draft = JSON.parse(String(await renderPosterDraft({
      headline: topic.slice(0, 80),
      subhead: ctx.brand.description?.slice(0, 140) ?? null,
      template: 'editorial',
      image_prompt: `Create a clean social poster hero image for ${ctx.brand.name}: ${topic}`,
      iteration: 1,
    })));
    await reviewArtifact({ artifact_id: draft.id, iteration: 1 });
    await finalizeArtifact({ artifact_id: draft.id, caption: `${topic}. From ${ctx.brand.handle ?? ctx.brand.name}.`, hashtags: ['#marquee', '#brand', '#content'] });
  });

const buildToolMap = (tools: LocalTool[]) => {
  const entries = tools.map((t) => [t.name, (input: unknown) => t.invoke({} as never, JSON.stringify(input))] as const);
  return Object.fromEntries(entries) as Record<string, ToolInvoker | undefined>;
};

const requireTool = (toolMap: Record<string, ToolInvoker | undefined>, name: string): ToolInvoker => {
  const invoker = toolMap[name];
  if (!invoker) throw new Error(`${name} tool missing`);
  return invoker;
};

const finalizeFallback = (sb: Supabase, state: ContentAgentState, artifactId: string) =>
  Effect.gen(function* () {
    const artifact = state.artifacts.find((a) => a.id === artifactId);
    if (!artifact?.url) return yield* Effect.fail(new Error('fallback artifact missing url'));
    const outputUrl = artifact.url;
    const outputKey = artifact.key ?? `${state.ctx.job.id}/agent/final`;
    const thumbnailUrl = artifact.kind === 'video' ? String(artifact.metadata.thumbnail_url ?? outputUrl) : outputUrl;
    yield* Effect.tryPromise(() => sb.client.rpc('set_job_output', {
      p_job_id: state.ctx.job.id,
      p_output_url: outputUrl,
      p_output_key: outputKey,
      p_thumbnail_url: thumbnailUrl,
    }));
    yield* Effect.tryPromise(() => sb.client.rpc('update_content_job_status', { p_job_id: state.ctx.job.id, p_status: 'REVIEW' }));
    state.finalized = true;
    yield* state.emit(ProgressStep.AgentFinal, 'Final artifact selected', 0.97, { artifact_id: artifact.id, url: artifact.url }) as Effect.Effect<void, never, never>;
    yield* state.emit(ProgressStep.Review, 'Ready for review', 0.98) as Effect.Effect<void, never, never>;
    yield* state.emit(ProgressStep.Complete, 'Done', 1) as Effect.Effect<void, never, never>;
  });

const extendLease = (rpc: Rpc, msgId: number, vtSeconds: number) =>
  Effect.tryPromise(() => rpc('extend_content_job_vt', {
    p_msg_id: msgId,
    p_visibility_timeout_seconds: vtSeconds,
  })).pipe(Effect.ignore);

const buildInstructions = (ctx: PipelineContext) => [
  'You are the server-side Marquee content agent.',
  'Use tools to render, review with vision, revise if needed, and finalize.',
  'Never claim a visual is good without calling review_artifact after rendering.',
  'Call finalize_artifact only after at least one render and one review.',
  'Keep public progress short. Do not expose hidden reasoning.',
  'For VIDEO/REEL, make 20-30 second vertical cat-meme explainers with 3-6 short spoken lines.',
  `Brand: ${ctx.brand.name}${ctx.brand.handle ? ` (${ctx.brand.handle})` : ''}`,
  ctx.brand.description ? `About: ${ctx.brand.description}` : '',
  ctx.brand.target_audience ? `Audience: ${ctx.brand.target_audience}` : '',
].filter(Boolean).join('\n');

const buildAgentInput = (ctx: PipelineContext) => JSON.stringify({
  job_id: ctx.job.id,
  content_type: ctx.job.content_type,
  topic: ctx.job.topic,
  platforms: ctx.job.platforms,
  brand: {
    name: ctx.brand.name,
    handle: ctx.brand.handle,
    description: ctx.brand.description,
    industry: ctx.brand.industry,
    target_audience: ctx.brand.target_audience,
    voice: ctx.brand.voice,
    palette: ctx.brand.palette,
    guidelines: ctx.brand.guidelines,
  },
});
