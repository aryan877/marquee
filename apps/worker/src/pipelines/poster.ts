import { Effect } from 'effect';
import { ProgressStep } from '@marquee/shared/progress';
import { Llm } from '../lib/llm.js';
import { Renderer } from '../lib/playwright-renderer.js';
import { Storage } from '../lib/storage.js';
import { Supabase } from '../lib/supabase.js';
import { JobStream } from '../ws/job-stream.js';
import { AppConfig } from '../config.js';
import { makeEmitter } from './progress.js';
import type { PipelineContext } from './types.js';

interface PosterCopy {
  headline: string;
  subhead?: string;
  caption: string;
  hashtags: string[];
}

const LAYERS = ['background', 'wordmark', 'headline', 'accent', 'final'] as const;
type Layer = (typeof LAYERS)[number];

export const runPosterPipeline = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const llm     = yield* Llm;
    const render  = yield* Renderer;
    const storage = yield* Storage;
    const sb      = yield* Supabase;
    const cfg     = yield* AppConfig;
    const stream  = yield* JobStream;

    const emit = makeEmitter({ jobId: ctx.job.id, stream, sb });

    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', {
        p_job_id: ctx.job.id,
        p_status: 'GENERATING',
      }),
    );

    yield* emit(ProgressStep.Research, `Researching "${ctx.job.topic ?? 'today’s topic'}" for ${ctx.brand.name}`, 0.05);

    const copy = yield* writeCopy(llm, ctx).pipe(
      Effect.tap((c) =>
        emit(ProgressStep.ScriptDone, `Headline drafted: "${c.headline}"`, 0.3, {
          headline: c.headline,
          subhead:  c.subhead ?? null,
        }),
      ),
    );

    yield* emit(ProgressStep.ImageDone, 'Hero illustration ready', 0.45, {
      slot: 'background',
      note: 'using brand gradient (gen-img CLI integration pending)',
    });

    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', {
        p_job_id: ctx.job.id,
        p_status: 'RENDERING',
      }),
    );

    yield* Effect.tryPromise(() =>
      sb.client.rpc('set_job_caption', {
        p_job_id:   ctx.job.id,
        p_caption:  copy.caption,
        p_hashtags: copy.hashtags,
      }),
    );

    let lastUrl: string | null = null;
    let layerIdx = 0;
    for (const layer of LAYERS) {
      layerIdx += 1;
      const visibleLayers = LAYERS.slice(0, layerIdx);
      const renderUrl = buildRenderUrl(cfg.webBaseUrl, ctx.job.id, 'editorial', visibleLayers, copy);
      const png = yield* render.shot({
        url: renderUrl,
        width: 1080,
        height: 1350,
        deviceScaleFactor: 1,
      });
      const saved = yield* storage.saveBytes(`${ctx.job.id}/layer-${layerIdx}-${layer}.png`, png);
      lastUrl = saved.url;
      yield* emit(ProgressStep.PosterLayer, `Layer ${layerIdx}/${LAYERS.length}: ${layer}`, 0.45 + (layerIdx / LAYERS.length) * 0.5, {
        layer,
        preview_url: saved.url,
        template:    'editorial',
      });
    }

    if (lastUrl) {
      yield* Effect.tryPromise(() =>
        sb.client.rpc('set_job_output', {
          p_job_id:        ctx.job.id,
          p_output_url:    lastUrl!,
          p_output_key:    `${ctx.job.id}/layer-${LAYERS.length}-final.png`,
          p_thumbnail_url: lastUrl!,
        }),
      );
    }

    yield* emit(ProgressStep.Review, 'Ready for review', 0.98);
    yield* Effect.tryPromise(() =>
      sb.client.rpc('update_content_job_status', {
        p_job_id: ctx.job.id,
        p_status: 'REVIEW',
      }),
    );
    yield* emit(ProgressStep.Complete, 'Done', 1);
  });

const writeCopy = (llm: Llm, ctx: PipelineContext) =>
  Effect.gen(function* () {
    if (!llm.isReady) {
      return fallbackCopy(ctx);
    }
    const voice = (ctx.brand.voice ?? {}) as Record<string, unknown>;
    const guidelines = (ctx.brand.guidelines ?? {}) as Record<string, unknown>;
    return yield* llm.completeJson<PosterCopy>({
      system: [
        `You write social media copy that doesn't sound like AI slop. No "Discover the power of...".`,
        `Brand: ${ctx.brand.name}${ctx.brand.handle ? ` (${ctx.brand.handle})` : ''}.`,
        ctx.brand.description ? `About: ${ctx.brand.description}` : '',
        ctx.brand.target_audience ? `Audience: ${ctx.brand.target_audience}` : '',
        voice.tone   ? `Tone: ${voice.tone}` : '',
        voice.sample_lines ? `Voice samples: ${JSON.stringify(voice.sample_lines)}` : '',
        guidelines.do ? `Do: ${JSON.stringify(guidelines.do)}` : '',
        guidelines.dont ? `Don't: ${JSON.stringify(guidelines.dont)}` : '',
      ].filter(Boolean).join('\n'),
      user: [
        `Topic: ${ctx.job.topic ?? 'something on-brand'}`,
        `Output JSON shape: {"headline": "5-9 word punchy line", "subhead": "optional 5-12 word follow-up", "caption": "1-3 sentence post body", "hashtags": ["#one","#two","#three"]}`,
      ].join('\n'),
      maxTokens: 400,
      temperature: 0.9,
    }).pipe(
      Effect.catchAll(() => Effect.succeed(fallbackCopy(ctx))),
    );
  });

const fallbackCopy = (ctx: PipelineContext): PosterCopy => {
  const topic = ctx.job.topic?.trim() || ctx.brand.name;
  return {
    headline: topic.slice(0, 60),
    subhead:  ctx.brand.description?.slice(0, 90),
    caption:  `${topic}. From ${ctx.brand.handle ?? ctx.brand.name}.`,
    hashtags: ['#marquee', '#brand', '#content'],
  };
};

const buildRenderUrl = (
  base: string,
  jobId: string,
  template: string,
  visibleLayers: readonly Layer[],
  copy: PosterCopy,
) => {
  const u = new URL(`${base}/render/poster/${jobId}`);
  u.searchParams.set('template', template);
  u.searchParams.set('layers', visibleLayers.join(','));
  u.searchParams.set('headline', copy.headline);
  if (copy.subhead) u.searchParams.set('subhead', copy.subhead);
  return u.toString();
};
