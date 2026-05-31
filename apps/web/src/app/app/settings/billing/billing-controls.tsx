'use client';
import { useState, useTransition } from 'react';
import { formatAppDate } from '@/lib/dates';

export function BillingControls({
 isFounder,
 cancelAtPeriodEnd,
 periodEnd,
}: {
 isFounder: boolean;
 cancelAtPeriodEnd: boolean;
 periodEnd: string | null;
}) {
 const [error, setError] = useState<string | null>(null);
 const [pending, start] = useTransition();

 async function checkout() {
 setError(null);
 start(async () => {
 const res = await fetch('/api/billing/checkout', { method: 'POST' });
 const body = await res.json().catch(() => ({}));
 if (!res.ok || !body.url) {
 setError(body.error ?? 'Could not start checkout');
 return;
 }
 window.location.href = body.url;
 });
 }

 if (isFounder) {
 return (
 <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <p className="text-sm text-[var(--color-ink-2)]">
 {cancelAtPeriodEnd && periodEnd
 ? `Set to cancel on ${formatAppDate(periodEnd)}.`
 : periodEnd
 ? `Renews on ${formatAppDate(periodEnd)}.`
 : 'Active.'}
 </p>
 <span className="font-mono text-xs tracking-wider text-[var(--color-ink-3)]">
 Manage via support for now
 </span>
 </div>
 );
 }

 return (
 <div className="mt-8 space-y-3">
 <button
 onClick={checkout}
 disabled={pending}
 className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-base text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
 >
 {pending ? 'Opening checkout…' : 'Become a Founder'} {!pending && <span aria-hidden>→</span>}
 </button>
 {error && (
 <div className="rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
 {error}
 </div>
 )}
 </div>
 );
}
