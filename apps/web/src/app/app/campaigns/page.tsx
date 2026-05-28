import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Database } from '@marquee/db';

type Campaign = Database['public']['Functions']['get_campaigns']['Returns'][number];

export default async function CampaignsPage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: campaigns } = await sb.rpc('get_campaigns', { p_limit: 50 });

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

        {!campaigns || campaigns.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-10 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] surface">
            {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 surface rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-12 text-center">
      <p className="font-display text-2xl tracking-[-0.03em]">No autopilot campaigns yet.</p>
      <p className="mt-2 max-w-md mx-auto text-sm text-[var(--color-ink-3)]">
        Campaigns post on a recurring cadence — daily, weekly, whatever you set. Each tick picks a fresh topic from your pool and runs the pipeline.
      </p>
      <p className="mt-4 text-xs text-[var(--color-ink-3)]">Coming soon.</p>
    </div>
  );
}

function CampaignRow({ campaign: c }: { campaign: Campaign }) {
  const next = c.next_run_at ? new Date(c.next_run_at) : null;
  return (
    <li className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 ${c.active ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-ink-3)]/40'}`}
          />
          <span className="font-medium">{c.name}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--color-ink-3)]">
          {c.content_type} · {(c.platforms ?? []).join(', ') || 'no platforms'} · {c.cron_expression ?? 'manual'}
        </div>
      </div>
      <div className="text-right text-xs text-[var(--color-ink-3)]">
        {next ? (
          <>
            <div>Next run</div>
            <div className="font-mono text-[var(--color-ink-2)]">{next.toLocaleString()}</div>
          </>
        ) : (
          <span className="font-mono">paused</span>
        )}
      </div>
    </li>
  );
}
