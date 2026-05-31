import { readPalette, readFonts, type TemplateProps } from '../template-shared';

export function EditorialTemplate({ brand, headline, subhead, visible }: TemplateProps) {
  const palette = readPalette(brand);
  const fonts = readFonts(brand);
  const headlineSize = headline.length > 34 ? 92 : headline.length > 22 ? 108 : 132;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: visible.has('background') ? palette.bg : '#ffffff',
        color: palette.fg,
        fontFamily: fonts.body,
        padding: '96px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {visible.has('background') && (
        <>
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 224,
              height: '100%',
              background: palette.accent,
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              right: 68,
              bottom: 142,
              width: 170,
              height: 170,
              border: `18px solid ${palette.fg}`,
              opacity: 0.9,
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'absolute',
              left: 96,
              bottom: 304,
              width: 178,
              height: 14,
              background: palette.primary,
            }}
          />
        </>
      )}

      {visible.has('wordmark') && (
        <header style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 12, height: 12, borderRadius: '999px',
              background: palette.primary,
            }}
          />
          <span style={{
            fontFamily: fonts.heading,
            fontSize: 28,
            letterSpacing: 0,
            color: palette.fg,
            fontWeight: 700,
          }}>
            {brand.name.toLowerCase()}.
          </span>
        </header>
      )}

      {visible.has('headline') && (
        <div style={{ position: 'relative', zIndex: 1, marginTop: 'auto', maxWidth: 610 }}>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: headlineSize,
              lineHeight: 0.94,
              letterSpacing: 0,
              color: palette.fg,
              margin: 0,
              fontWeight: 800,
              textWrap: 'balance',
              whiteSpace: 'pre-line',
            }}
          >
            {headline}
          </h1>
          {subhead && (
            <p
              style={{
                marginTop: 36,
                fontSize: 34,
                lineHeight: 1.22,
                color: palette.fg,
                maxWidth: 560,
                paddingLeft: 28,
                borderLeft: `8px solid ${palette.primary}`,
              }}
            >
              {subhead}
            </p>
          )}
        </div>
      )}

      {visible.has('accent') && (
        <footer style={{
          position: 'relative',
          zIndex: 1,
          marginTop: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: fonts.body,
          fontSize: 20,
          color: palette.fg,
        }}>
          <span>{brand.handle ?? brand.industry ?? ''}</span>
          <span
            style={{
              padding: '14px 26px',
              background: palette.fg,
              color: palette.bg,
              borderRadius: 4,
              fontWeight: 600,
              letterSpacing: 0,
            }}
          >
            read more →
          </span>
        </footer>
      )}
    </div>
  );
}
