'use client';

import type { Database } from '@marquee/db';
import type { CampaignListPage } from '@/hooks/queries';
import { usePaginatedCampaigns } from '@/hooks/queries';
import { formatAppDateTime } from '@/lib/dates';

type Campaign = Database['public']['Functions']['get_campaigns_page']['Returns'][number];

export function CampaignsList({ initialPage }: { initialPage: CampaignListPage }) {
  const query = usePaginatedCampaigns({ initialPage });
  const campaigns = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (campaigns.length === 0) return <EmptyState />;

  return (
    <div className="mt-10">
      <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] surface">
        {campaigns.map((c) => <CampaignRow key={c.id} campaign={c} />)}
      </ul>

      {query.hasNextPage && (
        <div className="mt-5 flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className="rounded-full border border-[var(--color-border-strong)] px-5 py-2 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] disabled:opacity-50"
          >
            {query.isFetchingNextPage ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
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
  return (
    <li className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${c.active ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-ink-3)]/40'}`}
          />
          <span className="font-medium">{c.name}</span>
        </div>
        <div className="mt-1 text-xs text-[var(--color-ink-3)]">
          {c.brand_name} · {c.content_type} · {(c.platforms ?? []).join(', ') || 'no platforms'} · {c.cron_expression ?? 'manual'}
        </div>
      </div>
      <div className="text-right text-xs text-[var(--color-ink-3)]">
        {c.next_run_at ? (
          <>
            <div>Next run</div>
            <time dateTime={c.next_run_at} className="font-mono text-[var(--color-ink-2)]">{formatAppDateTime(c.next_run_at)}</time>
          </>
        ) : (
          <span className="font-mono">paused</span>
        )}
      </div>
    </li>
  );
}
