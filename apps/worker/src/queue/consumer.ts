import { Effect, Layer, Schedule, Duration } from 'effect';
import { AppConfig } from '../config.js';
import { Supabase } from '../lib/supabase.js';
import { dispatchPipeline } from '../pipelines/index.js';
import type { PipelineContext } from '../pipelines/types.js';

const tickOnce = Effect.gen(function* () {
  const cfg = yield* AppConfig;
  const sb  = yield* Supabase;

  const { data, error } = yield* Effect.tryPromise(() =>
    sb.client.rpc('read_next_content_job', {
      p_visibility_timeout_seconds: cfg.vtSeconds,
    }),
  );
  if (error || !data || data.length === 0) return;

  const msg = data[0]!;
  const msgId = msg.msg_id as unknown as number;
  const payload = msg.message as Record<string, unknown>;
  const jobId = String(payload.job_id ?? '');
  if (!jobId) {
    yield* archive(sb, msgId, 'malformed: missing job_id');
    return;
  }

  const { data: jobRows } = yield* Effect.tryPromise(() =>
    sb.client.rpc('get_content_job_full', { p_job_id: jobId }),
  );
  const job = jobRows?.[0];
  if (!job) {
    yield* archive(sb, msgId, 'job row not found');
    return;
  }
  if (job.status !== 'PENDING') {
    yield* archive(sb, msgId, `skip non-PENDING (${job.status})`);
    return;
  }

  const { data: brandRows } = yield* Effect.tryPromise(() =>
    sb.client.rpc('get_brand_for_job', { p_brand_id: job.brand_id }),
  );
  const brand = brandRows?.[0];
  if (!brand) {
    yield* refund(sb, jobId, 'brand vanished');
    yield* archive(sb, msgId, 'brand not found');
    return;
  }

  const ctx: PipelineContext = { job, brand, queue: { msgId } };

  yield* dispatchPipeline(ctx).pipe(
    Effect.catchAllCause((cause) =>
      Effect.gen(function* () {
        yield* Effect.logError(`pipeline failed for job ${jobId}`, cause);
        const shouldRefund = yield* shouldRefundFailedJob(sb, jobId);
        if (shouldRefund) {
          yield* refund(sb, jobId, 'Generation failed. Slot refunded.');
        }
      }),
    ),
  );

  yield* archive(sb, msgId, 'done');
});

const archive = (sb: Supabase, msgId: number, _why: string) =>
  Effect.tryPromise(() =>
    sb.client.rpc('archive_content_job', { p_msg_id: msgId }),
  ).pipe(Effect.ignore);

const refund = (sb: Supabase, jobId: string, msg: string) =>
  Effect.tryPromise(() =>
    sb.client.rpc('refund_content_job', {
      p_job_id:        jobId,
      p_error_message: msg,
    }),
  ).pipe(Effect.ignore);

const shouldRefundFailedJob = (sb: Supabase, jobId: string) =>
  Effect.tryPromise(() => sb.client.rpc('get_content_job_full', { p_job_id: jobId })).pipe(
    Effect.map(({ data }) => {
      const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : undefined;
      if (!row) return true;
      const status = typeof row.status === 'string' ? row.status : '';
      const outputUrl = typeof row.output_url === 'string' ? row.output_url : '';
      return !outputUrl && !['REVIEW', 'POSTING', 'POSTED'].includes(status);
    }),
    Effect.catchAll(() => Effect.succeed(true)),
  );

const heartbeat = Effect.gen(function* () {
  const sb = yield* Supabase;
  yield* Effect.tryPromise(() => sb.client.rpc('bump_worker_heartbeat')).pipe(Effect.ignore);
});

export const QueueConsumerLive = Layer.scopedDiscard(
  Effect.gen(function* () {
    const cfg = yield* AppConfig;
    yield* Effect.logInfo(`[queue] poll every ${cfg.pollMs}ms, vt=${cfg.vtSeconds}s`);

    const loop = tickOnce.pipe(
      Effect.catchAllCause((cause) => Effect.logError('queue tick failed', cause)),
      Effect.repeat(Schedule.spaced(Duration.millis(cfg.pollMs))),
    );

    yield* Effect.fork(loop);
    yield* Effect.fork(
      heartbeat.pipe(Effect.repeat(Schedule.spaced(Duration.seconds(15)))),
    );
  }),
);
