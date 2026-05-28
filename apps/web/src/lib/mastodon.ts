import 'server-only';
import { decrypt } from './crypto';
import { getSupabaseAdmin } from './supabase/server';

interface StoredCreds { instance: string; access_token: string }

export interface MastodonPostResult { id: string; url: string }

export async function verifyMastodonCreds(args: {
  instance: string;
  access_token: string;
}): Promise<{ handle: string }> {
  const base = normalizeInstance(args.instance);
  const res = await fetch(`${base}/api/v1/accounts/verify_credentials`, {
    headers: { Authorization: `Bearer ${args.access_token}` },
  });
  if (!res.ok) throw new Error(`Mastodon verify failed: ${res.status}`);
  const body = (await res.json()) as { acct: string; username: string };
  const host = new URL(base).host;
  const handle = body.acct.includes('@') ? `@${body.acct}` : `@${body.username}@${host}`;
  return { handle };
}

export async function postPosterToMastodon(args: {
  brandId: string;
  imageUrl: string;
  caption: string;
}): Promise<MastodonPostResult> {
  const creds = await loadCreds(args.brandId);
  const base = normalizeInstance(creds.instance);

  const imgRes = await fetch(args.imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? 'image/png';

  const form = new FormData();
  form.append('file', new Blob([imgBytes as BlobPart], { type: contentType }), filenameFor(contentType));
  form.append('description', args.caption.slice(0, 1500));

  const upload = await fetch(`${base}/api/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${creds.access_token}` },
    body: form,
  });
  if (upload.status !== 200 && upload.status !== 202) {
    throw new Error(`Mastodon media upload failed: ${upload.status} ${await upload.text().catch(() => '')}`);
  }
  const media = (await upload.json()) as { id: string };

  const status = await fetch(`${base}/api/v1/statuses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${creds.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      status:    args.caption.slice(0, 500),
      media_ids: [media.id],
      visibility: 'public',
    }),
  });
  if (!status.ok) throw new Error(`Mastodon post failed: ${status.status} ${await status.text().catch(() => '')}`);
  const body = (await status.json()) as { id: string; url: string };
  return { id: body.id, url: body.url };
}

async function loadCreds(brandId: string): Promise<StoredCreds> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_social_session', {
    p_brand_id: brandId,
    p_platform: 'MASTODON',
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.session) throw new Error('Mastodon account not connected for this brand');
  return JSON.parse(decrypt(bufferFrom(row.session))) as StoredCreds;
}

export function normalizeInstance(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('Mastodon instance required');
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
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
