'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { getSupabaseBrowser } from '@/lib/supabase/client';

const NAV = [
 { href: '/app', label: 'Dashboard', icon: GridIcon },
 { href: '/app/generate', label: 'Generate', icon: SparkleIcon },
 { href: '/app/brands', label: 'Brands', icon: TagIcon },
 { href: '/app/campaigns', label: 'Campaigns', icon: CalendarIcon },
 { href: '/app/settings', label: 'Settings', icon: GearIcon },
] as const;

export function AppShell({
 user,
 children,
}: {
 user: { email: string; plan: string };
 children: React.ReactNode;
}) {
 const pathname = usePathname();
 const [menuOpen, setMenuOpen] = useState(false);

 return (
 <div className="min-h-screen overflow-x-hidden">
 <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-[var(--color-border)] bg-[var(--color-paper)] md:flex md:flex-col">
 <div className="flex h-14 items-center gap-2 border-b border-[var(--color-border)] px-5">
 <Link href="/app" className="font-display text-xl tracking-[-0.06em]">
 marquee
 </Link>
 </div>
 <nav className="flex-1 px-3 py-4">
 <ul className="space-y-1">
 {NAV.map((n) => {
 const active = pathname === n.href || (n.href !== '/app' && pathname.startsWith(n.href));
 const Icon = n.icon;
 return (
 <li key={n.href}>
 <Link
 href={n.href}
 className={cn(
 'flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2 text-sm transition-colors',
 active
 ? 'bg-[var(--color-paper-3)] text-[var(--color-ink)]'
 : 'text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]',
 )}
 >
 <Icon className="h-4 w-4" />
 {n.label}
 </Link>
 </li>
 );
 })}
 </ul>
 </nav>
 <div className="border-t border-[var(--color-border)] p-4">
 <UserMenu user={user} />
 </div>
 </aside>

 <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-paper)]/85 px-4 backdrop-blur md:hidden">
 <Link href="/app" className="font-display text-xl tracking-[-0.06em]">marquee.</Link>
 <button
 onClick={() => setMenuOpen((s) => !s)}
 className="rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-sm"
 >
 {menuOpen ? 'Close' : 'Menu'}
 </button>
 </header>

 <main className="flex min-h-screen min-w-0 flex-col md:ml-60">
 {menuOpen && (
 <nav className="border-b border-[var(--color-border)] bg-[var(--color-paper-2)] p-3 md:hidden">
 <ul className="grid grid-cols-2 gap-2">
 {NAV.map((n) => (
 <li key={n.href}>
 <Link
 href={n.href}
 onClick={() => setMenuOpen(false)}
 className="block rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-3 py-2 text-sm"
 >
 {n.label}
 </Link>
 </li>
 ))}
 </ul>
 </nav>
 )}
 {children}
 </main>
 </div>
 );
}

function UserMenu({ user }: { user: { email: string; plan: string } }) {
  async function signOut() {
    const sb = getSupabaseBrowser();
    await sb.auth.signOut();
    window.location.href = '/';
  }
  const initial = (user.email[0] ?? '?').toUpperCase();
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-paper)] p-3">
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-ink)] text-sm font-medium text-[var(--color-paper)]">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{user.email}</div>
          <div className="font-mono text-[10px] tracking-wider text-[var(--color-ink-3)]">
            {user.plan === 'FOUNDER' ? 'Founder Pass' : 'Free plan'}
          </div>
        </div>
      </div>
      <button
        onClick={signOut}
        className="mt-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]"
      >
        Log out
      </button>
    </div>
  );
}

function GridIcon(p: React.SVGProps<SVGSVGElement>) {
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
 <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
 <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
 </svg>
 );
}
function SparkleIcon(p: React.SVGProps<SVGSVGElement>) {
 return (
 <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
 <path d="M12 2 14 9l7 2-7 2-2 7-2-7-7-2 7-2z" />
 </svg>
 );
}
function TagIcon(p: React.SVGProps<SVGSVGElement>) {
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
 <path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
 </svg>
 );
}
function CalendarIcon(p: React.SVGProps<SVGSVGElement>) {
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
 <rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" />
 </svg>
 );
}
function GearIcon(p: React.SVGProps<SVGSVGElement>) {
 return (
 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" {...p}>
 <circle cx="12" cy="12" r="3" />
 <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.6-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.6A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.3-1a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z" />
 </svg>
 );
}
