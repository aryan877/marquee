'use client';

import type { BrandListPage } from '@/hooks/queries';
import { usePaginatedBrands } from '@/hooks/queries';
import { BlueskyConnect } from './bluesky-connect';
import { MastodonConnect } from './mastodon-connect';
import { DiscordConnect } from './discord-connect';
import { TelegramConnect } from './telegram-connect';
import { TwitterConnect } from './twitter-connect';

export function SocialPlatformsList({ initialPage }: { initialPage: BrandListPage }) {
  const query = usePaginatedBrands({ initialPage });
  const brands = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mt-10 space-y-10">
      {brands.map((b) => (
        <div key={b.id} className="surface rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 lift">
          <div>
            <div className="font-medium text-lg">{b.name}</div>
            <div className="text-xs text-[var(--color-ink-3)]">{b.handle ?? b.industry ?? '—'}</div>
          </div>

          <div className="mt-6 space-y-6">
            <PlatformBlock
              title="Bluesky"
              hint="Generate an app password at bsky.app/settings/app-passwords"
            >
              <BlueskyConnect brandId={b.id} />
            </PlatformBlock>

            <PlatformBlock
              title="Mastodon"
              hint="Settings → Development → New application (scopes: write:statuses, write:media). Copy the access token."
            >
              <MastodonConnect brandId={b.id} />
            </PlatformBlock>

            <PlatformBlock
              title="Discord"
              hint="Server Settings → Integrations → Webhooks → New Webhook → Copy URL"
            >
              <DiscordConnect brandId={b.id} />
            </PlatformBlock>

            <PlatformBlock
              title="Telegram"
              hint="Talk to @BotFather, /newbot, copy token. Add bot to your channel as admin, then paste @channel_name or numeric chat ID."
            >
              <TelegramConnect brandId={b.id} />
            </PlatformBlock>

            <PlatformBlock
              title="X / Twitter"
              hint="developer.x.com → your project → Keys and tokens. Set app permissions to Read+Write, regenerate Access Token+Secret. Paste all 4."
            >
              <TwitterConnect brandId={b.id} />
            </PlatformBlock>
          </div>
        </div>
      ))}

      {query.hasNextPage && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-full border border-[var(--color-border-strong)] px-5 py-2 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] disabled:opacity-50"
          >
            {query.isFetchingNextPage ? 'Loading...' : 'Load more brands'}
          </button>
        </div>
      )}
    </div>
  );
}

function PlatformBlock({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl tracking-[-0.02em]">{title}</h2>
      </div>
      <p className="mt-1 text-xs text-[var(--color-ink-3)]">{hint}</p>
      {children}
    </section>
  );
}
