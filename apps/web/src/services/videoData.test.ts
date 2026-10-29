import { describe, expect, it } from 'vitest';
import { readVideoClip } from './videoData';

describe('a video clip read from a file', () => {
  it('keeps its speed, loop and held last frame', () => {
    expect(
      readVideoClip({
        start: 12,
        offset: 1,
        duration: 3,
        speed: 2,
        loop: true,
        loopFor: 9,
        holdLastFrame: true,
      })
    ).toEqual({
      start: 12,
      offset: 1,
      duration: 3,
      speed: 2,
      loop: true,
      loopFor: 9,
      holdLastFrame: true,
    });
  });

  it('leaves out what a file got wrong, and anything else it holds', () => {
    expect(
      readVideoClip({
        start: 12.4,
        offset: -1,
        duration: 3,
        speed: 'fast',
        loop: 'yes',
        loopFor: -2,
        holdLastFrame: 1,
        extra: { big: true },
      })
    ).toEqual({ start: 12, offset: 0, duration: 3 });
  });
});
