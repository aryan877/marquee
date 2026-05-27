export default function RenderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700;800&family=Instrument+Serif&family=Space+Grotesk:wght@500;700&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
