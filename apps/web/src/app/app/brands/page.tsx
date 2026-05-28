import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import type { Database } from '@marquee/db';

type Brand = Database['public']['Functions']['get_brands']['Returns'][number];

export default async function BrandsPage() {
  const sb = await getSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: brands } = await sb.rpc('get_brands', { p_limit: 100 });

  return (
    <div className="px-6 py-10 md:px-10 md:py-14">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">Brands</p>
            <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
              Your brand profiles
            </h1>
          </div>
          <Link
            href="/app/onboarding"
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
          >
            New brand <span aria-hidden>+</span>
          </Link>
        </div>

        {!brands || brands.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {brands.map((b) => <BrandCard key={b.id} brand={b} />)}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 surface rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-12 text-center">
      <p className="font-display text-2xl tracking-[-0.03em]">No brand profiles yet.</p>
      <p className="mt-2 text-sm text-[var(--color-ink-3)]">Set one up and we&apos;ll bake every post around it.</p>
      <Link
        href="/app/onboarding"
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
      >
        Create your first brand <span aria-hidden>→</span>
      </Link>
    </div>
  );
}

function BrandCard({ brand: b }: { brand: Brand }) {
  const palette = (b.palette ?? {}) as Record<string, string>;
  const colors = [palette.primary, palette.accent, palette.secondary].filter(Boolean) as string[];
  return (
    <li>
      <Link
        href={`/app/brands/${b.id}`}
        className="surface block h-full rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 lift transition-transform hover:-translate-y-0.5"
      >
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-12 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)]"
            style={{
              background: colors.length >= 2
                ? `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1]} 100%)`
                : colors[0] ?? 'var(--color-paper-3)',
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{b.name}</div>
            <div className="truncate text-xs text-[var(--color-ink-3)]">
              {b.handle ?? b.industry ?? '—'}
            </div>
          </div>
        </div>
        {b.description && (
          <p className="mt-3 line-clamp-2 text-sm text-[var(--color-ink-2)]">{b.description}</p>
        )}
        <div className="mt-4 flex items-center gap-2 text-xs text-[var(--color-ink-3)]">
          {b.target_audience && <span>{b.target_audience}</span>}
          {b.is_active === false && (
            <span className="rounded-full bg-[var(--color-paper-3)] px-2 py-0.5">Paused</span>
          )}
        </div>
      </Link>
    </li>
  );
}
