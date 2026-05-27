import { Effect } from 'effect';
import { runPosterPipeline } from './poster.js';
import { runVideoPipeline } from './video.js';
import type { PipelineContext } from './types.js';
import type { Database } from '@marquee/db';

type ContentType = Database['public']['Enums']['ContentType'];

export const dispatchPipeline = (ctx: PipelineContext) => {
  const type = ctx.job.content_type as ContentType;
  switch (type) {
    case 'POSTER':
    case 'CAROUSEL':
      return runPosterPipeline(ctx);
    case 'VIDEO':
    case 'REEL':
      return runVideoPipeline(ctx);
    default:
      return Effect.fail(new Error(`Unknown content type: ${type as string}`));
  }
};
