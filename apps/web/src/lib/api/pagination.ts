import { z } from 'zod';

export const PAGE_LIMIT_DEFAULT = 20;
export const PAGE_LIMIT_MAX = 50;

export const CursorSchema = z.object({
  created_at: z.string().datetime({ offset: true }),
  id:         z.string().uuid(),
});

export const PageSearchParamsSchema = z.object({
  limit:             z.coerce.number().int().min(1).max(PAGE_LIMIT_MAX).default(PAGE_LIMIT_DEFAULT),
  cursor_created_at: z.string().datetime({ offset: true }).optional(),
  cursor_id:         z.string().uuid().optional(),
});

export type PageCursor = z.infer<typeof CursorSchema>;

export type PaginatedResponse<T> = {
  items: T[];
  next_cursor: PageCursor | null;
  has_more: boolean;
};

export function pageFromRows<T extends { id: string; created_at: string }>(
  rows: T[] | null | undefined,
  limit: number,
): PaginatedResponse<T> {
  const all = rows ?? [];
  const items = all.slice(0, limit);
  const hasMore = all.length > limit;
  const last = items.at(-1);
  return {
    items,
    has_more: hasMore,
    next_cursor: hasMore && last ? { id: last.id, created_at: last.created_at } : null,
  };
}

export function parseCursorParams(searchParams: URLSearchParams) {
  const raw = Object.fromEntries(searchParams.entries());
  const parsed = PageSearchParamsSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, error: parsed.error.flatten() };

  const cursorProvided = Boolean(parsed.data.cursor_created_at || parsed.data.cursor_id);
  if (cursorProvided && (!parsed.data.cursor_created_at || !parsed.data.cursor_id)) {
    return { ok: false as const, error: { formErrors: ['cursor_created_at and cursor_id must be provided together'], fieldErrors: {} } };
  }

  return { ok: true as const, data: parsed.data };
}

export function appendCursorParams(params: URLSearchParams, cursor: PageCursor | null | undefined) {
  if (!cursor) return;
  params.set('cursor_created_at', cursor.created_at);
  params.set('cursor_id', cursor.id);
}
