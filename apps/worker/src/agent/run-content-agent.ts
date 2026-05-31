import { Effect, Duration, Schedule } from 'effect';
import { Agent, Runner } from '@openai/agents';
import { ProgressStep } from '@marquee/shared/progress';
import { AppConfig } from '../config.js';
import { Supabase } from '../lib/supabase.js';
import { AgentBudget } from '../lib/agent-budget.js';
import { JobStream } from '../ws/job-stream.js';
import { makeEmitter } from '../pipelines/progress.js';
import type { PipelineContext } from '../pipelines/types.js';
import { makeOpenRouterProvider } from './provider.js';
import { makeContentAgentTools } from './tools.js';
import type { ContentAgentState } from './types.js';
import { ensureJobWorkspace } from './workspace.js';

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export const runContentAgent = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const sb = yield* Supabase;
    const budget = yield* AgentBudget;
    const stream = yield* JobStream;
    const rpc = sb.client.rpc.bind(sb.client) as unknown as Rpc;
    const emit = makeEmitter({ jobId: ctx.job.id, stream, sb });
    const workspace = yield* Effect.tryPromise(() => ensureJobWorkspace(ctx, cfg.outputsDir));
    const state: ContentAgentState = { ctx, emit, workspace, artifacts: [], toolCalls: 0, finalized: false };

    yield* Effect.tryPromise(() => sb.client.rpc('update_content_job_status', { p_job_id: ctx.job.id, p_status: 'GENERATING' }));
    yield* emit(ProgressStep.AgentStart, `Starting content agent for ${ctx.brand.name}`, 0.03, {
      model: cfg.openrouterModel,
      content_type: ctx.job.content_type,
      mode: 'agentic',
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
        yield* runAgenticWorkflow(ctx, state).pipe(
          Effect.timeoutFail({ duration: Duration.seconds(cfg.agentMaxJobSeconds), onTimeout: () => new Error('Agent job timed out') }),
        );
      }),
    );

    if (!state.finalized) {
      return yield* Effect.fail(new Error('Agent did not finalize an artifact'));
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

const runAgenticWorkflow = (ctx: PipelineContext, state: ContentAgentState) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const provider = makeOpenRouterProvider(cfg);
    const tools = yield* makeContentAgentTools(state);
    const input = buildAgentInput(ctx);

    if (!provider) {
      yield* state.emit(ProgressStep.Error, 'OPENROUTER_API_KEY missing', null, { reason: 'missing_openrouter_key' }) as Effect.Effect<void, never, never>;
      return yield* Effect.fail(new Error('OPENROUTER_API_KEY missing'));
    }

    const posterAgent = new Agent({
      name: 'Poster Production Agent',
      instructions: buildPosterInstructions(ctx),
      model: cfg.openrouterModel,
      modelSettings: {
        temperature: 0.7,
        maxTokens: 1100,
        parallelToolCalls: false,
        toolChoice: 'required',
      },
      resetToolChoice: true,
      toolUseBehavior: { stopAtToolNames: ['finalize_artifact'] },
      tools,
    });

    const videoAgent = new Agent({
      name: 'Video Production Agent',
      instructions: buildVideoInstructions(ctx),
      model: cfg.openrouterModel,
      modelSettings: {
        temperature: 0.75,
        maxTokens: 1400,
        parallelToolCalls: false,
        toolChoice: 'required',
      },
      resetToolChoice: true,
      toolUseBehavior: { stopAtToolNames: ['finalize_artifact'] },
      tools,
    });

    const productionAgent = ctx.job.content_type === 'VIDEO' || ctx.job.content_type === 'REEL'
      ? videoAgent
      : posterAgent;

    yield* state.emit(ProgressStep.AgentPlan, `Starting ${productionAgent.name}`, 0.1, {
      workflow: 'openrouter_chat_tools',
      agent: productionAgent.name,
      max_iterations: cfg.agentMaxIterations,
    }) as Effect.Effect<void, never, never>;
    const runner = new Runner({
      modelProvider: provider,
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
      toolExecution: { maxFunctionToolConcurrency: 1 },
    });
    const result = yield* Effect.tryPromise({
      try: () => runner.run(productionAgent, input, {
        maxTurns: Math.max(18, cfg.agentMaxIterations * 6),
      }),
      catch: (err) => new Error(`content agent failed: ${String(err)}`),
    });
    yield* state.emit(ProgressStep.AgentPlan, 'Agent workflow finished', 0.95, {
      final_output: String(result.finalOutput ?? '').slice(0, 240),
      last_agent: result.lastAgent?.name,
    }) as Effect.Effect<void, never, never>;
  }).pipe(
    Effect.catchAll((err) =>
      Effect.gen(function* () {
        yield* state.emit(ProgressStep.AgentRevise, 'Agent runner failed', 0.14, { error: err.message }) as Effect.Effect<void, never, never>;
        return yield* Effect.fail(err);
      }),
    ),
  );

const extendLease = (rpc: Rpc, msgId: number, vtSeconds: number) =>
  Effect.tryPromise(() => rpc('extend_content_job_vt', {
    p_msg_id: msgId,
    p_visibility_timeout_seconds: vtSeconds,
  })).pipe(Effect.ignore);

const commonInstructions = (ctx: PipelineContext) => [
  'You are a Marquee production agent running server-side.',
  'You have a real Docker bash tool named workspace_shell.',
  'The durable job workspace is /workspace/shared. Inspect it first with workspace_shell. Write short notes/specs there.',
  'Do not rely on files outside /workspace/shared for durable work.',
  'You must use tools. Finish by calling finalize_artifact; the run stops on that tool.',
  'Render, review with vision, revise if needed, and finalize.',
  'Never claim a visual is good without calling review_artifact after rendering.',
  'Call finalize_artifact only after at least one render and one review.',
  'Avoid long exploration. Use the smallest set of tool calls needed to ship.',
  'Keep public progress short. Do not expose hidden reasoning.',
  `Brand: ${ctx.brand.name}${ctx.brand.handle ? ` (${ctx.brand.handle})` : ''}`,
  ctx.brand.description ? `About: ${ctx.brand.description}` : '',
  ctx.brand.target_audience ? `Audience: ${ctx.brand.target_audience}` : '',
].filter(Boolean).join('\n');

const buildPosterInstructions = (ctx: PipelineContext) => [
  commonInstructions(ctx),
  'You are the poster/carousel specialist.',
  'Tool order: workspace_shell to inspect the brief and write /workspace/shared/notes/poster-plan.md, render_poster_draft, review_artifact, then finalize_artifact.',
  'Do not inspect cat assets for poster/carousel jobs.',
  'Use render_poster_draft with sharp copy and the brand palette. Use Fal image prompting only when it materially improves the poster.',
  'Use one clean revision at most unless the first render fails.',
].join('\n');

const buildVideoInstructions = (ctx: PipelineContext) => [
  commonInstructions(ctx),
  'You are the cat-meme video specialist.',
  'Cat assets live in /workspace/shared/assets/cats/metadata.json and /workspace/shared/assets/cats/*.jpg.',
  'Tool order: workspace_shell to inspect the brief and cat metadata and write /workspace/shared/notes/video-plan.md, render_video_draft, review_artifact, then finalize_artifact.',
  'For VIDEO/REEL, make a 20-30 second vertical explainer with 3-6 short spoken lines.',
  'Pass asset_id on every render_video_draft line. The render tool fails without real cat assets.',
  'Use one clean revision at most unless the first render fails.',
].join('\n');

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
