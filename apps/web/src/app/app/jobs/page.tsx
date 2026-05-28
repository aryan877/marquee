import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Database } from '@marquee/db';

type Job = Database['public']['Functions']['get_content_jobs']['Returns'][number];

export default async function JobsPage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: jobs } = await sb.rpc('get_content_jobs', { p_limit: 100 });

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">Posts</p>
            <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
              Every post you&apos;ve made.
            </h1>
          </div>
          <Link
            href="/app/generate"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
          >
            New post <span aria-hidden>+</span>
          </Link>
        </div>

        {!jobs || jobs.length === 0 ? (
          <div className="mt-10 surface rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-12 text-center text-[var(--color-ink-3)]">
            No posts yet. Hit Generate to make your first.
          </div>
        ) : (
          <ul className="mt-10 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] surface">
            {jobs.map((j) => <JobRow key={j.id} job={j} />)}
          </ul>
        )}
      </div>
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
            {j.content_type} · {(j.platforms ?? []).join(', ') || 'no platforms'} · {new Date(j.created_at).toLocaleString()}
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
  return <span aria-hidden className={`inline-block h-2 w-2 ${cls}`} />;
}
