import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getSupabaseServer, requireUser } from '@/lib/supabase/server';
import { mintWorkerActionToken, workerHttpUrl } from '@/lib/ws-token';

const ActionSchema = z.object({
  action: z.enum(['connect', 'disconnect']),
});

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const token = mintWorkerActionToken({ userId: user.id, scope: 'whatsapp' });
  const worker = await callWorker('/whatsapp/status', token).catch(() => null);
  if (worker) return NextResponse.json(worker);

  const sb = await getSupabaseServer();
  const { data } = await sb.rpc('get_whatsapp_account');
  return NextResponse.json(data?.[0] ?? { status: 'DISCONNECTED', connected: false });
}

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const token = mintWorkerActionToken({ userId: user.id, scope: 'whatsapp' });
  const path = parsed.data.action === 'connect' ? '/whatsapp/connect' : '/whatsapp/disconnect';
  const body = await callWorker(path, token, { method: 'POST' }).catch((err) => ({
    error: err instanceof Error ? err.message : 'worker unavailable',
  }));

  if ('error' in body) return NextResponse.json(body, { status: 503 });
  return NextResponse.json(body);
}

async function callWorker(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(workerHttpUrl(path), {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body.error === 'string' ? body.error : 'worker request failed');
  return body as Record<string, unknown>;
}
