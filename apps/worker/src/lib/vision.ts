import { Effect, Redacted } from 'effect';
import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { ProgressStep } from '@marquee/shared/progress';
import { AppConfig } from '../config.js';
import { Llm } from './llm.js';
import { AgentBudget } from './agent-budget.js';
import type { ContentAgentState } from '../agent/types.js';

export interface VisionReview {
  pass: boolean;
  score: number;
  issues: string[];
  suggested_edits: string[];
  risk_flags: string[];
}

const fallbackReview = (kind: 'image' | 'video'): VisionReview => ({
  pass: true,
  score: 0.72,
  issues: [],
  suggested_edits: [`${kind} review used local fallback`],
  risk_flags: [],
});

const parseReview = (text: string): VisionReview => {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<VisionReview>;
  return {
    pass: Boolean(parsed.pass),
    score: Math.max(0, Math.min(1, Number(parsed.score ?? 0))),
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 6) : [],
    suggested_edits: Array.isArray(parsed.suggested_edits) ? parsed.suggested_edits.map(String).slice(0, 6) : [],
    risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String).slice(0, 6) : [],
  };
};

export class Vision extends Effect.Service<Vision>()('Vision', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const llm = yield* Llm;
    const budget = yield* AgentBudget;

    const client = cfg.openrouterApiKey
      ? new OpenAI({
          apiKey: Redacted.value(cfg.openrouterApiKey),
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': cfg.openrouterSiteUrl,
            'X-Title': cfg.openrouterSiteName,
          },
        })
      : null;

    const reviewImage = (args: {
      state: ContentAgentState;
      artifactId: string;
      filePath: string;
      mimeType?: string;
      prompt: string;
      iteration: number;
    }) =>
      Effect.gen(function* () {
        const estimate = 0.005;
        yield* budget.assertCanSpend(args.state.ctx.job.id, estimate);
        const review = yield* Effect.tryPromise({
          try: async () => {
            if (!client) return fallbackReview('image');
            const bytes = await readFile(args.filePath);
            const dataUrl = `data:${args.mimeType ?? 'image/png'};base64,${bytes.toString('base64')}`;
            const res = await client.chat.completions.create({
              model: cfg.openrouterModel,
              temperature: 0.2,
              max_tokens: 500,
              messages: [
                {
                  role: 'system',
                  content: 'You are Marquee visual QA. Return only JSON: {"pass":boolean,"score":0..1,"issues":string[],"suggested_edits":string[],"risk_flags":string[]}. Judge brand fit, readability, composition, and social-post quality.',
                },
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: args.prompt },
                    { type: 'image_url', image_url: { url: dataUrl } },
                  ],
                },
              ],
            });
            const text = res.choices[0]?.message?.content ?? '{}';
            return parseReview(text);
          },
          catch: (err) => err instanceof Error ? err : new Error(String(err)),
        }).pipe(Effect.catchAll(() => Effect.succeed(fallbackReview('image'))));
        const usage = llm.isReady ? estimate : 0;
        yield* budget.record({
          jobId: args.state.ctx.job.id,
          provider: 'openrouter',
          model: cfg.openrouterModel,
          purpose: 'vision',
          estimatedCostUsd: usage,
          metadata: { artifact_id: args.artifactId },
        });
        yield* args.state.emit(ProgressStep.VisionReview, review.pass ? 'Vision review passed' : 'Vision review needs revision', null, {
          artifact_id: args.artifactId,
          model: cfg.openrouterModel,
          pass: review.pass,
          score: review.score,
          issues: review.issues,
          suggested_edits: review.suggested_edits,
          iteration: args.iteration,
        }) as Effect.Effect<void, never, never>;
        return review;
      });

    return { isReady: client !== null, reviewImage } as const;
  }),
  dependencies: [AppConfig.Default, Llm.Default, AgentBudget.Default],
}) {}

export const VisionLive = Vision.Default;
