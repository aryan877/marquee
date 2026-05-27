import { Suspense } from 'react';
import Link from 'next/link';
import { LoginForm } from './login-form';

export default function LoginPage() {
 return (
 <main className="relative grid min-h-screen lg:grid-cols-2">
 <aside className="relative hidden flex-col justify-between overflow-hidden bg-[var(--color-ink)] p-12 text-[var(--color-paper)] lg:flex">
 <div className="pointer-events-none absolute -bottom-40 -right-40 h-[60vh] w-[60vh] rounded-full bg-[var(--color-accent)] opacity-30 blur-3xl" />
 <Link href="/" className="font-display text-2xl tracking-[-0.06em]">
 marquee.
 </Link>
 <div className="relative">
 <p className="font-mono text-xs tracking-[0.2em] text-[var(--color-paper)]/60">
 Welcome back
 </p>
 <h1 className="mt-4 font-display text-6xl leading-[0.9] tracking-[-0.05em] xl:text-7xl">
 Your brand<br />
 <span className="text-[var(--color-paper)]/60">missed you.</span>
 </h1>
 <p className="mt-6 max-w-md text-[var(--color-paper)]/70">
 Sign in to see what the agent shipped last night.
 </p>
 </div>
 <p className="font-mono text-xs text-[var(--color-paper)]/40">
 marquee.app — built in Noida
 </p>
 </aside>

 <section className="flex items-center justify-center px-6 py-16 md:px-10">
 <div className="w-full max-w-sm">
 <Link href="/" className="font-display text-xl tracking-[-0.06em] lg:hidden">marquee.</Link>
 <h2 className="mt-8 font-display text-3xl tracking-[-0.04em] md:text-4xl">Sign in</h2>
 <p className="mt-2 text-sm text-[var(--color-ink-3)]">
 Don&apos;t have an account?{' '}
 <Link href="/signup" className="text-[var(--color-ink)] underline underline-offset-4">
 Create one
 </Link>
 </p>
 <Suspense>
 <LoginForm />
 </Suspense>
 </div>
 </section>
 </main>
 );
}
