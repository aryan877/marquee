import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { BskyAgent } from '@atproto/api';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

const Body = z.object({
  brand_id:      z.string().uuid(),
  handle:        z.string().min(3).max(64),
  app_password:  z.string().min(8).max(64),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: brand } = await admin
    .from('brands')
    .select('id, user_id')
    .eq('id', parsed.data.brand_id)
    .single();
  if (!brand || brand.user_id !== user.id) {
    return NextResponse.json({ error: 'brand not found' }, { status: 404 });
  }

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  try {
    await agent.login({ identifier: parsed.data.handle, password: parsed.data.app_password });
  } catch {
    return NextResponse.json({ error: 'Bluesky login failed' }, { status: 400 });
  }

  const blob = encrypt(JSON.stringify({
    handle:       parsed.data.handle,
    app_password: parsed.data.app_password,
  }));

  const { error } = await admin.rpc('upsert_social_account', {
    p_brand_id:    parsed.data.brand_id,
    p_platform:    'BLUESKY',
    p_handle:      parsed.data.handle,
    p_session_enc: blob as never,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handle: parsed.data.handle });
}
