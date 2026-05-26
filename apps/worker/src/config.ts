import { Config, ConfigProvider, Effect, Layer } from 'effect';

export class AppConfig extends Effect.Service<AppConfig>()('AppConfig', {
  effect: Effect.gen(function* () {
    const supabaseUrl       = yield* Config.string('SUPABASE_URL');
    const supabaseServiceKey = yield* Config.redacted('SUPABASE_SERVICE_ROLE_KEY');
    const jwtSecret         = yield* Config.redacted('JWT_SECRET');
    const wsPort            = yield* Config.integer('WS_PORT').pipe(Config.withDefault(4001));
    const wsHost            = yield* Config.string('WS_HOST').pipe(Config.withDefault('0.0.0.0'));
    const pollMs            = yield* Config.integer('WORKER_POLL_MS').pipe(Config.withDefault(750));
    const vtSeconds         = yield* Config.integer('WORKER_VT_SECONDS').pipe(Config.withDefault(300));
    const openrouterApiKey  = yield* Config.redacted('OPENROUTER_API_KEY').pipe(Config.withDefault(undefined));
    const openrouterModel   = yield* Config.string('OPENROUTER_MODEL').pipe(Config.withDefault('openai/gpt-5.5'));
    const openrouterSiteUrl = yield* Config.string('OPENROUTER_SITE_URL').pipe(Config.withDefault('http://localhost:3000'));
    const openrouterSiteName = yield* Config.string('OPENROUTER_SITE_NAME').pipe(Config.withDefault('Marquee'));
    const webBaseUrl        = yield* Config.string('NEXT_PUBLIC_APP_URL').pipe(Config.withDefault('http://localhost:3000'));
    const workerHttpUrl     = yield* Config.string('WORKER_HTTP_URL').pipe(Config.withDefault('http://localhost:4001'));
    const outputsDir        = yield* Config.string('OUTPUTS_DIR').pipe(Config.withDefault('/tmp/marquee-outputs'));
    return {
      supabaseUrl, supabaseServiceKey, jwtSecret,
      wsPort, wsHost,
      pollMs, vtSeconds,
      openrouterApiKey, openrouterModel,
      openrouterSiteUrl, openrouterSiteName,
      webBaseUrl, workerHttpUrl, outputsDir,
    } as const;
  }),
}) {}

export const ConfigFromEnv = Layer.setConfigProvider(ConfigProvider.fromEnv());
