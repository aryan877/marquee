import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { Dashboard } from '@/components/app/dashboard';

export default async function DashboardPage() {
  const sb = await getSupabaseServer();
  const [{ data: brands }, { data: jobs }, { data: profileRows }] = await Promise.all([
    sb.rpc('get_brands', { p_limit: 12 }),
    sb.rpc('get_content_jobs', { p_limit: 12 }),
    sb.rpc('get_profile'),
  ]);

  if (!brands || brands.length === 0) {
    redirect('/app/onboarding');
  }

  return (
    <Dashboard
      brands={brands ?? []}
      jobs={jobs ?? []}
      profile={profileRows?.[0] ?? null}
    />
  );
}
