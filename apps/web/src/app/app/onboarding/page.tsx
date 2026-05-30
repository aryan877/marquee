import { redirect } from 'next/navigation';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/app/onboarding-wizard';

export default async function OnboardingPage() {
  const user = await requireUser();
  if (!user) redirect('/login');

  const sb = await getSupabaseServer();
  const { data: brands } = await sb.rpc('get_brands_page', { p_limit: 1 });
  if (brands && brands.length > 0) redirect('/app');

  return <OnboardingWizard />;
}
