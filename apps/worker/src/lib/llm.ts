import { Effect, Redacted } from 'effect';
import OpenAI from 'openai';
import { AppConfig } from '../config.js';

export interface CompletionRequest {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
}

export class LlmError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LlmError';
  }
}

export class Llm extends Effect.Service<Llm>()('Llm', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const apiKey = cfg.openrouterApiKey ? Redacted.value(cfg.openrouterApiKey) : null;

    const client = apiKey
      ? new OpenAI({
          apiKey,
          baseURL: 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': cfg.openrouterSiteUrl,
            'X-Title':      cfg.openrouterSiteName,
          },
        })
      : null;

    const complete = (req: CompletionRequest) =>
      Effect.tryPromise({
        try: async () => {
          if (!client) throw new LlmError('OPENROUTER_API_KEY missing');
          const res = await client.chat.completions.create({
            model: cfg.openrouterModel,
            max_tokens: req.maxTokens ?? 512,
            temperature: req.temperature ?? 0.8,
            messages: [
              { role: 'system', content: req.system },
              { role: 'user',   content: req.user },
            ],
          });
          return (res.choices[0]?.message?.content ?? '').trim();
        },
        catch: (err) => new LlmError(String(err), err),
      });

    const completeJson = <T>(req: CompletionRequest) =>
      complete({
        ...req,
        system: `${req.system}\n\nReturn ONLY valid JSON. No prose, no markdown fences.`,
      }).pipe(
        Effect.flatMap((text) =>
          Effect.try({
            try: () => {
              const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
              return JSON.parse(cleaned) as T;
            },
            catch: () => new LlmError(`invalid JSON: ${text.slice(0, 200)}`),
          }),
        ),
      );

    return { isReady: client !== null, complete, completeJson } as const;
  }),
  dependencies: [AppConfig.Default],
}) {}

export const LlmLive = Llm.Default;
