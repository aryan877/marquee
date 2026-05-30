'use client';

import Link from 'next/link';
import type { Database } from '@marquee/db';
import { coerceBrandPalette } from '@marquee/shared/palettes';
import type { BrandListPage } from '@/hooks/queries';
import { usePaginatedBrands } from '@/hooks/queries';

type Brand = Database['public']['Functions']['get_brands_page']['Returns'][number];

export function BrandsList({ initialPage }: { initialPage: BrandListPage }) {
  const query = usePaginatedBrands({ initialPage });
  const brands = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (brands.length === 0) return <EmptyState />;

  return (
    <div className="mt-10">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((b) => <BrandCard key={b.id} brand={b} />)}
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
  const palette = coerceBrandPalette(b.palette);
  const colors = [palette.primary, palette.accent, palette.secondary];
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
