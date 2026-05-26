import { Effect, Layer } from 'effect';
import { chromium, type Browser } from 'playwright';
import { AppConfig } from '../config.js';

export interface ShotOpts {
  url: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  waitForSelector?: string;
  timeoutMs?: number;
}

export class Renderer extends Effect.Service<Renderer>()('Renderer', {
  scoped: Effect.gen(function* () {
    const cfg = yield* AppConfig;

    const browser: Browser = yield* Effect.acquireRelease(
      Effect.tryPromise(() => chromium.launch({ headless: true })),
      (b) => Effect.tryPromise(() => b.close()).pipe(Effect.ignore),
    );

    const shot = (opts: ShotOpts) =>
      Effect.tryPromise({
        try: async () => {
          const ctx = await browser.newContext({
            viewport: { width: opts.width, height: opts.height },
            deviceScaleFactor: opts.deviceScaleFactor ?? 2,
          });
          const page = await ctx.newPage();
          try {
            await page.goto(opts.url, { waitUntil: 'networkidle', timeout: opts.timeoutMs ?? 15_000 });
            if (opts.waitForSelector) {
              await page.waitForSelector(opts.waitForSelector, { timeout: 5_000 });
            }
            await page.evaluate(() => (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready ?? Promise.resolve());
            const png = await page.screenshot({ type: 'png', fullPage: false });
            return new Uint8Array(png);
          } finally {
            await ctx.close();
          }
        },
        catch: (err) => new Error(`Renderer shot failed: ${String(err)}`),
      });

    const previewUrl = (path: string) => `${cfg.webBaseUrl}${path}`;

    return { shot, previewUrl } as const;
  }),
  dependencies: [AppConfig.Default],
}) {}

export const RendererLive = Renderer.Default;
