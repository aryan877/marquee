import { redirect } from 'next/navigation';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';
import { OnboardingWizard } from '@/components/app/onboarding-wizard';

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const { mode } = await searchParams;
  const sb = await getSupabaseServer();
  const { data: hasCompleted } = await sb.rpc('has_completed_onboarding');
  if (hasCompleted && mode !== 'new') redirect('/app');

  return <OnboardingWizard />;
}
