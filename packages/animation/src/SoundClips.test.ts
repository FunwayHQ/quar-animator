import { describe, expect, it } from 'vitest';
import type { SoundClip } from '@quar/types';

import { createTimeline } from './Timeline';
import {
  clipEndFrame,
  findSoundClip,
  lastSoundFrame,
  movedClip,
  soundIdsUsed,
  soundRows,
  soundsPlayed,
  trimmedEnd,
  trimmedStart,
  withSoundClip,
} from './SoundClips';
import { scopeSounds, scopedTimeline, withScopeSounds } from './TimelineScope';

function clip(id: string, start: number, duration: number, more: Partial<SoundClip> = {}) {
  return { id, soundId: `s-${id}`, start, offset: 0, duration, gain: 1, ...more };
}

describe('soundsPlayed', () => {
  it('plays a clip from its start, at its place on the timeline', () => {
    // 30 fps: frame 30 is one second in
    expect(soundsPlayed([clip('a', 30, 2)], 30, 0, 299)).toEqual([
      { clipId: 'a', soundId: 's-a', at: 1, offset: 0, duration: 2, gain: 1, rate: 1 },
    ]);
  });

  it('plays a clip already going from where it has got to', () => {
    const [play] = soundsPlayed([clip('a', 30, 2, { offset: 0.5 })], 30, 45, 299);
    expect(play).toMatchObject({ at: 0, offset: 1, duration: 1.5 });
  });

  it('cuts a clip where the range ends, and leaves out those outside it', () => {
    const plays = soundsPlayed(
      [clip('a', 0, 10), clip('b', 300, 1), clip('c', 0, 0.5)],
      30,
      30,
      59
    );
    // Frames 30–59 are seconds 1 to 2: a plays a second of itself, c is over, b not yet begun
    expect(plays).toEqual([
      { clipId: 'a', soundId: 's-a', at: 0, offset: 1, duration: 1, gain: 1, rate: 1 },
    ]);
  });

  it('leaves out muted and silent clips, and keeps each clip’s volume', () => {
    const plays = soundsPlayed(
      [
        clip('a', 0, 1, { muted: true }),
        clip('b', 0, 1, { gain: 0 }),
        clip('c', 0, 1, { gain: 0.25 }),
      ],
      30,
      0,
      29
    );
    expect(plays.map((play) => [play.clipId, play.gain])).toEqual([['c', 0.25]]);
  });

  it('plays faster with the timeline, pitched with it', () => {
    const [play] = soundsPlayed([clip('a', 60, 3)], 30, 0, 299, 2);
    // Two seconds of timeline in a second; the whole three seconds of sound in 1.5
    expect(play).toMatchObject({ at: 1, offset: 0, duration: 3, rate: 2 });
  });

  it('plays nothing without clips', () => {
    expect(soundsPlayed(undefined, 30, 0, 10)).toEqual([]);
  });
});

describe('a clip’s extent', () => {
  it('ends where its sound does, and the last frame sounding is the one it ends in', () => {
    expect(clipEndFrame(clip('a', 10, 1.5), 30)).toBe(55);
    expect(lastSoundFrame([clip('a', 10, 1.5), clip('b', 0, 0.5)], 30)).toBe(54);
    expect(lastSoundFrame([clip('a', 0, 1.01)], 30)).toBe(30);
    expect(lastSoundFrame([], 30)).toBe(-1);
  });
});

describe('moving and trimming', () => {
  it('moves to whole frames, never before the first', () => {
    expect(movedClip(clip('a', 10, 1), 14.6).start).toBe(15);
    expect(movedClip(clip('a', 10, 1), -8).start).toBe(0);
    const same = clip('a', 10, 1);
    expect(movedClip(same, 10)).toBe(same);
  });

  it('trims the start: skips the sound before the new start, the end staying put', () => {
    const trimmed = trimmedStart(clip('a', 30, 4), 60, 30);
    expect(trimmed).toMatchObject({ start: 60, offset: 1, duration: 3 });
    expect(clipEndFrame(trimmed, 30)).toBeCloseTo(150);
  });

  it('brings back trimmed sound, back to the sound’s beginning and no further', () => {
    const cut = clip('a', 60, 2, { offset: 1 });
    expect(trimmedStart(cut, 45, 30)).toMatchObject({ start: 45, offset: 0.5, duration: 2.5 });
    expect(trimmedStart(cut, 0, 30)).toMatchObject({ start: 30, offset: 0, duration: 3 });
    // A sound trimmed by more than its start is before the first frame: as far as frame 0
    expect(trimmedStart(clip('b', 10, 2, { offset: 1 }), -40, 30)).toMatchObject({ start: 0 });
  });

  it('leaves at least a frame when the start is trimmed past the end', () => {
    const trimmed = trimmedStart(clip('a', 0, 1), 500, 30);
    expect(trimmed.start).toBe(29);
    expect(trimmed.duration).toBeCloseTo(1 / 30);
  });

  it('trims the end to a frame, at least a frame long, not past the sound’s end', () => {
    expect(trimmedEnd(clip('a', 30, 4), 90, 30, 10).duration).toBe(2);
    expect(trimmedEnd(clip('a', 30, 4), 10, 30, 10).duration).toBeCloseTo(1 / 30);
    // A sound of 4.5 s played from 1 s in: 3.5 s of it left
    expect(trimmedEnd(clip('a', 30, 2, { offset: 1 }), 900, 30, 4.5).duration).toBe(3.5);
  });
});

describe('soundRows', () => {
  it('puts clips that play together one under another, the rest in the first row', () => {
    const { rows, count } = soundRows(
      [clip('a', 0, 2), clip('b', 30, 2), clip('c', 60, 1), clip('d', 100, 1)],
      30
    );
    // a: 0–60, b: 30–90 (over a), c: 60–90 (a's done), d: 100–130
    expect(Object.fromEntries(rows)).toEqual({ a: 0, b: 1, c: 0, d: 0 });
    expect(count).toBe(2);
  });

  it('has a row with no clips', () => {
    expect(soundRows([], 30).count).toBe(1);
  });
});

describe('clips on a page’s timelines', () => {
  const timeline = createTimeline({
    duration: 120,
    sounds: [clip('loose', 0, 1)],
    artboards: { a: { duration: 60, sounds: [clip('in-a', 5, 1)] } },
  });

  it('keeps each timeline’s own sounds, and plays an artboard with its sounds', () => {
    expect(scopeSounds(timeline, null).map((c) => c.id)).toEqual(['loose']);
    expect(scopeSounds(timeline, 'a').map((c) => c.id)).toEqual(['in-a']);
    expect(scopeSounds(timeline, 'b')).toEqual([]);
    expect(scopedTimeline(timeline, 'a', () => true).sounds?.map((c) => c.id)).toEqual(['in-a']);
    expect(scopedTimeline(timeline, 'b', () => true).sounds).toBeUndefined();
    expect(scopedTimeline(timeline, null, () => true).sounds?.map((c) => c.id)).toEqual(['loose']);
  });

  it('gives an artboard with no timing yet the page’s length with its first sound', () => {
    const added = withScopeSounds(timeline, 'b', [clip('in-b', 0, 1)]);
    expect(added.artboards?.b).toEqual({ duration: 120, sounds: [clip('in-b', 0, 1)] });
    expect(added.artboards?.a).toBe(timeline.artboards?.a);
  });

  it('finds, changes and takes out a clip on whichever timeline it is', () => {
    expect(findSoundClip(timeline, 'in-a')?.scope).toBe('a');
    expect(findSoundClip(timeline, 'loose')?.scope).toBeNull();
    expect(findSoundClip(timeline, 'nope')).toBeNull();

    const moved = withSoundClip(timeline, 'in-a', (c) => movedClip(c, 20));
    expect(scopeSounds(moved, 'a')[0]?.start).toBe(20);
    expect(moved.sounds).toBe(timeline.sounds);
    expect(withSoundClip(timeline, 'in-a', (c) => c)).toBe(timeline);

    const removed = withSoundClip(timeline, 'loose', () => null);
    expect(removed.sounds).toEqual([]);
  });

  it('lists the sounds the clips play', () => {
    expect([...soundIdsUsed(timeline)].sort()).toEqual(['s-in-a', 's-loose']);
  });
});
