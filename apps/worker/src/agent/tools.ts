import { Effect } from 'effect';
import { ProgressStep } from '@marquee/shared/progress';
import { tool, type Tool } from '@openai/agents';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { AppConfig } from '../config.js';
import { Renderer } from '../lib/playwright-renderer.js';
import { Storage } from '../lib/storage.js';
import { Supabase } from '../lib/supabase.js';
import { Tts } from '../lib/tts.js';
import { Ffmpeg } from '../lib/ffmpeg.js';
import { FalImage } from '../lib/fal-image.js';
import { Vision } from '../lib/vision.js';
import { AgentBudget } from '../lib/agent-budget.js';
import type { ArtifactRecord, ContentAgentState } from './types.js';
import { stageVisualAsset } from './workspace.js';

const MAX_TEXT = 180;
const LAYERS = ['background', 'wordmark', 'headline', 'accent', 'final'] as const;
const execFileAsync = promisify(execFile);

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
type PosterAssetPlacement = {
  x: number;
  y: number;
  width: number;
  rotation?: number;
  opacity?: number;
};
type PosterGeneratedAssetRequest = PosterAssetPlacement & { prompt: string };
type PosterUserAssetRequest = PosterAssetPlacement & { asset_id: string };
type PosterRenderAsset = PosterAssetPlacement & { url: string };
type PosterRenderAssetWithBlend = PosterRenderAsset & { blend?: 'normal' | 'multiply' };
type PosterTemplate = 'editorial' | 'stat' | 'listicle' | 'quote';
type PlacementRect = { x: number; y: number; width: number; height: number };

const PosterGeneratedAssetSchema = z.object({
  prompt: z.string().min(1).max(280),
  x: z.number().min(0).max(92),
  y: z.number().min(0).max(92),
  width: z.number().min(6).max(28),
  rotation: z.number().min(-24).max(24).optional().default(0),
  opacity: z.number().min(0.25).max(1).optional(),
});

const PosterUserAssetSchema = z.object({
  asset_id: z.string().min(1).max(160),
  x: z.number().min(0).max(92),
  y: z.number().min(0).max(92),
  width: z.number().min(6).max(36),
  rotation: z.number().min(-24).max(24).optional().default(0),
  opacity: z.number().min(0.25).max(1).optional(),
});

const clip = (value: string, max = MAX_TEXT) => value.trim().slice(0, max);
const safeJson = (value: unknown) => JSON.stringify(value);
const toError = (err: unknown) => err instanceof Error ? err : new Error(String(err));

export const makeContentAgentRuntime = (state: ContentAgentState) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const render = yield* Renderer;
    const storage = yield* Storage;
    const sb = yield* Supabase;
    const tts = yield* Tts;
    const ff = yield* Ffmpeg;
    const fal = yield* FalImage;
    const vision = yield* Vision;
    const budget = yield* AgentBudget;
    const rpc = sb.client.rpc.bind(sb.client) as unknown as Rpc;
    const fromPromise = <A>(tryer: () => Promise<A>) => Effect.tryPromise({ try: tryer, catch: toError });

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
        const thumbnailUrl = typeof artifact.metadata.thumbnail_url === 'string'
          ? artifact.metadata.thumbnail_url
          : artifact.kind === 'video' ? null : artifact.url;
        yield* state.emit(ProgressStep.ArtifactCreate, `${artifact.kind} ${artifact.role} created`, null, {
          artifact_id: artifact.id,
          kind: artifact.kind,
          role: artifact.role,
          url: artifact.url,
          thumbnail_url: thumbnailUrl,
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
      asset_prompts?: PosterGeneratedAssetRequest[] | null;
      user_assets?: PosterUserAssetRequest[] | null;
      iteration?: number;
    }) =>
      withToolProgress('render_poster_draft', input.iteration ?? 1, { headline: input.headline, template: input.template ?? 'editorial' },
        Effect.gen(function* () {
          const iteration = input.iteration ?? 1;
          const template = input.template ?? 'editorial';
          const posterAssets: PosterRenderAssetWithBlend[] = [];
          for (const requested of normalizeUserPosterAssets(input.user_assets, template)) {
            const staged = yield* fromPromise(async () =>
              stageVisualAsset(state.workspace, requested.asset_id, cfg.workerHttpUrl, state.ctx.job.id, requested.asset_id));
            const stagedPath = join(state.workspace.root, staged.path);
            let assetPath = stagedPath;
            let assetType = staged.asset.content_type;
            if (assetType.startsWith('video/')) {
              const frameKey = `${state.ctx.job.id}/agent/poster-input-frame-${iteration}-${posterAssets.length + 1}.jpg`;
              const framePath = join(cfg.outputsDir, frameKey);
              yield* ff.extractFrame({ videoPath: stagedPath, outPath: framePath, atSeconds: 1 });
              assetPath = framePath;
              assetType = 'image/jpeg';
            }
            const saved = yield* storage.saveFile(
              `${state.ctx.job.id}/agent/poster-input-${iteration}-${posterAssets.length + 1}${extForContentType(assetType)}`,
              assetPath,
              assetType,
            );
            yield* createArtifact({
              kind: 'image',
              role: 'intermediate',
              iteration,
              url: saved.url,
              key: saved.key,
              mimeType: assetType,
              width: null,
              height: null,
              durationS: null,
              metadata: {
                source: staged.asset.source,
                input_asset_id: staged.asset.id,
                description: 'description' in staged.asset ? staged.asset.description : '',
                usage_hint: 'usage_hint' in staged.asset ? staged.asset.usage_hint : '',
                placement: placementPayload(requested),
              },
            });
            posterAssets.push({ url: saved.url, ...placementPayload(requested), blend: 'normal' });
            yield* state.emit(ProgressStep.AssetFetch, `Placed ${staged.asset.title}`, null, {
              asset_id: staged.asset.id,
              emotion: 'reference',
              url: saved.url,
              thumbnail_url: saved.url,
              scene_index: posterAssets.length - 1,
            }) as Effect.Effect<void, never, never>;
          }

          const generatedAssets = normalizeGeneratedPosterAssets(input, template);
          if (generatedAssets.length > 0 && !fal.isReady) {
            return yield* Effect.fail(new Error('FAL_KEY missing for requested poster assets'));
          }
          for (const requested of generatedAssets) {
            const image = yield* fal.generate({
              jobId: state.ctx.job.id,
              prompt: posterAssetPrompt(requested.prompt, state),
              imageSize: 'square',
              quality: 'low',
              outputFormat: 'png',
            });
            const downloaded = yield* downloadMedia(image.url);
            const saved = yield* storage.saveBytes(
              `${state.ctx.job.id}/agent/poster-asset-${iteration}-${posterAssets.length + 1}.png`,
              downloaded.bytes,
              image.contentType ?? downloaded.contentType ?? 'image/png',
            );
            yield* createArtifact({
              kind: 'image',
              role: 'intermediate',
              iteration,
              url: saved.url,
              key: saved.key,
              mimeType: image.contentType ?? downloaded.contentType ?? 'image/png',
              width: image.width,
              height: image.height,
              durationS: null,
              metadata: {
                request_id: image.requestId,
                source: 'fal',
                usage: 'poster_decorative_asset',
                prompt: clip(requested.prompt, 280),
                placement: placementPayload(requested),
              },
            });
            posterAssets.push({ url: saved.url, ...placementPayload(requested), blend: 'multiply' });
            yield* state.emit(ProgressStep.AssetFetch, `Generated poster asset ${posterAssets.length}`, null, {
              asset_id: `generated-${posterAssets.length}`,
              emotion: 'decorative',
              url: saved.url,
              thumbnail_url: saved.url,
              scene_index: posterAssets.length - 1,
            }) as Effect.Effect<void, never, never>;
          }
          const visibleLayers = [...LAYERS];
          const renderUrl = buildPosterRenderUrl(cfg.webBaseUrl, state.ctx.job.id, template, visibleLayers, {
            headline: clip(input.headline, 90),
            subhead: input.subhead ? clip(input.subhead, 140) : undefined,
          }, posterAssets);
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
            metadata: {
              template,
              headline: clip(input.headline, 90),
              subhead: input.subhead ?? null,
              assets: posterAssets,
            },
          });
          yield* state.emit(ProgressStep.PosterLayer, `Draft poster ${iteration}`, 0.45, {
            layer: 'final',
            preview_url: saved.url,
            template,
          }) as Effect.Effect<void, never, never>;
          return artifact;
        }),
      );

    const workspaceShell = (input: { cmd: string }) =>
      withToolProgress('workspace_shell', 0, { cmd: input.cmd.slice(0, 160) },
        Effect.promise(async () => {
          const cmd = input.cmd.trim();
          if (!cmd) return { exit_code: 2, stdout: '', stderr: 'cmd is required' };
          if (cmd.includes('\0')) return { exit_code: 2, stdout: '', stderr: 'cmd contains a null byte' };
          const args = [
            'run',
            '--rm',
            '--network',
            'none',
            '--cpus',
            '1',
            '--memory',
            '768m',
            '--pids-limit',
            '256',
            '--cap-drop',
            'ALL',
            '--security-opt',
            'no-new-privileges',
            '--read-only',
            '--tmpfs',
            '/tmp:rw,nosuid,nodev,size=128m',
            '--tmpfs',
            '/run:rw,nosuid,nodev,size=32m',
            '-e',
            'HOME=/workspace/shared',
            '-v',
            `${state.workspace.root}:/workspace/shared:rw`,
            '-w',
            '/workspace/shared',
            cfg.agentSandboxImage,
            'bash',
            '-lc',
            cmd,
          ];
          try {
            const { stdout, stderr } = await execFileAsync('docker', args, {
              timeout: 30_000,
              maxBuffer: 384 * 1024,
            });
            return {
              exit_code: 0,
              stdout: truncateOutput(stdout),
              stderr: truncateOutput(stderr),
            };
          } catch (err) {
            const cause = err as { code?: number | string; signal?: string; stdout?: string; stderr?: string; killed?: boolean };
            return {
              exit_code: typeof cause.code === 'number' ? cause.code : null,
              signal: cause.signal ?? null,
              timed_out: cause.killed === true,
              stdout: truncateOutput(cause.stdout ?? ''),
              stderr: truncateOutput(cause.stderr ?? String(err)),
            };
          }
        }),
      );

    const renderVideoDraft = (input: {
      lines: { text: string; emotion?: string | null; asset_id: string }[];
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
            assetId: line.asset_id?.trim() || null,
          })).filter((line) => line.text.length > 0);
          if (lines.length < 3) return yield* Effect.fail(new Error('video needs at least three lines'));
          if (lines.some((line) => !line.assetId)) return yield* Effect.fail(new Error('every video line needs a cat asset_id'));
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
            const staged = yield* fromPromise(async () => {
              return await stageVisualAsset(state.workspace, line.assetId!, cfg.workerHttpUrl, state.ctx.job.id);
            });
            const stagedSaved = yield* storage.saveFile(
              `${state.ctx.job.id}/agent/assets/${basename(staged.path)}`,
              join(state.workspace.root, staged.path),
              staged.asset.content_type,
            );
            const ttsBytes = yield* tts.speak(line.text);
            const ttsSaved = yield* storage.saveBytes(`${state.ctx.job.id}/agent/audio-${iteration}-${i + 1}.mp3`, ttsBytes);
            const rawDuration = yield* ff.probeDurationSeconds(ttsSaved.path);
            const durationSec = Math.max(2.5, Math.min(5, rawDuration));
            yield* state.emit(ProgressStep.TtsChunk, `Recorded line ${i + 1}`, null, {
              line_index: i,
              url: ttsSaved.url,
              duration_s: durationSec,
              voice: tts.voice,
            }) as Effect.Effect<void, never, never>;
            let visualUrl = stagedSaved.url;
            if (staged.asset.content_type.startsWith('video/')) {
              const frameKey = `${state.ctx.job.id}/agent/input-video-frame-${iteration}-${i + 1}.jpg`;
              const framePath = join(cfg.outputsDir, frameKey);
              yield* ff.extractFrame({ videoPath: stagedSaved.path, outPath: framePath, atSeconds: 1 });
              const frameSaved = yield* storage.saveFile(frameKey, framePath, 'image/jpeg');
              visualUrl = frameSaved.url;
            }
            const cardUrl = buildCardRenderUrl(cfg.webBaseUrl, state.ctx.job.id, line.text, i + 1, lines.length, visualUrl);
            const png = yield* render.shot({ url: cardUrl, width: 1080, height: 1920, deviceScaleFactor: 1 });
            const cardSaved = yield* storage.saveBytes(`${state.ctx.job.id}/agent/card-${iteration}-${i + 1}.png`, png);
            thumbUrl ??= cardSaved.url;
            yield* state.emit(ProgressStep.AssetFetch, `Picked ${staged.asset.title}`, null, {
              asset_id: staged.asset.id,
              emotion: line.emotion,
              url: stagedSaved.url,
              thumbnail_url: visualUrl,
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
          const duration = yield* ff.probeDurationSeconds(finalPath);
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
              prompt: input.prompt ?? defaultReviewPrompt(artifact.kind, state),
              iteration: input.iteration ?? artifact.iteration,
            });
          }
          if (artifact.kind === 'video') {
            if (!artifact.key) return yield* Effect.fail(new Error('video artifact has no local key'));
            const videoPath = join(cfg.outputsDir, artifact.key);
            const duration = yield* ff.probeDurationSeconds(videoPath);
            const frameKey = `${state.ctx.job.id}/agent/review-frame-${artifact.iteration}.jpg`;
            const framePath = join(cfg.outputsDir, frameKey);
            yield* ff.extractFrame({ videoPath, outPath: framePath, atSeconds: Math.max(1, duration / 2) });
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
              prompt: input.prompt ?? `This is one sampled frame from a ${duration.toFixed(1)}s vertical video for ${state.ctx.brand.name}. Review only visual readability and composition in this frame. Do not claim to have checked motion, audio, or the full timeline.`,
              iteration: input.iteration ?? artifact.iteration,
              reviewScope: 'sampled_video_frame',
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

    const sharedTools = [
      tool({
        name: 'workspace_shell',
        description: 'Run one bash command in an isolated Docker workspace mounted at /workspace/shared. Use it to inspect job files and write short notes before rendering.',
        parameters: z.object({
          cmd: z.string().min(1).max(8000),
        }),
        execute: (input) => run(workspaceShell(input)).then(toModel),
      }),
    ];

    const posterTools = [
      tool({
        name: 'render_poster_draft',
        description: 'Render a poster draft. Use for POSTER and CAROUSEL jobs before review/finalize.',
        parameters: z.object({
          headline: z.string().min(1).max(100),
          subhead: z.string().max(160).nullable().optional(),
          template: z.enum(['editorial', 'stat', 'listicle', 'quote']).optional(),
          image_prompt: z.string().max(600).nullable().optional(),
          asset_prompts: z.array(PosterGeneratedAssetSchema).max(4).nullable().optional(),
          user_assets: z.array(PosterUserAssetSchema).max(4).nullable().optional(),
          iteration: z.number().int().min(1).max(5).optional(),
        }),
        execute: (input) => run(renderPosterDraft(input)).then(toModel),
      }),
    ];

    const videoTools = [
      tool({
        name: 'render_video_draft',
        description: 'Render a 20-30 second vertical explainer draft for VIDEO and REEL jobs. Every line must include an asset_id from /workspace/shared/assets/input/metadata.json or /workspace/shared/assets/cats/metadata.json.',
        parameters: z.object({
          lines: z.array(z.object({
            text: z.string().min(1).max(110),
            emotion: z.string().max(40).nullable().optional(),
            asset_id: z.string().min(1).max(120),
          })).min(3).max(6),
          caption: z.string().max(800).nullable().optional(),
          hashtags: z.array(z.string().max(40)).max(8).nullable().optional(),
          iteration: z.number().int().min(1).max(5).optional(),
        }),
        execute: (input) => run(renderVideoDraft(input)).then(toModel),
      }),
    ];

    const tools = [
      ...sharedTools,
      ...(state.ctx.job.content_type === 'VIDEO' || state.ctx.job.content_type === 'REEL' ? videoTools : posterTools),
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

    return {
      tools,
      workspaceShell,
      renderPosterDraft,
      renderVideoDraft,
      reviewArtifact,
      finalizeArtifact,
      emitBudget,
    } as const;
  });

export const makeContentAgentTools = (state: ContentAgentState) =>
  makeContentAgentRuntime(state).pipe(Effect.map((runtime) => runtime.tools));

const toModel = (value: unknown) => safeJson(value);

const truncateOutput = (value: string) =>
  value.length > 12_000 ? `${value.slice(0, 12_000)}\n[truncated]` : value;

const buildPosterRenderUrl = (
  base: string,
  jobId: string,
  template: string,
  visibleLayers: readonly string[],
  copy: { headline: string; subhead?: string },
  assets: PosterRenderAssetWithBlend[],
) => {
  const u = new URL(`${base}/render/poster/${jobId}`);
  u.searchParams.set('template', template);
  u.searchParams.set('layers', visibleLayers.join(','));
  u.searchParams.set('headline', copy.headline);
  if (copy.subhead) u.searchParams.set('subhead', copy.subhead);
  if (assets.length > 0) u.searchParams.set('assets', JSON.stringify(assets.slice(0, 4)));
  return u.toString();
};

const buildCardRenderUrl = (base: string, jobId: string, line: string, index: number, total: number, imageUrl: string) => {
  const u = new URL(`${base}/render/video/card/${jobId}`);
  u.searchParams.set('line', line);
  u.searchParams.set('index', String(index));
  u.searchParams.set('total', String(total));
  u.searchParams.set('image', imageUrl);
  return u.toString();
};

const normalizeGeneratedPosterAssets = (input: {
  headline: string;
  image_prompt?: string | null;
  asset_prompts?: PosterGeneratedAssetRequest[] | null;
}, template: PosterTemplate) => {
  const explicit = (input.asset_prompts ?? []).slice(0, 4).map((asset, index) => ({
    prompt: clip(asset.prompt, 280),
    ...safePlacement(asset, template, index),
  }));
  if (explicit.length > 0 || !input.image_prompt?.trim()) return explicit;
  return [{
    prompt: clip(input.image_prompt, 280),
    ...safePlacement(seededPlacement(`${input.headline}:${input.image_prompt}`), template, 0),
  }];
};

const normalizeUserPosterAssets = (assets: PosterUserAssetRequest[] | null | undefined, template: PosterTemplate) =>
  (assets ?? []).slice(0, 4).map((asset, index) => ({
    asset_id: asset.asset_id,
    ...safePlacement(asset, template, index),
  }));

const placementPayload = (asset: PosterAssetPlacement): PosterAssetPlacement => ({
  x: clamp(asset.x, 0, 92),
  y: clamp(asset.y, 0, 92),
  width: clamp(asset.width, 6, 36),
  rotation: clamp(asset.rotation ?? 0, -24, 24),
  opacity: asset.opacity === undefined ? undefined : clamp(asset.opacity, 0.25, 1),
});

const posterAssetPrompt = (prompt: string, state: ContentAgentState) =>
  [
    `Create one small isolated decorative asset for a premium social poster for ${state.ctx.brand.name}.`,
    `Asset request: ${clip(prompt, 280)}.`,
    'No words, no letters, no numbers, no logo, no watermark, no finished poster, no background scene.',
    'Make it usable as a cutout or sticker over a designed layout. Transparent or plain light background is preferred.',
  ].join(' ');

const safePlacement = (asset: PosterAssetPlacement, template: PosterTemplate, index: number): PosterAssetPlacement => {
  const placement = placementPayload(asset);
  if (fitsAllowedZone(placement, template)) return placement;
  const zones = allowedPosterZones(template);
  const zone = zones[index % zones.length]!;
  const width = Math.min(placement.width, zone.width, zone.height);
  const unit = (shift: number) => seededUnit(`${template}:${index}:${placement.x}:${placement.y}:${shift}`);
  return {
    ...placement,
    width,
    x: zone.x + Math.max(0, zone.width - width) * unit(1),
    y: zone.y + Math.max(0, zone.height - width) * unit(2),
  };
};

const fitsAllowedZone = (asset: PosterAssetPlacement, template: PosterTemplate) =>
  allowedPosterZones(template).some((zone) => rectContains(zone, placementRect(asset)));

const allowedPosterZones = (template: PosterTemplate): PlacementRect[] => {
  switch (template) {
    case 'stat':
      return [
        { x: 70, y: 8, width: 22, height: 18 },
        { x: 72, y: 74, width: 20, height: 14 },
        { x: 6, y: 74, width: 18, height: 14 },
      ];
    case 'listicle':
      return [
        { x: 70, y: 6, width: 22, height: 18 },
        { x: 72, y: 76, width: 18, height: 14 },
        { x: 6, y: 72, width: 18, height: 16 },
      ];
    case 'quote':
      return [
        { x: 64, y: 8, width: 24, height: 20 },
        { x: 8, y: 76, width: 20, height: 16 },
        { x: 70, y: 72, width: 18, height: 16 },
      ];
    case 'editorial':
    default:
      return [
        { x: 66, y: 8, width: 24, height: 30 },
        { x: 72, y: 46, width: 18, height: 24 },
        { x: 8, y: 28, width: 16, height: 18 },
      ];
  }
};

const rectContains = (outer: PlacementRect, inner: PlacementRect) =>
  inner.x >= outer.x
  && inner.y >= outer.y
  && inner.x + inner.width <= outer.x + outer.width
  && inner.y + inner.height <= outer.y + outer.height;

const placementRect = (asset: PosterAssetPlacement): PlacementRect => ({
  x: asset.x,
  y: asset.y,
  width: asset.width,
  height: asset.width,
});

const defaultReviewPrompt = (kind: string, state: ContentAgentState) =>
  kind === 'poster'
    ? [
        `Review this poster for ${state.ctx.brand.name}.`,
        'The layout, typography, and CTA should be designed by the template; generated/user assets should behave like small supporting cutouts.',
        'Pass only if text is readable at phone size, contrast is strong, brand/CTA are visible, and no asset overlaps or competes with key copy.',
        'Return pass=false as a revision signal, not a terminal failure, for full-poster AI imagery, cramped type, bad contrast, messy placement, or decorative assets covering the hierarchy.',
      ].join(' ')
    : `Review this ${kind} for ${state.ctx.brand.name}.`;

const seededPlacement = (seed: string): PosterAssetPlacement => {
  return {
    x: 8 + seededUnit(seed, 1) * 70,
    y: 6 + seededUnit(seed, 2) * 74,
    width: 9 + seededUnit(seed, 3) * 13,
    rotation: -18 + seededUnit(seed, 4) * 36,
    opacity: 0.9,
  };
};

const seededUnit = (seed: string, shift = 0) => {
  const hash = [...seed].reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0);
  return Math.abs(Math.sin(hash + shift)) % 1;
};

const downloadMedia = (url: string) =>
  Effect.tryPromise({
    try: async () => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        contentType: res.headers.get('content-type'),
      };
    },
    catch: toError,
  });

const extForContentType = (contentType: string) => {
  if (contentType.includes('jpeg')) return '.jpg';
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  return '.bin';
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
