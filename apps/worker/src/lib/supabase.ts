import { Effect, Redacted } from 'effect';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import type { Database } from '@marquee/db';
import { AppConfig } from '../config.js';

const wsTransport =
  typeof globalThis.WebSocket === 'undefined'
    ? (WebSocket as unknown as typeof globalThis.WebSocket)
    : undefined;

export class Supabase extends Effect.Service<Supabase>()('Supabase', {
  effect: Effect.gen(function* () {
    const cfg = yield* AppConfig;
    const client: SupabaseClient<Database> = createClient<Database>(
      cfg.supabaseUrl,
      Redacted.value(cfg.supabaseServiceKey),
      {
        auth: { persistSession: false, autoRefreshToken: false },
        ...(wsTransport ? { realtime: { transport: wsTransport } } : {}),
      },
    );
    return { client } as const;
  }),
  dependencies: [AppConfig.Default],
}) {}

export const SupabaseLive = Supabase.Default;
