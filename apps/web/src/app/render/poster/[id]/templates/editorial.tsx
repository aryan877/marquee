import { readPalette, readFonts, type TemplateProps } from '../template-shared';

export function EditorialTemplate({ brand, headline, subhead, visible }: TemplateProps) {
  const palette = readPalette(brand);
  const fonts = readFonts(brand);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: visible.has('background')
          ? `linear-gradient(135deg, ${palette.bg} 0%, ${palette.accent} 100%)`
          : '#ffffff',
        color: palette.fg,
        fontFamily: fonts.body,
        padding: '96px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      {visible.has('background') && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: -180,
            right: -180,
            width: 720,
            height: 720,
            borderRadius: '999px',
            background: `radial-gradient(circle, ${palette.primary}22 0%, transparent 70%)`,
            filter: 'blur(20px)',
          }}
        />
      )}

      {visible.has('wordmark') && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 12, height: 12, borderRadius: '999px',
              background: palette.primary,
            }}
          />
          <span style={{
            fontFamily: fonts.heading,
            fontSize: 28,
            letterSpacing: '-0.04em',
            color: palette.primary,
            fontWeight: 700,
          }}>
            {brand.name.toLowerCase()}.
          </span>
        </header>
      )}

      {visible.has('headline') && (
        <div style={{ marginTop: 'auto' }}>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: 168,
              lineHeight: 0.88,
              letterSpacing: '-0.06em',
              color: palette.primary,
              margin: 0,
              fontWeight: 800,
              textWrap: 'balance',
            }}
          >
            {headline}
          </h1>
          {subhead && (
            <p
              style={{
                marginTop: 32,
                fontSize: 36,
                lineHeight: 1.2,
                color: palette.secondary,
                maxWidth: 720,
              }}
            >
              {subhead}
            </p>
          )}
        </div>
      )}

      {visible.has('accent') && (
        <footer style={{
          marginTop: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontFamily: fonts.body,
          fontSize: 20,
          color: palette.secondary,
        }}>
          <span>{brand.handle ?? brand.industry ?? ''}</span>
          <span
            style={{
              padding: '12px 24px',
              background: palette.primary,
              color: palette.bg,
              borderRadius: '999px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            read more →
          </span>
        </footer>
      )}
    </div>
  );
}
