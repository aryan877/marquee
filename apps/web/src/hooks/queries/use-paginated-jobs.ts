import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { Database } from '@marquee/db';
import type { PageCursor, PaginatedResponse } from '@/lib/api/pagination';
import { PAGE_LIMIT_DEFAULT } from '@/lib/api/pagination';
import { fetchPage } from './fetch-page';

export type JobHistoryItem = Database['public']['Functions']['get_content_jobs_page']['Returns'][number];
export type JobHistoryPage = PaginatedResponse<JobHistoryItem>;

export function usePaginatedJobs({
  brandId,
  limit = PAGE_LIMIT_DEFAULT,
  initialPage,
}: {
  brandId?: string;
  limit?: number;
  initialPage?: JobHistoryPage;
}) {
  return useInfiniteQuery<JobHistoryPage, Error>({
    queryKey: ['jobs', 'history', { brandId: brandId ?? null, limit }],
    queryFn: ({ pageParam }) => fetchPage<JobHistoryPage>('/api/jobs', {
      brandId,
      limit,
      cursor: pageParam as PageCursor | null,
    }),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    placeholderData: keepPreviousData,
    initialData: initialPage ? { pages: [initialPage], pageParams: [null] } : undefined,
  });
}
