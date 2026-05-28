import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { verifyTwitterCreds } from '@/lib/twitter';

const Body = z.object({
  brand_id:      z.string().uuid(),
  app_key:       z.string().min(10).max(128),
  app_secret:    z.string().min(20).max(128),
  access_token:  z.string().min(20).max(128),
  access_secret: z.string().min(20).max(128),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid input' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data: brand } = await admin
    .from('brands')
    .select('id, user_id')
    .eq('id', parsed.data.brand_id)
    .single();
  if (!brand || brand.user_id !== user.id) {
    return NextResponse.json({ error: 'brand not found' }, { status: 404 });
  }

  let verified: { handle: string; user_id: string };
  try {
    verified = await verifyTwitterCreds({
      app_key:       parsed.data.app_key.trim(),
      app_secret:    parsed.data.app_secret.trim(),
      access_token:  parsed.data.access_token.trim(),
      access_secret: parsed.data.access_secret.trim(),
    });
  } catch (err) {
    return NextResponse.json({ error: `X verify failed: ${String(err)}` }, { status: 400 });
  }

  const blob = encrypt(JSON.stringify({
    app_key:       parsed.data.app_key.trim(),
    app_secret:    parsed.data.app_secret.trim(),
    access_token:  parsed.data.access_token.trim(),
    access_secret: parsed.data.access_secret.trim(),
  }));

  const { error } = await admin.rpc('upsert_social_account', {
    p_brand_id:    parsed.data.brand_id,
    p_platform:    'TWITTER',
    p_handle:      verified.handle,
    p_session_enc: blob as never,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handle: verified.handle });
}
