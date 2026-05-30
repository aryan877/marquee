import type { Database } from '@marquee/db';
import { DEFAULT_BRAND_STYLE, fontsById, paletteById } from '@marquee/shared/palettes';

export type Job = Database['public']['Functions']['get_content_job_full']['Returns'][number];
export type Brand = Database['public']['Functions']['get_brand_for_job']['Returns'][number];

export interface TemplateProps {
  brand: Brand;
  job: Job;
  headline: string;
  subhead?: string;
  visible: Set<string>;
}

export interface Palette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  fg: string;
}

const DEFAULT_PALETTE: Palette = paletteById(DEFAULT_BRAND_STYLE.paletteId).colors;
const DEFAULT_FONTS = fontsById(DEFAULT_BRAND_STYLE.fontsId);

export function readPalette(brand: Brand): Palette {
  const p = (brand.palette ?? {}) as Partial<Palette>;
  return {
    primary:   p.primary   ?? DEFAULT_PALETTE.primary,
    secondary: p.secondary ?? DEFAULT_PALETTE.secondary,
    accent:    p.accent    ?? DEFAULT_PALETTE.accent,
    bg:        p.bg        ?? DEFAULT_PALETTE.bg,
    fg:        p.fg        ?? DEFAULT_PALETTE.fg,
  };
}

export function readFonts(brand: Brand): { heading: string; body: string } {
  const f = (brand.fonts ?? {}) as { heading?: string; body?: string };
  return {
    heading: f.heading ?? DEFAULT_FONTS.heading,
    body:    f.body    ?? DEFAULT_FONTS.body,
  };
}
