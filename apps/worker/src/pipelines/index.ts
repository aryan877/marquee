import { Effect } from 'effect';
import { runPosterPipeline } from './poster.js';
import { runVideoPipeline } from './video.js';
import { AppConfig } from '../config.js';
import { runContentAgent } from '../agent/run-content-agent.js';
import type { PipelineContext } from './types.js';
import type { Database } from '@marquee/db';

type ContentType = Database['public']['Enums']['ContentType'];

export const dispatchPipeline = (ctx: PipelineContext) =>
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const type = ctx.job.content_type as ContentType;
    if (cfg.agentMode !== 'legacy') {
      switch (type) {
        case 'POSTER':
        case 'CAROUSEL':
        case 'VIDEO':
        case 'REEL':
          return yield* runContentAgent(ctx);
        default:
          return yield* Effect.fail(new Error(`Unknown content type: ${type as string}`));
      }
    }
    switch (type) {
      case 'POSTER':
      case 'CAROUSEL':
        return yield* runPosterPipeline(ctx);
      case 'VIDEO':
      case 'REEL':
        return yield* runVideoPipeline(ctx);
      default:
        return yield* Effect.fail(new Error(`Unknown content type: ${type as string}`));
    }
  });
