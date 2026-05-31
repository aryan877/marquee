import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { EditorialTemplate } from './templates/editorial';
import { StatTemplate } from './templates/stat';
import { ListicleTemplate } from './templates/listicle';
import { QuoteTemplate } from './templates/quote';
import type { PosterRenderAsset } from './template-shared';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  template?: string;
  layers?: string;
  headline?: string;
  subhead?: string;
  assets?: string;
}

export default async function PosterRender({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
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

  const visible = new Set((sp.layers ?? 'background,wordmark,headline,accent,final').split(','));
  const template = sp.template ?? 'editorial';
  const headline = sp.headline ?? job.topic ?? brand.name;
  const subhead  = sp.subhead;
  const assets = parsePosterAssets(sp.assets);

  const props = { brand, job, headline, subhead, visible, assets };
  return (
    <main className="poster-stage">
      {template === 'stat'     ? <StatTemplate {...props} /> :
       template === 'listicle' ? <ListicleTemplate {...props} /> :
       template === 'quote'    ? <QuoteTemplate {...props} /> :
                                 <EditorialTemplate {...props} />}
      <style>{`
        html, body { margin: 0; padding: 0; background: transparent; }
        body { width: 1080px; height: 1350px; overflow: hidden; }
        .poster-stage { width: 1080px; height: 1350px; position: relative; }
      `}</style>
    </main>
  );
}

function parsePosterAssets(value: string | undefined): PosterRenderAsset[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 4).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      if (typeof record.url !== 'string' || !isSafeMediaUrl(record.url)) return [];
      return [{
        url: record.url,
        x: clampNumber(record.x, 0, 92, 50),
        y: clampNumber(record.y, 0, 92, 50),
        width: clampNumber(record.width, 6, 40, 14),
        rotation: clampNumber(record.rotation, -24, 24, 0),
        opacity: clampNumber(record.opacity, 0.25, 1, 0.92),
        blend: record.blend === 'multiply' ? 'multiply' : 'normal',
      }];
    });
  } catch {
    return [];
  }
}

function isSafeMediaUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return value.startsWith('/outputs/');
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
