'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { AiFillButton } from '@/components/app/ai-fill-button';
import { coerceBrandPalette } from '@marquee/shared/palettes';
import type { BrandListPage } from '@/hooks/queries';
import { usePaginatedBrands } from '@/hooks/queries';
import type { Database } from '@marquee/db';
import type { JobInputAsset } from '@marquee/shared/schemas';

type ContentType = Database['public']['Enums']['ContentType'];

const TYPES: { id: ContentType; label: string; blurb: string }[] = [
 { id: 'POSTER', label: 'Poster', blurb: 'Single 1080×1350 image. Editorial type, stat hero, listicle, or quote.' },
 { id: 'VIDEO', label: 'Video', blurb: 'Cat-meme explainer. TTS + green-screen overlays + auto-captions.' },
 { id: 'CAROUSEL', label: 'Carousel', blurb: '5–10 slides. LinkedIn + IG friendly.' },
 { id: 'REEL', label: 'Reel', blurb: 'Short vertical video. Same pipeline as Video, faster cuts.' },
];

export function GenerateForm({ initialBrandsPage }: { initialBrandsPage: BrandListPage }) {
 const router = useRouter();
 const brandsQuery = usePaginatedBrands({ initialPage: initialBrandsPage });
 const brands = brandsQuery.data?.pages.flatMap((page) => page.items) ?? [];
 const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
 const [type, setType] = useState<ContentType>('POSTER');
 const [topic, setTopic] = useState('');
 const [assets, setAssets] = useState<JobInputAsset[]>([]);
 const [uploading, setUploading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const [pending, start] = useTransition();
 const activeBrand = brands.find((b) => b.id === brandId) ?? null;

 async function uploadFiles(files: FileList | null) {
 if (!files?.length || !brandId) return;
 setError(null);
 setUploading(true);
 try {
 const next: JobInputAsset[] = [];
 for (const file of Array.from(files).slice(0, 8 - assets.length)) {
 const form = new FormData();
 form.append('brand_id', brandId);
 form.append('file', file);
 const res = await fetch('/api/assets/job-input', { method: 'POST', body: form });
 const body = await res.json().catch(() => ({}));
 if (!res.ok) throw new Error(body.error ?? 'Upload failed');
 next.push(body.asset as JobInputAsset);
 }
 setAssets((current) => [...current, ...next].slice(0, 8));
 } catch (err) {
 setError(err instanceof Error ? err.message : 'Upload failed');
 } finally {
 setUploading(false);
 }
 }

 function updateAsset(id: string, patch: Partial<Pick<JobInputAsset, 'description' | 'usage_hint'>>) {
 setAssets((current) => current.map((asset) => asset.id === id ? { ...asset, ...patch } : asset));
 }

 async function submit() {
 setError(null);
 if (!brandId) return setError('Pick a brand');
 start(async () => {
 const res = await fetch('/api/jobs', {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({
 brand_id: brandId,
 content_type: type,
 topic: topic.trim() || undefined,
 assets,
 }),
 });
 if (!res.ok) {
 const body = await res.json().catch(() => ({}));
 setError(body.error ?? 'Could not submit');
 return;
 }
 const { job_id } = (await res.json()) as { job_id: string };
 router.push(`/app/jobs/${job_id}`);
 });
 }

 return (
 <div className="mt-10 space-y-10">
 <section>
 <h3 className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Brand</h3>
 <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {brands.map((b) => {
 const active = b.id === brandId;
 const palette = coerceBrandPalette(b.palette);
 return (
 <button
 key={b.id}
 onClick={() => setBrandId(b.id)}
 className={cn(
 'rounded-[var(--radius-md)] border p-4 text-left transition-colors',
 active ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
 )}
 >
 <div className="flex items-center gap-3">
 <span
 className="h-7 w-7 rounded-[var(--radius-xs)] ring-1 ring-black/10"
 style={{ background: palette.primary ?? 'var(--color-paper-3)' }}
 />
 <div className="min-w-0">
 <div className="truncate font-medium">{b.name}</div>
 <div className="truncate text-xs text-[var(--color-ink-3)]">{b.handle ?? b.industry ?? '—'}</div>
 </div>
 </div>
 </button>
 );
 })}
 </div>
 {brandsQuery.hasNextPage && (
 <button
 type="button"
 onClick={() => void brandsQuery.fetchNextPage()}
 disabled={brandsQuery.isFetchingNextPage}
 className="mt-3 rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] disabled:opacity-50"
 >
 {brandsQuery.isFetchingNextPage ? 'Loading...' : 'Load more brands'}
 </button>
 )}
 </section>

 <section>
 <h3 className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">What to make</h3>
 <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
 {TYPES.map((t) => {
 const active = t.id === type;
 return (
 <button
 key={t.id}
 onClick={() => setType(t.id)}
 className={cn(
 'rounded-[var(--radius-md)] border p-4 text-left transition-colors',
 active ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
 )}
 >
 <div className="font-medium">{t.label}</div>
 <div className="mt-1 text-xs text-[var(--color-ink-3)]">{t.blurb}</div>
 </button>
 );
 })}
 </div>
 </section>

 <section>
 <div className="flex items-end justify-between gap-4">
 <div>
 <h3 className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Assets (optional)</h3>
 <p className="mt-1 text-sm text-[var(--color-ink-3)]">
 Upload screenshots, product shots, demo clips, or reference docs. The agent reads your notes and uses them where they fit.
 </p>
 </div>
 <label
 className={cn(
 'inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border-strong)] px-4 py-2 text-sm hover:bg-[var(--color-paper-2)]',
 (!brandId || uploading || assets.length >= 8) && 'pointer-events-none opacity-50',
 )}
 >
 <Upload className="h-4 w-4" />
 {uploading ? 'Uploading...' : 'Add assets'}
 <input
 type="file"
 multiple
 accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf"
 className="hidden"
 disabled={!brandId || uploading || assets.length >= 8}
 onChange={(e) => {
 void uploadFiles(e.target.files);
 e.currentTarget.value = '';
 }}
 />
 </label>
 </div>
 {assets.length > 0 && (
 <div className="mt-3 space-y-3">
 {assets.map((asset) => (
 <div key={asset.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <div className="truncate text-sm font-medium">{asset.file_name}</div>
 <div className="mt-0.5 font-mono text-xs text-[var(--color-ink-3)]">{asset.kind} · {formatBytes(asset.size)}</div>
 </div>
 <button
 type="button"
 onClick={() => setAssets((current) => current.filter((item) => item.id !== asset.id))}
 className="rounded-full p-1 text-[var(--color-ink-3)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
 aria-label={`Remove ${asset.file_name}`}
 >
 <X className="h-4 w-4" />
 </button>
 </div>
 <div className="mt-3 grid gap-2 md:grid-cols-2">
 <input
 value={asset.description ?? ''}
 onChange={(e) => updateAsset(asset.id, { description: e.target.value })}
 placeholder="What is this asset?"
 className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:border-[var(--color-ink)] focus:outline-none"
 />
 <input
 value={asset.usage_hint ?? ''}
 onChange={(e) => updateAsset(asset.id, { usage_hint: e.target.value })}
 placeholder="How should the agent use it?"
 className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-paper)] px-3 py-2 text-sm focus:border-[var(--color-ink)] focus:outline-none"
 />
 </div>
 </div>
 ))}
 </div>
 )}
 </section>

 <section>
 <label htmlFor="generation-topic" className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">
 Topic (optional)
 </label>
 <div className="mt-3">
 <AiFillButton
 label="Suggest"
 disabled={!activeBrand}
 promptRequired
 promptLabel="Generation brief for AI topic suggestion"
 promptPlaceholder="Describe the angle, offer, campaign, pain point, or audience..."
 request={{
 form: 'generation-topic',
 contentType: type,
 topic,
 brand: activeBrand ? {
 name: activeBrand.name,
 handle: activeBrand.handle,
 description: activeBrand.description,
 industry: activeBrand.industry,
 target_audience: activeBrand.target_audience,
 } : null,
 }}
 onApply={(suggestion) => {
 if (typeof suggestion.topic === 'string' && suggestion.topic.trim()) {
 setTopic(suggestion.topic.trim());
 }
 }}
 />
 </div>
 <input
 id="generation-topic"
 value={topic}
 onChange={(e) => setTopic(e.target.value)}
 placeholder="e.g. how to survive a 9-to-5, explained by cats"
 className="mt-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-base text-[var(--color-ink)] focus:border-[var(--color-ink)] focus:outline-none"
 />
 </section>

 {error && (
 <div className="rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
 {error}
 </div>
 )}

 <div className="flex items-center justify-end gap-3">
 <button
 onClick={submit}
 disabled={pending || uploading || !brandId}
 className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-base text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
 >
 {pending ? 'Submitting…' : 'Start generation'}
 {!pending && <span aria-hidden>→</span>}
 </button>
 </div>
 </div>
 );
}

function formatBytes(value: number) {
 if (value < 1024) return `${value} B`;
 if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
 return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
