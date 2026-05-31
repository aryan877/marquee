import { PosterDecorations } from '../poster-decorations';
import { contentLayerStyle, readPalette, readFonts, type TemplateProps } from '../template-shared';

export function StatTemplate({ brand, headline, subhead, visible, assets }: TemplateProps) {
  const palette = readPalette(brand);
  const fonts = readFonts(brand);
  const big = pickStat(headline);
  const tail = headline.replace(big, '').trim();

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: visible.has('background') ? palette.primary : '#fff',
      color: palette.bg,
      fontFamily: fonts.body,
      padding: 96,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      <PosterDecorations assets={assets} />
      {visible.has('wordmark') && (
        <span style={{ ...contentLayerStyle, fontFamily: fonts.heading, fontSize: 28, letterSpacing: 0 }}>
          {brand.name.toLowerCase()}.
        </span>
      )}
      {visible.has('headline') && (
        <div style={contentLayerStyle}>
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 360,
            lineHeight: 0.85,
            letterSpacing: '-0.07em',
            color: palette.accent,
            fontWeight: 800,
          }}>
            {big}
          </div>
          <div style={{
            marginTop: 24,
            fontFamily: fonts.heading,
            fontSize: 56,
            lineHeight: 1.05,
            color: palette.bg,
            letterSpacing: '-0.03em',
          }}>
            {tail || (subhead ?? '')}
          </div>
        </div>
      )}
      {visible.has('accent') && (
        <span style={{ ...contentLayerStyle, color: palette.bg, opacity: 0.6, fontSize: 22 }}>
          source: {brand.handle ?? brand.name}
        </span>
      )}
    </div>
  );
}

function pickStat(text: string): string {
  const m = text.match(/(\d+(?:\.\d+)?%?|\$?\d+(?:,\d{3})*(?:\.\d+)?[kKmMbB]?)/);
  return m?.[0] ?? text.split(/\s+/)[0] ?? text;
}
