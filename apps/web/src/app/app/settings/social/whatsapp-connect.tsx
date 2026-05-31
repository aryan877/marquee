'use client';

import { useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { WHATSAPP_META } from '@/components/marquee/platform-icons';

type WhatsappStatus = {
  status?: string;
  connected?: boolean;
  qr_data_url?: string | null;
  phone_e164?: string | null;
  display_name?: string | null;
  last_send_at?: string | null;
  error?: string;
};

export function WhatsappConnect() {
  const [status, setStatus] = useState<WhatsappStatus>({});
  const [pendingAction, setPendingAction] = useState<'connect' | 'disconnect' | 'refresh' | null>(null);
  const Icon = WHATSAPP_META.Icon;

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh(showPending = false) {
    if (showPending) setPendingAction('refresh');
    try {
      const res = await fetch('/api/whatsapp');
      const body = await res.json().catch(() => ({}));
      setStatus(body);
    } finally {
      if (showPending) setPendingAction(null);
    }
  }

  function action(name: 'connect' | 'disconnect') {
    setPendingAction(name);
    void (async () => {
      try {
        const res = await fetch('/api/whatsapp', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: name }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus((current) => ({
            ...current,
            error: typeof body.error === 'string' ? body.error : 'WhatsApp request failed',
          }));
        } else {
          setStatus(body);
        }
      } catch (err) {
        setStatus((current) => ({
          ...current,
          error: err instanceof Error ? err.message : 'WhatsApp request failed',
        }));
      } finally {
        setPendingAction(null);
      }
    })();
  }

  const connected = status.connected || status.status === 'CONNECTED';
  const canLogout = connected || status.status === 'QR' || status.status === 'CONNECTING' || Boolean(status.qr_data_url);
  const isBusy = pendingAction !== null;

  return (
    <section className="surface mt-8 rounded-[var(--radius-lg)] border border-[var(--color-border)] p-6 lift">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-paper)]">
            <Icon className={`h-5 w-5 ${WHATSAPP_META.tint}`} />
          </span>
          <div>
            <h2 className="font-display text-2xl tracking-[-0.02em]">WhatsApp to self</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-3)]">
              Send finished posts, videos, or intermediate artifacts to your own phone for review.
            </p>
            <div className="mt-2 font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">
              {connected ? status.phone_e164 ?? status.display_name ?? 'CONNECTED' : status.status ?? 'DISCONNECTED'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void refresh(true)}
            disabled={isBusy}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-ink)] hover:border-[var(--color-ink)] disabled:opacity-50"
          >
            {pendingAction === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
          {!connected && (
            <button
              type="button"
              onClick={() => action('connect')}
              disabled={isBusy}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] disabled:opacity-50"
            >
              {pendingAction === 'connect' && <Loader2 className="h-4 w-4 animate-spin" />}
              {status.qr_data_url ? 'Refresh QR' : 'Pair phone'}
            </button>
          )}
          <button
            type="button"
            onClick={() => action('disconnect')}
            disabled={isBusy || !canLogout}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-signal-bad)]/50 px-4 py-2 text-sm text-[var(--color-signal-bad)] hover:border-[var(--color-signal-bad)] hover:bg-[var(--color-signal-bad)]/10 disabled:opacity-40"
          >
            {pendingAction === 'disconnect' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Log out WhatsApp
          </button>
        </div>
      </div>

      {status.qr_data_url && !connected && (
        <div className="mt-5 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <img
            src={status.qr_data_url}
            alt="WhatsApp pairing QR"
            className="h-[180px] w-[180px] rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-2"
          />
          <div className="self-center text-sm text-[var(--color-ink-2)]">
            Open WhatsApp on your phone, scan this QR from Linked Devices, then refresh once it connects.
          </div>
        </div>
      )}

      {status.error && (
        <div className="mt-4 rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
          {status.error}
        </div>
      )}
    </section>
  );
}
