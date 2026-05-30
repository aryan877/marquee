import { Effect } from 'effect';
import { AppConfig } from '../config.js';
import { Supabase } from './supabase.js';

type RpcResult = { data: unknown; error: unknown };
type Rpc = (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;

export class AgentBudget extends Effect.Service<AgentBudget>()('AgentBudget', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const sb = yield* Supabase;
    const rpc = sb.client.rpc.bind(sb.client) as unknown as Rpc;
    const jobSpend = new Map<string, number>();

    const dailySpend = Effect.tryPromise(async () => {
      const { data, error } = await rpc('get_agent_daily_spend');
      if (error) throw error;
      return Number(data ?? 0);
    }).pipe(Effect.catchAll(() => Effect.succeed(0)));

    const assertCanSpend = (jobId: string, estimateUsd: number) =>
      Effect.gen(function* () {
        const day = yield* dailySpend;
        const job = jobSpend.get(jobId) ?? 0;
        if (day + estimateUsd > cfg.agentDailyUsdCap) {
          return yield* Effect.fail(new Error('Daily agent budget reached'));
        }
        if (job + estimateUsd > cfg.agentJobUsdCap) {
          return yield* Effect.fail(new Error('Job agent budget reached'));
        }
      });

    const record = (args: {
      jobId: string;
      provider: string;
      model: string;
      purpose: string;
      inputTokens?: number;
      outputTokens?: number;
      estimatedCostUsd?: number;
      metadata?: Record<string, unknown>;
    }) =>
      Effect.gen(function* () {
        const cost = args.estimatedCostUsd ?? 0;
        jobSpend.set(args.jobId, (jobSpend.get(args.jobId) ?? 0) + cost);
        yield* Effect.tryPromise(() =>
          rpc('record_agent_usage', {
            p_job_id: args.jobId,
            p_provider: args.provider,
            p_model: args.model,
            p_purpose: args.purpose,
            p_input_tokens: args.inputTokens ?? 0,
            p_output_tokens: args.outputTokens ?? 0,
            p_estimated_cost_usd: cost,
            p_metadata: args.metadata ?? {},
          }),
        ).pipe(Effect.ignore);
        return { jobSpendUsd: jobSpend.get(args.jobId) ?? 0, costUsd: cost };
      });

    const getJobSpend = (jobId: string) => jobSpend.get(jobId) ?? 0;

    return { assertCanSpend, record, getJobSpend } as const;
  }),
  dependencies: [AppConfig.Default, Supabase.Default],
}) {}

export const AgentBudgetLive = AgentBudget.Default;
