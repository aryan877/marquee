'use client';
import Image from 'next/image';
import { motion } from 'framer-motion';

/**
 * Hero illustration card. Uses the generated marquee tower artwork.
 * Subtle parallax float + a slow-drifting accent dot in the foreground.
 */
export function HeroSpotlight({ className }: { className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 30, rotate: -2 }}
      animate={{ opacity: 1, y: 0, rotate: 0 }}
      transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        className="relative"
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <Image
          src="/brand/hero-marquee.png"
          alt=""
          width={1024}
          height={1024}
          priority
          className="relative z-10 select-none pointer-events-none"
          draggable={false}
        />
        {/* small magenta accent dot drifting around the tower */}
        <motion.span
          className="absolute z-20 h-2.5 w-2.5 rounded-full bg-[var(--color-accent-strong)]"
          style={{ top: '38%', left: '46%' }}
          animate={{
            x: [0, 6, 0, -4, 0],
            y: [0, -4, 6, 2, 0],
            opacity: [0.7, 1, 0.6, 0.9, 0.7],
          }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          className="absolute -bottom-2 left-1/2 z-0 block h-3 w-2/3 -translate-x-1/2 rounded-full bg-[var(--color-ink)]/10 blur-md"
          animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.9, 1.05, 0.9] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}
