import { Effect } from 'effect';
import { ProgressStep } from '@marquee/shared/progress';
import { join } from 'node:path';
import { Llm } from '../lib/llm.js';
import { Renderer } from '../lib/playwright-renderer.js';
import { Storage } from '../lib/storage.js';
import { Supabase } from '../lib/supabase.js';
import { Cats, type Cat } from '../lib/cats.js';
import { Tts } from '../lib/tts.js';
import { Ffmpeg } from '../lib/ffmpeg.js';
import { JobStream } from '../ws/job-stream.js';
import { AppConfig } from '../config.js';
import { makeEmitter } from './progress.js';
import type { PipelineContext } from './types.js';

interface VideoScript {
  hook: string;
  lines: { text: string; emotion: string }[];
  caption: string;
  hashtags: string[];
}

export const runVideoPipeline = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const llm     = yield* Llm;
    const render  = yield* Renderer;
    const storage = yield* Storage;
    const sb      = yield* Supabase;
    const cats    = yield* Cats;
    const tts     = yield* Tts;
    const ff      = yield* Ffmpeg;
    const cfg     = yield* AppConfig;
    const stream  = yield* JobStream;

    const emit = makeEmitter({ jobId: ctx.job.id, stream, sb });

    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', { p_job_id: ctx.job.id, p_status: 'GENERATING' }),
    );

    yield* emit(ProgressStep.Research, `Picking the angle for "${ctx.job.topic ?? 'today'}"`, 0.04);

    const script = yield* writeScript(llm, ctx, cats.emotions).pipe(
      Effect.tap((s) => emit(ProgressStep.ScriptStart, `Drafted ${s.lines.length} steps`, 0.12, { hook: s.hook })),
    );

    for (let i = 0; i < script.lines.length; i++) {
      const line = script.lines[i]!;
      yield* emit(ProgressStep.ScriptLine, `Step ${i + 1}: ${line.text}`, 0.12 + (i / script.lines.length) * 0.08, {
        index: i, text: line.text, emotion: line.emotion,
      });
    }

    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', { p_job_id: ctx.job.id, p_status: 'RENDERING' }),
    );

    interface SceneFile { clipPath: string; cardUrl: string; ttsUrl: string; cat: Cat; }
    const scenes: SceneFile[] = [];

    for (let i = 0; i < script.lines.length; i++) {
      const line = script.lines[i]!;
      const cat = cats.pickByEmotion(line.emotion);

      const ttsBytes = yield* tts.speak(line.text).pipe(
        Effect.catchAll(() => Effect.succeed(new Uint8Array())),
      );
      const ttsKey = `${ctx.job.id}/audio/line-${i + 1}.mp3`;
      const ttsSaved = yield* storage.saveBytes(ttsKey, ttsBytes.length > 0 ? ttsBytes : SILENT_MP3);
      const durationSec = yield* ff.probeDurationSeconds(ttsSaved.path).pipe(
        Effect.catchAll(() => Effect.succeed(Math.max(2.5, line.text.length * 0.075))),
      );
      yield* emit(ProgressStep.TtsChunk, `Recorded line ${i + 1}`, 0.2 + ((i + 0.5) / script.lines.length) * 0.25, {
        line_index: i, url: ttsSaved.url, duration_s: durationSec, voice: tts.voice,
      });

      const cardUrl = buildCardUrl(cfg.webBaseUrl, ctx.job.id, line.text, cat, i + 1, script.lines.length);
      const png = yield* render.shot({ url: cardUrl, width: 1080, height: 1920, deviceScaleFactor: 1 });
      const cardKey = `${ctx.job.id}/cards/line-${i + 1}.png`;
      const cardSaved = yield* storage.saveBytes(cardKey, png);
      yield* emit(ProgressStep.AssetFetch, `Picked "${cat.emotion}" cat`, null, {
        asset_id: cat.id, emotion: cat.emotion, url: cardSaved.url,
        thumbnail_url: cardSaved.url, scene_index: i,
      });

      const clipPath = join(cfg.outputsDir, `${ctx.job.id}/clips/clip-${i + 1}.mp4`);
      yield* ff.makeClipFromStillAndAudio({
        imagePath: cardSaved.path, audioPath: ttsSaved.path,
        outPath: clipPath, durationSec,
      });
      const clipUrl = `${cfg.workerHttpUrl}/outputs/${ctx.job.id}/clips/clip-${i + 1}.mp4`;
      yield* emit(ProgressStep.RenderFrame, `Clip ${i + 1}/${script.lines.length}`, 0.45 + ((i + 1) / script.lines.length) * 0.4, {
        frame: i + 1, total: script.lines.length, thumbnail_url: cardSaved.url, fps: 30, clip_url: clipUrl,
      });
      scenes.push({ clipPath, cardUrl: cardSaved.url, ttsUrl: ttsSaved.url, cat });
    }

    yield* emit(ProgressStep.RenderStart, 'Stitching final cut', 0.88);
    const finalPath = join(cfg.outputsDir, `${ctx.job.id}/final.mp4`);
    yield* ff.concatClips({ clipPaths: scenes.map((s) => s.clipPath), outPath: finalPath });
    const finalUrl = `${cfg.workerHttpUrl}/outputs/${ctx.job.id}/final.mp4`;
    const thumbUrl = scenes[0]?.cardUrl ?? null;

    yield* Effect.tryPromise(() =>
      sb.client.rpc('set_job_output', {
        p_job_id:        ctx.job.id,
        p_output_url:    finalUrl,
        p_output_key:    `${ctx.job.id}/final.mp4`,
        p_thumbnail_url: thumbUrl ?? finalUrl,
      }),
    );
    yield* Effect.tryPromise(() =>
      sb.client.rpc('set_job_caption', {
        p_job_id: ctx.job.id, p_caption: script.caption, p_hashtags: script.hashtags,
      }),
    );

    yield* emit(ProgressStep.RenderDone, 'Final cut ready', 0.96, { url: finalUrl });
    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', { p_job_id: ctx.job.id, p_status: 'REVIEW' }),
    );
    yield* emit(ProgressStep.Review, 'Ready for review', 0.98);
    yield* emit(ProgressStep.Complete, 'Done', 1);
  });

const writeScript = (llm: Llm, ctx: PipelineContext, emotions: string[]) =>
  Effect.gen(function* () {
    if (!llm.isReady) return fallbackScript(ctx);

    const voice = (ctx.brand.voice ?? {}) as Record<string, unknown>;
    return yield* llm.completeJson<VideoScript>({
      system: [
        `You write 30-second TikTok-style cat-meme explainer scripts. Punchy, comedic, short sentences. NO AI slop words like "discover", "unleash", "transform".`,
        `Each line is one spoken sentence (max 15 words) paired with one cat emotion (must be one of: ${emotions.join(', ')}).`,
        `Brand: ${ctx.brand.name}${ctx.brand.handle ? ` (${ctx.brand.handle})` : ''}.`,
        ctx.brand.description ? `About: ${ctx.brand.description}` : '',
        voice.tone   ? `Tone: ${voice.tone}` : '',
        voice.sample_lines ? `Voice samples: ${JSON.stringify(voice.sample_lines)}` : '',
      ].filter(Boolean).join('\n'),
      user: [
        `Topic: ${ctx.job.topic ?? `something on-brand for ${ctx.brand.name}`}`,
        `JSON: {"hook":"5-8 word hook","lines":[{"text":"…","emotion":"<one of allowed>"}, ...4-6 entries],"caption":"1-2 sentence post body","hashtags":["#one","#two","#three","#four"]}`,
      ].join('\n'),
      maxTokens: 700,
      temperature: 0.95,
    }).pipe(Effect.catchAll(() => Effect.succeed(fallbackScript(ctx))));
  });

const fallbackScript = (ctx: PipelineContext): VideoScript => {
  const topic = ctx.job.topic ?? `${ctx.brand.name} in 5 steps`;
  return {
    hook: topic,
    lines: [
      { text: 'Step one: pretend you have a plan.',       emotion: 'smug' },
      { text: 'Step two: open six tabs you will not read.', emotion: 'confused' },
      { text: 'Step three: panic at 4:47pm.',              emotion: 'rage' },
      { text: 'Step four: ship anyway.',                    emotion: 'happy' },
      { text: 'Step five: tell everyone it was on purpose.', emotion: 'smug' },
    ],
    caption: `${topic}. From ${ctx.brand.handle ?? ctx.brand.name}.`,
    hashtags: ['#marquee', '#cats', '#explainer', '#brand'],
  };
};

const buildCardUrl = (base: string, jobId: string, line: string, cat: Cat, index: number, total: number) => {
  const u = new URL(`${base}/render/video/card/${jobId}`);
  u.searchParams.set('line',  line);
  u.searchParams.set('emoji', cat.emoji);
  u.searchParams.set('color', cat.color);
  u.searchParams.set('index', String(index));
  u.searchParams.set('total', String(total));
  return u.toString();
};

// 1-second silent MP3 placeholder for when TTS fails entirely.
// Base64 of a near-empty MP3 frame so ffmpeg can still probe a duration.
const SILENT_MP3 = Uint8Array.from(
  Buffer.from(
    '//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACgAA' +
    'A//////////////////////////////////////////////////' +
    '//////////////////////////////////////////////////8' +
    'AAAA8TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAAgAAAAoBfXVO',
    'base64',
  ),
);
