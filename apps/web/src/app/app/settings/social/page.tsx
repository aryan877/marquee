import { redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { SocialPlatformsList } from './social-platforms-list';

export default async function SocialPage() {
  const sb = await getSupabaseServer();
  const { data } = await sb.rpc('get_brands_page', { p_limit: 20 });
  const initialPage = pageFromRows(data, 20);
  if (initialPage.items.length === 0) redirect('/app/onboarding');

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

        <SocialPlatformsList initialPage={initialPage} />
      </div>
    </div>
  );
}
