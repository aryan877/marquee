'use client';
import { useState, useTransition } from 'react';

export function MastodonConnect({ brandId }: { brandId: string }) {
  const [instance, setInstance] = useState('mastodon.social');
  const [token, setToken] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  async function connect() {
    setMsg(null);
    start(async () => {
      const res = await fetch('/api/social/mastodon/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, instance, access_token: token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: body.error ?? 'Connect failed' });
        return;
      }
      setToken('');
      setMsg({ kind: 'ok', text: `Connected as ${body.handle}` });
    });
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
      <input
        value={instance}
        onChange={(e) => setInstance(e.target.value)}
        placeholder="mastodon.social"
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        placeholder="access token (Settings → Development → New application)"
        className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
      <button
        onClick={connect}
        disabled={pending || instance.length < 3 || token.length < 20}
        className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
      >
        {pending ? 'Connecting…' : 'Connect Mastodon'}
      </button>
      {msg && (
        <div
          className={`sm:col-span-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm ${
            msg.kind === 'err'
              ? 'border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 text-[var(--color-signal-bad)]'
              : 'border border-[var(--color-signal-good)]/30 bg-[var(--color-signal-good)]/10 text-[var(--color-signal-good)]'
          }`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
