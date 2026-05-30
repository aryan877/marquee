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
    const openrouterModel   = yield* Config.string('OPENROUTER_MODEL').pipe(Config.withDefault('xiaomi/mimo-v2.5'));
    const openrouterSiteUrl = yield* Config.string('OPENROUTER_SITE_URL').pipe(Config.withDefault('http://localhost:3000'));
    const openrouterSiteName = yield* Config.string('OPENROUTER_SITE_NAME').pipe(Config.withDefault('Marquee'));
    const falKey            = yield* Config.redacted('FAL_KEY').pipe(Config.withDefault(undefined));
    const falImageModel     = yield* Config.string('FAL_IMAGE_MODEL').pipe(Config.withDefault('openai/gpt-image-2'));
    const agentMode         = yield* Config.string('AGENT_MODE').pipe(Config.withDefault('agent'));
    const agentMaxIterations = yield* Config.integer('AGENT_MAX_ITERATIONS').pipe(Config.withDefault(3));
    const agentMaxToolCalls = yield* Config.integer('AGENT_MAX_TOOL_CALLS').pipe(Config.withDefault(16));
    const agentMaxJobSeconds = yield* Config.integer('AGENT_MAX_JOB_SECONDS').pipe(Config.withDefault(240));
    const agentDailyUsdCap = yield* Config.number('AGENT_DAILY_USD_CAP').pipe(Config.withDefault(10));
    const agentJobUsdCap = yield* Config.number('AGENT_JOB_USD_CAP').pipe(Config.withDefault(0.75));
    const webBaseUrl        = yield* Config.string('NEXT_PUBLIC_APP_URL').pipe(Config.withDefault('http://localhost:3000'));
    const workerHttpUrl     = yield* Config.string('WORKER_HTTP_URL').pipe(Config.withDefault('http://localhost:4001'));
    const outputsDir        = yield* Config.string('OUTPUTS_DIR').pipe(Config.withDefault('/tmp/marquee-outputs'));
    const r2AccountId       = yield* Config.string('R2_ACCOUNT_ID').pipe(Config.withDefault(''));
    const r2AccessKeyId     = yield* Config.redacted('R2_ACCESS_KEY_ID').pipe(Config.withDefault(undefined));
    const r2SecretAccessKey = yield* Config.redacted('R2_SECRET_ACCESS_KEY').pipe(Config.withDefault(undefined));
    const r2Bucket          = yield* Config.string('R2_BUCKET').pipe(Config.withDefault(''));
    const r2PublicUrl       = yield* Config.string('R2_PUBLIC_URL').pipe(Config.withDefault(''));
    return {
      supabaseUrl, supabaseServiceKey, jwtSecret,
      wsPort, wsHost,
      pollMs, vtSeconds,
      openrouterApiKey, openrouterModel,
      openrouterSiteUrl, openrouterSiteName,
      falKey, falImageModel,
      agentMode, agentMaxIterations, agentMaxToolCalls,
      agentMaxJobSeconds, agentDailyUsdCap, agentJobUsdCap,
      webBaseUrl, workerHttpUrl, outputsDir,
      r2AccountId, r2AccessKeyId, r2SecretAccessKey, r2Bucket, r2PublicUrl,
    } as const;
  }),
}) {}

export const ConfigFromEnv = Layer.setConfigProvider(ConfigProvider.fromEnv());
