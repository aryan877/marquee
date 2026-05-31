import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';
import { PLANS } from '@marquee/shared/billing';
import { SettingsTabs } from '../settings-tabs';
import { BillingControls } from './billing-controls';

export default async function BillingPage() {
 const sb = await getSupabaseServer();
 const { data: profileRows } = await sb.rpc('get_profile');
 const profile = profileRows?.[0];
 if (!profile) redirect('/login');

 const founder = PLANS.FOUNDER;
 const isFounder = profile.plan === 'FOUNDER';

 return (
 <div className="px-6 py-10 md:px-10 md:py-14">
 <div className="mx-auto max-w-3xl">
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Billing</p>
 <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
 {isFounder ? 'You’re on Founder Pass.' : 'Skip the line.'}
 </h1>
 <p className="mt-3 text-[var(--color-ink-2)]">
 {isFounder
 ? 'Renews automatically. Cancel anytime; access stays through the period.'
 : 'Founder Pass moves you to the priority queue and unlocks daily autopilot.'}
 </p>
 <SettingsTabs active="/app/settings/billing" />

 <div className="mt-8 surface rounded-[var(--radius-lg)] border border-[var(--color-ink)] p-8 lift-2">
 <div className="flex items-baseline justify-between">
 <h2 className="font-display text-3xl tracking-[-0.04em]">{founder.label}</h2>
 <div className="font-display tracking-[-0.04em]">
 <span className="text-4xl">${founder.priceUsd}</span>
 <span className="ml-1 text-[var(--color-ink-3)]">/mo</span>
 </div>
 </div>
 <ul className="mt-6 space-y-2 text-[var(--color-ink-2)]">
 {founder.features.map((f) => (
 <li key={f} className="flex items-start gap-2">
 <span aria-hidden className="mt-2 inline-block h-1 w-1 rounded-full bg-[var(--color-ink)]" />
 <span>{f}</span>
 </li>
 ))}
 </ul>
 <BillingControls
 isFounder={isFounder}
 cancelAtPeriodEnd={profile.cancel_at_period_end}
 periodEnd={profile.period_ends_at}
 />
 </div>
 </div>
 </div>
 );
}
