import { PosterDecorations } from '../poster-decorations';
import { contentLayerStyle, readPalette, readFonts, type TemplateProps } from '../template-shared';

export function ListicleTemplate({ brand, headline, subhead, visible, assets }: TemplateProps) {
  const palette = readPalette(brand);
  const fonts = readFonts(brand);
  const items = (subhead ?? '').split(/\s*\|\s*|\s*;\s*|\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 5);
  const list = items.length > 0
    ? items
    : ['Show up daily', 'Stay weird on purpose', 'Repeat your one idea', 'Ship before perfect', 'Reply in DMs'];

  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: visible.has('background') ? palette.bg : '#fff',
      color: palette.fg,
      fontFamily: fonts.body,
      padding: 96,
      display: 'flex', flexDirection: 'column', gap: 56,
    }}>
      <PosterDecorations assets={assets} />
      {visible.has('wordmark') && (
        <header style={{ ...contentLayerStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: fonts.heading, fontSize: 28, letterSpacing: 0, color: palette.primary }}>
            {brand.name.toLowerCase()}.
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: 18, opacity: 0.6 }}>
            #{list.length}
          </span>
        </header>
      )}
      {visible.has('headline') && (
        <h1 style={{
          ...contentLayerStyle,
          fontFamily: fonts.heading,
          fontSize: 96,
          lineHeight: 0.95,
          letterSpacing: '-0.05em',
          color: palette.primary,
          margin: 0,
          fontWeight: 800,
          textWrap: 'balance',
        }}>
          {headline}
        </h1>
      )}
      {visible.has('accent') && (
        <ol style={{ ...contentLayerStyle, listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {list.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: 32, alignItems: 'baseline' }}>
              <span style={{
                fontFamily: fonts.heading,
                fontSize: 64,
                lineHeight: 1,
                color: palette.accent,
                fontWeight: 800,
                minWidth: 96,
              }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{
                fontSize: 38, lineHeight: 1.2, color: palette.fg, flex: 1,
              }}>
                {item}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
