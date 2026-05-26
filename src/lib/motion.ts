import type { Transition, Variants } from 'framer-motion';

export const springs = {
  default: { type: 'spring', stiffness: 400, damping: 30 } as Transition,
  snappy: { type: 'spring', stiffness: 500, damping: 35 } as Transition,
  gentle: { type: 'spring', stiffness: 300, damping: 28 } as Transition,
};

export const cardVariants: Variants = {
  initial: { opacity: 0, y: 8, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: 60, scale: 0.95 },
  hover: { y: -1, scale: 1 },
  tap: { scale: 0.98 },
};

export const windowVariants: Variants = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
};
