'use client';

import { useState, useTransition } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

type AiFillButtonProps = {
  label?: string;
  request: Record<string, unknown>;
  onApply: (suggestion: Record<string, unknown>) => void;
  disabled?: boolean;
  className?: string;
};

export function AiFillButton({
  label = 'AI fill',
  request,
  onApply,
  disabled,
  className,
}: AiFillButtonProps) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await fetch('/api/ai/form-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.suggestion || typeof body.suggestion !== 'object') {
        setError(body.error ?? 'Could not fill');
        return;
      }
      onApply(body.suggestion as Record<string, unknown>);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={run}
        disabled={disabled || pending}
        title={label}
        aria-busy={pending}
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50',
          className,
        )}
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
        <span>{pending ? 'Filling' : label}</span>
      </button>
      {error && <span className="text-[11px] text-[var(--color-signal-bad)]">{error}</span>}
    </div>
  );
}
