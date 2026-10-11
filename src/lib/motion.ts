import type { Transition, Variants } from 'framer-motion';

/**
 * Apple-fluid motion tuning (WWDC 2018 *Designing Fluid Interfaces*):
 * critically-damped springs (bounce: 0) for UI elements the user didn't
 * throw — they arrive smoothly without overshoot. A slight bounce only
 * for items that carry visual momentum (list reorder, deletion).
 */
export const springs = {
  /** Default UI settle — buttons, toggles, card hover/press. */
  default: { type: 'spring', bounce: 0, duration: 0.35 } as Transition,
  /** Faster feedback for press/tap and small controls. */
  snappy: { type: 'spring', bounce: 0, duration: 0.25 } as Transition,
  /** Larger surfaces — panels, cards, drawers. */
  gentle: { type: 'spring', bounce: 0, duration: 0.4 } as Transition,
  /** Items that enter/exit with visual momentum (clipboard list). */
  momentum: { type: 'spring', bounce: 0.15, duration: 0.4 } as Transition,
};

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: -40, scale: 0.95 },
  hover: { y: -1, scale: 1 },
  tap: { scale: 0.98 },
};

export const windowVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

/** Shared-layout indicator that slides between tabs/filters. */
export const indicatorVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
