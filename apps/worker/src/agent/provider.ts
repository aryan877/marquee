import { Redacted } from 'effect';
import { OpenAIProvider } from '@openai/agents';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';

export const makeOpenRouterProvider = (cfg: AppConfig) => {
  if (!cfg.openrouterApiKey) return null;
  const client = new OpenAI({
    apiKey: Redacted.value(cfg.openrouterApiKey),
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': cfg.openrouterSiteUrl,
      'X-Title': cfg.openrouterSiteName,
    },
  });
  return new OpenAIProvider({ openAIClient: client, useResponses: false });
};
