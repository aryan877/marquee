import { z } from 'zod';

export interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  fg: string;
}

export interface PaletteOption {
  id: string;
  name: string;
  colors: BrandPalette;
}

export const BRAND_PALETTE_KEYS = ['bg', 'fg', 'primary', 'secondary', 'accent'] as const satisfies readonly (keyof BrandPalette)[];

type IdTuple<T extends readonly { readonly id: string }[]> = {
  readonly [K in keyof T]: T[K] extends { readonly id: infer Id extends string } ? Id : never;
};

function presetIds<const T extends readonly { readonly id: string }[]>(items: T) {
  return items.map((item) => item.id) as IdTuple<T>;
}

export const PALETTE_PRESETS = [
  { id: 'lavender', name: 'Lavender Type',
    colors: { primary: '#1A1A1F', secondary: '#4D4D51', accent: '#C9C2E5', bg: '#E8E6F0', fg: '#0A0A0F' } },
  { id: 'sunset',   name: 'Sunset Strip',
    colors: { primary: '#FF5722', secondary: '#FFC107', accent: '#FF9800', bg: '#1A0F0A', fg: '#FFE0B2' } },
  { id: 'mint',     name: 'Mint Lab',
    colors: { primary: '#00BFA5', secondary: '#1DE9B6', accent: '#69F0AE', bg: '#F0FFF7', fg: '#0A1F18' } },
  { id: 'cobalt',   name: 'Cobalt Sharp',
    colors: { primary: '#3D5AFE', secondary: '#536DFE', accent: '#FFEB3B', bg: '#0A0A1A', fg: '#E8EAFF' } },
  { id: 'coral',    name: 'Coral Pop',
    colors: { primary: '#FF6B6B', secondary: '#F8B195', accent: '#355C7D', bg: '#FFF8F5', fg: '#2B2024' } },
  { id: 'mono',     name: 'Mono Press',
    colors: { primary: '#0A0A0A', secondary: '#404040', accent: '#FFD400', bg: '#F5F5F5', fg: '#0A0A0A' } },
] as const satisfies readonly PaletteOption[];

export const VOICE_PRESETS = [
  { id: 'witty',  label: 'Witty + sharp',     sample: "Numbers don't lie. Bad design does." },
  { id: 'warm',   label: 'Warm + human',      sample: 'We made this for the people who get it.' },
  { id: 'bold',   label: 'Bold + loud',       sample: 'STOP SCROLLING. THIS CHANGES EVERYTHING.' },
  { id: 'expert', label: 'Calm expert',       sample: "Three patterns separate brands that win from those that don't." },
  { id: 'cheeky', label: 'Cheeky meme-lord',  sample: "me: i'll start at 9am · 11:47am: starting now actually" },
] as const;

export const FONT_PAIRS = [
  { id: 'helvetica-now',    heading: 'Helvetica Now Display', body: 'Inter' },
  { id: 'editorial-new',    heading: 'Editorial New',         body: 'Inter' },
  { id: 'space-grotesk',    heading: 'Space Grotesk',         body: 'Space Grotesk' },
  { id: 'instrument-serif', heading: 'Instrument Serif',      body: 'Inter' },
  { id: 'geist',            heading: 'Geist',                 body: 'Geist Mono' },
] as const;

export const PALETTE_IDS = presetIds(PALETTE_PRESETS);
export const VOICE_IDS = presetIds(VOICE_PRESETS);
export const FONT_IDS = presetIds(FONT_PAIRS);

export const PaletteIdSchema = z.enum(PALETTE_IDS);
export const VoiceIdSchema = z.enum(VOICE_IDS);
export const FontIdSchema = z.enum(FONT_IDS);

export type PaletteId = z.infer<typeof PaletteIdSchema>;
export type VoiceId = z.infer<typeof VoiceIdSchema>;
export type FontId = z.infer<typeof FontIdSchema>;

export const DEFAULT_BRAND_STYLE = {
  voiceId:   'witty',
  paletteId: 'lavender',
  fontsId:   'helvetica-now',
} as const satisfies {
  voiceId: VoiceId;
  paletteId: PaletteId;
  fontsId: FontId;
};

export function paletteById(id: PaletteId) {
  return PALETTE_PRESETS.find((p) => p.id === id) ?? PALETTE_PRESETS[0];
}

export function isBrandHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value);
}

export function coerceBrandPalette(value: unknown, fallback: BrandPalette = paletteById(DEFAULT_BRAND_STYLE.paletteId).colors): BrandPalette {
  const candidate = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<Record<keyof BrandPalette, unknown>>
    : {};

  return {
    bg:        isBrandHexColor(candidate.bg)        ? candidate.bg        : fallback.bg,
    fg:        isBrandHexColor(candidate.fg)        ? candidate.fg        : fallback.fg,
    primary:   isBrandHexColor(candidate.primary)   ? candidate.primary   : fallback.primary,
    secondary: isBrandHexColor(candidate.secondary) ? candidate.secondary : fallback.secondary,
    accent:    isBrandHexColor(candidate.accent)    ? candidate.accent    : fallback.accent,
  };
}

export function voiceById(id: VoiceId) {
  return VOICE_PRESETS.find((v) => v.id === id) ?? VOICE_PRESETS[0];
}

export function fontsById(id: FontId) {
  return FONT_PAIRS.find((f) => f.id === id) ?? FONT_PAIRS[0];
}
