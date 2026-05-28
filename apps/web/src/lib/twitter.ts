import 'server-only';
import { TwitterApi, type EUploadMimeType } from 'twitter-api-v2';
import { decrypt } from './crypto';
import { getSupabaseAdmin } from './supabase/server';

interface StoredCreds {
  app_key:       string;
  app_secret:    string;
  access_token:  string;
  access_secret: string;
}

export interface TwitterPostResult { id: string; url: string }

export async function verifyTwitterCreds(creds: StoredCreds): Promise<{ handle: string; user_id: string }> {
  const client = newClient(creds);
  const me = await client.v2.me({ 'user.fields': ['username'] });
  if (!me.data?.username) throw new Error('Twitter verify_credentials returned no username');
  return { handle: `@${me.data.username}`, user_id: me.data.id };
}

export async function postPosterToTwitter(args: {
  brandId: string;
  imageUrl: string;
  caption: string;
}): Promise<TwitterPostResult> {
  const creds = await loadCreds(args.brandId);
  const client = newClient(creds);

  const imgRes = await fetch(args.imageUrl);
  if (!imgRes.ok) throw new Error(`fetch image failed: ${imgRes.status}`);
  const imgBytes = Buffer.from(await imgRes.arrayBuffer());
  const mime = (imgRes.headers.get('content-type') ?? 'image/png') as EUploadMimeType;

  const mediaId = await client.v1.uploadMedia(imgBytes, { mimeType: mime });

  const text = args.caption.slice(0, 280);
  const tweet = await client.v2.tweet({
    text,
    media: { media_ids: [mediaId] },
  });
  if (!tweet.data?.id) throw new Error('Twitter post returned no tweet id');

  const url = `https://x.com/i/web/status/${tweet.data.id}`;
  return { id: tweet.data.id, url };
}

function newClient(c: StoredCreds): TwitterApi {
  return new TwitterApi({
    appKey:       c.app_key,
    appSecret:    c.app_secret,
    accessToken:  c.access_token,
    accessSecret: c.access_secret,
  });
}

async function loadCreds(brandId: string): Promise<StoredCreds> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('get_social_session', {
    p_brand_id: brandId,
    p_platform: 'TWITTER',
  });
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row?.session) throw new Error('Twitter account not connected for this brand');
  return JSON.parse(decrypt(bufferFrom(row.session))) as StoredCreds;
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
