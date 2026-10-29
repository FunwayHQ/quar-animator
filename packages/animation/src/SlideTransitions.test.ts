import { describe, expect, it } from 'vitest';
import type { SlideTransitionType } from '@quar/types';

import { createTimeline } from './Timeline';
import { scopeTransition, withScopeTransition } from './TimelineScope';
import {
  DEFAULT_TRANSITION_EASING,
  DEFAULT_TRANSITION_SECONDS,
  MAX_TRANSITION_SECONDS,
  SLIDE_TRANSITION_TYPES,
  readSlideTransition,
  slideTransition,
  transitionEasing,
  transitionFrameCount,
  transitionMoves,
  transitionProgress,
  transitionSeconds,
  withSlidesTransition,
  withTransitionEasing,
} from './SlideTransitions';

describe('the transition into a slide', () => {
  const timeline = createTimeline({
    duration: 120,
    artboards: { a: { duration: 60, sounds: [] } },
  });
  const fade = { type: 'fade', duration: 0.5 } as const;

  it('is none until one is set, and the page’s own timeline never has one', () => {
    expect(scopeTransition(timeline, 'a')).toBeNull();
    expect(scopeTransition(timeline, 'unknown')).toBeNull();
    expect(scopeTransition(timeline, null)).toBeNull();
    expect(withScopeTransition(timeline, null, fade)).toBe(timeline);
  });

  it('is kept on the artboard’s timeline entry, beside its length and sounds', () => {
    const faded = withScopeTransition(timeline, 'a', fade);
    expect(faded.artboards?.a).toEqual({ duration: 60, sounds: [], transition: fade });
    expect(scopeTransition(faded, 'a')).toEqual(fade);
    // An artboard with no timing yet gets the page's length with it
    const other = withScopeTransition(timeline, 'b', fade);
    expect(other.artboards?.b).toEqual({ duration: 120, transition: fade });
    // A copy: changing what was passed in changes nothing
    expect(faded.artboards?.a?.transition).not.toBe(fade);
    // Taken off again
    expect(withScopeTransition(faded, 'a', null).artboards?.a).toEqual({
      duration: 60,
      sounds: [],
    });
    expect(timeline.artboards?.a?.transition).toBeUndefined();
  });

  it('goes on every slide at once (or comes off every one)', () => {
    const push = slideTransition('push');
    const all = withSlidesTransition(timeline, ['a', 'b', 'c'], push);
    expect(['a', 'b', 'c'].map((id) => scopeTransition(all, id))).toEqual([push, push, push]);
    const none = withSlidesTransition(all, ['a', 'b', 'c'], null);
    expect(['a', 'b', 'c'].map((id) => scopeTransition(none, id))).toEqual([null, null, null]);
  });
});

describe('making a transition', () => {
  it('lasts half a second once one is chosen, and moves left where it moves', () => {
    expect(slideTransition('fade')).toEqual({ type: 'fade', duration: DEFAULT_TRANSITION_SECONDS });
    expect(slideTransition('wipe')).toEqual({ type: 'wipe', direction: 'left', duration: 0.5 });
    expect(
      SLIDE_TRANSITION_TYPES.map((type: SlideTransitionType) => transitionMoves(type))
    ).toEqual([false, false, true, true, true]);
  });

  it('keeps the length, easing and direction of the one it replaces', () => {
    const was = { type: 'push', direction: 'up', duration: 1.2, easing: 'linear' } as const;
    expect(slideTransition('wipe', was)).toEqual({ ...was, type: 'wipe' });
    expect(slideTransition('fade', was)).toEqual({ type: 'fade', duration: 1.2, easing: 'linear' });
    // From one that doesn't move: left
    expect(slideTransition('push', { type: 'fade', duration: 2 })).toEqual({
      type: 'push',
      direction: 'left',
      duration: 2,
    });
  });

  it('eases in and out unless eased another way, the default kept as no easing', () => {
    const push = slideTransition('push');
    expect(transitionEasing(push)).toBe(DEFAULT_TRANSITION_EASING);
    const bouncing = withTransitionEasing(push, 'easeOutBounce');
    expect(bouncing).toEqual({ ...push, easing: 'easeOutBounce' });
    expect(transitionEasing(bouncing)).toBe('easeOutBounce');
    // Back to the default: the same transition as a new one
    expect(withTransitionEasing(bouncing, DEFAULT_TRANSITION_EASING)).toEqual(push);
    // A copy: what was passed in is unchanged
    expect(push).not.toHaveProperty('easing');
  });

  it('lasts between a tenth of a second and ten, to the hundredth', () => {
    expect(transitionSeconds(0)).toBe(0.1);
    expect(transitionSeconds(0.456)).toBe(0.46);
    expect(transitionSeconds(99)).toBe(MAX_TRANSITION_SECONDS);
    expect(transitionSeconds(Number.NaN)).toBe(DEFAULT_TRANSITION_SECONDS);
  });
});

describe('a transition from outside the editor', () => {
  it('is read as the editor can use it', () => {
    expect(readSlideTransition({ type: 'fade', duration: 0.75 })).toEqual({
      type: 'fade',
      duration: 0.75,
    });
    expect(
      readSlideTransition({ type: 'push', direction: 'down', duration: 1, easing: 'easeOutQuad' })
    ).toEqual({ type: 'push', direction: 'down', duration: 1, easing: 'easeOutQuad' });
  });

  it('leaves out what it gets wrong, or is none at all', () => {
    // A direction only where it moves (left where it's wrong), a known easing only
    expect(
      readSlideTransition({ type: 'fade', direction: 'up', duration: 1, easing: 'zoom' })
    ).toEqual({ type: 'fade', duration: 1 });
    expect(readSlideTransition({ type: 'wipe', direction: 'sideways', duration: 60 })).toEqual({
      type: 'wipe',
      direction: 'left',
      duration: MAX_TRANSITION_SECONDS,
    });
    for (const wrong of [
      null,
      'fade',
      { type: 'spin', duration: 1 },
      { type: 'fade' },
      { type: 'fade', duration: 0 },
      { type: 'fade', duration: '1' },
      { type: 'fade', duration: Number.POSITIVE_INFINITY },
    ]) {
      expect(readSlideTransition(wrong)).toBeNull();
    }
  });
});

describe('a transition’s frames and progress', () => {
  const half = { type: 'fade', duration: 0.5 } as const;

  it('lasts its length at the output’s frame rate and speed', () => {
    expect(transitionFrameCount(half, 30)).toBe(15);
    expect(transitionFrameCount(half, 25)).toBe(13);
    expect(transitionFrameCount(half, 30, 2)).toBe(8);
    expect(transitionFrameCount(half, 30, 0.5)).toBe(30);
    expect(transitionFrameCount(null, 30)).toBe(0);
    expect(transitionFrameCount({ type: 'fade', duration: 0 }, 30)).toBe(0);
  });

  it('eases in and out unless it says otherwise, from 0 to 1', () => {
    expect(transitionProgress(half, 0)).toBe(0);
    expect(transitionProgress(half, 1)).toBe(1);
    expect(transitionProgress(half, 0.5)).toBeCloseTo(0.5);
    // easeInOutCubic: slow at first
    expect(transitionProgress(half, 0.25)).toBeCloseTo(0.0625);
    expect(transitionProgress({ ...half, easing: 'linear' }, 0.25)).toBe(0.25);
    expect(transitionProgress(half, -1)).toBe(0);
    expect(transitionProgress(half, 2)).toBe(1);
  });
});
