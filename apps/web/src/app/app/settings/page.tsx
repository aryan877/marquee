import type { Route } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase/server';

export default async function SettingsPage() {
 const sb = await getSupabaseServer();
 const { data: profileRows } = await sb.rpc('get_profile');
 const profile = profileRows?.[0];
 if (!profile) redirect('/login');

 return (
 <div className="px-6 py-10 md:px-10 md:py-14">
 <div className="mx-auto max-w-3xl">
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-ink-3)]">Settings</p>
 <h1 className="mt-2 font-display text-4xl tracking-[-0.04em] md:text-5xl">
 {profile.email}
 </h1>

 <nav className="mt-10 grid gap-3 sm:grid-cols-2">
 <Card href="/app/settings/billing" title="Billing" body={profile.plan === 'FOUNDER' ? 'Founder Pass · active' : 'On Free · upgrade for $50/mo'} />
 <Card href="/app/settings/social" title="Connected accounts" body="Bluesky · LinkedIn · more soon" />
 </nav>
 </div>
 </div>
 );
}

function Card({ href, title, body }: { href: Route; title: string; body: string }) {
 return (
 <Link
 href={href}
 className="surface rounded-[var(--radius-md)] border border-[var(--color-border)] p-5 lift hover:-translate-y-0.5 transition-transform"
 >
 <div className="font-medium">{title}</div>
 <div className="mt-1 text-sm text-[var(--color-ink-3)]">{body}</div>
 </Link>
 );
}
