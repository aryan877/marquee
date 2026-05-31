import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin, getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { mintWorkerActionToken, workerHttpUrl } from '@/lib/ws-token';

const BodySchema = z.object({
  job_id: z.string().uuid(),
  media_url: z.string().url().optional(),
  caption: z.string().max(900).optional(),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: jobRows, error: jobErr } = await admin.rpc('get_content_job_for_approval', {
    p_job_id: parsed.data.job_id,
  });
  const job = jobRows?.[0];
  if (jobErr || !job || job.user_id !== user.id) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const mediaUrl = parsed.data.media_url ?? job.output_url;
  if (!mediaUrl) return NextResponse.json({ error: 'no media to send' }, { status: 400 });

  const allowed = new Set<string>();
  if (job.output_url) allowed.add(job.output_url);

  const sb = await getSupabaseServer();
  const { data: events } = await sb.rpc('get_job_events', { p_job_id: parsed.data.job_id });
  for (const event of events ?? []) collectMediaUrls(event.payload, allowed);

  if (!allowed.has(mediaUrl)) {
    return NextResponse.json({ error: 'media does not belong to this job' }, { status: 400 });
  }

  const token = mintWorkerActionToken({ userId: user.id, scope: 'whatsapp' });
  const res = await fetch(workerHttpUrl('/whatsapp/send'), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      media_url: mediaUrl,
      kind: inferKind(mediaUrl),
      caption: parsed.data.caption ?? job.caption ?? '',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { error: typeof body.error === 'string' ? body.error : 'WhatsApp send failed' },
      { status: res.status },
    );
  }

  return NextResponse.json({ ok: true });
}

function collectMediaUrls(payload: unknown, out: Set<string>) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  const record = payload as Record<string, unknown>;
  for (const key of ['url', 'thumbnail_url', 'preview_url', 'clip_url']) {
    const value = record[key];
    if (typeof value === 'string' && /^https?:\/\//.test(value)) out.add(value);
  }
}

function inferKind(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url) ? 'video' : 'image';
}
