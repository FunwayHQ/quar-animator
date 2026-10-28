import { describe, expect, it } from 'vitest';
import { frameAt, slideFor } from './presentation';

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
});
