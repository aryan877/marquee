import { PosterDecorations } from '../poster-decorations';
import { contentLayerStyle, readPalette, readFonts, type TemplateProps } from '../template-shared';

export function QuoteTemplate({ brand, headline, subhead, visible, assets }: TemplateProps) {
  const palette = readPalette(brand);
  const fonts = readFonts(brand);

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: visible.has('background') ? palette.bg : '#fff',
      color: palette.fg,
      fontFamily: 'Instrument Serif, ' + fonts.body,
      padding: 120,
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <PosterDecorations assets={assets} />
      {visible.has('accent') && (
        <span style={{
          ...contentLayerStyle,
          fontFamily: 'Instrument Serif, serif',
          fontSize: 360, lineHeight: 0.6, color: palette.accent,
          alignSelf: 'flex-start', marginBottom: -40,
        }}>
          “
        </span>
      )}
      {visible.has('headline') && (
        <blockquote style={{
          ...contentLayerStyle,
          margin: 0,
          fontFamily: 'Instrument Serif, serif',
          fontSize: 96, lineHeight: 1.06,
          letterSpacing: '-0.02em', color: palette.primary, fontWeight: 400,
        }}>
          {headline}
        </blockquote>
      )}
      {visible.has('wordmark') && (
        <footer style={{
          ...contentLayerStyle,
          marginTop: 64, fontFamily: fonts.body, fontSize: 24, color: palette.secondary,
          display: 'flex', alignItems: 'center', gap: 16,
        }}>
          <span style={{ width: 56, height: 1, background: palette.primary }} />
          <span>{subhead ?? brand.handle ?? brand.name}</span>
        </footer>
      )}
    </div>
  );
}
