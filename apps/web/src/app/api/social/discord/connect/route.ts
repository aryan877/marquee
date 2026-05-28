import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { verifyDiscordWebhook } from '@/lib/discord';

const Body = z.object({
  brand_id:    z.string().uuid(),
  webhook_url: z.string().min(40).max(512),
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

  let verified: { id: string; name: string; channel_id: string };
  try {
    verified = await verifyDiscordWebhook(parsed.data.webhook_url);
  } catch (err) {
    return NextResponse.json({ error: `Discord webhook check failed: ${String(err)}` }, { status: 400 });
  }

  const blob = encrypt(JSON.stringify({ webhook_url: parsed.data.webhook_url.trim() }));

  const handle = `#${verified.name || verified.channel_id}`;
  const { error } = await admin.rpc('upsert_social_account', {
    p_brand_id:    parsed.data.brand_id,
    p_platform:    'DISCORD',
    p_handle:      handle,
    p_session_enc: blob as never,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handle });
}
