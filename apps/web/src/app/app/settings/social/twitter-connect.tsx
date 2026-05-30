'use client';
import { useState, useTransition } from 'react';

export function TwitterConnect({ brandId }: { brandId: string }) {
  const [appKey, setAppKey] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [accessSecret, setAccessSecret] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  async function connect() {
    setMsg(null);
    start(async () => {
      const res = await fetch('/api/social/twitter/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brand_id:      brandId,
          app_key:       appKey,
          app_secret:    appSecret,
          access_token:  accessToken,
          access_secret: accessSecret,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: body.error ?? 'Connect failed' });
        return;
      }
      setAppSecret(''); setAccessSecret('');
      setMsg({ kind: 'ok', text: `Connected as ${body.handle}` });
    });
  }

  const ready = appKey.length >= 10 && appSecret.length >= 20 && accessToken.length >= 20 && accessSecret.length >= 20;

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-paper-2)] px-3 py-2 text-xs font-medium text-[var(--color-ink)]">
        Cost warning: X switched to pay-per-use Feb 2026. ~$0.015 per text post, ~$0.20 per post containing a link. A test run with 5 posts = $1+ if any include URLs.
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="API key" className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm" />
        <input type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="API key secret" className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm" />
        <input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Access token" className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm" />
        <input type="password" value={accessSecret} onChange={(e) => setAccessSecret(e.target.value)} placeholder="Access token secret" className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm" />
      </div>
      <button
        onClick={connect}
        disabled={pending || !ready}
        className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
      >
        {pending ? 'Connecting…' : 'Connect X'}
      </button>
      {msg && (
        <div className={`rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
          msg.kind === 'err'
            ? 'border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 text-[var(--color-signal-bad)]'
            : 'border border-[var(--color-signal-good)]/30 bg-[var(--color-signal-good)]/10 text-[var(--color-signal-good)]'
        }`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
