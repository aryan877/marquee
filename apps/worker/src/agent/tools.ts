import { Effect } from 'effect';
import { ProgressStep } from '@marquee/shared/progress';
import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import { join } from 'node:path';
import { AppConfig } from '../config.js';
import { Renderer } from '../lib/playwright-renderer.js';
import { Storage } from '../lib/storage.js';
import { Supabase } from '../lib/supabase.js';
import { Cats } from '../lib/cats.js';
import { Tts } from '../lib/tts.js';
import { Ffmpeg } from '../lib/ffmpeg.js';
import { FalImage } from '../lib/fal-image.js';
import { Vision } from '../lib/vision.js';
import { AgentBudget } from '../lib/agent-budget.js';
import type { ArtifactRecord, ContentAgentState } from './types.js';

const MAX_TEXT = 180;
const LAYERS = ['background', 'wordmark', 'headline', 'accent', 'final'] as const;
const SILENT_MP3 = Uint8Array.from(
  Buffer.from(
    '//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACgAA' +
    'A//////////////////////////////////////////////////' +
    '//////////////////////////////////////////////////8' +
    'AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAAgAAAAoBfXVO',
    'base64',
  ),
);

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

const clip = (value: string, max = MAX_TEXT) => value.trim().slice(0, max);
const safeJson = (value: unknown) => JSON.stringify(value);

export const makeContentAgentTools = (state: ContentAgentState) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const render = yield* Renderer;
    const storage = yield* Storage;
    const sb = yield* Supabase;
    const cats = yield* Cats;
    const tts = yield* Tts;
    const ff = yield* Ffmpeg;
    const fal = yield* FalImage;
    const vision = yield* Vision;
    const budget = yield* AgentBudget;
    const rpc = sb.client.rpc.bind(sb.client) as unknown as Rpc;

    const createArtifact = (args: Omit<ArtifactRecord, 'id'>) =>
      Effect.gen(function* () {
        const { data, error } = yield* Effect.tryPromise(() =>
          rpc('create_job_artifact', {
            p_job_id: state.ctx.job.id,
            p_kind: args.kind,
            p_role: args.role,
            p_iteration: args.iteration,
            p_url: args.url,
            p_key: args.key,
            p_mime_type: args.mimeType,
            p_width: args.width,
            p_height: args.height,
            p_duration_s: args.durationS,
            p_metadata: args.metadata,
          }),
        );
        if (error) return yield* Effect.fail(error instanceof Error ? error : new Error(String(error)));
        const id = String(data);
        const artifact = { id, ...args } satisfies ArtifactRecord;
        state.artifacts.push(artifact);
        yield* state.emit(ProgressStep.ArtifactCreate, `${artifact.kind} ${artifact.role} created`, null, {
          artifact_id: artifact.id,
          kind: artifact.kind,
          role: artifact.role,
          url: artifact.url,
          thumbnail_url: artifact.kind === 'video' ? null : artifact.url,
          mime_type: artifact.mimeType,
          width: artifact.width,
          height: artifact.height,
          duration_s: artifact.durationS,
          iteration: artifact.iteration,
        }) as Effect.Effect<void, never, never>;
        return artifact;
      });

    const withToolProgress = <A>(name: string, iteration: number, argsPreview: Record<string, unknown>, effect: Effect.Effect<A, Error>) =>
      Effect.gen(function* () {
        state.toolCalls += 1;
        if (state.toolCalls > cfg.agentMaxToolCalls) {
          return yield* Effect.fail(new Error('Agent tool call limit reached'));
        }
        const started = Date.now();
        yield* state.emit(ProgressStep.AgentToolStart, `Running ${name}`, null, {
          tool_name: name,
          iteration,
          args_preview: argsPreview,
        }) as Effect.Effect<void, never, never>;
        return yield* effect.pipe(
          Effect.tap(() => state.emit(ProgressStep.AgentToolDone, `${name} done`, null, {
            tool_name: name,
            iteration,
            duration_ms: Date.now() - started,
          }) as Effect.Effect<void, never, never>),
          Effect.catchAll((err) =>
            Effect.gen(function* () {
              yield* state.emit(ProgressStep.AgentToolError, `${name} failed`, null, {
                tool_name: name,
                iteration,
                error: err.message,
              }) as Effect.Effect<void, never, never>;
              return yield* Effect.fail(err);
            }),
          ),
        );
      });

    const renderPosterDraft = (input: {
      headline: string;
      subhead?: string | null;
      template?: 'editorial' | 'stat' | 'listicle' | 'quote';
      image_prompt?: string | null;
      iteration?: number;
    }) =>
      withToolProgress('render_poster_draft', input.iteration ?? 1, { headline: input.headline, template: input.template ?? 'editorial' },
        Effect.gen(function* () {
          const iteration = input.iteration ?? 1;
          if (input.image_prompt && fal.isReady) {
            yield* fal.generate({
              jobId: state.ctx.job.id,
              prompt: input.image_prompt,
              imageSize: 'portrait_4_3',
              quality: 'medium',
              outputFormat: 'png',
            }).pipe(
              Effect.flatMap((image) =>
                createArtifact({
                  kind: 'image',
                  role: 'intermediate',
                  iteration,
                  url: image.url,
                  key: null,
                  mimeType: image.contentType ?? 'image/png',
                  width: image.width,
                  height: image.height,
                  durationS: null,
                  metadata: { request_id: image.requestId, source: 'fal' },
                }),
              ),
              Effect.ignore,
            );
          }
          const visibleLayers = [...LAYERS];
          const renderUrl = buildPosterRenderUrl(cfg.webBaseUrl, state.ctx.job.id, input.template ?? 'editorial', visibleLayers, {
            headline: clip(input.headline, 90),
            subhead: input.subhead ? clip(input.subhead, 140) : undefined,
          });
          const png = yield* render.shot({ url: renderUrl, width: 1080, height: 1350, deviceScaleFactor: 1 });
          const saved = yield* storage.saveBytes(`${state.ctx.job.id}/agent/poster-${iteration}.png`, png);
          const artifact = yield* createArtifact({
            kind: 'poster',
            role: 'draft',
            iteration,
            url: saved.url,
            key: saved.key,
            mimeType: 'image/png',
            width: 1080,
            height: 1350,
            durationS: null,
            metadata: { template: input.template ?? 'editorial', headline: clip(input.headline, 90), subhead: input.subhead ?? null },
          });
          yield* state.emit(ProgressStep.PosterLayer, `Draft poster ${iteration}`, 0.45, {
            layer: 'final',
            preview_url: saved.url,
            template: input.template ?? 'editorial',
          }) as Effect.Effect<void, never, never>;
          return artifact;
        }),
      );

    const renderVideoDraft = (input: {
      lines: { text: string; emotion?: string | null }[];
      caption?: string | null;
      hashtags?: string[] | null;
      iteration?: number;
    }) =>
      withToolProgress('render_video_draft', input.iteration ?? 1, { lines: input.lines.length },
        Effect.gen(function* () {
          const iteration = input.iteration ?? 1;
          const lines = input.lines.slice(0, 6).map((line) => ({
            text: clip(line.text, 96),
            emotion: (line.emotion ?? 'happy').toLowerCase(),
          })).filter((line) => line.text.length > 0);
          if (lines.length < 3) return yield* Effect.fail(new Error('video needs at least three lines'));
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            yield* state.emit(ProgressStep.ScriptLine, `Step ${i + 1}: ${line.text}`, 0.12 + (i / lines.length) * 0.08, {
              index: i,
              text: line.text,
              emotion: line.emotion,
            }) as Effect.Effect<void, never, never>;
          }
          const clipPaths: string[] = [];
          let thumbUrl: string | null = null;
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            const cat = cats.pickByEmotion(line.emotion);
            const ttsBytes = yield* tts.speak(line.text).pipe(Effect.catchAll(() => Effect.succeed(new Uint8Array())));
            const ttsSaved = yield* storage.saveBytes(`${state.ctx.job.id}/agent/audio-${iteration}-${i + 1}.mp3`, ttsBytes.length > 0 ? ttsBytes : SILENT_MP3);
            const rawDuration = yield* ff.probeDurationSeconds(ttsSaved.path).pipe(Effect.catchAll(() => Effect.succeed(Math.max(2.8, line.text.length * 0.075))));
            const durationSec = Math.max(2.5, Math.min(5, rawDuration));
            yield* state.emit(ProgressStep.TtsChunk, `Recorded line ${i + 1}`, null, {
              line_index: i,
              url: ttsSaved.url,
              duration_s: durationSec,
              voice: tts.voice,
            }) as Effect.Effect<void, never, never>;
            const cardUrl = buildCardRenderUrl(cfg.webBaseUrl, state.ctx.job.id, line.text, cat.emoji, cat.color, i + 1, lines.length);
            const png = yield* render.shot({ url: cardUrl, width: 1080, height: 1920, deviceScaleFactor: 1 });
            const cardSaved = yield* storage.saveBytes(`${state.ctx.job.id}/agent/card-${iteration}-${i + 1}.png`, png);
            thumbUrl ??= cardSaved.url;
            yield* state.emit(ProgressStep.AssetFetch, `Picked ${cat.emotion} cat`, null, {
              asset_id: cat.id,
              emotion: cat.emotion,
              url: cardSaved.url,
              thumbnail_url: cardSaved.url,
              scene_index: i,
            }) as Effect.Effect<void, never, never>;
            const clipPath = join(cfg.outputsDir, `${state.ctx.job.id}/agent/clip-${iteration}-${i + 1}.mp4`);
            const clipKey = `${state.ctx.job.id}/agent/clip-${iteration}-${i + 1}.mp4`;
            yield* ff.makeClipFromStillAndAudio({ imagePath: cardSaved.path, audioPath: ttsSaved.path, outPath: clipPath, durationSec });
            const clipSaved = yield* storage.saveFile(clipKey, clipPath, 'video/mp4');
            clipPaths.push(clipPath);
            yield* state.emit(ProgressStep.RenderFrame, `Clip ${i + 1}/${lines.length}`, 0.45 + ((i + 1) / lines.length) * 0.35, {
              frame: i + 1,
              total: lines.length,
              thumbnail_url: cardSaved.url,
              fps: 30,
              clip_url: clipSaved.url,
            }) as Effect.Effect<void, never, never>;
          }
          const finalKey = `${state.ctx.job.id}/agent/final-${iteration}.mp4`;
          const finalPath = join(cfg.outputsDir, finalKey);
          yield* state.emit(ProgressStep.RenderStart, 'Stitching draft cut', 0.88) as Effect.Effect<void, never, never>;
          yield* ff.concatClips({ clipPaths, outPath: finalPath });
          const finalSaved = yield* storage.saveFile(finalKey, finalPath, 'video/mp4');
          const duration = yield* ff.probeDurationSeconds(finalPath).pipe(Effect.catchAll(() => Effect.succeed(null)));
          const artifact = yield* createArtifact({
            kind: 'video',
            role: 'draft',
            iteration,
            url: finalSaved.url,
            key: finalSaved.key,
            mimeType: 'video/mp4',
            width: 1080,
            height: 1920,
            durationS: duration,
            metadata: { thumbnail_url: thumbUrl, lines, caption: input.caption ?? null, hashtags: input.hashtags ?? [] },
          });
          yield* state.emit(ProgressStep.RenderDone, 'Draft cut ready', 0.94, { url: finalSaved.url, thumbnail_url: thumbUrl }) as Effect.Effect<void, never, never>;
          return artifact;
        }),
      );

    const reviewArtifact = (input: { artifact_id: string; iteration?: number; prompt?: string | null }) =>
      withToolProgress('review_artifact', input.iteration ?? 1, { artifact_id: input.artifact_id },
        Effect.gen(function* () {
          const artifact = state.artifacts.find((a) => a.id === input.artifact_id);
          if (!artifact) return yield* Effect.fail(new Error('artifact not found'));
          return yield* Effect.gen(function* () {
          if (artifact.kind === 'poster' || artifact.kind === 'image' || artifact.kind === 'frame') {
            if (!artifact.key) return yield* Effect.fail(new Error('artifact has no local key'));
            const path = join(cfg.outputsDir, artifact.key);
            return yield* vision.reviewImage({
              state,
              artifactId: artifact.id,
              filePath: path,
              mimeType: artifact.mimeType ?? 'image/png',
              prompt: input.prompt ?? `Review this ${artifact.kind} for ${state.ctx.brand.name}.`,
              iteration: input.iteration ?? artifact.iteration,
            });
          }
          if (artifact.kind === 'video') {
            if (!artifact.key) return yield* Effect.fail(new Error('video artifact has no local key'));
            const frameKey = `${state.ctx.job.id}/agent/review-frame-${artifact.iteration}.jpg`;
            const framePath = join(cfg.outputsDir, frameKey);
            yield* ff.extractFrame({ videoPath: join(cfg.outputsDir, artifact.key), outPath: framePath, atSeconds: Math.max(1, (artifact.durationS ?? 6) / 2) });
            const frameSaved = yield* storage.saveFile(frameKey, framePath, 'image/jpeg');
            yield* createArtifact({
              kind: 'frame',
              role: 'intermediate',
              iteration: input.iteration ?? artifact.iteration,
              url: frameSaved.url,
              key: frameKey,
              mimeType: 'image/jpeg',
              width: 1080,
              height: 1920,
              durationS: null,
              metadata: { source_artifact_id: artifact.id },
            });
            return yield* vision.reviewImage({
              state,
              artifactId: artifact.id,
              filePath: framePath,
              mimeType: 'image/jpeg',
              prompt: input.prompt ?? `Review this sampled video frame for ${state.ctx.brand.name}. Check if the final video should pass social review.`,
              iteration: input.iteration ?? artifact.iteration,
            });
          }
            return yield* Effect.fail(new Error('unsupported artifact kind'));
          });
        }),
      );

    const finalizeArtifact = (input: { artifact_id: string; caption?: string | null; hashtags?: string[] | null }) =>
      withToolProgress('finalize_artifact', 0, { artifact_id: input.artifact_id },
        Effect.gen(function* () {
          const artifact = state.artifacts.find((a) => a.id === input.artifact_id);
          if (!artifact?.url) return yield* Effect.fail(new Error('artifact not found or missing url'));
          const outputKey = artifact.key ?? `${state.ctx.job.id}/agent/final`;
          const thumbnailUrl = artifact.kind === 'video'
            ? String(artifact.metadata.thumbnail_url ?? artifact.url)
            : artifact.url;
          const outputUrl = artifact.url;
          yield* Effect.tryPromise(() =>
            sb.client.rpc('set_job_output', {
              p_job_id: state.ctx.job.id,
              p_output_url: outputUrl,
              p_output_key: outputKey,
              p_thumbnail_url: thumbnailUrl,
            }),
          );
          const caption = input.caption;
          if (caption) {
            yield* Effect.tryPromise(() =>
              sb.client.rpc('set_job_caption', {
                p_job_id: state.ctx.job.id,
                p_caption: clip(caption, 800),
                p_hashtags: (input.hashtags ?? []).map((tag) => clip(tag, 40)).slice(0, 8),
              }),
            );
          }
          yield* createArtifact({
            ...artifact,
            role: 'final',
            metadata: { ...artifact.metadata, source_artifact_id: artifact.id },
          });
          yield* Effect.tryPromise(() => sb.client.rpc('update_content_job_status', { p_job_id: state.ctx.job.id, p_status: 'REVIEW' }));
          state.finalized = true;
          yield* state.emit(ProgressStep.AgentFinal, 'Final artifact selected', 0.97, { artifact_id: artifact.id, url: artifact.url }) as Effect.Effect<void, never, never>;
          yield* state.emit(ProgressStep.Review, 'Ready for review', 0.98) as Effect.Effect<void, never, never>;
          yield* state.emit(ProgressStep.Complete, 'Done', 1) as Effect.Effect<void, never, never>;
          return { ok: true, artifact_id: artifact.id, url: artifact.url };
        }),
      );

    const emitBudget = () =>
      Effect.gen(function* () {
        const spent = budget.getJobSpend(state.ctx.job.id);
        yield* state.emit(ProgressStep.AgentBudget, `Job spend $${spent.toFixed(3)} / $${cfg.agentJobUsdCap.toFixed(2)}`, null, {
          spent_usd: spent,
          cap_usd: cfg.agentDailyUsdCap,
          job_spent_usd: spent,
          job_cap_usd: cfg.agentJobUsdCap,
        }) as Effect.Effect<void, never, never>;
        return { spent_usd: spent, job_cap_usd: cfg.agentJobUsdCap };
      });

    const run = <A>(effect: Effect.Effect<A, Error>) => Effect.runPromise(effect);

    return [
      tool({
        name: 'render_poster_draft',
        description: 'Render a poster draft. Use for POSTER and CAROUSEL jobs before review/finalize.',
        parameters: z.object({
          headline: z.string().min(1).max(100),
          subhead: z.string().max(160).nullable().optional(),
          template: z.enum(['editorial', 'stat', 'listicle', 'quote']).optional(),
          image_prompt: z.string().max(600).nullable().optional(),
          iteration: z.number().int().min(1).max(5).optional(),
        }),
        execute: (input) => run(renderPosterDraft(input)).then(toModel),
      }),
      tool({
        name: 'render_video_draft',
        description: 'Render a 20-30 second vertical cat-meme explainer draft for VIDEO and REEL jobs.',
        parameters: z.object({
          lines: z.array(z.object({ text: z.string().min(1).max(110), emotion: z.string().max(40).nullable().optional() })).min(3).max(6),
          caption: z.string().max(800).nullable().optional(),
          hashtags: z.array(z.string().max(40)).max(8).nullable().optional(),
          iteration: z.number().int().min(1).max(5).optional(),
        }),
        execute: (input) => run(renderVideoDraft(input)).then(toModel),
      }),
      tool({
        name: 'review_artifact',
        description: 'Review a rendered poster, image, or sampled video frame with the same OpenRouter vision model.',
        parameters: z.object({
          artifact_id: z.uuid(),
          prompt: z.string().max(600).nullable().optional(),
          iteration: z.number().int().min(1).max(5).optional(),
        }),
        execute: (input) => run(reviewArtifact(input)).then(toModel),
      }),
      tool({
        name: 'finalize_artifact',
        description: 'Finalize a reviewed artifact and move the job to REVIEW. Call only after rendering and reviewing.',
        parameters: z.object({
          artifact_id: z.uuid(),
          caption: z.string().max(800).nullable().optional(),
          hashtags: z.array(z.string().max(40)).max(8).nullable().optional(),
        }),
        execute: (input) => run(finalizeArtifact(input)).then(toModel),
      }),
      tool({
        name: 'emit_budget',
        description: 'Emit current job budget usage to the Studio.',
        parameters: z.object({}),
        execute: () => run(emitBudget()).then(toModel),
      }),
    ] satisfies Tool[];
  });

const toModel = (value: unknown) => safeJson(value);

const buildPosterRenderUrl = (
  base: string,
  jobId: string,
  template: string,
  visibleLayers: readonly string[],
  copy: { headline: string; subhead?: string },
) => {
  const u = new URL(`${base}/render/poster/${jobId}`);
  u.searchParams.set('template', template);
  u.searchParams.set('layers', visibleLayers.join(','));
  u.searchParams.set('headline', copy.headline);
  if (copy.subhead) u.searchParams.set('subhead', copy.subhead);
  return u.toString();
};

const buildCardRenderUrl = (base: string, jobId: string, line: string, emoji: string, color: string, index: number, total: number) => {
  const u = new URL(`${base}/render/video/card/${jobId}`);
  u.searchParams.set('line', line);
  u.searchParams.set('emoji', emoji);
  u.searchParams.set('color', color);
  u.searchParams.set('index', String(index));
  u.searchParams.set('total', String(total));
  return u.toString();
};
