import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/cn';

const TABS = [
  { href: '/app/settings', label: 'Account' },
  { href: '/app/settings/social', label: 'Platforms' },
  { href: '/app/settings/billing', label: 'Billing' },
] as const;

type SettingsTab = typeof TABS[number]['href'];

export function SettingsTabs({ active }: { active: SettingsTab }) {
  return (
    <nav className="mt-8 flex flex-wrap gap-2 border-b border-[var(--color-border)]" aria-label="Settings sections">
      {TABS.map((tab) => {
        const selected = active === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href as Route}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-3 text-sm transition-colors',
              selected
                ? 'border-[var(--color-ink)] text-[var(--color-ink)]'
                : 'border-transparent text-[var(--color-ink-3)] hover:text-[var(--color-ink)]',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
