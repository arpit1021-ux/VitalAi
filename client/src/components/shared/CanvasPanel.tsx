import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { rise, transition, durations, prefersReducedMotion } from '@/lib/motion';

interface CanvasPanelProps {
  children: ReactNode;
  /**
   * Where the warm bloom sits. `left` suits a panel whose content starts at the
   * left edge; `right` fills the space beside a short heading so a wide panel
   * does not read as mostly empty.
   */
  glow?: 'left' | 'right' | 'none';
  className?: string;
  as?: 'header' | 'section' | 'div';
}

/**
 * A dark block with warm light falling across it.
 *
 * The light is the one piece of atmosphere in the product and it does real
 * work: a flat dark rectangle at the top of a page is a slab, and on a wide
 * screen the empty half of it reads as something failing to load. The bloom
 * gives the panel a centre of gravity and a direction.
 *
 * It is `aria-hidden` and sits behind the content at `z-0`; children are
 * raised to `z-10` so nothing is swallowed by it.
 */
export function CanvasPanel({ children, glow = 'right', className, as = 'section' }: CanvasPanelProps) {
  const Element = motion[as];
  const reduced = prefersReducedMotion();

  return (
    <Element
      variants={rise}
      initial="hidden"
      animate="visible"
      transition={transition(durations.enter)}
      className={cn(
        'relative isolate overflow-hidden rounded-xl bg-canvas shadow-lift',
        'px-5 py-7 sm:px-8 sm:py-9',
        className,
      )}
    >
      {glow !== 'none' && (
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 1.2, ease: [0.2, 0, 0, 1] }}
          className={cn(
            'pointer-events-none absolute -z-10 h-[34rem] w-[34rem] rounded-full blur-3xl',
            glow === 'right' ? '-right-24 -top-48 sm:-right-10' : '-left-32 -top-52',
          )}
          style={{
            background:
              'radial-gradient(circle, rgba(232,148,99,0.24) 0%, rgba(143,217,182,0.14) 42%, rgba(22,33,27,0) 70%)',
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
    </Element>
  );
}
