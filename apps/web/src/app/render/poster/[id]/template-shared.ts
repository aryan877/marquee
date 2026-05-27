import type { Database } from '@marquee/db';

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

const DEFAULT_PALETTE: Palette = {
  primary: '#1A1A1F',
  secondary: '#4D4D51',
  accent: '#C9C2E5',
  bg: '#E8E6F0',
  fg: '#0A0A0F',
};

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
    heading: f.heading ?? 'Geist',
    body:    f.body    ?? 'Inter',
  };
}
