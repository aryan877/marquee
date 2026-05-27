'use client';
import { motion } from 'framer-motion';

/**
 * Rhythmic scallop border. Clean, intentional, repeating arcs — not random.
 * One tile is 80×40 (one full scallop). Slow horizontal drift.
 */
export function WaveBorder({
  className,
  flip = false,
  height = 64,
}: {
  className?: string;
  flip?: boolean;
  height?: number;
}) {
  return (
    <div
      className={className}
      style={{
        height,
        overflow: 'hidden',
        transform: flip ? 'scaleY(-1)' : undefined,
        position: 'relative',
      }}
      aria-hidden
    >
      <motion.div
        className="absolute inset-y-0 left-0"
        style={{ width: '200%', height }}
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 80, repeat: Infinity, ease: 'linear' }}
      >
        <svg width="100%" height={height} xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="scallop-tile" x="0" y="0" width="80" height="64" patternUnits="userSpaceOnUse">
              {/* clean half-circle scallop, anchored bottom */}
              <path
                d="M 0 64 L 0 36 A 40 28 0 0 1 80 36 L 80 64 Z"
                fill="var(--color-ink)"
              />
              {/* fine inner echo line, paper-colored */}
              <path
                d="M 6 38 A 34 22 0 0 1 74 38"
                stroke="var(--color-paper)"
                strokeWidth="0.6"
                fill="none"
                opacity="0.5"
              />
              {/* single droplet centered above the peak */}
              <circle cx="40" cy="22" r="1" fill="var(--color-ink)" opacity="0.7" />
            </pattern>
            <pattern id="scallop-accent" x="0" y="0" width="320" height="64" patternUnits="userSpaceOnUse">
              {/* magenta-pink accent dot every 4th scallop */}
              <circle cx="160" cy="22" r="1.6" fill="var(--color-accent-strong)" opacity="0.9" />
              <circle cx="160" cy="14" r="0.8" fill="var(--color-accent-strong)" opacity="0.6" />
            </pattern>
          </defs>
          <rect width="100%" height={height} fill="url(#scallop-tile)" />
          <rect width="100%" height={height} fill="url(#scallop-accent)" />
        </svg>
      </motion.div>
    </div>
  );
}
