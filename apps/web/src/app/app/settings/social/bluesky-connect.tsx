'use client';
import { useState, useTransition } from 'react';

export function BlueskyConnect({ brandId }: { brandId: string }) {
  const [handle, setHandle] = useState('');
  const [pass, setPass] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pending, start] = useTransition();

  async function connect() {
    setMsg(null);
    start(async () => {
      const res = await fetch('/api/social/bluesky/connect', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brand_id: brandId, handle, app_password: pass }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ kind: 'err', text: body.error ?? 'Connect failed' });
        return;
      }
      setHandle(''); setPass('');
      setMsg({ kind: 'ok', text: `Connected as ${body.handle}` });
    });
  }

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <input
        value={handle}
        onChange={(e) => setHandle(e.target.value)}
        placeholder="handle.bsky.social"
        className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
      <input
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="app password (xxxx-xxxx-xxxx-xxxx)"
        className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
      />
      <button
        onClick={connect}
        disabled={pending || handle.length < 3 || pass.length < 8}
        className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
      >
        {pending ? 'Connecting…' : 'Connect Bluesky'}
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
