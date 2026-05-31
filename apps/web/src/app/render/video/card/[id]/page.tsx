import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { readPalette, readFonts } from '@/app/render/poster/[id]/template-shared';

export const dynamic = 'force-dynamic';

export default async function VideoCardRender({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ line?: string; color?: string; index?: string; total?: string; image?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const sb = getSupabaseAdmin();
  const { data: jobs } = await sb.rpc('get_content_job_full', { p_job_id: id });
  const job = jobs?.[0];
  if (!job) return notFound();
  const { data: brands } = await sb.rpc('get_brand_for_job', { p_brand_id: job.brand_id });
  const brand = brands?.[0];
  if (!brand) return notFound();

  const palette = readPalette(brand);
  const fonts = readFonts(brand);

  const line  = sp.line ?? 'When the wifi goes out at the worst possible moment.';
  const color = sp.color ?? palette.accent;
  const image = sp.image?.startsWith('http') ? sp.image : null;
  if (!image) throw new Error('image query param required');

  return (
    <main className="stage">
      <div
        className="bg"
        style={{
          background: `linear-gradient(160deg, ${color} 0%, ${palette.primary} 120%)`,
        }}
      />
      <section className="cat-wrap">
        <div className="cat-card" style={{ background: palette.bg, color: palette.fg }}>
          <img className="cat-image" src={image} alt="" />
        </div>
      </section>

      <footer className="caption-wrap">
        <div className="caption" style={{
          fontFamily: fonts.heading,
          color: palette.bg,
          textShadow: '0 4px 12px rgba(0,0,0,0.35)',
        }}>
          {line}
        </div>
      </footer>

      <style>{`
        html, body { margin: 0; padding: 0; }
        body { width: 1080px; height: 1920px; overflow: hidden; }
        .stage {
          position: relative; width: 1080px; height: 1920px;
          font-family: ${fonts.body}, system-ui, sans-serif;
        }
        .bg { position: absolute; inset: 0; }
        .cat-wrap {
          position: absolute; top: 150px; left: 0; right: 0;
          display: flex; justify-content: center;
        }
        .cat-card {
          width: 760px; height: 760px;
          border-radius: 48px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 32px 80px -16px rgba(0,0,0,0.45);
        }
        .cat-image {
          width: 100%; height: 100%;
          object-fit: cover;
          border-radius: 48px;
          filter: saturate(1.05) contrast(1.04);
        }
        .caption-wrap {
          position: absolute; bottom: 200px; left: 64px; right: 64px;
        }
        .caption {
          font-size: 92px; line-height: 1.02;
          letter-spacing: -0.04em; font-weight: 800;
          text-wrap: balance;
        }
      `}</style>
    </main>
  );
}
