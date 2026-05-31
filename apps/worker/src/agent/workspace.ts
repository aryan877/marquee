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

export interface JobWorkspace {
  root: string;
  assets: WorkspaceAsset[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CAT_ASSET_DIR = resolve(__dirname, '..', '..', 'assets', 'cats', 'imgflip');
const CAT_METADATA_PATH = join(CAT_ASSET_DIR, 'metadata.json');

export const ensureJobWorkspace = async (ctx: PipelineContext, outputsDir: string): Promise<JobWorkspace> => {
  const root = join(outputsDir, ctx.job.id, 'workspace');
  const assetOut = join(root, 'assets', 'cats');
  await mkdir(assetOut, { recursive: true });
  await mkdir(join(root, 'notes'), { recursive: true });
  await mkdir(join(root, 'selected-cats'), { recursive: true });

  const assets = await readCatAssets();
  await writeFile(join(root, 'job.json'), JSON.stringify(ctx.job, null, 2));
  await writeFile(join(root, 'brand.json'), JSON.stringify(ctx.brand, null, 2));
  await writeFile(join(root, 'brief.md'), buildBrief(ctx));
  await writeFile(join(assetOut, 'metadata.json'), JSON.stringify({ assets }, null, 2));

  await Promise.all(assets.map(async (asset) => {
    await copyFile(join(CAT_ASSET_DIR, asset.file), join(assetOut, asset.file));
  }));

  return { root, assets };
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
].filter(Boolean).join('\n');

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
