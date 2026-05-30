import { redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { CampaignsList } from '@/components/app/campaigns-list';

export default async function CampaignsPage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await sb.rpc('get_campaigns_page', { p_limit: 20 });
  const initialPage = pageFromRows(data, 20);

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">Campaigns</p>
            <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
              Autopilot schedules
            </h1>
          </div>
        </div>

        <CampaignsList initialPage={initialPage} />
      </div>
    </div>
  );
}
