import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import type { JobInputAsset } from '@marquee/shared/schemas';
import { isBrandOwner } from '@/lib/brand-owner';
import { getSupabaseAdmin, requireUser } from '@/lib/supabase/server';

const MAX_BYTES = 50 * 1024 * 1024;
export const runtime = 'nodejs';
const ALLOWED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
]);

const UploadSchema = z.object({
  brand_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'invalid form' }, { status: 400 });

  const parsed = UploadSchema.safeParse({ brand_id: form.get('brand_id') });
  if (!parsed.success) return NextResponse.json({ error: 'invalid input', issues: parsed.error.flatten() }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'file is required' }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: 'file must be 1 byte to 50 MB' }, { status: 400 });
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: 'unsupported file type' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!(await isBrandOwner(admin, parsed.data.brand_id, user.id))) {
    return NextResponse.json({ error: 'brand not found' }, { status: 404 });
  }

  const r2 = getR2();
  if (!r2) return NextResponse.json({ error: 'R2 is not configured' }, { status: 500 });

  const id = crypto.randomUUID();
  const name = sanitizeFileName(file.name || `asset-${id}`);
  const key = `job-inputs/${user.id}/${parsed.data.brand_id}/${id}-${name}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  await r2.client.send(new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    Body: bytes,
    ContentType: file.type,
  }));

  const asset: JobInputAsset = {
    id,
    url: `${r2.publicUrl}/${key.split('/').map(encodeURIComponent).join('/')}`,
    key,
    file_name: name,
    mime_type: file.type,
    size: file.size,
    kind: assetKind(file.type),
  };

  return NextResponse.json({ asset });
}

function getR2() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const publicUrl = process.env.R2_PUBLIC_URL?.trim().replace(/\/+$/, '');
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null;
  return {
    bucket,
    publicUrl,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

function assetKind(mime: string): JobInputAsset['kind'] {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'document';
  return 'other';
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.slice(0, 140) || 'asset';
}
