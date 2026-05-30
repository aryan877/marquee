import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import type { Database } from '@marquee/db';
import type { PageCursor, PaginatedResponse } from '@/lib/api/pagination';
import { PAGE_LIMIT_DEFAULT } from '@/lib/api/pagination';
import { fetchPage } from './fetch-page';

export type CampaignListItem = Database['public']['Functions']['get_campaigns_page']['Returns'][number];
export type CampaignListPage = PaginatedResponse<CampaignListItem>;

export function usePaginatedCampaigns({
  limit = PAGE_LIMIT_DEFAULT,
  initialPage,
}: {
  limit?: number;
  initialPage?: CampaignListPage;
}) {
  return useInfiniteQuery<CampaignListPage, Error>({
    queryKey: ['campaigns', 'list', { limit }],
    queryFn: ({ pageParam }) => fetchPage<CampaignListPage>('/api/campaigns', {
      limit,
      cursor: pageParam as PageCursor | null,
    }),
    initialPageParam: null as PageCursor | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    placeholderData: keepPreviousData,
    initialData: initialPage ? { pages: [initialPage], pageParams: [null] } : undefined,
  });
}
