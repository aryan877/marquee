import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { JobsHistoryList } from '@/components/app/jobs-history-list';
import { BrandEditor } from './brand-editor';

export default async function BrandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await sb.rpc('get_brand', { p_brand_id: id });
  const brand = rows?.[0];
  if (!brand) notFound();

  const guide   = (brand.guidelines ?? {}) as { do?: string[]; dont?: string[]; vocabulary?: string[]; hashtags?: string[] };

  const { data: jobs } = await sb.rpc('get_content_jobs_page', { p_brand_id: id, p_limit: 20 });
  const initialJobsPage = pageFromRows(jobs, 20);

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <Link href="/app/brands" className="text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
          ← All brands
        </Link>

        <div className="mt-4 flex justify-end">
          <Link
            href={`/app/generate?brand=${brand.id}`}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
          >
            Generate for this brand <span aria-hidden>→</span>
          </Link>
        </div>

        <BrandEditor brand={brand} />

        {(guide.do?.length || guide.dont?.length) && (
          <section className="mt-10">
            <SectionLabel>Guidelines</SectionLabel>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {guide.do && guide.do.length > 0 && (
                <Block title="Always">
                  <ul className="space-y-1">{guide.do.map((x) => <li key={x}>· {x}</li>)}</ul>
                </Block>
              )}
              {guide.dont && guide.dont.length > 0 && (
                <Block title="Never">
                  <ul className="space-y-1">{guide.dont.map((x) => <li key={x}>· {x}</li>)}</ul>
                </Block>
              )}
            </div>
          </section>
        )}

        <section className="mt-12">
          <SectionLabel>Recent posts</SectionLabel>
          <JobsHistoryList
            initialPage={initialJobsPage}
            brandId={id}
            emptyText="No posts yet for this brand."
          />
        </section>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">{children}</p>;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="surface rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <div className="font-mono text-[10px] tracking-[0.04em] text-[var(--color-ink-3)]">{title}</div>
      <div className="mt-1 text-sm text-[var(--color-ink-2)]">{children}</div>
    </div>
  );
}
