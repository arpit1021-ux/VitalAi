import type { Transition, Variants } from 'framer-motion';

/**
 * Whether this person has asked their system to reduce motion.
 *
 * Read at call time rather than cached: someone can change the setting while
 * the tab is open, and a cached `false` would keep animating at them.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const EASE = [0.2, 0, 0, 1] as const;

export const durations = {
  micro: 0.12,
  enter: 0.22,
  page: 0.32,
} as const;

export function transition(duration: number = durations.enter): Transition {
  return prefersReducedMotion()
    ? { duration: 0 }
    : { duration, ease: EASE };
}

/**
 * The house entrance: content rises a little as it fades in.
 *
 * Eight pixels, not twenty. The previous twenty-pixel rise on every card meant
 * the whole page visibly reassembled itself on each navigation, which is
 * theatre rather than feedback.
 */
export const rise: Variants = {
  hidden: { opacity: 0, y: prefersReducedMotion() ? 0 : 8 },
  visible: { opacity: 1, y: 0 },
};

/** Children enter in sequence rather than all at once. */
export function stagger(gap = 0.04): Variants {
  return {
    hidden: {},
    visible: {
      transition: prefersReducedMotion() ? { staggerChildren: 0 } : { staggerChildren: gap },
    },
  };
}

/**
 * Wizard and route steps: the outgoing step leaves the way the incoming one
 * arrives, so the direction of travel is legible.
 */
export function step(direction: 1 | -1): Variants {
  const distance = prefersReducedMotion() ? 0 : 24 * direction;
  return {
    hidden: { opacity: 0, x: distance },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -distance },
  };
}
