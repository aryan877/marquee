import { Effect, Layer } from 'effect';
import { NodeRuntime } from '@effect/platform-node';
import { AppConfig, ConfigFromEnv } from './config.js';
import { JobStream } from './ws/job-stream.js';
import { WsServerLive } from './ws/server.js';
import { DevEmitLive } from './ws/dev-emit.js';
import { SupabaseLive } from './lib/supabase.js';
import { LlmLive } from './lib/llm.js';
import { RendererLive } from './lib/playwright-renderer.js';
import { StorageLive } from './lib/storage.js';
import { CatsLive } from './lib/cats.js';
import { TtsLive } from './lib/tts.js';
import { FfmpegLive } from './lib/ffmpeg.js';
import { QueueConsumerLive } from './queue/consumer.js';

const Infrastructure = Layer.mergeAll(
  AppConfig.Default,
  JobStream.Default,
  SupabaseLive,
  LlmLive,
  RendererLive,
  StorageLive,
  CatsLive,
  TtsLive,
  FfmpegLive,
).pipe(Layer.provide(ConfigFromEnv));

const program = Effect.gen(function* () {
  yield* Effect.logInfo('[worker] starting');
  yield* Effect.never;
});

NodeRuntime.runMain(
  program.pipe(
    Effect.provide(Layer.mergeAll(WsServerLive, DevEmitLive, QueueConsumerLive)),
    Effect.provide(Infrastructure),
  ),
);
