import { describe, expect, it } from 'vitest';
import type { SoundClip, VideoClip } from '@quar/types';
import {
  clipMomentAt,
  clipSeconds,
  clipSpeed,
  lastVideoFrame,
  linkedSoundClip,
  movedVideoClip,
  trimmedVideoEnd,
  trimmedVideoStart,
  videoClipEndFrame,
  videoPosterTime,
  videoTimeAt,
  withClipSpeed,
  withHold,
  withLoop,
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
    expect(videoTimeAt(held, 150, 30)).toBeCloseTo(6, 3);
    expect(videoTimeAt(held, 1000, 30)).toBeLessThan(6);
    // A looped one holds where its last pass got to
    const loopedHeld = clip({ loop: true, loopFor: 5, holdLastFrame: true });
    expect(videoTimeAt(loopedHeld, 400, 30)).toBeCloseTo(3, 3);
    // An empty clip shows nothing, held or not
    expect(videoTimeAt(clip({ duration: 0, holdLastFrame: true }), 40, 30)).toBeNull();
  });

  it('hold the picture their part ends on, not the one after it', () => {
    // The frame source nudges each moment on by 1e-5 s, so a frame boundary lands
    // in the frame it begins: the held moment is further than that inside the last
    const NUDGE = 1e-5;
    for (const speed of [0.25, 1, 4]) {
      const held = videoTimeAt(clip({ speed, holdLastFrame: true }), 2000, 30) ?? 0;
      expect(held + NUDGE).toBeLessThan(6);
      expect(held).toBeGreaterThan(6 - 1 / 30);
      // Looped for a whole number of passes: the end of the last, not the start of the next
      const passes = (4 / speed) * 3;
      const looped = clip({ speed, loop: true, loopFor: passes, holdLastFrame: true });
      const last = videoTimeAt(looped, 5000, 30) ?? 0;
      expect(last + NUDGE).toBeLessThan(6);
      expect(last).toBeGreaterThan(6 - 1 / 30);
    }
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

describe('trimming a clip', () => {
  it('trims its start, the video before it skipped, its end where it was', () => {
    const trimmed = trimmedVideoStart(clip(), 60, 30);
    expect(trimmed).toEqual({ start: 60, offset: 3, duration: 3 });
    expect(videoClipEndFrame(trimmed, 30)).toBeCloseTo(150);
    // The same clip when it stays put
    const same = clip();
    expect(trimmedVideoStart(same, 30.2, 30)).toBe(same);
  });

  it('trims its start at its speed: a frame is more of the video when it’s faster', () => {
    // 2×: 60 frames long (30 to 90); 15 frames on is 1 s of the video
    const fast = trimmedVideoStart(clip({ speed: 2 }), 45, 30);
    expect(fast).toEqual({ start: 45, offset: 3, duration: 3, speed: 2 });
    expect(videoClipEndFrame(fast, 30)).toBeCloseTo(90);
    // 0.25×: 480 frames long; 30 frames on is a quarter of a second
    const slow = trimmedVideoStart(clip({ speed: 0.25 }), 60, 30);
    expect(slow).toMatchObject({ start: 60, offset: 2.25, duration: 3.75 });
    expect(videoClipEndFrame(slow, 30)).toBeCloseTo(510);
    // 4×: 30 frames long; 3 frames on is 0.4 s
    const quick = trimmedVideoStart(clip({ speed: 4 }), 33, 30);
    expect(quick.offset).toBeCloseTo(2.4);
    expect(quick.duration).toBeCloseTo(3.6);
  });

  it('brings trimmed video back, as far as the file’s start and the first frame', () => {
    // 2 s trimmed off at 0.5× is 120 frames: from frame 150 back to 30
    const slow = clip({ start: 150, speed: 0.5 });
    expect(trimmedVideoStart(slow, 0, 30)).toMatchObject({ start: 30, offset: 0, duration: 6 });
    // At 2× they’d be 30 frames before frame 30: as far as frame 0
    expect(trimmedVideoStart(clip({ speed: 2 }), -100, 30)).toMatchObject({
      start: 0,
      offset: 0,
      duration: 6,
    });
  });

  it('leaves at least a frame when its start is trimmed past its end', () => {
    // 1.01 s ends at frame 60.3: frame 59 is its last
    const short = trimmedVideoStart(clip({ duration: 1.01 }), 500, 30);
    expect(short.start).toBe(59);
    expect(short.duration).toBeCloseTo(1.01 - 29 / 30);
    expect(videoClipEndFrame(short, 30)).toBeCloseTo(60.3);
    // 1 s at 4× is 7.5 frames: from 30 to 37.5, frame 36 its last
    const quick = trimmedVideoStart(clip({ duration: 1, speed: 4 }), 100, 30);
    expect(quick.start).toBe(36);
    expect(quick.duration).toBeCloseTo(0.2);
    expect(videoClipEndFrame(quick, 30)).toBeCloseTo(37.5);
  });

  it('trims a looped clip’s first pass, its end staying where it is', () => {
    const looped = clip({ loop: true, loopFor: 10 });
    const trimmed = trimmedVideoStart(looped, 60, 30);
    expect(trimmed).toMatchObject({ start: 60, offset: 3, duration: 3, loop: true, loopFor: 9 });
    expect(videoClipEndFrame(trimmed, 30)).toBeCloseTo(330);
    // No further than a frame short of the first pass’s end (frame 150)
    const most = trimmedVideoStart(looped, 400, 30);
    expect(most.start).toBe(149);
    expect(most.duration).toBeCloseTo(1 / 30);
    expect(videoClipEndFrame(most, 30)).toBeCloseTo(330);
    // Looped but not lengthened: one pass, ending where it did
    const once = trimmedVideoStart(clip({ loop: true }), 60, 30);
    expect(once).not.toHaveProperty('loopFor');
    expect(videoClipEndFrame(once, 30)).toBeCloseTo(150);
    // Looped shorter than a pass: no further than its end
    expect(trimmedVideoStart(clip({ loop: true, loopFor: 1 }), 400, 30).start).toBe(59);
  });

  it('keeps holding its last frame as it’s trimmed', () => {
    expect(trimmedVideoStart(clip({ holdLastFrame: true }), 60, 30).holdLastFrame).toBe(true);
    expect(trimmedVideoEnd(clip({ holdLastFrame: true }), 90, 30, 10).holdLastFrame).toBe(true);
  });

  it('trims its end to a frame, at least a frame long, not past the video’s end', () => {
    expect(trimmedVideoEnd(clip(), 90, 30, 10)).toEqual({ start: 30, offset: 2, duration: 2 });
    expect(trimmedVideoEnd(clip(), 90.4, 30, 10).duration).toBe(2);
    expect(trimmedVideoEnd(clip(), 10, 30, 10).duration).toBeCloseTo(1 / 30);
    // A 10 s video played from 2 s in: 8 s of it left
    expect(trimmedVideoEnd(clip(), 900, 30, 10).duration).toBe(8);
    const same = clip();
    expect(trimmedVideoEnd(same, 150, 30, 10)).toBe(same);
  });

  it('trims its end at its speed', () => {
    // 2×: 30 frames are 2 s of the video; the 8 s left last 120 frames
    expect(trimmedVideoEnd(clip({ speed: 2 }), 60, 30, 10).duration).toBe(2);
    const longest = trimmedVideoEnd(clip({ speed: 2 }), 900, 30, 10);
    expect(longest.duration).toBe(8);
    expect(videoClipEndFrame(longest, 30)).toBe(150);
    // 0.25×: a frame is 1/120 s of the video
    expect(trimmedVideoEnd(clip({ speed: 0.25 }), 60, 30, 10).duration).toBe(0.25);
    expect(trimmedVideoEnd(clip({ speed: 0.25 }), 0, 30, 10).duration).toBeCloseTo(1 / 120);
    // 4×: the 8 s left last 2 s, ending on frame 90
    expect(videoClipEndFrame(trimmedVideoEnd(clip({ speed: 4 }), 900, 30, 10), 30)).toBe(90);
  });

  it('lengthens a looped clip past the video’s end, its pass as it was', () => {
    const looped = trimmedVideoEnd(clip({ loop: true }), 600, 30, 10);
    expect(looped).toEqual({ start: 30, offset: 2, duration: 4, loop: true, loopFor: 19 });
    expect(videoClipEndFrame(looped, 30)).toBe(600);
    // As short as a frame, at any speed
    expect(trimmedVideoEnd(clip({ loop: true, speed: 2 }), 10, 30, 10).loopFor).toBeCloseTo(1 / 30);
    // A whole frame
    expect(trimmedVideoEnd(clip({ loop: true }), 100.6, 30, 10).loopFor).toBeCloseTo(71 / 30);
  });
});

describe('a clip’s speed, loop and hold set', () => {
  it('plays at a speed from where it starts, ending sooner or later', () => {
    const fast = withClipSpeed(clip(), 2);
    expect(fast).toEqual({ start: 30, offset: 2, duration: 4, speed: 2 });
    expect(videoClipEndFrame(fast, 30)).toBe(90);
    expect(videoClipEndFrame(withClipSpeed(clip(), 0.5), 30)).toBe(270);
    // Back to 1×: no speed of its own
    expect(withClipSpeed(fast, 1)).toEqual(clip());
  });

  it('keeps its speed within 0.25× to 4×, and ignores a wrong one', () => {
    expect(withClipSpeed(clip(), 10).speed).toBe(4);
    expect(withClipSpeed(clip(), 0.1).speed).toBe(0.25);
    const same = clip({ speed: 2 });
    expect(withClipSpeed(same, 2)).toBe(same);
    expect(withClipSpeed(same, Number.NaN)).toBe(same);
    expect(withClipSpeed(same, 0)).toBe(same);
    expect(withClipSpeed(same, -1)).toBe(same);
  });

  it('keeps a looped clip as long as it was made at another speed', () => {
    const looped = withClipSpeed(clip({ loop: true, loopFor: 10 }), 2);
    expect(looped.loopFor).toBe(10);
    expect(videoClipEndFrame(looped, 30)).toBe(330);
  });

  it('loops for a pass until it’s lengthened, and stops looping', () => {
    const looped = withLoop(clip(), true);
    expect(looped).toEqual({ ...clip(), loop: true });
    expect(videoClipEndFrame(looped, 30)).toBe(150);
    expect(withLoop(looped, true)).toBe(looped);
    // Its length goes with its looping
    expect(withLoop(clip({ loop: true, loopFor: 10 }), false)).toEqual(clip());
    const plain = clip();
    expect(withLoop(plain, false)).toBe(plain);
  });

  it('holds its last frame, or doesn’t', () => {
    const held = withHold(clip(), true);
    expect(held).toEqual({ ...clip(), holdLastFrame: true });
    expect(withHold(held, true)).toBe(held);
    expect(withHold(held, false)).toEqual(clip());
    const plain = clip();
    expect(withHold(plain, false)).toBe(plain);
  });
});

describe('the last frame videos play on', () => {
  it('is the latest clip’s last, at its speed and loop, held frames not counted', () => {
    expect(lastVideoFrame([], 30)).toBe(-1);
    // 30 + 4 s × 30 = 150: frames 30 to 149
    expect(lastVideoFrame([clip()], 30)).toBe(149);
    expect(lastVideoFrame([clip(), clip({ start: 0, speed: 0.5 })], 30)).toBe(239);
    expect(lastVideoFrame([clip({ loop: true, loopFor: 10 })], 30)).toBe(329);
    expect(lastVideoFrame([clip({ holdLastFrame: true })], 30)).toBe(149);
    // A part that isn't whole frames plays on into the frame it ends in
    expect(lastVideoFrame([clip({ duration: 1.01 })], 30)).toBe(60);
    expect(lastVideoFrame([clip({ duration: 0 })], 30)).toBe(-1);
  });
});
