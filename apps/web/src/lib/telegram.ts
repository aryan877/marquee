import 'server-only';
import { decrypt } from './crypto';
import { getSupabaseAdmin } from './supabase/server';

interface StoredCreds { bot_token: string; chat_id: string }

export interface TelegramPostResult { message_id: number; chat_id: number | string }

export async function verifyTelegramBot(args: {
  bot_token: string;
  chat_id: string;
}): Promise<{ bot_username: string; chat_title: string }> {
  const token = args.bot_token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) throw new Error('Invalid Telegram bot token format');
  const chat = args.chat_id.trim();
  if (!chat) throw new Error('Telegram chat_id required');

  const me = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const meBody = (await me.json()) as { ok: boolean; result?: { username: string }; description?: string };
  if (!meBody.ok || !meBody.result) throw new Error(`Telegram getMe failed: ${meBody.description ?? me.status}`);

  const getChat = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${encodeURIComponent(chat)}`);
  const chatBody = (await getChat.json()) as { ok: boolean; result?: { title?: string; username?: string }; description?: string };
  if (!chatBody.ok || !chatBody.result) throw new Error(`Telegram getChat failed: ${chatBody.description ?? getChat.status}`);

  return {
    bot_username: meBody.result.username,
    chat_title:   chatBody.result.title ?? chatBody.result.username ?? chat,
  };
}

export async function postPosterToTelegram(args: {
  brandId: string;
  imageUrl: string;
  caption: string;
}): Promise<TelegramPostResult> {
  const creds = await loadCreds(args.brandId);

  const imgRes = await fetch(args.imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? 'image/png';
  const isVideo = contentType.startsWith('video/');
  const method = isVideo ? 'sendVideo' : 'sendPhoto';
  const fileField = isVideo ? 'video' : 'photo';

  const form = new FormData();
  form.append('chat_id', creds.chat_id);
  form.append('caption', args.caption.slice(0, 1024));
  form.append(fileField, new Blob([imgBytes as BlobPart], { type: contentType }), filenameFor(contentType));

  const res = await fetch(`https://api.telegram.org/bot${creds.bot_token}/${method}`, {
    method: 'POST',
    body: form,
  });
  const body = (await res.json()) as {
    ok: boolean;
    result?: { message_id: number; chat: { id: number | string } };
    description?: string;
  };
  if (!body.ok || !body.result) throw new Error(`Telegram ${method} failed: ${body.description ?? res.status}`);
  return { message_id: body.result.message_id, chat_id: body.result.chat.id };
}

async function loadCreds(brandId: string): Promise<StoredCreds> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_social_session', {
    p_brand_id: brandId,
    p_platform: 'TELEGRAM',
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.session) throw new Error('Telegram bot not connected for this brand');
  return JSON.parse(decrypt(bufferFrom(row.session))) as StoredCreds;
}

function filenameFor(mime: string): string {
  if (mime.includes('jpeg')) return 'poster.jpg';
  if (mime.includes('png'))  return 'poster.png';
  if (mime.includes('mp4'))  return 'video.mp4';
  return 'media.bin';
}

function bufferFrom(v: unknown): Buffer {
  if (v instanceof Uint8Array) return Buffer.from(v);
  if (typeof v === 'string') {
    const hex = v.startsWith('\\x') ? v.slice(2) : v;
    return Buffer.from(hex, 'hex');
  }
  const o = v as { type?: string; data?: number[] };
  if (o?.type === 'Buffer' && Array.isArray(o.data)) return Buffer.from(o.data);
  throw new Error('cannot coerce to Buffer');
}
