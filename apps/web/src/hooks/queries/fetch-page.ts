import { appendCursorParams, type PageCursor } from '@/lib/api/pagination';

type FetchPageParams = {
  limit?: number;
  brandId?: string;
  cursor?: PageCursor | null;
};

export async function fetchPage<T>(path: string, params: FetchPageParams = {}) {
  const url = new URL(path, window.location.origin);
  if (params.limit) url.searchParams.set('limit', String(params.limit));
  if (params.brandId) url.searchParams.set('brand_id', params.brandId);
  appendCursorParams(url.searchParams, params.cursor);

  const res = await fetch(url.toString(), { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.error === 'string' ? body.error : 'Request failed');
  }
  return body as T;
}
