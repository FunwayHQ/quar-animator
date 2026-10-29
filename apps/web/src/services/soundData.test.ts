/**
 * Sound clips read from a file or a paste from another window: what's
 * malformed left out, what plays kept — their speed and loop too.
 */

import { describe, expect, it } from 'vitest';
import { readSoundClips } from './soundData';

describe('readSoundClips', () => {
  it('keeps a clip’s speed and loop, where they’re right', () => {
    const base = { id: 'c', soundId: 's', start: 0, offset: 1, duration: 2, gain: 1 };
    expect(readSoundClips([{ ...base, speed: 2, loop: true, loopFor: 6 }])).toEqual([
      { ...base, speed: 2, loop: true, loopFor: 6 },
    ]);
    expect(
      readSoundClips([
        { ...base, speed: -1, loop: 'yes', loopFor: Number.NaN },
        { ...base, speed: 0 },
      ])
    ).toEqual([base, base]);
  });
});
