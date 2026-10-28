/**
 * Slide Transitions
 * How one of the page's artboards gives way to the next when they play as
 * slides (the presentation player, slides exports): the kinds there are, a
 * transition made, read from outside the editor or put on every slide, how
 * many frames one lasts and how far it has got at a moment.
 */

import type {
  EasingType,
  SlideTransition,
  SlideTransitionDirection,
  SlideTransitionType,
  Timeline,
} from '@quar/types';
import { applyEasing, getEasingTypes } from './Easing';
import { withScopeTransition } from './TimelineScope';

/** The kinds of transition, in the order they're offered. */
export const SLIDE_TRANSITION_TYPES: readonly SlideTransitionType[] = [
  'fade',
  'fade-through',
  'push',
  'slide-over',
  'wipe',
];

/** The ways a push, slide-over or wipe moves. */
export const SLIDE_TRANSITION_DIRECTIONS: readonly SlideTransitionDirection[] = [
  'left',
  'right',
  'up',
  'down',
];

/** How long a transition takes once one is chosen, in seconds. */
export const DEFAULT_TRANSITION_SECONDS = 0.5;
/** The shortest and longest a transition can take, in seconds. */
export const MIN_TRANSITION_SECONDS = 0.1;
export const MAX_TRANSITION_SECONDS = 10;
/** How a transition's progress eases when it doesn't say. */
export const DEFAULT_TRANSITION_EASING: EasingType = 'easeInOutCubic';

/** Whether a kind of transition moves one way (push, slide-over, wipe) and so has a direction. */
export function transitionMoves(type: SlideTransitionType): boolean {
  return type === 'push' || type === 'slide-over' || type === 'wipe';
}

/** The way a transition moves: its own, or left. */
export function transitionDirection(transition: SlideTransition): SlideTransitionDirection {
  return transition.direction ?? 'left';
}

/** A length in seconds a transition can have: within its bounds, to a hundredth. */
export function transitionSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_TRANSITION_SECONDS;
  const kept = Math.min(MAX_TRANSITION_SECONDS, Math.max(MIN_TRANSITION_SECONDS, seconds));
  return Math.round(kept * 100) / 100;
}

/**
 * A transition of a kind, taking what it can of the one it replaces (its
 * length and easing; its direction, when both move): otherwise half a second,
 * eased in and out, leftwards.
 */
export function slideTransition(
  type: SlideTransitionType,
  was?: SlideTransition | null
): SlideTransition {
  return {
    type,
    ...(transitionMoves(type)
      ? { direction: was?.direction && transitionMoves(was.type) ? was.direction : 'left' }
      : {}),
    duration: was ? transitionSeconds(was.duration) : DEFAULT_TRANSITION_SECONDS,
    ...(was?.easing ? { easing: was.easing } : {}),
  };
}

const EASINGS = new Set<string>(getEasingTypes());

/**
 * A transition from outside the editor (a file, layers pasted from another
 * window) as the editor can use it: a known kind and a length, a direction
 * only where it moves, an easing only if it's one there is. Null otherwise.
 */
export function readSlideTransition(value: unknown): SlideTransition | null {
  if (typeof value !== 'object' || value === null) return null;
  const { type, direction, duration, easing } = value as Partial<Record<string, unknown>>;
  if (!SLIDE_TRANSITION_TYPES.includes(type as SlideTransitionType)) return null;
  if (typeof duration !== 'number' || !Number.isFinite(duration) || !(duration > 0)) return null;
  const kind = type as SlideTransitionType;
  return {
    type: kind,
    ...(transitionMoves(kind)
      ? {
          direction: SLIDE_TRANSITION_DIRECTIONS.includes(direction as SlideTransitionDirection)
            ? (direction as SlideTransitionDirection)
            : 'left',
        }
      : {}),
    duration: transitionSeconds(duration),
    ...(typeof easing === 'string' && EASINGS.has(easing) ? { easing: easing as EasingType } : {}),
  };
}

/** The timeline with this transition (or none) into each of these artboards' slides. */
export function withSlidesTransition(
  timeline: Timeline,
  artboardIds: readonly string[],
  transition: SlideTransition | null
): Timeline {
  return artboardIds.reduce((result, id) => withScopeTransition(result, id, transition), timeline);
}

/** How many frames a transition lasts at `fps`, played at `speed` (as the slides around it are). */
export function transitionFrameCount(
  transition: SlideTransition | null | undefined,
  fps: number,
  speed = 1
): number {
  if (!transition || !(transition.duration > 0)) return 0;
  const pace = Number.isFinite(speed) && speed > 0 ? speed : 1;
  return Math.max(0, Math.round((transition.duration / pace) * Math.max(1, fps)));
}

/**
 * How far a transition has got, eased, `raw` of the way through it (0 —
 * all the outgoing slide — to 1, all the incoming one).
 */
export function transitionProgress(transition: SlideTransition, raw: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(raw) ? raw : 0));
  return applyEasing(t, transition.easing ?? DEFAULT_TRANSITION_EASING);
}
