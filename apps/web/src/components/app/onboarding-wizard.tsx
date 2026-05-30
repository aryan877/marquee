'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
 PALETTE_PRESETS,
 VOICE_PRESETS,
 FONT_PAIRS,
 VOICE_IDS,
 PALETTE_IDS,
 FONT_IDS,
 DEFAULT_BRAND_STYLE,
 paletteById,
 voiceById,
 fontsById,
 type VoiceId,
 type PaletteId,
 type FontId,
} from '@marquee/shared/palettes';
import { AiFillButton } from '@/components/app/ai-fill-button';
import { cn } from '@/lib/cn';

interface Draft {
 name: string;
 handle: string;
 description: string;
 industry: string;
 targetAudience: string;
 voiceId: VoiceId;
 paletteId: PaletteId;
 fontsId: FontId;
}

const EMPTY: Draft = {
 name: '',
 handle: '',
 description: '',
 industry: '',
 targetAudience: '',
 voiceId: DEFAULT_BRAND_STYLE.voiceId,
 paletteId: DEFAULT_BRAND_STYLE.paletteId,
 fontsId: DEFAULT_BRAND_STYLE.fontsId,
};

const STEPS = ['Brand', 'Voice', 'Look', 'Review'] as const;
const VOICE_ID_SET = new Set<VoiceId>(VOICE_IDS);
const PALETTE_ID_SET = new Set<PaletteId>(PALETTE_IDS);
const FONT_ID_SET = new Set<FontId>(FONT_IDS);

export function OnboardingWizard() {
 const router = useRouter();
 const [step, setStep] = useState(0);
 const [draft, setDraft] = useState<Draft>(EMPTY);
 const [error, setError] = useState<string | null>(null);
 const [pending, start] = useTransition();

 const palette = paletteById(draft.paletteId);
 const voice = voiceById(draft.voiceId);
 const fonts = fontsById(draft.fontsId);

 function next() { setStep((s) => Math.min(s + 1, STEPS.length - 1)); }
 function back() { setStep((s) => Math.max(s - 1, 0)); }

 async function submit() {
 setError(null);
 start(async () => {
 const res = await fetch('/api/brands', {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({
 name: draft.name.trim(),
 handle: draft.handle.trim() || undefined,
 description: draft.description.trim() || undefined,
 industry: draft.industry.trim() || undefined,
 target_audience: draft.targetAudience.trim() || undefined,
 voice: { tone: voice.label, sample_lines: [voice.sample] },
 palette: palette.colors,
 fonts: { heading: fonts.heading, body: fonts.body },
 }),
 });
 if (!res.ok) {
 const body = await res.json().catch(() => ({}));
 setError(body.error ?? 'Could not save brand');
 return;
 }
 router.replace('/app');
 router.refresh();
 });
 }

 return (
 <div className="grid flex-1 lg:grid-cols-[1fr_420px]">
 <section className="flex flex-col px-6 py-10 md:px-12">
 <header className="flex items-baseline justify-between">
 <div>
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">
 Setup · {step + 1} of {STEPS.length}
 </p>
 <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
 {STEPS[step] === 'Brand' && 'Tell us about your brand.'}
 {STEPS[step] === 'Voice' && 'How does it sound?'}
 {STEPS[step] === 'Look' && 'How does it look?'}
 {STEPS[step] === 'Review' && 'Looks good?'}
 </h1>
 </div>
 <Stepper step={step} />
 </header>

 <div className="mt-10 flex-1">
 <AnimatePresence mode="wait">
 <motion.div
 key={STEPS[step]}
 initial={{ opacity: 0, y: 12 }}
 animate={{ opacity: 1, y: 0 }}
 exit={{ opacity: 0, y: -12 }}
 transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
 >
 {STEPS[step] === 'Brand' && <BrandStep draft={draft} setDraft={setDraft} />}
 {STEPS[step] === 'Voice' && <VoiceStep draft={draft} setDraft={setDraft} />}
 {STEPS[step] === 'Look' && <LookStep draft={draft} setDraft={setDraft} />}
 {STEPS[step] === 'Review' && <ReviewStep draft={draft} palette={palette} voice={voice} fonts={fonts} />}
 </motion.div>
 </AnimatePresence>
 </div>

 {error && (
 <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
 {error}
 </div>
 )}

 <footer className="mt-8 flex items-center justify-between gap-3">
 <button
 onClick={back}
 disabled={step === 0 || pending}
 className="rounded-full border border-[var(--color-border)] px-5 py-2.5 text-sm disabled:opacity-40"
 >
 Back
 </button>
 {step < STEPS.length - 1 ? (
 <button
 onClick={next}
 disabled={step === 0 && !draft.name.trim()}
 className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] disabled:opacity-50"
 >
 Continue <span aria-hidden>→</span>
 </button>
 ) : (
 <button
 onClick={submit}
 disabled={pending}
 className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] disabled:opacity-60"
 >
 {pending ? 'Saving…' : 'Save brand'} {!pending && <span aria-hidden>→</span>}
 </button>
 )}
 </footer>
 </section>

 <aside
 className="relative hidden overflow-hidden border-l border-[var(--color-border)] lg:block"
 style={{ background: palette.colors.bg, color: palette.colors.fg }}
 >
 <PreviewCard draft={draft} palette={palette} voice={voice} fonts={fonts} />
 </aside>
 </div>
 );
}

function Stepper({ step }: { step: number }) {
 return (
 <div className="hidden gap-1.5 md:flex">
 {STEPS.map((_, i) => (
 <span
 key={i}
 className={cn(
 'h-1.5 w-8 rounded-full',
 i <= step ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-paper-3)]',
 )}
 />
 ))}
 </div>
 );
}

function BrandStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
 return (
 <div className="grid max-w-2xl gap-4 sm:grid-cols-2">
 <div className="sm:col-span-2">
 <AiFillButton
 label="Fill"
 promptRequired
 promptLabel="Brand context for AI fill"
 promptPlaceholder="Describe the brand, customer, offer, tone, or anything you already know..."
 request={{ form: 'brand-onboarding', draft }}
 onApply={(suggestion) => setDraft(applyBrandSuggestion(draft, suggestion))}
 />
 </div>
 <Field label="Brand name" required>
 <input
 value={draft.name}
 onChange={(e) => setDraft({ ...draft, name: e.target.value })}
 placeholder="Acme Coffee"
 className="oi"
 />
 </Field>
 <Field label="Handle">
 <input
 value={draft.handle}
 onChange={(e) => setDraft({ ...draft, handle: e.target.value })}
 placeholder="@acmecoffee"
 className="oi"
 />
 </Field>
 <Field label="Industry">
 <input
 value={draft.industry}
 onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
 placeholder="Specialty coffee"
 className="oi"
 />
 </Field>
 <Field label="Target audience">
 <input
 value={draft.targetAudience}
 onChange={(e) => setDraft({ ...draft, targetAudience: e.target.value })}
 placeholder="Coffee snobs aged 24–40"
 className="oi"
 />
 </Field>
 <Field label="Description" className="sm:col-span-2">
 <textarea
 rows={3}
 value={draft.description}
 onChange={(e) => setDraft({ ...draft, description: e.target.value })}
 placeholder="What does the brand actually do?"
 className="oi"
 />
 </Field>
 <FieldStyle />
 </div>
 );
}

function applyBrandSuggestion(current: Draft, suggestion: Record<string, unknown>): Draft {
 return {
 ...current,
 name:           textSuggestion(suggestion.name, current.name),
 handle:         textSuggestion(suggestion.handle, current.handle),
 industry:       textSuggestion(suggestion.industry, current.industry),
 targetAudience: textSuggestion(suggestion.targetAudience, current.targetAudience),
 description:    textSuggestion(suggestion.description, current.description),
 voiceId:        presetSuggestion(suggestion.voiceId, VOICE_ID_SET, current.voiceId),
 paletteId:      presetSuggestion(suggestion.paletteId, PALETTE_ID_SET, current.paletteId),
 fontsId:        presetSuggestion(suggestion.fontsId, FONT_ID_SET, current.fontsId),
 };
}

function textSuggestion(value: unknown, fallback: string) {
 return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function presetSuggestion<T extends string>(value: unknown, allowed: ReadonlySet<T>, fallback: T): T {
 return typeof value === 'string' && allowed.has(value as T) ? value as T : fallback;
}

function VoiceStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
 return (
 <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {VOICE_PRESETS.map((v) => {
 const active = v.id === draft.voiceId;
 return (
 <button
 key={v.id}
 onClick={() => setDraft({ ...draft, voiceId: v.id })}
 className={cn(
 'rounded-[var(--radius-md)] border p-5 text-left transition-colors',
 active
 ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]'
 : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
 )}
 >
 <div className="font-medium">{v.label}</div>
 <div className="mt-2 text-sm text-[var(--color-ink-2)]">&ldquo;{v.sample}&rdquo;</div>
 </button>
 );
 })}
 </div>
 );
}

function LookStep({ draft, setDraft }: { draft: Draft; setDraft: (d: Draft) => void }) {
 return (
 <div className="space-y-8">
 <div>
 <h3 className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Palette</h3>
 <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {PALETTE_PRESETS.map((p) => {
 const active = p.id === draft.paletteId;
 return (
 <button
 key={p.id}
 onClick={() => setDraft({ ...draft, paletteId: p.id })}
 className={cn(
 'rounded-[var(--radius-md)] border p-4 text-left transition-colors',
 active ? 'border-[var(--color-ink)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
 )}
 >
 <div className="flex items-center gap-2">
 {(['primary', 'secondary', 'accent', 'bg', 'fg'] as const).map((k) => (
 <span
 key={k}
 className="h-7 w-7 rounded-[var(--radius-xs)] ring-1 ring-black/10"
 style={{ background: p.colors[k] }}
 />
 ))}
 </div>
 <div className="mt-3 font-medium">{p.name}</div>
 </button>
 );
 })}
 </div>
 </div>
 <div>
 <h3 className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Type</h3>
 <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
 {FONT_PAIRS.map((f) => {
 const active = f.id === draft.fontsId;
 return (
 <button
 key={f.id}
 onClick={() => setDraft({ ...draft, fontsId: f.id })}
 className={cn(
 'rounded-[var(--radius-md)] border p-5 text-left transition-colors',
 active ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
 )}
 >
 <div style={{ fontFamily: f.heading }} className="text-2xl tracking-[-0.03em]">
 {f.heading}
 </div>
 <div style={{ fontFamily: f.body }} className="mt-1 text-sm text-[var(--color-ink-2)]">
 {f.body}
 </div>
 </button>
 );
 })}
 </div>
 </div>
 </div>
 );
}

function ReviewStep({
 draft,
 palette,
 voice,
 fonts,
}: {
 draft: Draft;
 palette: typeof PALETTE_PRESETS[number];
 voice: typeof VOICE_PRESETS[number];
 fonts: typeof FONT_PAIRS[number];
}) {
 return (
 <dl className="grid max-w-2xl gap-4 sm:grid-cols-2">
 <Row k="Name" v={draft.name || '—'} />
 <Row k="Handle" v={draft.handle || '—'} />
 <Row k="Industry" v={draft.industry || '—'} />
 <Row k="Audience" v={draft.targetAudience || '—'} />
 <Row k="Voice" v={voice.label} />
 <Row k="Palette" v={palette.name} />
 <Row k="Type" v={`${fonts.heading} · ${fonts.body}`} />
 <Row k="About" v={draft.description || '—'} full />
 </dl>
 );
}

function Row({ k, v, full }: { k: string; v: string; full?: boolean }) {
 return (
 <div className={cn('rounded-[var(--radius-sm)] border border-[var(--color-border)] p-4', full && 'sm:col-span-2')}>
 <dt className="font-mono text-[10px] tracking-[0.2em] text-[var(--color-ink-3)]">{k}</dt>
 <dd className="mt-1.5 text-[var(--color-ink)]">{v}</dd>
 </div>
 );
}

function Field({
 label,
 required,
 className,
 children,
}: {
 label: string;
 required?: boolean;
 className?: string;
 children: React.ReactNode;
}) {
 return (
 <label className={cn('block', className)}>
 <span className="text-sm text-[var(--color-ink-2)]">
 {label}
 {required && <span className="ml-0.5 text-[var(--color-signal-bad)]">*</span>}
 </span>
 <span className="mt-1.5 block">{children}</span>
 </label>
 );
}

function FieldStyle() {
 return (
 <style jsx global>{`
 .oi {
 width: 100%;
 border-radius: var(--radius-sm);
 border: 1px solid var(--color-border);
 background: var(--color-surface);
 padding: 0.65rem 0.85rem;
 font-size: 0.95rem;
 color: var(--color-ink);
 transition: border-color 120ms;
 }
 .oi:focus {
 outline: none;
 border-color: var(--color-ink);
 }
 `}</style>
 );
}

function PreviewCard({
 draft,
 palette,
 voice,
 fonts,
}: {
 draft: Draft;
 palette: typeof PALETTE_PRESETS[number];
 voice: typeof VOICE_PRESETS[number];
 fonts: typeof FONT_PAIRS[number];
}) {
 return (
 <div className="absolute inset-0 flex flex-col p-10">
 <div className="font-mono text-[10px] tracking-[0.2em] opacity-60">
 Preview · {palette.name}
 </div>
 <div className="flex flex-1 flex-col justify-center">
 <div
 style={{ fontFamily: fonts.heading, lineHeight: 0.92, letterSpacing: '-0.05em' }}
 className="text-5xl xl:text-7xl"
 >
 {draft.name || 'Your Brand'}
 </div>
 <div
 style={{ fontFamily: fonts.body, color: palette.colors.secondary }}
 className="mt-4 text-base"
 >
 &ldquo;{voice.sample}&rdquo;
 </div>
 <div className="mt-8 flex flex-wrap gap-2">
 {(['primary', 'secondary', 'accent'] as const).map((k) => (
 <span
 key={k}
 className="rounded-full px-3 py-1 text-xs"
 style={{ background: palette.colors[k], color: palette.colors.bg }}
 >
 {k}
 </span>
 ))}
 </div>
 </div>
 </div>
 );
}
