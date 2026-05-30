import Link from 'next/link';
import { redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { JobsHistoryList } from '@/components/app/jobs-history-list';

export default async function JobsPage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data } = await sb.rpc('get_content_jobs_page', { p_limit: 20 });
  const initialPage = pageFromRows(data, 20);

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">Generations</p>
            <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
              Past generations.
            </h1>
          </div>
          <Link
            href="/app/generate"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
          >
            New post <span aria-hidden>+</span>
          </Link>
        </div>

        <JobsHistoryList initialPage={initialPage} />
      </div>
    </div>
  );
}
