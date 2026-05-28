import 'server-only';
import { decrypt } from './crypto';
import { getSupabaseAdmin } from './supabase/server';

interface StoredCreds { webhook_url: string }

export interface DiscordPostResult { id: string; channel_id: string }

const DISCORD_HOSTS = new Set(['discord.com', 'discordapp.com', 'canary.discord.com', 'ptb.discord.com']);

export function parseDiscordWebhook(raw: string): URL {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new Error('Invalid Discord webhook URL'); }
  if (!DISCORD_HOSTS.has(url.host)) throw new Error('Not a Discord webhook host');
  if (!/^\/api(\/v\d+)?\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    throw new Error('URL is not a Discord webhook path');
  }
  return url;
}

export async function verifyDiscordWebhook(rawUrl: string): Promise<{ id: string; name: string; channel_id: string }> {
  const url = parseDiscordWebhook(rawUrl);
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) throw new Error(`Discord webhook check failed: ${res.status}`);
  const body = (await res.json()) as { id: string; name: string; channel_id: string };
  return body;
}

export async function postPosterToDiscord(args: {
  brandId: string;
  imageUrl: string;
  caption: string;
}): Promise<DiscordPostResult> {
  const creds = await loadCreds(args.brandId);
  const url = parseDiscordWebhook(creds.webhook_url);
  const sep = url.search ? '&' : '?';
  const withWait = `${url.toString()}${sep}wait=true`;

  const imgRes = await fetch(args.imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? 'image/png';
  const filename = filenameFor(contentType);

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: args.caption.slice(0, 1900) }));
  form.append('files[0]', new Blob([imgBytes as BlobPart], { type: contentType }), filename);

  const res = await fetch(withWait, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Discord post failed: ${res.status} ${await res.text().catch(() => '')}`);
  const body = (await res.json()) as { id: string; channel_id: string };
  return { id: body.id, channel_id: body.channel_id };
}

async function loadCreds(brandId: string): Promise<StoredCreds> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_social_session', {
    p_brand_id: brandId,
    p_platform: 'DISCORD',
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.session) throw new Error('Discord webhook not connected for this brand');
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
