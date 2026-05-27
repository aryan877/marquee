import { cn } from '@/lib/cn';

/**
 * Clean text wordmark. Same display family as the hero H1 so the nav, hero,
 * and footer all read as one piece of typography.
 */
export function MarqueeWord({ className, dot = false }: { className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-[0.06em] font-display font-extrabold tracking-[-0.07em]',
        className,
      )}
    >
      marquee
      {dot && <span aria-hidden>.</span>}
    </span>
  );
}
