import { Effect, Redacted } from 'effect';
import { readFile } from 'node:fs/promises';
import OpenAI from 'openai';
import { ProgressStep } from '@marquee/shared/progress';
import { AppConfig } from '../config.js';
import { AgentBudget } from './agent-budget.js';
import type { ContentAgentState } from '../agent/types.js';

export interface VisionReview {
  pass: boolean;
  score: number | null;
  issues: string[];
  suggested_edits: string[];
  risk_flags: string[];
}

const parseReview = (text: string): VisionReview => {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const parsed = parseJsonObject(cleaned);
  const score = Number(parsed.score);
  return {
    pass: parsed.pass === true,
    score: Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : null,
    issues: Array.isArray(parsed.issues) ? parsed.issues.map(String).slice(0, 6) : [],
    suggested_edits: Array.isArray(parsed.suggested_edits) ? parsed.suggested_edits.map(String).slice(0, 6) : [],
    risk_flags: Array.isArray(parsed.risk_flags) ? parsed.risk_flags.map(String).slice(0, 6) : [],
  };
};

const parseJsonObject = (text: string): Partial<VisionReview> => {
  try {
    return JSON.parse(text) as Partial<VisionReview>;
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1)) as Partial<VisionReview>;
      } catch {}
    }
    return {
      pass: false,
      score: null,
      issues: ['Vision review returned unreadable output.'],
      suggested_edits: ['Manual review required.'],
      risk_flags: ['invalid_review_output'],
    };
  }
};

export class Vision extends Effect.Service<Vision>()('Vision', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const budget = yield* AgentBudget;
    const apiKey = cfg.openrouterApiKey ? Redacted.value(cfg.openrouterApiKey).trim() : '';

    const client = apiKey
      ? new OpenAI({
          apiKey,
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
      reviewScope?: 'image' | 'sampled_video_frame';
    }) =>
      Effect.gen(function* () {
        const estimate = 0.005;
        yield* budget.assertCanSpend(args.state.ctx.job.id, estimate);
        const review = yield* Effect.tryPromise({
          try: async () => {
            if (!client) throw new Error('OPENROUTER_API_KEY missing');
            const bytes = await readFile(args.filePath);
            const dataUrl = `data:${args.mimeType ?? 'image/png'};base64,${bytes.toString('base64')}`;
            const res = await client.chat.completions.create({
              model: cfg.openrouterModel,
              temperature: 0.2,
              max_tokens: 500,
              messages: [
                {
                  role: 'system',
                  content: 'You are Marquee visual QA. Return only JSON: {"pass":boolean,"score":0..1,"issues":string[],"suggested_edits":string[],"risk_flags":string[]}. Judge only what is visible in the supplied image: brand fit, readability, composition, and social-post quality. If this is a sampled video frame, do not claim you reviewed motion, timing, audio, or the whole video.',
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
        });
        yield* budget.record({
          jobId: args.state.ctx.job.id,
          provider: 'openrouter',
          model: cfg.openrouterModel,
          purpose: 'vision',
          estimatedCostUsd: estimate,
          metadata: { artifact_id: args.artifactId },
        });
        yield* args.state.emit(ProgressStep.VisionReview, review.pass ? 'Vision review passed' : 'Vision review needs revision', null, {
          artifact_id: args.artifactId,
          model: cfg.openrouterModel,
          pass: review.pass,
          score: review.score,
          issues: review.issues,
          suggested_edits: review.suggested_edits,
          risk_flags: review.risk_flags,
          review_scope: args.reviewScope ?? 'image',
          iteration: args.iteration,
        }) as Effect.Effect<void, never, never>;
        return review;
      });

    return { isReady: client !== null, reviewImage } as const;
  }),
  dependencies: [AppConfig.Default, AgentBudget.Default],
}) {}

export const VisionLive = Vision.Default;
