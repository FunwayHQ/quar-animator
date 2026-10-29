import { describe, expect, it } from 'vitest';
import type { SoundClip } from '@quar/types';

import { createTimeline } from './Timeline';
import {
  clipEndFrame,
  clipFades,
  clipLevel,
  fadedClip,
  findSoundClip,
  lastSoundFrame,
  movedClip,
  playLevel,
  schedulePlayGain,
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

describe('clips at a speed and looped', () => {
  it('play a sped-up or slowed clip from its rendition at that speed, in its seconds', () => {
    // 4 s of the sound from 1 s in, twice as fast: 2 s of the timeline
    const [fast] = soundsPlayed([clip('a', 30, 4, { offset: 1, speed: 2 })], 30, 0, 299);
    expect(fast).toEqual({
      clipId: 'a',
      soundId: 's-a',
      at: 1,
      offset: 0.5,
      duration: 2,
      gain: 1,
      rate: 1,
      speed: 2,
    });
    // Half as fast: 2 s of it last 4 s, from 2 s into the slowed rendition
    const [slow] = soundsPlayed([clip('a', 0, 2, { offset: 1, speed: 0.5 })], 30, 0, 299);
    expect(slow).toMatchObject({ at: 0, offset: 2, duration: 4, speed: 0.5 });
    // A speed out of range plays at the nearest it can; 1× plays the sound itself
    expect(soundsPlayed([clip('a', 0, 2, { speed: 10 })], 30, 0, 299)[0]?.speed).toBe(4);
    expect(soundsPlayed([clip('a', 0, 2, { speed: 1 })], 30, 0, 299)[0]).not.toHaveProperty(
      'speed'
    );
  });

  it('play a sped-up clip from where it has got to, cut where the range ends', () => {
    // Frame 45 is half a second into a clip twice as fast: 1 s of its sound in, 0.5 s of its rendition
    const [play] = soundsPlayed([clip('a', 30, 4, { speed: 2 })], 30, 45, 59);
    expect(play).toMatchObject({ at: 0, offset: 0.5, duration: 0.5, speed: 2 });
  });

  it('play a looped clip a pass at a time, the last cut where the clip ends', () => {
    // Its 2 s from 1 s in, looped for 5 s
    const looped = clip('a', 0, 2, { offset: 1, loop: true, loopFor: 5 });
    const passes = soundsPlayed([looped], 30, 0, 299);
    expect(passes.map(({ at, offset, duration }) => ({ at, offset, duration }))).toEqual([
      { at: 0, offset: 1, duration: 2 },
      { at: 2, offset: 1, duration: 2 },
      { at: 4, offset: 1, duration: 1 },
    ]);
    // Looped but not lengthened: one pass
    expect(soundsPlayed([clip('b', 0, 2, { loop: true })], 30, 0, 299)).toHaveLength(1);
  });

  it('play a looped clip from the middle of a pass, and only the passes in the range', () => {
    const looped = clip('a', 0, 2, { offset: 1, loop: true, loopFor: 5 });
    // From 1.5 s (frame 45) to 4.5 s (frame 134)
    const passes = soundsPlayed([looped], 30, 45, 134);
    const shown = passes.map(({ at, offset, duration }) => ({ at, offset, duration }));
    expect(shown).toHaveLength(3);
    expect(shown[0]).toEqual({ at: 0, offset: 2.5, duration: 0.5 });
    expect(shown[1]).toEqual({ at: 0.5, offset: 1, duration: 2 });
    expect(shown[2]!.at).toBeCloseTo(2.5);
    expect(shown[2]!.offset).toBe(1);
    expect(shown[2]!.duration).toBeCloseTo(0.5);
  });

  it('loop at a speed: each pass its part of the rendition', () => {
    // 2 s of sound twice as fast is a 1 s pass, looped for 2.5 s
    const looped = clip('a', 0, 2, { offset: 1, speed: 2, loop: true, loopFor: 2.5 });
    const passes = soundsPlayed([looped], 30, 0, 299);
    expect(passes.map(({ at, offset, duration, speed }) => [at, offset, duration, speed])).toEqual([
      [0, 0.5, 1, 2],
      [1, 0.5, 1, 2],
      [2, 0.5, 0.5, 2],
    ]);
  });

  it('play at the timeline’s own speed too, pitched with it', () => {
    const looped = clip('a', 30, 2, { speed: 2, loop: true, loopFor: 2 });
    const passes = soundsPlayed([looped], 30, 0, 299, 2);
    // Its passes of 1 s from 1 s in, the timeline twice as fast: at 0.5 s and 1 s of the video
    expect(passes.map(({ at, duration, rate, speed }) => [at, duration, rate, speed])).toEqual([
      [0.5, 1, 2, 2],
      [1, 1, 2, 2],
    ]);
  });

  it('fade over the clip’s whole length on the timeline: in on its first pass, out on its last', () => {
    const looped = clip('a', 0, 2, { loop: true, loopFor: 5, fadeIn: 1, fadeOut: 1.5 });
    const [first, second, third] = soundsPlayed([looped], 30, 0, 299);
    expect(first!.levels).toEqual([
      { time: 0, level: 0 },
      { time: 1, level: 1 },
      { time: 2, level: 1 },
    ]);
    expect(second!.levels?.map(({ time, level }) => [time, +level.toFixed(4)])).toEqual([
      [0, 1],
      [1.5, 1],
      [2, 0.6667],
    ]);
    expect(third!.levels?.map(({ time, level }) => [time, +level.toFixed(4)])).toEqual([
      [0, 0.6667],
      [1, 0],
    ]);
  });

  it('fade a sped-up clip over its time on the timeline, the fades fitted to it', () => {
    // 4 s of sound twice as fast: 2 s long, so fades of 1.5 s each are 1 s each
    const fast = clip('a', 0, 4, { speed: 2, fadeIn: 1.5, fadeOut: 1.5 });
    expect(clipFades(fast)).toEqual({ fadeIn: 1, fadeOut: 1 });
    expect(clipLevel(fast, 0.5)).toBe(0.5);
    expect(clipLevel(fast, 1.5)).toBe(0.5);
    const [play] = soundsPlayed([fast], 30, 0, 299);
    expect(play!.levels).toEqual([
      { time: 0, level: 0 },
      { time: 1, level: 1 },
      { time: 2, level: 0 },
    ]);
    // Set within what's left of its time on the timeline
    expect(fadedClip(clip('b', 0, 4, { speed: 2 }), { fadeIn: 5 })).toMatchObject({ fadeIn: 2 });
  });

  it('end where their time on the timeline does, at their speed and looped', () => {
    expect(clipEndFrame(clip('a', 10, 3, { speed: 2 }), 30)).toBe(55);
    expect(clipEndFrame(clip('a', 10, 3, { speed: 0.5 }), 30)).toBe(190);
    expect(clipEndFrame(clip('a', 10, 3, { loop: true, loopFor: 4 }), 30)).toBe(130);
    expect(lastSoundFrame([clip('a', 0, 3, { speed: 2, loop: true, loopFor: 10 })], 30)).toBe(299);
    // Rows follow their length on the timeline: a sped-up clip leaves room after it
    const { rows } = soundRows([clip('a', 0, 4, { speed: 2 }), clip('b', 60, 1)], 30);
    expect(rows.get('b')).toBe(0);
  });
});

describe('fades', () => {
  it('rise from silence and fall to it, straight', () => {
    const faded = clip('a', 0, 4, { fadeIn: 1, fadeOut: 2 });
    expect([0, 0.5, 1, 2, 3, 4].map((t) => clipLevel(faded, t))).toEqual([0, 0.5, 1, 1, 0.5, 0]);
    expect(clipLevel(clip('b', 0, 4), 0)).toBe(1);
    expect(clipLevel(clip('b', 0, 4), 4)).toBe(1);
  });

  it('fit the clip: fades longer than it together are shortened alike', () => {
    expect(clipFades(clip('a', 0, 2, { fadeIn: 3, fadeOut: 1 }))).toEqual({
      fadeIn: 1.5,
      fadeOut: 0.5,
    });
    expect(clipFades(clip('a', 0, 2, { fadeIn: -1, fadeOut: NaN }))).toEqual({
      fadeIn: 0,
      fadeOut: 0,
    });
  });

  it('play as loudness through the part that plays', () => {
    const [whole] = soundsPlayed([clip('a', 0, 4, { fadeIn: 1, fadeOut: 2 })], 30, 0, 299);
    expect(whole!.levels).toEqual([
      { time: 0, level: 0 },
      { time: 1, level: 1 },
      { time: 2, level: 1 },
      { time: 4, level: 0 },
    ]);
    // Played from 1.5 s in to 3 s (frames 45–89): the fade out half done where it's cut
    const [part] = soundsPlayed([clip('a', 0, 4, { fadeIn: 1, fadeOut: 2 })], 30, 45, 89);
    expect(part!.levels).toEqual([
      { time: 0, level: 1 },
      { time: 0.5, level: 1 },
      { time: 1.5, level: 0.5 },
    ]);
    expect(playLevel(part!, 1)).toBe(0.75);
    // Without fades, nothing to ramp
    expect(soundsPlayed([clip('b', 0, 1)], 30, 0, 29)[0]).not.toHaveProperty('levels');
  });

  it('are set within what the other fade leaves, and taken off at 0', () => {
    const plain = clip('a', 0, 4);
    expect(fadedClip(plain, { fadeIn: 1 })).toMatchObject({ fadeIn: 1 });
    const both = fadedClip(fadedClip(plain, { fadeIn: 1 }), { fadeOut: 5 });
    expect(both).toMatchObject({ fadeIn: 1, fadeOut: 3 });
    expect(fadedClip(both, { fadeIn: 0 })).not.toHaveProperty('fadeIn');
    expect(fadedClip(plain, { fadeIn: -2 })).toBe(plain);
    expect(fadedClip(both, { fadeIn: 1 })).toBe(both);
  });

  it('are set on a gain as ramps, at the pace it plays, from where it starts', () => {
    const calls: string[] = [];
    const param = {
      value: 1,
      setValueAtTime: (v: number, t: number) => calls.push(`set ${v} @${t}`),
      linearRampToValueAtTime: (v: number, t: number) => calls.push(`ramp ${v} @${t}`),
    };
    const [play] = soundsPlayed(
      [clip('a', 0, 4, { fadeIn: 1, fadeOut: 2, gain: 0.5 })],
      30,
      0,
      299,
      2
    );
    schedulePlayGain(param, play!, 10);
    // Twice as fast: the 4 s clip over 2 s
    expect(calls).toEqual(['set 0 @10', 'ramp 0.5 @10.5', 'ramp 0.5 @11', 'ramp 0 @12']);

    calls.length = 0;
    schedulePlayGain(param, play!, 10, 3);
    expect(calls).toEqual(['set 0.25 @10', 'ramp 0 @10.5']);

    const plain = { ...param, value: 1 };
    schedulePlayGain(plain, soundsPlayed([clip('b', 0, 1, { gain: 0.3 })], 30, 0, 29)[0]!, 0);
    expect(plain.value).toBe(0.3);
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
