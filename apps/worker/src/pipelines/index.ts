import { Effect } from 'effect';
import { runContentAgent } from '../agent/run-content-agent.js';
import type { PipelineContext } from './types.js';
import type { Database } from '@marquee/db';

type ContentType = Database['public']['Enums']['ContentType'];

export const dispatchPipeline = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const type = ctx.job.content_type as ContentType;
    switch (type) {
      case 'POSTER':
      case 'CAROUSEL':
      case 'VIDEO':
      case 'REEL':
        return yield* runContentAgent(ctx);
      default:
        return yield* Effect.fail(new Error(`Unknown content type: ${type as string}`));
    }
  });
