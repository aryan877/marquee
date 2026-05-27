'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MarqueeWord } from './wordmark';
import { cn } from '@/lib/cn';

const ITEMS = [
  { href: '/#how',       label: 'How it works' },
  { href: '/#platforms', label: 'Platforms' },
  { href: '/#pricing',   label: 'Pricing' },
  { href: '/#faq',       label: 'FAQ' },
] as const;

export function SiteNav({ variant = 'transparent' }: { variant?: 'transparent' | 'glass' }) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      if (y < 80) {
        setHidden(false);
      } else if (y > lastY.current + 4) {
        setHidden(true);
      } else if (y < lastY.current - 4) {
        setHidden(false);
      }
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      initial={false}
      animate={{ y: hidden ? -88 : 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-4 md:px-10 md:py-5',
        (variant === 'glass' || scrolled) && 'backdrop-blur-md bg-[var(--color-paper)]/75 border-b border-[var(--color-border)]',
      )}
    >
      <Link href="/" aria-label="marquee — home" className="block">
        <MarqueeWord className="text-2xl md:text-3xl" />
      </Link>
      <nav className="hidden md:flex items-center gap-8 text-sm">
        {ITEMS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className="text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
          >
            {i.label}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-3">
        <Link
          href="/login"
          className="hidden sm:inline-flex text-sm text-[var(--color-ink-2)] hover:text-[var(--color-ink)] transition-colors"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 py-2 text-sm text-[var(--color-paper)] hover:bg-[var(--color-ink-2)] transition-colors"
        >
          Start free
          <span aria-hidden>→</span>
        </Link>
      </div>
    </motion.header>
  );
}
