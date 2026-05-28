import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUser, getSupabaseAdmin } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';
import { verifyTelegramBot } from '@/lib/telegram';

const Body = z.object({
  brand_id:  z.string().uuid(),
  bot_token: z.string().min(30).max(128),
  chat_id:   z.string().min(1).max(64),
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

  let verified: { bot_username: string; chat_title: string };
  try {
    verified = await verifyTelegramBot(parsed.data);
  } catch (err) {
    return NextResponse.json({ error: `Telegram check failed: ${String(err)}` }, { status: 400 });
  }

  const blob = encrypt(JSON.stringify({
    bot_token: parsed.data.bot_token.trim(),
    chat_id:   parsed.data.chat_id.trim(),
  }));

  const handle = `@${verified.bot_username} → ${verified.chat_title}`;
  const { error } = await admin.rpc('upsert_social_account', {
    p_brand_id:    parsed.data.brand_id,
    p_platform:    'TELEGRAM',
    p_handle:      handle,
    p_session_enc: blob as never,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, handle });
}
