import { Effect, Redacted } from 'effect';
import { fal } from '@fal-ai/client';
import { AppConfig } from '../config.js';
import { AgentBudget } from './agent-budget.js';

export interface FalImageResult {
  url: string;
  width: number | null;
  height: number | null;
  contentType: string | null;
  fileName: string | null;
  requestId: string | null;
}

type FalImageFile = {
  url?: string;
  width?: number;
  height?: number;
  content_type?: string;
  file_name?: string;
};

type FalResult = {
  data?: { images?: FalImageFile[] };
  requestId?: string;
};

export class FalImage extends Effect.Service<FalImage>()('FalImage', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const budget = yield* AgentBudget;
    const key = cfg.falKey ? Redacted.value(cfg.falKey).trim() : '';
    if (key) fal.config({ credentials: key });

    const generate = (args: {
      jobId: string;
      prompt: string;
      imageSize?: 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9' | 'auto' | { width: number; height: number };
      quality?: 'auto' | 'low' | 'medium' | 'high';
      outputFormat?: 'png' | 'jpeg' | 'webp';
    }) =>
      Effect.gen(function* () {
        if (!key) return yield* Effect.fail(new Error('FAL_KEY missing'));
        const estimate = args.quality === 'high' ? 0.18 : args.quality === 'medium' ? 0.06 : 0.02;
        yield* budget.assertCanSpend(args.jobId, estimate);
        const result = yield* Effect.tryPromise({
          try: () => fal.subscribe(cfg.falImageModel, {
            input: {
              prompt: args.prompt,
              image_size: args.imageSize ?? 'portrait_4_3',
              quality: args.quality ?? 'medium',
              num_images: 1,
              output_format: args.outputFormat ?? 'png',
            },
            logs: true,
          }) as Promise<FalResult>,
          catch: (err) => new Error(`fal image failed: ${String(err)}`),
        });
        const image = result.data?.images?.[0];
        if (!image?.url) return yield* Effect.fail(new Error('fal image missing url'));
        yield* budget.record({
          jobId: args.jobId,
          provider: 'fal',
          model: cfg.falImageModel,
          purpose: 'image',
          estimatedCostUsd: estimate,
          metadata: { request_id: result.requestId ?? null },
        });
        return {
          url: image.url,
          width: image.width ?? null,
          height: image.height ?? null,
          contentType: image.content_type ?? null,
          fileName: image.file_name ?? null,
          requestId: result.requestId ?? null,
        } satisfies FalImageResult;
      });

    return { isReady: key.length > 0, generate } as const;
  }),
  dependencies: [AppConfig.Default, AgentBudget.Default],
}) {}

export const FalImageLive = FalImage.Default;
