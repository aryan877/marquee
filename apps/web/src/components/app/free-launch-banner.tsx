import Link from 'next/link';

export function FreeLaunchBanner() {
  return (
    <div className="sticky top-14 z-30 border-b border-[var(--color-border)] bg-[var(--color-ink)] px-6 py-2.5 text-[var(--color-paper)] md:top-0 md:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-sm">
        <p className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 bg-[var(--color-accent-strong)]"
            style={{ transform: 'rotate(45deg)' }}
          />
          Marquee is free during launch — all features unlocked.
        </p>
        <Link
          href="/app/settings/billing"
          className="rounded-full border border-[var(--color-paper)]/30 px-3 py-1 text-xs transition-colors hover:bg-[var(--color-paper)]/10"
        >
          Get Founder Pass — skip the queue for $50/mo →
        </Link>
      </div>
    </div>
  );
}
