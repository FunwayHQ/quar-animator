import { describe, expect, it } from 'vitest';
import { frameAt, moveFor, slideFor, transitionAt, transitionFor } from './presentation';

describe('a slide’s frame', () => {
  it('follows the clock in whole frames, holding on the last', () => {
    expect(frameAt(0, 30, 90)).toBe(0);
    expect(frameAt(1000, 30, 90)).toBe(30);
    expect(frameAt(1049, 30, 90)).toBe(31);
    expect(frameAt(60_000, 30, 90)).toBe(89);
    expect(frameAt(500, 30, 0)).toBe(0);
  });
});

describe('moving between slides', () => {
  it('goes on with ↓ and Page Down, back with ↑ and Page Up, no further than the ends', () => {
    expect(slideFor('ArrowDown', 0, 3)).toBe(1);
    expect(slideFor('PageDown', 2, 3)).toBe(2);
    expect(slideFor('ArrowUp', 2, 3)).toBe(1);
    expect(slideFor('PageUp', 0, 3)).toBe(0);
    expect(slideFor('Home', 2, 3)).toBe(0);
    expect(slideFor('End', 0, 3)).toBe(2);
    expect(slideFor('ArrowLeft', 1, 3)).toBeNull();
    expect(slideFor(' ', 1, 3)).toBeNull();
  });

  it('starts the first slide over with ↑, Page Up or Home there; the others go back', () => {
    expect(moveFor('ArrowUp', 0, 3)).toEqual({ to: 0, again: true });
    expect(moveFor('PageUp', 0, 3)).toEqual({ to: 0, again: true });
    expect(moveFor('Home', 0, 3)).toEqual({ to: 0, again: true });
    // A deck of one: its only slide
    expect(moveFor('ArrowUp', 0, 1)).toEqual({ to: 0, again: true });
    expect(moveFor('ArrowUp', 2, 3)).toEqual({ to: 1, again: false });
    expect(moveFor('PageUp', 1, 3)).toEqual({ to: 0, again: false });
    expect(moveFor('Home', 2, 3)).toEqual({ to: 0, again: false });
    // Going on from the last keeps it as it is
    expect(moveFor('ArrowDown', 2, 3)).toEqual({ to: 2, again: false });
    expect(moveFor('End', 2, 3)).toEqual({ to: 2, again: false });
    expect(moveFor('ArrowDown', 0, 1)).toEqual({ to: 0, again: false });
    expect(moveFor('ArrowLeft', 0, 3)).toBeNull();
  });
});

describe('the transition into a slide', () => {
  const fade = { type: 'fade', duration: 0.5 } as const;

  it('plays going on to the next slide with ↓ or Page Down, and only then', () => {
    expect(transitionFor('ArrowDown', 0, 1, fade)).toBe(fade);
    expect(transitionFor('PageDown', 1, 2, fade)).toBe(fade);
    // Back, a jump, or starting over: a cut
    expect(transitionFor('ArrowUp', 2, 1, fade)).toBeNull();
    expect(transitionFor('End', 0, 1, fade)).toBeNull();
    expect(transitionFor('End', 0, 3, fade)).toBeNull();
    expect(transitionFor('ArrowDown', 2, 2, fade)).toBeNull();
    expect(transitionFor('ArrowDown', 0, 1, null)).toBeNull();
    expect(transitionFor('ArrowDown', 0, 1, { ...fade, duration: 0 })).toBeNull();
  });

  it('runs its length, eased, then is over', () => {
    expect(transitionAt(0, fade)).toEqual({ progress: 0, done: false });
    expect(transitionAt(250, fade).progress).toBeCloseTo(0.5);
    // easeInOutCubic: a quarter of the way through, a sixteenth of the change
    expect(transitionAt(125, fade).progress).toBeCloseTo(0.0625);
    expect(transitionAt(499, fade).done).toBe(false);
    expect(transitionAt(500, fade)).toEqual({ progress: 1, done: true });
    expect(transitionAt(-40, fade).progress).toBe(0);
  });
});
