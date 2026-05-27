import Link from 'next/link';
import { MarqueeWord } from './wordmark';
import { ScrollingStrip } from './scrolling-strip';

const TICKER = [
  'Autopilot posting',
  'Daily posters',
  'Cat-meme videos',
  'Carries your brand voice',
  'Free during launch',
  'Priority queue for founders',
];

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-paper-2)]">
      <div className="border-b border-[var(--color-border)] py-6 text-[var(--color-ink-2)]">
        <ScrollingStrip items={TICKER} className="font-display text-2xl tracking-tight" />
      </div>
      <div className="mx-auto flex max-w-7xl flex-col gap-10 px-6 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <div>
          <MarqueeWord dot className="text-5xl md:text-6xl" />
          <p className="mt-3 max-w-md text-sm text-[var(--color-ink-3)]">
            Your brand on autopilot. We make daily posts, you focus on building.
          </p>
        </div>
        <nav className="flex flex-wrap gap-x-10 gap-y-3 text-sm text-[var(--color-ink-2)]">
          <Link href="/#how">How it works</Link>
          <Link href="/#platforms">Platforms</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/login">Sign in</Link>
          <Link href="/signup">Start free</Link>
        </nav>
      </div>
      <div className="border-t border-[var(--color-border)] px-6 py-4 text-xs text-[var(--color-ink-3)] md:px-10">
        © {new Date().getFullYear()} Marquee. Built at an open-air hackathon in Noida.
      </div>
    </footer>
  );
}
