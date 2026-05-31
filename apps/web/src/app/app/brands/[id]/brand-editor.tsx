'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FONT_PAIRS,
  PALETTE_PRESETS,
  DEFAULT_BRAND_STYLE,
  BRAND_PALETTE_KEYS,
  coerceBrandPalette,
  fontsById,
  isBrandHexColor,
  voiceById,
  type BrandPalette,
} from '@marquee/shared/palettes';
import type { Database } from '@marquee/db';
import { cn } from '@/lib/cn';

type Brand = Database['public']['Functions']['get_brand']['Returns'][number];
type PaletteKey = keyof BrandPalette;

const PALETTE_KEYS = BRAND_PALETTE_KEYS;
const PALETTE_LABELS: Record<PaletteKey, string> = {
  bg: 'Background',
  fg: 'Text',
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
};

type Draft = {
  name: string;
  handle: string;
  description: string;
  industry: string;
  targetAudience: string;
  voiceTone: string;
  palette: BrandPalette;
  fonts: {
    heading: string;
    body: string;
  };
  isActive: boolean;
};

export function BrandEditor({ brand }: { brand: Brand }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(() => brandToDraft(brand));

  const paletteValid = PALETTE_KEYS.every((key) => isBrandHexColor(draft.palette[key]));
  const canSave = draft.name.trim().length > 0 && paletteValid && !pending;

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPaletteColor(key: PaletteKey, value: string) {
    setDraft((current) => ({
      ...current,
      palette: { ...current.palette, [key]: value },
    }));
  }

  async function save() {
    if (!canSave) return;

    setMessage(null);
    start(async () => {
      const res = await fetch(`/api/brands/${brand.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          handle: draft.handle.trim() || undefined,
          description: draft.description.trim() || undefined,
          industry: draft.industry.trim() || undefined,
          target_audience: draft.targetAudience.trim() || undefined,
          voice: { tone: draft.voiceTone.trim() || undefined },
          palette: draft.palette,
          fonts: draft.fonts,
          logo_url: brand.logo_url ?? undefined,
          guidelines: brand.guidelines ?? {},
          is_active: draft.isActive,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: 'err', text: body.error ?? 'Could not save brand' });
        return;
      }

      setMessage({ kind: 'ok', text: 'Brand updated' });
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">Brand</p>
          <input
            value={draft.name}
            onChange={(event) => setField('name', event.target.value)}
            className="mt-2 w-full min-w-0 bg-transparent font-display text-4xl text-[var(--color-ink)] outline-none md:text-6xl"
            aria-label="Brand name"
          />
          <input
            value={draft.handle}
            onChange={(event) => setField('handle', event.target.value)}
            placeholder="@handle"
            className="mt-2 w-full bg-transparent text-[var(--color-ink-3)] outline-none placeholder:text-[var(--color-ink-3)]"
            aria-label="Brand handle"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-ink-2)]">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => setField('isActive', event.target.checked)}
              className="accent-[var(--color-ink)]"
            />
            Active
          </label>
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={cn(
            'mt-4 rounded-[var(--radius-sm)] border px-3 py-2 text-sm',
            message.kind === 'err'
              ? 'border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 text-[var(--color-signal-bad)]'
              : 'border-[var(--color-signal-good)]/30 bg-[var(--color-signal-good)]/10 text-[var(--color-signal-good)]',
          )}
        >
          {message.text}
        </div>
      )}

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <TextAreaField
          label="Description"
          value={draft.description}
          onChange={(value) => setField('description', value)}
          className="md:col-span-1"
        />
        <TextAreaField
          label="Target audience"
          value={draft.targetAudience}
          onChange={(value) => setField('targetAudience', value)}
          className="md:col-span-1"
        />
        <TextField label="Industry" value={draft.industry} onChange={(value) => setField('industry', value)} />
        <TextField label="Voice tone" value={draft.voiceTone} onChange={(value) => setField('voiceTone', value)} />
      </section>

      <section className="mt-10">
        <SectionLabel>Palette</SectionLabel>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PALETTE_PRESETS.map((preset) => {
            const active = paletteEquals(draft.palette, preset.colors);
            return (
              <button
                type="button"
                key={preset.id}
                onClick={() => setField('palette', preset.colors)}
                className={cn(
                  'rounded-[var(--radius-md)] border p-4 text-left transition-colors',
                  active ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
                )}
              >
                <div className="flex items-center gap-2">
                  {PALETTE_KEYS.map((key) => (
                    <span
                      key={key}
                      className="h-7 w-7 rounded-[var(--radius-xs)] ring-1 ring-black/10"
                      style={{ background: preset.colors[key] }}
                    />
                  ))}
                </div>
                <div className="mt-3 font-medium">{preset.name}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {PALETTE_KEYS.map((key) => (
              <label key={key} className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-paper-2)] p-3">
                <span className="font-mono text-[10px] tracking-[0.12em] text-[var(--color-ink-3)]">
                  {PALETTE_LABELS[key]}
                </span>
                <span className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-2">
                  <input
                    type="color"
                    value={isBrandHexColor(draft.palette[key]) ? draft.palette[key] : '#000000'}
                    onChange={(event) => setPaletteColor(key, event.target.value.toUpperCase())}
                    className="h-10 w-10 cursor-pointer rounded-[var(--radius-xs)] border border-[var(--color-border)] bg-transparent p-0.5"
                  />
                  <input
                    value={draft.palette[key]}
                    onChange={(event) => setPaletteColor(key, normalizeHexInput(event.target.value))}
                    className={cn(
                      'min-w-0 rounded-[var(--radius-sm)] border bg-[var(--color-surface)] px-3 py-2 font-mono text-xs text-[var(--color-ink)] outline-none focus:border-[var(--color-ink)]',
                      isBrandHexColor(draft.palette[key]) ? 'border-[var(--color-border)]' : 'border-[var(--color-signal-bad)]',
                    )}
                  />
                </span>
              </label>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <SectionLabel>Typography</SectionLabel>
        <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
          {FONT_PAIRS.map((pair) => {
            const active = draft.fonts.heading === pair.heading && draft.fonts.body === pair.body;
            return (
              <button
                type="button"
                key={pair.id}
                onClick={() => setField('fonts', { heading: pair.heading, body: pair.body })}
                className={cn(
                  'min-w-0 rounded-[var(--radius-md)] border p-5 text-left transition-colors',
                  active ? 'border-[var(--color-ink)] bg-[var(--color-paper-3)]' : 'border-[var(--color-border)] hover:bg-[var(--color-paper-2)]',
                )}
              >
                <div style={{ fontFamily: pair.heading }} className="truncate text-2xl">
                  {pair.heading}
                </div>
                <div style={{ fontFamily: pair.body }} className="mt-1 truncate text-sm text-[var(--color-ink-2)]">
                  {pair.body}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="surface rounded-[var(--radius-md)] border border-[var(--color-border)] p-4">
      <span className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-ink-3)]">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full bg-transparent text-sm text-[var(--color-ink-2)] outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={cn('surface rounded-[var(--radius-md)] border border-[var(--color-border)] p-4', className)}>
      <span className="font-mono text-[10px] tracking-[0.16em] text-[var(--color-ink-3)]">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full resize-y bg-transparent text-sm leading-6 text-[var(--color-ink-2)] outline-none"
      />
    </label>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-xs tracking-[0.04em] text-[var(--color-ink-3)]">{children}</p>;
}

function brandToDraft(brand: Brand): Draft {
  const defaultVoice = voiceById(DEFAULT_BRAND_STYLE.voiceId);
  const defaultFonts = fontsById(DEFAULT_BRAND_STYLE.fontsId);
  const voice = (brand.voice ?? {}) as { tone?: string };
  const fonts = (brand.fonts ?? {}) as { heading?: string; body?: string };

  return {
    name: brand.name,
    handle: brand.handle ?? '',
    description: brand.description ?? '',
    industry: brand.industry ?? '',
    targetAudience: brand.target_audience ?? '',
    voiceTone: voice.tone ?? defaultVoice.label,
    palette: coerceBrandPalette(brand.palette),
    fonts: {
      heading: fonts.heading ?? defaultFonts.heading,
      body: fonts.body ?? defaultFonts.body,
    },
    isActive: brand.is_active,
  };
}

function paletteEquals(left: BrandPalette, right: BrandPalette) {
  return PALETTE_KEYS.every((key) => left[key].toUpperCase() === right[key].toUpperCase());
}

function normalizeHexInput(value: string) {
  const next = value.trim().toUpperCase();
  if (!next) return '#';
  return next.startsWith('#') ? next.slice(0, 7) : `#${next.slice(0, 6)}`;
}
