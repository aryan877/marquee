import { Data, Duration, Effect, Layer, Schedule } from 'effect';
import type { Database } from '@marquee/db';
import type { PostgrestError } from '@supabase/supabase-js';
import { AppConfig } from '../config.js';
import { Supabase } from '../lib/supabase.js';
import { dispatchPipeline } from '../pipelines/index.js';
import type { BrandCtx, JobFull, PipelineContext } from '../pipelines/types.js';

type Functions = Database['public']['Functions'];
type QueueMessage = Functions['read_next_content_job']['Returns'][number];
type JobFailureState = Functions['get_content_job_for_approval']['Returns'][number];
type FailureDisposition =
  | { readonly _tag: 'Refund' }
  | { readonly _tag: 'Preserve'; readonly reason: string; readonly promoteToReview: boolean };

class WorkerRpcError extends Data.TaggedError('WorkerRpcError')<{
  readonly fn: string;
  readonly cause: unknown;
}> {}

class RowNotFound extends Data.TaggedError('RowNotFound')<{
  readonly entity: string;
  readonly id: string;
}> {}

const reviewSafeStatuses: ReadonlySet<JobFailureState['status']> = new Set(['REVIEW', 'POSTING', 'POSTED']);

const tickOnce = Effect.gen(function* () {
  const cfg = yield* AppConfig;
  const sb  = yield* Supabase;

  const data = yield* readNextContentJob(sb, cfg.vtSeconds);
  if (data.length === 0) return;

  const msg = data[0]!;
  const msgId = msg.msg_id as unknown as number;
  const payload = recordPayload(msg.message);
  const jobId = String(payload.job_id ?? '');
  if (!jobId) {
    yield* archive(sb, msgId, 'malformed: missing job_id');
    return;
  }

  const job = yield* getContentJobFull(sb, jobId).pipe(
    Effect.catchTag('RowNotFound', () => Effect.succeed(null)),
  );
  if (!job) {
    yield* archive(sb, msgId, 'job row not found');
    return;
  }
  if (job.status !== 'PENDING') {
    yield* archive(sb, msgId, `skip non-PENDING (${job.status})`);
    return;
  }

  const brand = yield* getBrandForJob(sb, job.brand_id).pipe(
    Effect.catchTag('RowNotFound', () => Effect.succeed(null)),
  );
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
        const disposition = yield* getFailureDisposition(sb, jobId);
        if (disposition._tag === 'Refund') {
          yield* refund(sb, jobId, 'Generation failed. Slot refunded.');
        } else {
          if (disposition.promoteToReview) {
            yield* updateJobStatus(sb, jobId, 'REVIEW');
          }
          yield* Effect.logInfo(`preserved failed job ${jobId}: ${disposition.reason}`);
        }
      }),
    ),
  );

  yield* archive(sb, msgId, 'done');
});

const readNextContentJob = (sb: Supabase, vtSeconds: number) =>
  rpc<QueueMessage[]>('read_next_content_job', () =>
    sb.client.rpc('read_next_content_job', {
      p_visibility_timeout_seconds: vtSeconds,
    }),
  ).pipe(Effect.map((rows) => rows ?? []));

const getContentJobFull = (sb: Supabase, jobId: string) =>
  rpc<JobFull[]>('get_content_job_full', () =>
    sb.client.rpc('get_content_job_full', { p_job_id: jobId }),
  ).pipe(
    Effect.flatMap((rows) => rows?.[0]
      ? Effect.succeed(rows[0])
      : Effect.fail(new RowNotFound({ entity: 'content_job', id: jobId }))),
  );

const getBrandForJob = (sb: Supabase, brandId: string) =>
  rpc<BrandCtx[]>('get_brand_for_job', () =>
    sb.client.rpc('get_brand_for_job', { p_brand_id: brandId }),
  ).pipe(
    Effect.flatMap((rows) => rows?.[0]
      ? Effect.succeed(rows[0])
      : Effect.fail(new RowNotFound({ entity: 'brand', id: brandId }))),
  );

const archive = (sb: Supabase, msgId: number, _why: string) =>
  rpc<boolean>('archive_content_job', () =>
    sb.client.rpc('archive_content_job', { p_msg_id: msgId }),
  ).pipe(Effect.asVoid);

const refund = (sb: Supabase, jobId: string, msg: string) =>
  rpc<undefined>('refund_content_job', () =>
    sb.client.rpc('refund_content_job', {
      p_job_id:        jobId,
      p_error_message: msg,
    }),
  ).pipe(Effect.asVoid);

const updateJobStatus = (sb: Supabase, jobId: string, status: JobFailureState['status']) =>
  rpc<undefined>('update_content_job_status', () =>
    sb.client.rpc('update_content_job_status', {
      p_job_id: jobId,
      p_status: status,
    }),
  ).pipe(Effect.asVoid);

const getFailureDisposition = (sb: Supabase, jobId: string) =>
  getJobFailureState(sb, jobId).pipe(
    Effect.map((job): FailureDisposition => {
      if (reviewSafeStatuses.has(job.status)) {
        return { _tag: 'Preserve', reason: `status ${job.status}`, promoteToReview: false };
      }
      if (typeof job.output_url === 'string' && job.output_url.length > 0) {
        return { _tag: 'Preserve', reason: 'output already exists', promoteToReview: true };
      }
      return { _tag: 'Refund' };
    }),
    Effect.catchTag('RowNotFound', () =>
      Effect.succeed({ _tag: 'Preserve', reason: 'job row missing', promoteToReview: false } as const)),
  );

const getJobFailureState = (sb: Supabase, jobId: string) =>
  rpc<JobFailureState[]>('get_content_job_for_approval', () =>
    sb.client.rpc('get_content_job_for_approval', { p_job_id: jobId }),
  ).pipe(
    Effect.flatMap((rows) => rows?.[0]
      ? Effect.succeed(rows[0])
      : Effect.fail(new RowNotFound({ entity: 'content_job', id: jobId }))),
  );

const rpc = <A>(
  fn: string,
  run: () => PromiseLike<{ data: A | null; error: PostgrestError | null }>,
) =>
  Effect.tryPromise({
    try: () => Promise.resolve(run()),
    catch: (cause) => new WorkerRpcError({ fn, cause }),
  }).pipe(
    Effect.flatMap(({ data, error }) =>
      error
        ? Effect.fail(new WorkerRpcError({ fn, cause: error }))
        : Effect.succeed(data as A)),
  );

const recordPayload = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

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
