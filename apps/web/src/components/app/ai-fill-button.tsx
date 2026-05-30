'use client';

import { useId, useState, useTransition } from 'react';
import { Loader2, WandSparkles } from 'lucide-react';
import { cn } from '@/lib/cn';

type AiFillButtonProps = {
  label?: string;
  promptLabel?: string;
  promptPlaceholder?: string;
  promptRequired?: boolean;
  request: Record<string, unknown>;
  onApply: (suggestion: Record<string, unknown>) => void;
  disabled?: boolean;
  className?: string;
};

export function AiFillButton({
  label = 'AI fill',
  promptLabel = 'What should AI fill?',
  promptPlaceholder = 'Tell AI what to fill...',
  promptRequired = false,
  request,
  onApply,
  disabled,
  className,
}: AiFillButtonProps) {
  const promptId = useId();
  const [pending, start] = useTransition();
  const [instructions, setInstructions] = useState('');
  const [error, setError] = useState<string | null>(null);

  function run() {
    const trimmedInstructions = instructions.trim();
    if (promptRequired && !trimmedInstructions) {
      setError('Add context first');
      return;
    }

    setError(null);
    start(async () => {
      const res = await fetch('/api/ai/form-fill', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(trimmedInstructions ? { ...request, instructions: trimmedInstructions } : request),
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
    <div className="flex w-full flex-col gap-1">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor={promptId} className="sr-only">
          {promptLabel}
        </label>
        <input
          id={promptId}
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (!disabled && !pending) run();
            }
          }}
          disabled={disabled || pending}
          placeholder={promptPlaceholder}
          aria-label={promptLabel}
          className="h-9 min-w-0 flex-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-ink)] disabled:opacity-50"
        />
        <button
          type="button"
          onClick={run}
          disabled={disabled || pending}
          title={label}
          aria-busy={pending}
          className={cn(
            'inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper-2)] disabled:opacity-50',
            className,
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
          <span>{pending ? 'Filling' : label}</span>
        </button>
      </div>
      {error && <span className="text-[11px] text-[var(--color-signal-bad)]">{error}</span>}
    </div>
  );
}
