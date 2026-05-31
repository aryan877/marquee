import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PipelineContext } from '../pipelines/types.js';

export interface WorkspaceAsset {
  id: string;
  title: string;
  file: string;
  source: string;
  page: string;
  bytes: number;
  content_type: string;
}

export interface WorkspaceInputAsset extends WorkspaceAsset {
  url: string;
  kind: 'image' | 'video' | 'document' | 'other';
  description: string;
  usage_hint: string;
}

export interface JobWorkspace {
  root: string;
  assets: WorkspaceAsset[];
  inputAssets: WorkspaceInputAsset[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAT_ASSET_DIR = resolve(__dirname, '..', '..', 'assets', 'cats', 'imgflip');
const CAT_METADATA_PATH = join(CAT_ASSET_DIR, 'metadata.json');

export const ensureJobWorkspace = async (ctx: PipelineContext, outputsDir: string): Promise<JobWorkspace> => {
  const root = join(outputsDir, ctx.job.id, 'workspace');
  const assetOut = join(root, 'assets', 'cats');
  const inputOut = join(root, 'assets', 'input');
  await mkdir(assetOut, { recursive: true });
  await mkdir(inputOut, { recursive: true });
  await mkdir(join(root, 'notes'), { recursive: true });
  await mkdir(join(root, 'selected-cats'), { recursive: true });
  await mkdir(join(root, 'selected-input'), { recursive: true });

  const assets = await readCatAssets();
  const inputAssets = await downloadInputAssets(ctx, inputOut);
  await writeFile(join(root, 'job.json'), JSON.stringify(ctx.job, null, 2));
  await writeFile(join(root, 'brand.json'), JSON.stringify(ctx.brand, null, 2));
  await writeFile(join(root, 'brief.md'), buildBrief(ctx));
  await writeFile(join(assetOut, 'metadata.json'), JSON.stringify({ assets }, null, 2));
  await writeFile(join(inputOut, 'metadata.json'), JSON.stringify({ assets: inputAssets }, null, 2));

  await Promise.all(assets.map(async (asset) => {
    await copyFile(join(CAT_ASSET_DIR, asset.file), join(assetOut, asset.file));
  }));

  return { root, assets, inputAssets };
};

export const stageCatAsset = async (workspace: JobWorkspace, assetId: string, workerHttpUrl: string, jobId: string, targetName?: string | null) => {
  const asset = workspace.assets.find((item) => item.id === assetId || item.file === assetId);
  if (!asset) throw new Error(`unknown cat asset: ${assetId}`);
  const ext = extname(asset.file);
  const targetBase = sanitizeFileName(targetName?.trim() || asset.file.replace(ext, ''));
  const targetFile = `${targetBase}${ext}`;
  const relPath = join('selected-cats', targetFile);
  const target = safePath(workspace.root, relPath);
  await copyFile(join(workspace.root, 'assets', 'cats', asset.file), target);
  return {
    asset,
    path: relative(workspace.root, target),
    url: `${workerHttpUrl.replace(/\/+$/, '')}/outputs/${encodeURIComponent(jobId)}/workspace/${publicPath(relPath)}`,
  };
};

export const stageInputAsset = async (workspace: JobWorkspace, assetId: string, workerHttpUrl: string, jobId: string, targetName?: string | null) => {
  const asset = workspace.inputAssets.find((item) => item.id === assetId || item.file === assetId);
  if (!asset) throw new Error(`unknown input asset: ${assetId}`);
  const ext = extname(asset.file);
  const targetBase = sanitizeFileName(targetName?.trim() || asset.file.replace(ext, ''));
  const targetFile = `${targetBase}${ext}`;
  const relPath = join('selected-input', targetFile);
  const target = safePath(workspace.root, relPath);
  await copyFile(join(workspace.root, 'assets', 'input', asset.file), target);
  return {
    asset,
    path: relative(workspace.root, target),
    url: `${workerHttpUrl.replace(/\/+$/, '')}/outputs/${encodeURIComponent(jobId)}/workspace/${publicPath(relPath)}`,
  };
};

export const stageVisualAsset = async (workspace: JobWorkspace, assetId: string, workerHttpUrl: string, jobId: string, targetName?: string | null) => {
  if (workspace.inputAssets.some((item) => item.id === assetId || item.file === assetId)) {
    return stageInputAsset(workspace, assetId, workerHttpUrl, jobId, targetName);
  }
  return stageCatAsset(workspace, assetId, workerHttpUrl, jobId, targetName);
};

export const publicPath = (relPath: string) =>
  relPath.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join('/');

const readCatAssets = async (): Promise<WorkspaceAsset[]> => {
  const raw = JSON.parse(await readFile(CAT_METADATA_PATH, 'utf8')) as { items?: WorkspaceAsset[] };
  return (raw.items ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    file: item.file,
    source: item.source,
    page: item.page,
    bytes: item.bytes,
    content_type: item.content_type,
  }));
};

const buildBrief = (ctx: PipelineContext) => [
  `# ${ctx.brand.name}`,
  '',
  `Job: ${ctx.job.content_type}`,
  ctx.job.topic ? `Topic: ${ctx.job.topic}` : '',
  ctx.brand.description ? `Brand: ${ctx.brand.description}` : '',
  ctx.brand.target_audience ? `Audience: ${ctx.brand.target_audience}` : '',
  ctx.brand.voice ? `Voice: ${ctx.brand.voice}` : '',
  '',
  'Use assets from assets/cats/metadata.json when a cat visual helps the job.',
  ...inputAssetBriefLines(ctx),
].filter(Boolean).join('\n');

const inputAssetBriefLines = (ctx: PipelineContext) => {
  const assets = readInputAssetMetadata(ctx);
  if (assets.length === 0) return [];
  return [
    '',
    'User-provided input assets are in assets/input/metadata.json. Prefer them when they materially improve the poster, carousel, or video.',
    ...assets.map((asset) =>
      `- ${asset.id}: ${asset.file_name} (${asset.mime_type}) — ${asset.description || 'no description'}${asset.usage_hint ? `; use: ${asset.usage_hint}` : ''}`),
  ];
};

const downloadInputAssets = async (ctx: PipelineContext, inputOut: string): Promise<WorkspaceInputAsset[]> => {
  const assets = readInputAssetMetadata(ctx).slice(0, 8);
  return Promise.all(assets.map(async (asset) => {
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error(`input asset fetch failed: ${asset.file_name}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > 50 * 1024 * 1024) throw new Error(`input asset too large: ${asset.file_name}`);
    const file = inputFileName(asset);
    await writeFile(join(inputOut, file), bytes);
    return {
      id: asset.id,
      title: asset.description || asset.file_name,
      file,
      source: 'user',
      page: asset.url,
      bytes: bytes.byteLength,
      content_type: asset.mime_type,
      url: asset.url,
      kind: asset.kind,
      description: asset.description,
      usage_hint: asset.usage_hint,
    };
  }));
};

type RawInputAsset = {
  id: string;
  url: string;
  key: string;
  file_name: string;
  mime_type: string;
  size: number;
  kind: 'image' | 'video' | 'document' | 'other';
  description: string;
  usage_hint: string;
};

const readInputAssetMetadata = (ctx: PipelineContext): RawInputAsset[] => {
  const metadata = ctx.job.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return [];
  const assets = (metadata as { input_assets?: unknown }).input_assets;
  if (!Array.isArray(assets)) return [];
  return assets.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const asset = item as Record<string, unknown>;
    if (typeof asset.id !== 'string' || typeof asset.url !== 'string' || typeof asset.file_name !== 'string') return [];
    const mime = typeof asset.mime_type === 'string' ? asset.mime_type : 'application/octet-stream';
    return [{
      id: asset.id,
      url: asset.url,
      key: typeof asset.key === 'string' ? asset.key : '',
      file_name: asset.file_name,
      mime_type: mime,
      size: typeof asset.size === 'number' ? asset.size : 0,
      kind: inputKind(mime, asset.kind),
      description: typeof asset.description === 'string' ? asset.description.slice(0, 500) : '',
      usage_hint: typeof asset.usage_hint === 'string' ? asset.usage_hint.slice(0, 300) : '',
    }];
  });
};

const inputKind = (mime: string, value: unknown): RawInputAsset['kind'] => {
  if (value === 'image' || value === 'video' || value === 'document' || value === 'other') return value;
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'document';
  return 'other';
};

const inputFileName = (asset: RawInputAsset) => {
  const base = sanitizeFileName(asset.file_name.replace(extname(asset.file_name), ''));
  const ext = extname(asset.file_name) || extForMime(asset.mime_type);
  return `${asset.id}-${base}${ext}`;
};

const extForMime = (mime: string) => {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  if (mime === 'application/pdf') return '.pdf';
  return '.bin';
};

const safePath = (root: string, relPath: string) => {
  const target = resolve(root, relPath || '.');
  const normalizedRoot = resolve(root);
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + sep)) {
    throw new Error('path escapes workspace');
  }
  return target;
};

const sanitizeFileName = (value: string) => {
  const cleaned = basename(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'cat-asset';
};
