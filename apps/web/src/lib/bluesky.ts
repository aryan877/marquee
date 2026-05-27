import 'server-only';
import { BskyAgent, RichText } from '@atproto/api';
import { decrypt } from './crypto';
import { getSupabaseAdmin } from './supabase/server';

interface StoredCreds { handle: string; app_password: string }

export interface BlueskyPostResult { uri: string; cid: string }

export async function postPosterToBluesky(args: {
  brandId: string;
  imageUrl: string;
  caption: string;
}): Promise<BlueskyPostResult> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_social_session', {
    p_brand_id: args.brandId,
    p_platform: 'BLUESKY',
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.session) throw new Error('Bluesky account not connected for this brand');

  const buf = row.session as unknown as { type: 'Buffer'; data: number[] } | Uint8Array | string;
  const blob = bufferFrom(buf);
  const creds = JSON.parse(decrypt(blob)) as StoredCreds;

  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: creds.handle, password: creds.app_password });

  const imgRes = await fetch(args.imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const imgBytes = new Uint8Array(await imgRes.arrayBuffer());
  const contentType = imgRes.headers.get('content-type') ?? 'image/png';
  const uploaded = await agent.uploadBlob(imgBytes, { encoding: contentType });

  const rt = new RichText({ text: args.caption });
  await rt.detectFacets(agent);

  const res = await agent.post({
    text: rt.text,
    facets: rt.facets,
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{ image: uploaded.data.blob, alt: args.caption.slice(0, 200) }],
    },
  });
  return { uri: res.uri, cid: res.cid };
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
