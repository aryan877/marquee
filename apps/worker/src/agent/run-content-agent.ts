import { Effect, Duration, Either, Schedule } from 'effect';
import { ProgressStep } from '@marquee/shared/progress';
import { z } from 'zod';
import { AppConfig } from '../config.js';
import { Supabase } from '../lib/supabase.js';
import { AgentBudget } from '../lib/agent-budget.js';
import { Llm } from '../lib/llm.js';
import { JobStream } from '../ws/job-stream.js';
import { makeEmitter } from '../pipelines/progress.js';
import type { PipelineContext } from '../pipelines/types.js';
import { makeContentAgentRuntime } from './tools.js';
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

    const workflowResult = yield* Effect.either(Effect.scoped(
      Effect.gen(function* () {
        yield* Effect.forkScoped(lease.pipe(Effect.catchAll(() => Effect.void)));
        yield* Effect.forkScoped(heartbeat.pipe(Effect.catchAll(() => Effect.void)));
        yield* runAgenticWorkflow(ctx, state).pipe(
          Effect.timeoutFail({ duration: Duration.seconds(cfg.agentMaxJobSeconds), onTimeout: () => new Error('Agent job timed out') }),
        );
      }),
    ));

    if (Either.isLeft(workflowResult) && !state.finalized) {
      const recovered = yield* sendBestArtifactToReview(state, rpc, workflowResult.left).pipe(
        Effect.catchAll(() => Effect.succeed(false)),
      );
      if (!recovered) {
        return yield* Effect.fail(workflowResult.left);
      }
    }

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
    const llm = yield* Llm;
    const runtime = yield* makeContentAgentRuntime(state);

    if (!llm.isReady) {
      yield* state.emit(ProgressStep.Error, 'OPENROUTER_API_KEY missing', null, { reason: 'missing_openrouter_key' }) as Effect.Effect<void, never, never>;
      return yield* Effect.fail(new Error('OPENROUTER_API_KEY missing'));
    }

    const isVideo = ctx.job.content_type === 'VIDEO' || ctx.job.content_type === 'REEL';
    const agentName = isVideo ? 'Video Production Agent' : 'Poster Production Agent';
    const history: AgentObservation[] = [];

    yield* state.emit(ProgressStep.AgentPlan, `Starting ${agentName}`, 0.1, {
      workflow: 'openrouter_custom_agent_loop',
      agent: agentName,
      max_iterations: cfg.agentMaxIterations,
      max_turns: cfg.agentMaxTurns,
    }) as Effect.Effect<void, never, never>;

    for (let turn = 1; turn <= cfg.agentMaxTurns && !state.finalized; turn++) {
      const actionEither = yield* Effect.either(nextAgentAction({
        ctx,
        llm,
        history,
        isVideo,
        turn,
        maxTurns: cfg.agentMaxTurns,
        maxIterations: cfg.agentMaxIterations,
        artifacts: summarizeArtifacts(state),
      }));
      if (Either.isLeft(actionEither)) {
        history.push({
          turn,
          actor: agentName,
          action: 'invalid_action',
          ok: false,
          error: actionEither.left.message,
        });
        continue;
      }
      const observation = yield* executeAgentAction({
        ctx,
        state,
        llm,
        runtime,
        action: actionEither.right,
        history,
        turn,
        actor: agentName,
        isVideo,
        maxIterations: cfg.agentMaxIterations,
      });
      history.push(observation);
    }

    if (!state.finalized) {
      return yield* Effect.fail(new Error(`Agent did not finalize within ${cfg.agentMaxTurns} turns`));
    }
    yield* state.emit(ProgressStep.AgentPlan, 'Agent workflow finished', 0.95, {
      final_output: 'final artifact selected',
      last_agent: agentName,
    }) as Effect.Effect<void, never, never>;
  }).pipe(
    Effect.catchAll((err) =>
      Effect.gen(function* () {
        const error = err instanceof Error ? err : new Error(String(err));
        yield* state.emit(ProgressStep.AgentRevise, 'Agent runner failed', 0.14, { error: error.message }) as Effect.Effect<void, never, never>;
        return yield* Effect.fail(error);
      }),
    ),
  );

const extendLease = (rpc: Rpc, msgId: number, vtSeconds: number) =>
  Effect.tryPromise(() => rpc('extend_content_job_vt', {
    p_msg_id: msgId,
    p_visibility_timeout_seconds: vtSeconds,
  })).pipe(Effect.ignore);

const sendBestArtifactToReview = (state: ContentAgentState, rpc: Rpc, cause: unknown) =>
  Effect.gen(function* () {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    const artifact = [...state.artifacts].reverse().find((item) =>
      item.url && (item.role === 'draft' || item.role === 'intermediate') && (item.kind === 'poster' || item.kind === 'video' || item.kind === 'image'),
    );
    if (!artifact?.url) return false;

    const outputKey = artifact.key ?? `${state.ctx.job.id}/agent/manual-review`;
    const thumbnailUrl = artifact.kind === 'video'
      ? typeof artifact.metadata.thumbnail_url === 'string' ? artifact.metadata.thumbnail_url : artifact.url
      : artifact.url;
    yield* callRpc(rpc, 'set_job_output', {
      p_job_id: state.ctx.job.id,
      p_output_url: artifact.url,
      p_output_key: outputKey,
      p_thumbnail_url: thumbnailUrl,
    });

    const caption = typeof artifact.metadata.caption === 'string' ? artifact.metadata.caption.trim() : '';
    if (caption) {
      const hashtags = Array.isArray(artifact.metadata.hashtags) ? artifact.metadata.hashtags.map(String).slice(0, 8) : [];
      yield* callRpc(rpc, 'set_job_caption', {
        p_job_id: state.ctx.job.id,
        p_caption: caption.slice(0, 800),
        p_hashtags: hashtags,
      });
    }

    yield* callRpc(rpc, 'update_content_job_status', { p_job_id: state.ctx.job.id, p_status: 'REVIEW' });
    state.finalized = true;
    yield* state.emit(ProgressStep.AgentFinal, 'Artifact ready for manual review', 0.96, {
      artifact_id: artifact.id,
      url: artifact.url,
      manual_review: true,
      recovered_from_error: error.message,
    }) as Effect.Effect<void, never, never>;
    yield* state.emit(ProgressStep.Review, 'Ready for manual review', 0.98, {
      manual_review: true,
      reason: 'automated QA was inconclusive; usable artifact exists',
    }) as Effect.Effect<void, never, never>;
    yield* state.emit(ProgressStep.Complete, 'Done', 1, { manual_review: true }) as Effect.Effect<void, never, never>;
    return true;
  });

const callRpc = (rpc: Rpc, fn: string, args: Record<string, unknown>) =>
  Effect.tryPromise(() => rpc(fn, args)).pipe(
    Effect.flatMap(({ data, error }) => error
      ? Effect.fail(error instanceof Error ? error : new Error(String(error)))
      : Effect.succeed(data)),
  );

const AgentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('workspace_shell'),
    reason: z.string().max(240).optional(),
    args: z.object({ cmd: z.string().min(1).max(8000) }),
  }),
  z.object({
    action: z.literal('render_poster_draft'),
    reason: z.string().max(240).optional(),
    args: z.object({
      headline: z.string().min(1).max(100),
      subhead: z.string().max(160).nullable().optional(),
      template: z.enum(['editorial', 'stat', 'listicle', 'quote']).optional(),
      image_prompt: z.string().max(600).nullable().optional(),
      asset_prompts: z.array(z.object({
        prompt: z.string().min(1).max(280),
        x: z.number().min(0).max(92),
        y: z.number().min(0).max(92),
        width: z.number().min(6).max(28),
        rotation: z.number().min(-24).max(24).optional(),
        opacity: z.number().min(0.25).max(1).optional(),
      })).max(4).nullable().optional(),
      user_assets: z.array(z.object({
        asset_id: z.string().min(1).max(160),
        x: z.number().min(0).max(92),
        y: z.number().min(0).max(92),
        width: z.number().min(6).max(36),
        rotation: z.number().min(-24).max(24).optional(),
        opacity: z.number().min(0.25).max(1).optional(),
      })).max(4).nullable().optional(),
      iteration: z.number().int().min(1).max(5).optional(),
    }),
  }),
  z.object({
    action: z.literal('render_video_draft'),
    reason: z.string().max(240).optional(),
    args: z.object({
      lines: z.array(z.object({
        text: z.string().min(1).max(110),
        emotion: z.string().max(40).nullable().optional(),
        asset_id: z.string().min(1).max(120),
      })).min(3).max(6),
      caption: z.string().max(800).nullable().optional(),
      hashtags: z.array(z.string().max(40)).max(8).nullable().optional(),
      iteration: z.number().int().min(1).max(5).optional(),
    }),
  }),
  z.object({
    action: z.literal('review_artifact'),
    reason: z.string().max(240).optional(),
    args: z.object({
      artifact_id: z.uuid(),
      prompt: z.string().max(600).nullable().optional(),
      iteration: z.number().int().min(1).max(5).optional(),
    }),
  }),
  z.object({
    action: z.literal('finalize_artifact'),
    reason: z.string().max(240).optional(),
    args: z.object({
      artifact_id: z.uuid(),
      caption: z.string().max(800).nullable().optional(),
      hashtags: z.array(z.string().max(40)).max(8).nullable().optional(),
    }),
  }),
  z.object({
    action: z.literal('emit_budget'),
    reason: z.string().max(240).optional(),
    args: z.object({}).optional(),
  }),
  z.object({
    action: z.literal('delegate_subagent'),
    reason: z.string().max(240).optional(),
    args: z.object({
      agent: z.enum(['creative_director', 'production_engineer', 'visual_critic', 'video_editor']),
      task: z.string().min(1).max(1000),
      context: z.string().max(2000).optional(),
    }),
  }),
]);

const SubagentActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('workspace_shell'),
    args: z.object({ cmd: z.string().min(1).max(4000) }),
  }),
  z.object({
    action: z.literal('answer'),
    args: z.object({
      summary: z.string().min(1).max(1200),
      recommendations: z.array(z.string().max(240)).max(8),
    }),
  }),
]);

type AgentAction = z.infer<typeof AgentActionSchema>;
type AgentObservation = {
  turn: number;
  actor: string;
  action: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

type AgentRuntime = {
  workspaceShell: (input: Extract<AgentAction, { action: 'workspace_shell' }>['args']) => Effect.Effect<unknown, Error, never>;
  renderPosterDraft: (input: Extract<AgentAction, { action: 'render_poster_draft' }>['args']) => Effect.Effect<unknown, Error, never>;
  renderVideoDraft: (input: Extract<AgentAction, { action: 'render_video_draft' }>['args']) => Effect.Effect<unknown, Error, never>;
  reviewArtifact: (input: Extract<AgentAction, { action: 'review_artifact' }>['args']) => Effect.Effect<unknown, Error, never>;
  finalizeArtifact: (input: Extract<AgentAction, { action: 'finalize_artifact' }>['args']) => Effect.Effect<unknown, Error, never>;
  emitBudget: () => Effect.Effect<unknown, Error, never>;
};

const nextAgentAction = (args: {
  ctx: PipelineContext;
  llm: Llm;
  history: AgentObservation[];
  isVideo: boolean;
  turn: number;
  maxTurns: number;
  maxIterations: number;
  artifacts: unknown[];
}) =>
  args.llm.completeJson<unknown>({
    system: buildOrchestratorSystem(args.isVideo),
    user: JSON.stringify({
      turn: args.turn,
      max_turns: args.maxTurns,
      max_iterations: args.maxIterations,
      job: {
        id: args.ctx.job.id,
        content_type: args.ctx.job.content_type,
        topic: args.ctx.job.topic,
        platforms: args.ctx.job.platforms,
      },
      brand: args.ctx.brand,
      workspace: {
        root: '/workspace/shared',
        brief: '/workspace/shared/brief.md',
        brand_json: '/workspace/shared/brand.json',
        job_json: '/workspace/shared/job.json',
        cat_metadata: '/workspace/shared/assets/cats/metadata.json',
        input_asset_metadata: '/workspace/shared/assets/input/metadata.json',
      },
      artifacts: args.artifacts,
      recent_observations: args.history.slice(-10),
    }),
    maxTokens: args.isVideo ? 1400 : 1100,
    temperature: 0.45,
  }).pipe(
    Effect.flatMap((json) =>
      Effect.try({
        try: () => AgentActionSchema.parse(json),
        catch: (err) => new Error(`invalid agent action: ${err instanceof Error ? err.message : String(err)}`),
      }),
    ),
  );

const executeAgentAction = (args: {
  ctx: PipelineContext;
  state: ContentAgentState;
  llm: Llm;
  runtime: AgentRuntime;
  action: AgentAction;
  history: AgentObservation[];
  turn: number;
  actor: string;
  isVideo: boolean;
  maxIterations: number;
}) =>
  Effect.gen(function* () {
    const { action, state, history, turn, actor, isVideo, maxIterations } = args;
    const shellBeforeRender = history.filter((item) => item.action === 'workspace_shell').length;
    const hasDraft = state.artifacts.some((artifact) => artifact.role === 'draft');
    const hasReview = history.some((item) => item.action === 'review_artifact' && item.ok);
    const draftCount = state.artifacts.filter((artifact) => artifact.role === 'draft').length;
    const passedReviewArtifactId = latestPassedReviewArtifactId(history);
    const reviewedArtifactId = latestReviewedArtifactId(history);
    const latestDraft = [...state.artifacts].reverse().find((artifact) => artifact.role === 'draft');

    const blocked = (message: string): AgentObservation => ({
      turn,
      actor,
      action: action.action,
      ok: false,
      error: message,
    });

    if (action.action === 'workspace_shell' && !hasDraft && shellBeforeRender >= 3) {
      return blocked('workspace_shell pre-render budget is exhausted; render a draft now');
    }
    if (passedReviewArtifactId && action.action !== 'finalize_artifact' && action.action !== 'emit_budget') {
      return blocked(`vision already passed artifact ${passedReviewArtifactId}; finalize_artifact now`);
    }
    if (action.action === 'render_poster_draft' && isVideo) {
      return blocked('render_poster_draft is not available for video jobs');
    }
    if (action.action === 'render_video_draft' && !isVideo) {
      return blocked('render_video_draft is not available for poster/carousel jobs');
    }
    if ((action.action === 'render_poster_draft' || action.action === 'render_video_draft') && draftCount >= maxIterations) {
      return blocked(`draft budget is exhausted at ${maxIterations}; review or finalize the best existing draft${latestDraft ? ` (${latestDraft.id})` : ''}`);
    }
    if (action.action === 'finalize_artifact' && !hasReview) {
      return blocked('review_artifact must pass through the tool layer before finalize_artifact');
    }
    if (action.action === 'finalize_artifact' && !passedReviewArtifactId && draftCount < maxIterations) {
      return blocked('vision review requested changes; render one revised draft before finalizing');
    }
    if (action.action === 'finalize_artifact' && passedReviewArtifactId && action.args.artifact_id !== passedReviewArtifactId) {
      return blocked(`finalize_artifact must use passing artifact ${passedReviewArtifactId}`);
    }
    if (action.action === 'finalize_artifact' && !passedReviewArtifactId && reviewedArtifactId && action.args.artifact_id !== reviewedArtifactId) {
      return blocked(`finalize_artifact must use the latest reviewed artifact ${reviewedArtifactId}`);
    }

    return yield* runActionTool(action, args).pipe(
      Effect.map((result): AgentObservation => ({
        turn,
        actor,
        action: action.action,
        ok: true,
        result: summarizeActionResult(action, result),
      })),
      Effect.catchAll((err) =>
        Effect.succeed({
          turn,
          actor,
          action: action.action,
          ok: false,
          error: err.message,
        } satisfies AgentObservation),
      ),
    );
  });

const runActionTool = (
  action: AgentAction,
  args: {
    ctx: PipelineContext;
    state: ContentAgentState;
    llm: Llm;
    runtime: AgentRuntime;
    history: AgentObservation[];
    turn: number;
    actor: string;
    isVideo: boolean;
    maxIterations: number;
  },
) => {
  const { runtime } = args;
  switch (action.action) {
    case 'workspace_shell':
      return runtime.workspaceShell(action.args);
    case 'render_poster_draft':
      return runtime.renderPosterDraft(action.args);
    case 'render_video_draft':
      return runtime.renderVideoDraft(action.args);
    case 'review_artifact':
      return runtime.reviewArtifact(action.args);
    case 'finalize_artifact':
      return runtime.finalizeArtifact(action.args);
    case 'emit_budget':
      return runtime.emitBudget();
    case 'delegate_subagent':
      return runSubagent({
        ctx: args.ctx,
        state: args.state,
        llm: args.llm,
        runtime,
        parentHistory: args.history,
        ...action.args,
      });
  }
};

const runSubagent = (args: {
  ctx: PipelineContext;
  state: ContentAgentState;
  llm: Llm;
  runtime: AgentRuntime;
  parentHistory: AgentObservation[];
  agent: 'creative_director' | 'production_engineer' | 'visual_critic' | 'video_editor';
  task: string;
  context?: string;
}) =>
  Effect.gen(function* () {
    const observations: AgentObservation[] = [];
    yield* args.state.emit(ProgressStep.AgentPlan, `Delegating to ${args.agent}`, null, {
      subagent: args.agent,
      task: args.task.slice(0, 240),
    }) as Effect.Effect<void, never, never>;

    for (let turn = 1; turn <= 4; turn++) {
      const actionEither = yield* Effect.either(args.llm.completeJson<unknown>({
        system: buildSubagentSystem(args.agent),
        user: JSON.stringify({
          task: args.task,
          context: args.context ?? '',
          workspace: {
            root: '/workspace/shared',
            brief: '/workspace/shared/brief.md',
            notes: '/workspace/shared/notes',
            cat_metadata: '/workspace/shared/assets/cats/metadata.json',
            input_asset_metadata: '/workspace/shared/assets/input/metadata.json',
          },
          artifacts: summarizeArtifacts(args.state),
          parent_observations: args.parentHistory.slice(-6),
          subagent_observations: observations,
        }),
        maxTokens: 900,
        temperature: 0.35,
      }).pipe(
        Effect.flatMap((json) =>
          Effect.try({
            try: () => SubagentActionSchema.parse(json),
            catch: (err) => new Error(`invalid subagent action: ${err instanceof Error ? err.message : String(err)}`),
          }),
        ),
      ));
      if (Either.isLeft(actionEither)) {
        observations.push({ turn, actor: args.agent, action: 'invalid_action', ok: false, error: actionEither.left.message });
        continue;
      }
      const action = actionEither.right;
      if (action.action === 'answer') {
        return {
          agent: args.agent,
          summary: action.args.summary,
          recommendations: action.args.recommendations,
          observations,
        };
      }
      const result = yield* args.runtime.workspaceShell(action.args).pipe(
        Effect.map((value) => ({ ok: true, result: summarizeResult(value) })),
        Effect.catchAll((err) => Effect.succeed({ ok: false, error: err.message })),
      );
      observations.push({
        turn,
        actor: args.agent,
        action: action.action,
        ok: result.ok,
        result: 'result' in result ? result.result : undefined,
        error: 'error' in result ? result.error : undefined,
      });
    }

    return {
      agent: args.agent,
      summary: 'Subagent reached its turn cap before a final answer.',
      recommendations: [],
      observations,
    };
  });

const buildOrchestratorSystem = (isVideo: boolean) => [
  'You are Marquee Agent, an autonomous production orchestrator inspired by Claude Agent SDK patterns.',
  'You choose exactly one JSON action per turn. The server validates and executes the action, then returns an observation next turn.',
  'You have real bash through workspace_shell. It runs in Docker with only /workspace/shared mounted. Use it for brief inspection, notes, asset checks, or lightweight file work.',
  'You may delegate bounded work with delegate_subagent. Subagents have their own short context and may inspect/write workspace notes through workspace_shell.',
  'Do not pretend work happened. If you need a visual, call a render tool. If you need QA, call review_artifact. Finish only with finalize_artifact.',
  'Required lifecycle: inspect/write a short plan if needed, render a draft, review the rendered artifact, revise only if needed, finalize.',
  'If any review_artifact observation has result.pass=true, the next production action must be finalize_artifact for that reviewed artifact. Do not keep revising passed work.',
  'If a poster/carousel review fails and iterations remain, revise the template, copy, or asset placements and render again. If the final reviewed draft is imperfect but usable, finalize it for manual review instead of failing the job.',
  'Respect max_iterations from the user payload. Never render beyond that draft count; review or finalize existing drafts instead.',
  'Use no more than three workspace_shell calls before the first render. After that, render instead of exploring.',
  'Visual bar: strong hierarchy, high contrast, readable at mobile size, brand visible, no cramped text, no generic stock feel, no one-note palette.',
  'Use emit_budget when cost or long-running behavior matters.',
  isVideo
    ? 'Available render action: render_video_draft. Use asset IDs from /workspace/shared/assets/input/metadata.json when user assets are relevant, otherwise use /workspace/shared/assets/cats/metadata.json. Make 3-6 short lines for a 20-30s vertical video.'
    : 'Available render action: render_poster_draft. Do not inspect cat assets for poster/carousel jobs. Posters are designed by our Playwright templates; never ask Fal/GPT Image for a finished poster. Use user_assets from /workspace/shared/assets/input/metadata.json when relevant. Use asset_prompts only for 1-4 small no-text decorative cutouts, generated low quality for cost, with creative bounded x/y/width/rotation placements that stay clear of the headline, CTA, and wordmark. The renderer will snap unsafe placements away from protected copy zones, but you should choose clean non-overlapping placements yourself. Set image_prompt null.',
  'Return ONLY valid JSON matching one of these shapes:',
  '{"action":"workspace_shell","reason":"...","args":{"cmd":"..."}}',
  isVideo
    ? '{"action":"render_video_draft","reason":"...","args":{"lines":[{"text":"...","emotion":"...","asset_id":"..."}],"caption":"...","hashtags":["..."],"iteration":1}}'
    : '{"action":"render_poster_draft","reason":"...","args":{"headline":"...","subhead":"...","template":"editorial","image_prompt":null,"user_assets":[{"asset_id":"...","x":12,"y":18,"width":18,"rotation":-6}],"asset_prompts":[{"prompt":"small hand-drawn sparkle icon","x":72,"y":14,"width":9,"rotation":8}],"iteration":1}}',
  '{"action":"review_artifact","reason":"...","args":{"artifact_id":"uuid","prompt":"...","iteration":1}}',
  '{"action":"finalize_artifact","reason":"...","args":{"artifact_id":"uuid","caption":"...","hashtags":["..."]}}',
  '{"action":"delegate_subagent","reason":"...","args":{"agent":"creative_director|production_engineer|visual_critic|video_editor","task":"...","context":"..."}}',
  '{"action":"emit_budget","reason":"...","args":{}}',
].join('\n');

const buildSubagentSystem = (agent: string) => [
  `You are the ${agent} subagent inside Marquee.`,
  'You are isolated from the parent context. Do the delegated task and return one JSON action per turn.',
  'You can either inspect/write workspace notes with workspace_shell or finish with answer.',
  'workspace_shell runs in Docker with /workspace/shared mounted. Keep commands narrow and useful.',
  'Return ONLY valid JSON:',
  '{"action":"workspace_shell","args":{"cmd":"..."}}',
  '{"action":"answer","args":{"summary":"...","recommendations":["..."]}}',
].join('\n');

const summarizeArtifacts = (state: ContentAgentState) =>
  state.artifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    role: artifact.role,
    iteration: artifact.iteration,
    url: artifact.url,
    width: artifact.width,
    height: artifact.height,
    duration_s: artifact.durationS,
    metadata: artifact.metadata,
  }));

const latestPassedReviewArtifactId = (history: AgentObservation[]) => {
  for (const item of [...history].reverse()) {
    if (item.action !== 'review_artifact' || !item.ok || typeof item.result !== 'object' || item.result === null) continue;
    const result = item.result as { pass?: unknown; artifact_id?: unknown };
    if (result.pass === true && typeof result.artifact_id === 'string') return result.artifact_id;
  }
  return null;
};

const latestReviewedArtifactId = (history: AgentObservation[]) => {
  for (const item of [...history].reverse()) {
    if (item.action !== 'review_artifact' || !item.ok || typeof item.result !== 'object' || item.result === null) continue;
    const result = item.result as { artifact_id?: unknown };
    if (typeof result.artifact_id === 'string') return result.artifact_id;
  }
  return null;
};

const summarizeActionResult = (action: AgentAction, value: unknown) => {
  if (action.action === 'review_artifact' && typeof value === 'object' && value !== null) {
    return summarizeResult({ ...value, artifact_id: action.args.artifact_id });
  }
  return summarizeResult(value);
};

const summarizeResult = (value: unknown) => {
  if (typeof value === 'string') return value.slice(0, 2000);
  const json = JSON.stringify(value);
  return json.length > 2500 ? `${json.slice(0, 2500)}…` : value;
};
