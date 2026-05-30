import Link from 'next/link';
import type { Database } from '@marquee/db';
import { coerceBrandPalette, type BrandPalette } from '@marquee/shared/palettes';

type Brand = Database['public']['Functions']['get_brands_page']['Returns'][number];
type Job = Database['public']['Functions']['get_content_jobs_page']['Returns'][number];
type Profile = Database['public']['Functions']['get_profile']['Returns'][number];

export function Dashboard({
 brands,
 jobs,
 profile,
}: {
 brands: Brand[];
 jobs: Job[];
 profile: Profile | null;
}) {
 return (
 <div className="px-6 py-10 md:px-10 md:py-14">
 <div className="mx-auto max-w-6xl">
 <div className="flex flex-wrap items-baseline justify-between gap-4">
 <div>
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Today</p>
 <h1 className="mt-2 font-display text-5xl tracking-[-0.05em] md:text-6xl">
 Make today&apos;s post.
 </h1>
 </div>
 <Link
 href="/app/generate"
 className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)]"
 >
 Generate <span aria-hidden>→</span>
 </Link>
 </div>

 <Stats profile={profile} jobs={jobs} brands={brands} />

 <section className="mt-12">
 <header className="flex items-baseline justify-between">
 <h2 className="font-display text-2xl tracking-[-0.03em]">Brands</h2>
 <Link href="/app/brands" className="text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
 All →
 </Link>
 </header>
 <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
 {brands.map((b) => (
 <li key={b.id}>
 <Link
 href={`/app/brands/${b.id}`}
 className="surface block rounded-[var(--radius-lg)] border border-[var(--color-border)] p-5 lift hover:-translate-y-0.5 transition-transform"
 >
 <div className="flex items-center gap-3">
 <BrandChip palette={coerceBrandPalette(b.palette)} />
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
 </Link>
 </li>
 ))}
 </ul>
 </section>

 <section className="mt-12">
 <header className="flex items-baseline justify-between">
 <h2 className="font-display text-2xl tracking-[-0.03em]">Recent</h2>
 <Link href="/app/jobs" className="text-sm text-[var(--color-ink-3)] hover:text-[var(--color-ink)]">
 All →
 </Link>
 </header>
 {jobs.length === 0 ? (
 <div className="mt-5 surface rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] p-10 text-center text-[var(--color-ink-3)]">
 No posts yet. Hit Generate to make your first.
 </div>
 ) : (
 <ul className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] surface">
 {jobs.map((j) => (
 <li key={j.id}>
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
 <span className="font-mono text-xs tracking-wider text-[var(--color-ink-3)]">
 {j.status}
 </span>
 </Link>
 </li>
 ))}
 </ul>
 )}
 </section>
 </div>
 </div>
 );
}

function Stats({ profile, jobs, brands }: { profile: Profile | null; jobs: Job[]; brands: Brand[] }) {
 const inFlight = jobs.filter((j) => ['PENDING', 'GENERATING', 'RENDERING', 'POSTING'].includes(j.status)).length;
 const review = jobs.filter((j) => j.status === 'REVIEW').length;
 return (
 <dl className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4">
 <StatCard label="Brands" value={brands.length} />
 <StatCard label="In flight" value={inFlight} />
 <StatCard label="To review" value={review} highlight={review > 0} />
 <StatCard label="Posted this period" value={profile?.posts_used_period ?? 0} />
 </dl>
 );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
 return (
 <div className={`surface rounded-[var(--radius-md)] border p-4 ${highlight ? 'border-[var(--color-ink)]' : 'border-[var(--color-border)]'}`}>
 <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">{label}</div>
 <div className="mt-2 font-display text-3xl tracking-[-0.04em]">{value}</div>
 </div>
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

function BrandChip({ palette }: { palette: BrandPalette }) {
 const colors = [palette.primary, palette.accent, palette.secondary];
 if (colors.length === 0) {
 return <div className="h-10 w-10 rounded-[var(--radius-sm)] bg-[var(--color-paper-3)]" />;
 }
 return (
 <div
 className="h-10 w-10 rounded-[var(--radius-sm)]"
 style={{
 background: colors.length >= 2
 ? `linear-gradient(135deg, ${colors[0]} 0%, ${colors[1] ?? colors[0]} 100%)`
 : colors[0],
 }}
 />
 );
}
