import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { Database } from '@marquee/db';
import type { PageCursor, PaginatedResponse } from '@/lib/api/pagination';
import { PAGE_LIMIT_DEFAULT } from '@/lib/api/pagination';
import { fetchPage } from './fetch-page';

export type BrandListItem = Database['public']['Functions']['get_brands_page']['Returns'][number];
export type BrandListPage = PaginatedResponse<BrandListItem>;

export function usePaginatedBrands({
  limit = PAGE_LIMIT_DEFAULT,
  initialPage,
}: {
  limit?: number;
  initialPage?: BrandListPage;
}) {
  return useInfiniteQuery<BrandListPage, Error>({
    queryKey: ['brands', 'list', { limit }],
    queryFn: ({ pageParam }) => fetchPage<BrandListPage>('/api/brands', {
      limit,
      cursor: pageParam as PageCursor | null,
    }),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    placeholderData: keepPreviousData,
    initialData: initialPage ? { pages: [initialPage], pageParams: [null] } : undefined,
  });
}
