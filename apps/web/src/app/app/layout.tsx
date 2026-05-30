import { redirect } from 'next/navigation';
import type { CSSProperties } from 'react';
import { requireUser, getSupabaseServer } from '@/lib/supabase/server';
import { AppShell } from '@/components/app/app-shell';
import { FreeLaunchBanner } from '@/components/app/free-launch-banner';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) redirect('/login');

  const sb = await getSupabaseServer();
  const { data: profileRows } = await sb.rpc('get_profile');
  const profile = profileRows?.[0] ?? null;
  const isFounder = profile?.plan === 'FOUNDER';

  return (
    <AppShell user={{ email: user.email ?? '', plan: profile?.plan ?? 'FREE' }}>
      {!isFounder && <FreeLaunchBanner />}
      <div style={{ '--app-banner-height': isFounder ? '0px' : '41px' } as CSSProperties}>
        {children}
      </div>
    </AppShell>
  );
}
