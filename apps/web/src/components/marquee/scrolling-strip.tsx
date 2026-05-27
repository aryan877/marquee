import { cn } from '@/lib/cn';

interface Props {
  items: readonly string[];
  className?: string;
  separator?: React.ReactNode;
  reverse?: boolean;
}

/**
 * Infinite horizontal scroller. Renders the children twice so the
 * `translateX(-50%)` keyframe leaves no gap. Pause on hover.
 */
export function ScrollingStrip({ items, className, separator, reverse }: Props) {
  const sep = separator ?? <Dot />;
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div className="flex" style={{ direction: reverse ? 'rtl' : 'ltr' }}>
        <ul
          className={cn(
            'animate-marquee flex shrink-0 items-center gap-10 pr-10',
            'hover:[animation-play-state:paused]',
          )}
        >
          {items.concat(items).map((item, i) => (
            <li key={i} className="flex items-center gap-10 whitespace-nowrap">
              <span>{item}</span>
              {sep}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Dot() {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 rounded-full bg-current opacity-40"
    />
  );
}
