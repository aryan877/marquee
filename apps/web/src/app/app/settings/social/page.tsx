import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { BlueskyConnect } from './bluesky-connect';
import { MastodonConnect } from './mastodon-connect';
import { DiscordConnect } from './discord-connect';
import { TelegramConnect } from './telegram-connect';
import { TwitterConnect } from './twitter-connect';

export default async function SocialPage() {
  const sb = await getSupabaseServer();
  const { data: brands } = await sb.rpc('get_brands', { p_limit: 50 });
  if (!brands || brands.length === 0) redirect('/app/onboarding');

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Connected accounts</p>
        <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
          Hook in your platforms.
        </h1>
        <p className="mt-3 text-[var(--color-ink-2)]">
          Five platforms post directly today: Bluesky, Mastodon, Discord, Telegram, X. Others (IG, LinkedIn, TikTok, etc.) require multi-week approvals — they show on the picker but are disabled.
        </p>

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
        </div>
      </div>
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
