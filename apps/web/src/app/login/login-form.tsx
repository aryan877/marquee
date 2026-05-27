'use client';
import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Route } from 'next';
import { getSupabaseBrowser } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const sb = getSupabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <Field label="Email" id="email">
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Password" id="password">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </Field>
      {error && (
        <div className="rounded-[var(--radius-sm)] border border-[var(--color-signal-bad)]/30 bg-[var(--color-signal-bad)]/10 px-3 py-2 text-sm text-[var(--color-signal-bad)]">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--color-ink)] px-6 py-3 text-base text-[var(--color-paper)] transition-colors hover:bg-[var(--color-ink-2)] disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
        {!pending && <span aria-hidden>→</span>}
      </button>
      <style jsx>{`
        .input {
          width: 100%;
          border-radius: var(--radius-sm);
          border: 1px solid var(--color-border);
          background: var(--color-surface);
          padding: 0.75rem 0.875rem;
          font-size: 0.95rem;
          color: var(--color-ink);
          transition: border-color 120ms;
        }
        .input:focus {
          outline: none;
          border-color: var(--color-ink);
        }
      `}</style>
    </form>
  );
}

function safeNextPath(value: string | null): Route {
  if (value?.startsWith('/app')) return value as Route;
  return '/app';
}

function Field({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm text-[var(--color-ink-2)]">{label}</span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
