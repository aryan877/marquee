import { notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase/server';
import { EditorialTemplate } from './templates/editorial';
import { StatTemplate } from './templates/stat';
import { ListicleTemplate } from './templates/listicle';
import { QuoteTemplate } from './templates/quote';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  template?: string;
  layers?: string;
  headline?: string;
  subhead?: string;
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

  const props = { brand, job, headline, subhead, visible };
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
