import { describe, expect, it } from 'vitest';
import type { SoundClip, VideoClip } from '@quar/types';
import {
  clipMomentAt,
  clipSeconds,
  clipSpeed,
  linkedSoundClip,
  movedVideoClip,
  videoClipEndFrame,
  videoPosterTime,
  videoTimeAt,
} from './VideoClips';
import { soundsPlayed } from './SoundClips';

const clip = (extra: Partial<VideoClip> = {}): VideoClip => ({
  start: 30,
  offset: 2,
  duration: 4,
  ...extra,
});

describe('video clips', () => {
  it('end where their part of the video ends, in frames', () => {
    expect(videoClipEndFrame(clip(), 30)).toBe(150);
    expect(videoClipEndFrame(clip({ duration: 1.01 }), 30)).toBeCloseTo(60.3);
  });

  it('show nothing before their start or from their end', () => {
    expect(videoTimeAt(clip(), 29, 30)).toBeNull();
    expect(videoTimeAt(clip(), 150, 30)).toBeNull();
    expect(videoTimeAt(clip(), Number.NaN, 30)).toBeNull();
  });

  it('show the moment of the video each frame begins at, trimmed front and all', () => {
    expect(videoTimeAt(clip(), 30, 30)).toBe(2);
    expect(videoTimeAt(clip(), 45, 30)).toBe(2.5);
    expect(videoTimeAt(clip(), 149, 30)).toBeCloseTo(5.9667, 4);
    // Between frames, as an export at another rate samples
    expect(videoTimeAt(clip(), 45.5, 30)).toBeCloseTo(2.5167, 4);
  });

  it('keep in step with their sound, which counts frames the same way', () => {
    const sound: SoundClip = { id: 's', soundId: 'a', start: 30, offset: 2, duration: 4, gain: 1 };
    const [play] = soundsPlayed([sound], 30, 45, 200, 1);
    // Playing from frame 45, the sound starts 0.5 s into its clip: where the picture is
    expect(play?.offset).toBeCloseTo(videoTimeAt(clip(), 45, 30) ?? -1);
  });

  it('show their first frame away from the timeline in view', () => {
    expect(videoPosterTime(clip())).toBe(2);
  });

  it('move a whole frame at a time, not before the first', () => {
    expect(movedVideoClip(clip(), 41.6).start).toBe(42);
    expect(movedVideoClip(clip(), -5).start).toBe(0);
    const same = clip();
    expect(movedVideoClip(same, 30)).toBe(same);
  });

  it('put their linked sound where they are, its level its own', () => {
    const sound: SoundClip = {
      id: 's',
      soundId: 'a',
      start: 0,
      offset: 0,
      duration: 10,
      gain: 0.5,
      fadeIn: 1,
      linkedTo: 'v',
    };
    expect(linkedSoundClip(sound, clip())).toEqual({
      ...sound,
      start: 30,
      offset: 2,
      duration: 4,
    });
    const there = linkedSoundClip(sound, clip());
    expect(linkedSoundClip(there, clip())).toBe(there);
  });
});

describe('speed, loops and held last frames', () => {
  it('play faster or slower, within 0.25× to 4×, at 1× without a (sensible) speed', () => {
    expect(clipSpeed({})).toBe(1);
    expect(clipSpeed({ speed: 2 })).toBe(2);
    expect(clipSpeed({ speed: 10 })).toBe(4);
    expect(clipSpeed({ speed: 0.1 })).toBe(0.25);
    expect(clipSpeed({ speed: -1 })).toBe(1);
    expect(clipSpeed({ speed: Number.NaN })).toBe(1);
  });

  it('last as long on the timeline as their part takes at their speed', () => {
    expect(clipSeconds(clip({ speed: 2 }))).toBe(2);
    expect(clipSeconds(clip({ speed: 0.5 }))).toBe(8);
    expect(videoClipEndFrame(clip({ speed: 2 }), 30)).toBe(90);
    // Twice as fast: frame 45 (0.5 s in) shows 1 s into the part
    expect(videoTimeAt(clip({ speed: 2 }), 45, 30)).toBe(3);
    expect(videoTimeAt(clip({ speed: 2 }), 90, 30)).toBeNull();
  });

  it('loop for as long as they’re made to, starting their part over', () => {
    const looped = clip({ loop: true, loopFor: 10 });
    expect(clipSeconds(looped)).toBe(10);
    expect(videoClipEndFrame(looped, 30)).toBe(330);
    // 5 s in: one pass of 4 s done, 1 s into the next
    expect(videoTimeAt(looped, 180, 30)).toBeCloseTo(3);
    expect(videoTimeAt(looped, 330, 30)).toBeNull();
    // Looped but not lengthened: one pass
    expect(clipSeconds(clip({ loop: true }))).toBe(4);
    // Looped at 2×: 2 s a pass
    expect(clipMomentAt(clip({ loop: true, loopFor: 10, speed: 2 }), 2.5)).toBeCloseTo(3);
  });

  it('show their last picture after they end when they hold it, nothing before them', () => {
    const held = clip({ holdLastFrame: true });
    expect(videoTimeAt(held, 29, 30)).toBeNull();
    expect(videoTimeAt(held, 150, 30)).toBeCloseTo(6, 5);
    expect(videoTimeAt(held, 1000, 30)).toBeLessThan(6);
    // A looped one holds where its last pass got to
    const loopedHeld = clip({ loop: true, loopFor: 5, holdLastFrame: true });
    expect(videoTimeAt(loopedHeld, 400, 30)).toBeCloseTo(3, 5);
    // An empty clip shows nothing, held or not
    expect(videoTimeAt(clip({ duration: 0, holdLastFrame: true }), 40, 30)).toBeNull();
  });

  it('give their linked sound their speed and loop, not their hold', () => {
    const sound: SoundClip = { id: 's', soundId: 'a', start: 0, offset: 0, duration: 4, gain: 1 };
    const linked = linkedSoundClip(
      sound,
      clip({ speed: 2, loop: true, loopFor: 9, holdLastFrame: true })
    );
    expect(linked).toMatchObject({ start: 30, offset: 2, speed: 2, loop: true, loopFor: 9 });
    expect(linked).not.toHaveProperty('holdLastFrame');
    // Speed and loop taken away again
    const back = linkedSoundClip(linked, clip());
    expect(back).not.toHaveProperty('speed');
    expect(back).not.toHaveProperty('loop');
    expect(back).not.toHaveProperty('loopFor');
  });
});
