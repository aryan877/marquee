import { NextResponse, type NextRequest } from 'next/server';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';
import { mintJobToken, workerWsUrl } from '@/lib/ws-token';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const sb = await getSupabaseServer();
  const { data, error } = await sb.rpc('get_content_job', { p_job_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const token = mintJobToken({ userId: user.id, jobId: id, ttlSeconds: 60 * 60 });
  return NextResponse.json({ token, ws_url: workerWsUrl(id, token) });
}
