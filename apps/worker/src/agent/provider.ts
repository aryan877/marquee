import { Redacted } from 'effect';
import { OpenAIProvider } from '@openai/agents';
import OpenAI from 'openai';
import type { AppConfig } from '../config.js';

export const makeOpenRouterProvider = (cfg: AppConfig) => {
  const apiKey = cfg.openrouterApiKey ? Redacted.value(cfg.openrouterApiKey).trim() : '';
  if (!apiKey) return null;
  const client = new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': cfg.openrouterSiteUrl,
      'X-Title': cfg.openrouterSiteName,
    },
  });
  return new OpenAIProvider({ openAIClient: client, useResponses: false });
};
