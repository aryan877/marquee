import Image from 'next/image';
import Link from 'next/link';
import { SiteNav } from '@/components/marquee/site-nav';
import { SiteFooter } from '@/components/marquee/site-footer';
import { ScrollingStrip } from '@/components/marquee/scrolling-strip';
import { HeroSpotlight } from '@/components/marquee/hero-spotlight';
import { WaveBorder } from '@/components/marquee/wave-border';
import { PLATFORM_META } from '@/components/marquee/platform-icons';
import { PLANS } from '@marquee/shared/billing';
import type { SocialPlatformZ } from '@marquee/shared/schemas';

const HERO_TICKER = [
  'Posters',
  'Cat-meme videos',
  'Carousels',
  'Reels',
  'Instagram',
  'TikTok',
  'LinkedIn',
  'X',
  'YouTube',
  'Bluesky',
  'Threads',
  'Pinterest',
];

type HowStep = { n: string; t: string; d: string; image: string };

const HOW: readonly HowStep[] = [
  { n: '01', t: 'Tell us your brand',       d: 'Voice, palette, fonts, audience. Two minutes of setup. We bake every output around it.',          image: '/brand/card-1.png' },
  { n: '02', t: 'Pick autopilot or prompt', d: 'Set a daily cadence and a topic pool, or generate one-offs when inspiration strikes.',             image: '/brand/card-2.png' },
  { n: '03', t: 'Watch the Studio paint',   d: 'Scripts type themselves. Cats get keyed. Frames render. Posters layer in. Live, in front of you.', image: '/brand/card-3.png' },
  { n: '04', t: 'Approve or auto-post',     d: 'Review every post before it goes out, or flip to auto-publish once you trust the agent.',          image: '/brand/card-4.png' },
] as const;

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-x-clip">
      <SiteNav />

      <section className="relative px-6 pt-44 pb-24 md:px-10 md:pt-56 md:pb-32">
        <div className="pointer-events-none absolute right-2 top-24 hidden md:block md:right-10 md:top-28">
          <HeroSpotlight className="w-56 md:w-64 lg:w-80" />
        </div>

        <div className="relative mx-auto max-w-7xl">
          <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">
            Marketing automation · for founders who don&apos;t have time
          </p>
          <h1 className="mt-6 font-display leading-[0.85] tracking-[-0.07em]" style={{ fontSize: 'var(--text-mega)' }}>
            <span className="block">your brand,</span>
            <span className="block text-[var(--color-ink-2)]">on autopilot.</span>
          </h1>
          <p className="mt-8 max-w-xl text-lg text-[var(--color-ink-2)] md:text-xl">
            Marquee makes the posters, the cat-meme explainer videos, and the carousels — then posts them to Instagram, TikTok, LinkedIn, and seven more platforms while you sleep.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-base text-[var(--color-paper)] transition-colors hover:bg-[var(--color-ink-2)]"
            >
              Start free
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="#how"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] px-6 py-3 text-base text-[var(--color-ink)] hover:bg-[var(--color-paper-2)]"
            >
              See how it works
            </Link>
          </div>
          <p className="mt-6 text-xs text-[var(--color-ink-3)]">
            Free during launch · No card required
          </p>
        </div>
      </section>

      <WaveBorder className="-mb-px w-full text-[var(--color-ink)]" />

      <section className="border-y border-[var(--color-border)] bg-[var(--color-paper-2)] py-6 text-[var(--color-ink)]">
        <ScrollingStrip items={HERO_TICKER} className="font-display text-3xl tracking-tight md:text-4xl" />
      </section>

      <WaveBorder className="-mt-px w-full text-[var(--color-ink)]" flip />

      <section id="how" className="px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display tracking-[-0.05em]" style={{ fontSize: 'var(--text-giant)' }}>
              The whole<br />studio runs<br />while you sleep.
            </h2>
            <span className="hidden font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)] md:block">
              How it works
            </span>
          </div>
          <div className="mt-16 grid gap-8 md:grid-cols-2">
            {HOW.map((s, i) => (
              <div
                key={s.n}
                className="surface-2 group relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 transition-transform hover:-translate-y-1 md:p-8"
              >
                <div className="relative mb-6 aspect-square overflow-hidden rounded-[var(--radius-md)] bg-[var(--color-paper)]">
                  <Image
                    src={s.image}
                    alt=""
                    width={600}
                    height={600}
                    priority={i === 0}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">{s.n}</div>
                <h3 className="mt-2 font-display text-3xl tracking-[-0.03em] md:text-4xl">{s.t}</h3>
                <p className="mt-3 text-[var(--color-ink-2)]">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="platforms" className="px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">
            Distribution
          </p>
          <h2 className="mt-4 font-display tracking-[-0.05em]" style={{ fontSize: 'var(--text-giant)' }}>
            ten places<br />to be everywhere.
          </h2>
          <p className="mt-6 max-w-xl text-lg text-[var(--color-ink-2)]">
            One generation, posted to every platform you pick. No CSV exports, no scheduling tools, no &quot;just download and upload.&quot;
          </p>
          <div className="mt-16 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
            {(Object.entries(PLATFORM_META) as [SocialPlatformZ, typeof PLATFORM_META[SocialPlatformZ]][]).map(([key, meta]) => (
              <div key={key} className="surface-2 group relative aspect-[5/4] rounded-[var(--radius-md)] border border-[var(--color-border)] p-4 transition-transform hover:-translate-y-0.5">
                <meta.Icon className={`h-9 w-9 ${meta.tint}`} />
                <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
                  <span className="text-sm text-[var(--color-ink-2)]">{meta.label}</span>
                  {meta.status === 'soon' && (
                    <span className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">Soon</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <WaveBorder className="-mb-px w-full text-[var(--color-ink)]" />

      <section id="pricing" className="border-t border-[var(--color-border)] bg-[var(--color-paper-2)] px-6 py-24 md:px-10 md:py-32">
        <div className="mx-auto max-w-7xl">
          <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">
            Pricing
          </p>
          <h2 className="mt-4 font-display tracking-[-0.05em]" style={{ fontSize: 'var(--text-giant)' }}>
            one plan.<br />everything in.
          </h2>
          <div className="mt-16 grid gap-6 md:grid-cols-2">
            {Object.values(PLANS).map((plan) => (
              <div
                key={plan.id}
                className={`surface relative rounded-[var(--radius-lg)] border p-10 ${
                  plan.priceUsd > 0
                    ? 'border-[var(--color-ink)] lift-2'
                    : 'border-[var(--color-border)] lift'
                }`}
              >
                {plan.priceUsd > 0 && (
                  <span className="absolute -top-3 left-10 inline-flex items-center rounded-full bg-[var(--color-ink)] px-3 py-1 font-mono text-[10px] tracking-wider text-[var(--color-paper)]">
                    For founders
                  </span>
                )}
                <h3 className="font-display text-4xl tracking-[-0.03em] md:text-5xl">{plan.label}</h3>
                <div className="mt-4 flex items-baseline gap-1 font-display tracking-[-0.04em]">
                  <span className="text-5xl md:text-6xl">${plan.priceUsd}</span>
                  <span className="text-[var(--color-ink-3)]">/month</span>
                </div>
                <p className="mt-4 text-[var(--color-ink-2)]">{plan.blurb}</p>
                <ul className="mt-8 space-y-3 text-[var(--color-ink-2)]">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span aria-hidden className="mt-2 inline-block h-1 w-1 rounded-full bg-[var(--color-ink)]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className={`mt-10 inline-flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-base transition-colors ${
                    plan.priceUsd > 0
                      ? 'bg-[var(--color-ink)] text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]'
                      : 'border border-[var(--color-border-strong)] text-[var(--color-ink)] hover:bg-[var(--color-paper-3)]'
                  }`}
                >
                  {plan.priceUsd > 0 ? 'Become a Founder' : 'Start free'}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

