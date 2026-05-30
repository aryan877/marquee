'use client';

import Link from 'next/link';
import type { Database } from '@marquee/db';
import type { JobHistoryPage } from '@/hooks/queries';
import { usePaginatedJobs } from '@/hooks/queries';

type Job = Database['public']['Functions']['get_content_jobs_page']['Returns'][number];

export function JobsHistoryList({
  initialPage,
  brandId,
  emptyText = 'No posts yet. Hit Generate to make your first.',
}: {
  initialPage: JobHistoryPage;
  brandId?: string;
  emptyText?: string;
}) {
  const query = usePaginatedJobs({ brandId, initialPage });
  const jobs = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (jobs.length === 0) {
    return (
      <div className="mt-10 surface rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-12 text-center text-[var(--color-ink-3)]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="mt-10">
      <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] surface">
        {jobs.map((j) => <JobRow key={j.id} job={j} />)}
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

function JobRow({ job: j }: { job: Job }) {
  return (
    <li>
      <Link
        href={`/app/jobs/${j.id}`}
        className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[var(--color-paper-2)]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <StatusDot status={j.status} />
            <span className="font-medium">{j.topic ?? 'Untitled'}</span>
          </div>
          <div className="mt-1 truncate text-xs text-[var(--color-ink-3)]">
            {j.brand_name ? `${j.brand_name} · ` : ''}{j.content_type} · {(j.platforms ?? []).join(', ') || 'no platforms'} · {new Date(j.created_at).toLocaleString()}
          </div>
        </div>
        <span className="font-mono text-xs tracking-wider text-[var(--color-ink-3)]">{j.status}</span>
      </Link>
    </li>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === 'POSTED' ? 'bg-[var(--color-signal-good)]' :
    status === 'FAILED' ? 'bg-[var(--color-signal-bad)]' :
    status === 'REVIEW' ? 'bg-[var(--color-accent-strong)]' :
    'bg-[var(--color-ink-3)] animate-pulse';
  return <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${cls}`} />;
}
