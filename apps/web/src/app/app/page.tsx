import { redirect } from 'next/navigation';
import { pageFromRows } from '@/lib/api/pagination';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Dashboard } from '@/components/app/dashboard';

export default async function DashboardPage() {
  const sb = await getSupabaseServer();
  const [{ data: brands }, { data: jobs }, { data: profileRows }] = await Promise.all([
    sb.rpc('get_brands_page', { p_limit: 12 }),
    sb.rpc('get_content_jobs_page', { p_limit: 12 }),
    sb.rpc('get_profile'),
  ]);
  const brandsPage = pageFromRows(brands, 12);
  const jobsPage = pageFromRows(jobs, 12);

  if (brandsPage.items.length === 0) {
    redirect('/app/onboarding');
  }

  return (
    <Dashboard
      brands={brandsPage.items}
      jobs={jobsPage.items}
      profile={profileRows?.[0] ?? null}
    />
  );
}
