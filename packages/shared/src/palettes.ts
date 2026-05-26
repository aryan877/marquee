interface BrandPalette {
  primary: string;
  secondary: string;
  accent: string;
  bg: string;
  fg: string;
}

interface PaletteOption {
  id: string;
  name: string;
  colors: BrandPalette;
}

export const PALETTE_PRESETS: readonly PaletteOption[] = [
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
] as const;

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
