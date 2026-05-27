import { Effect } from 'effect';
import type { Supabase } from '../lib/supabase.js';
import type { JobStream } from '../ws/job-stream.js';
import { PROTOCOL_VERSION, type ProgressFrame } from '../ws/protocol.js';

export const makeEmitter = (args: { jobId: string; stream: JobStream; sb: Supabase }) => (
  step: string,
  message: string,
  progress: number | null = null,
  payload: Record<string, unknown> | null = null,
) =>
  Effect.gen(function* () {
    const frame: ProgressFrame = {
      v: PROTOCOL_VERSION,
      job_id: args.jobId,
      step,
      message,
      progress,
      payload,
      ts: Date.now(),
    };
    yield* args.stream.getOrCreateHub(args.jobId);
    yield* args.stream.emit(frame);
    const rpcArgs: {
      p_job_id: string;
      p_step: string;
      p_message: string;
      p_progress?: number;
      p_payload?: never;
    } = { p_job_id: args.jobId, p_step: step, p_message: message };
    if (progress !== null) rpcArgs.p_progress = progress;
    if (payload !== null) rpcArgs.p_payload = payload as never;
    yield* Effect.tryPromise(() => args.sb.client.rpc('emit_progress_event', rpcArgs)).pipe(Effect.ignore);
  });
