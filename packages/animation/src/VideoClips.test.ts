import { describe, expect, it } from 'vitest';
import type { SoundClip, VideoClip } from '@quar/types';
import {
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
