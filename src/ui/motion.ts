import { useReducedMotion } from 'motion/react';
import type { Transition, Variants } from 'motion/react';
import { ANCHOR_COLLAPSE_MS, ANCHOR_EXPAND_MS } from '@/lib/geometry';
import { useSettingsStore } from '@/stores/settings';

/** Motion presets (docs/ui-ux.md §5). Import from here only. */

export const spring: Transition = { type: 'spring', stiffness: 400, damping: 30, mass: 1 };

export const durations = {
  /** Hover states, toggles. */
  fast: 0.12,
  /** Cross-fades, row enter/exit. */
  base: 0.2,
  /** Panel hide. */
  exit: 0.16,
} as const;

/** Tab → pill chrome width inside the fixed anchor window (180 ms ease-out cubic). */
export const expand: Transition = {
  type: 'tween',
  duration: ANCHOR_EXPAND_MS / 1000,
  ease: [0.33, 1, 0.68, 1],
};

/** Pill → tab chrome width (150 ms ease-in cubic). */
export const collapse: Transition = {
  type: 'tween',
  duration: ANCHOR_COLLAPSE_MS / 1000,
  ease: [0.32, 0, 0.67, 0],
};

/** 35 ms between children, applied by a parent with `staggerContainer`. */
export const STAGGER_S = 0.035;
export const STAGGER_MAX_CHILDREN = 8;

export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_S, delayChildren: 0 } },
  exit: {},
};

export const slideInRight: Variants = {
  hidden: { x: 24, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: spring },
  exit: { x: 12, opacity: 0, transition: { duration: durations.exit, ease: 'easeIn' } },
};

export const fadeUp: Variants = {
  hidden: { y: 8, opacity: 0 },
  visible: { y: 0, opacity: 1, transition: { duration: durations.base, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.base } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};

export const scaleIn: Variants = {
  hidden: { scale: 0.6, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: spring },
  exit: { scale: 0.6, opacity: 0, transition: { duration: durations.fast } },
};

/** Quick opacity-only crossfade (tab ↔ toolbar chrome swap). Same under reduced motion. */
export const fadeFast: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: durations.fast } },
  exit: { opacity: 0, transition: { duration: durations.fast } },
};

/** Reduced-motion equivalents: opacity only, fast, no stagger. */
const reducedFade: Variants = fadeFast;
const reducedInstant: Variants = {
  hidden: { opacity: 1 },
  visible: { opacity: 1, transition: { duration: 0 } },
  exit: { opacity: 0, transition: { duration: 0 } },
};
const reducedContainer: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0 } }, exit: {} };

export interface MotionPresets {
  reduced: boolean;
  spring: Transition;
  expand: Transition;
  collapse: Transition;
  slideInRight: Variants;
  fadeUp: Variants;
  fade: Variants;
  fadeFast: Variants;
  scaleIn: Variants;
  staggerContainer: Variants;
}

/**
 * Presets that honour the OS reduced-motion preference and the Settings toggle.
 * Every animated component reads its variants from here.
 */
export function useMotionPresets(): MotionPresets {
  const osReduced = useReducedMotion() ?? false;
  const motionPref = useSettingsStore((s) => s.settings.motion);
  const reduced = osReduced || motionPref === 'reduced';
  if (reduced) {
    return {
      reduced,
      spring: { duration: durations.fast },
      expand: { duration: durations.fast },
      collapse: { duration: durations.fast },
      slideInRight: reducedFade,
      fadeUp: reducedFade,
      fade: reducedFade,
      fadeFast,
      scaleIn: reducedInstant,
      staggerContainer: reducedContainer,
    };
  }
  return {
    reduced,
    spring,
    expand,
    collapse,
    slideInRight,
    fadeUp,
    fade,
    fadeFast,
    scaleIn,
    staggerContainer,
  };
}
