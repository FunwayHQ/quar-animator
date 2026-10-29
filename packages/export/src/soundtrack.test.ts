import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound, SoundClip } from '@quar/types';
import { sampleSlides } from './exportUtils';
import {
  decodeSound,
  mixSoundtrack,
  slideSoundtrackParts,
  soundAtSpeed,
  soundBytes,
  soundtrackPlays,
} from './soundtrack';
import { stretch } from './audio/timeStretch';

/** What the mix asked the audio context to play */
interface Played {
  buffer: unknown;
  rate: number;
  gain: number;
  start: [number, number, number];
  /** The gain's fades, when it has any */
  ramps?: [string, number, number][];
}

type FakeGain = { gain: { value: number; ramps: [string, number, number][] } };

/** An offline audio context that notes what it's asked to play. */
class FakeOfflineContext {
  static made: FakeOfflineContext[] = [];
  readonly destination = { name: 'destination' };
  readonly played: Played[] = [];
  constructor(
    readonly channels: number,
    readonly length: number,
    readonly sampleRate: number
  ) {
    FakeOfflineContext.made.push(this);
  }
  createBufferSource() {
    const played: Played = { buffer: null, rate: 1, gain: 1, start: [0, 0, 0] };
    const source = {
      set buffer(buffer: unknown) {
        played.buffer = buffer;
      },
      playbackRate: {
        set value(rate: number) {
          played.rate = rate;
        },
      },
      connect: (gain: FakeGain) => {
        played.gain = gain.gain.value;
        if (gain.gain.ramps.length > 0) played.ramps = gain.gain.ramps;
        return gain;
      },
      start: (...args: [number, number, number]) => {
        played.start = args;
        this.played.push(played);
      },
    };
    return source;
  }
  createGain() {
    const ramps: [string, number, number][] = [];
    return {
      gain: {
        value: 1,
        ramps,
        setValueAtTime: (value: number, time: number) => ramps.push(['set', value, time]),
        linearRampToValueAtTime: (value: number, time: number) => ramps.push(['ramp', value, time]),
      },
      connect: (node: unknown) => node,
    };
  }
  startRendering() {
    return Promise.resolve({ mixed: this.played.length, length: this.length });
  }
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ decodedBytes: data.byteLength, rate: this.sampleRate });
  }
}

/** An audio buffer, as Web Audio makes one: its channels' samples. */
class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly channels: Float32Array[];
  constructor(options: { numberOfChannels: number; length: number; sampleRate: number }) {
    this.numberOfChannels = options.numberOfChannels;
    this.length = options.length;
    this.sampleRate = options.sampleRate;
    this.channels = Array.from(
      { length: options.numberOfChannels },
      () => new Float32Array(options.length)
    );
  }
  get duration() {
    return this.length / this.sampleRate;
  }
  getChannelData(channel: number) {
    return this.channels[channel]!;
  }
}

/** Whether two sets of channels hold the same samples (quicker than comparing them deeply). */
function sameSamples(a: readonly Float32Array[], b: readonly Float32Array[]): boolean {
  return (
    a.length === b.length &&
    a.every((samples, c) => {
      const other = b[c]!;
      return samples.length === other.length && samples.every((value, i) => value === other[i]);
    })
  );
}

/** A buffer of a tone in each channel. */
function toneBuffer(seconds: number, channels = 2) {
  const buffer = new FakeAudioBuffer({
    numberOfChannels: channels,
    length: Math.round(seconds * 48000),
    sampleRate: 48000,
  });
  buffer.channels.forEach((samples, c) => {
    for (let i = 0; i < samples.length; i++)
      samples[i] = Math.sin((2 * Math.PI * (330 + c * 110) * i) / 48000);
  });
  return buffer;
}

const sound = (id: string): Sound => ({
  id,
  name: id,
  src: `data:audio/wav;base64,${btoa(id)}`,
  duration: 4,
});
const clip = (id: string, soundId: string, start: number, more: Partial<SoundClip> = {}) => ({
  id,
  soundId,
  start,
  offset: 0,
  duration: 2,
  gain: 1,
  ...more,
});

beforeEach(() => {
  FakeOfflineContext.made = [];
  vi.stubGlobal('OfflineAudioContext', FakeOfflineContext);
  vi.stubGlobal('AudioBuffer', FakeAudioBuffer);
});
afterEach(() => vi.unstubAllGlobals());

describe('soundAtSpeed', () => {
  it('is the sound itself at 1×', async () => {
    const audio = toneBuffer(0.2);
    expect(await soundAtSpeed(audio as unknown as AudioBuffer, 1)).toBe(audio);
  });

  it('is the sound stretched at another speed, each channel alike, at its rate', async () => {
    const audio = toneBuffer(0.5);
    const fast = (await soundAtSpeed(audio as unknown as AudioBuffer, 2, {
      pause: async () => {},
    })) as unknown as FakeAudioBuffer;
    expect([fast.numberOfChannels, fast.length, fast.sampleRate]).toEqual([2, 12000, 48000]);
    expect(sameSamples(fast.channels, stretch(audio.channels, 48000, 2))).toBe(true);
  });
});

describe('soundBytes', () => {
  it('reads a data URI’s bytes', () => {
    expect([...soundBytes(`data:audio/mpeg;base64,${btoa('\x00\x01\xff')}`)]).toEqual([0, 1, 255]);
  });
});

describe('decodeSound', () => {
  it('decodes at the soundtrack’s rate', async () => {
    const decoded = await decodeSound(`data:audio/wav;base64,${btoa('abcd')}`);
    expect(decoded).toEqual({ decodedBytes: 4, rate: 48000 });
  });
});

describe('soundtrackPlays', () => {
  it('puts each stretch’s clips where it plays in the video', () => {
    const plays = soundtrackPlays(
      [
        // A first slide of 60 frames, then one starting 2 s in
        { clips: [clip('a', 'one', 30)], at: 0, startFrame: 0, endFrame: 59 },
        { clips: [clip('b', 'two', 0), clip('c', 'two', 90)], at: 2, startFrame: 0, endFrame: 59 },
      ],
      30
    );
    // a is cut at its slide's end (1 s of it); c starts after its slide ends
    expect(plays.map((play) => [play.clipId, play.at, play.duration])).toEqual([
      ['a', 1, 1],
      ['b', 2, 2],
    ]);
  });
});

describe('slideSoundtrackParts', () => {
  const clip = (id: string): SoundClip => ({
    id,
    soundId: id,
    start: 0,
    offset: 0,
    duration: 1,
    gain: 1,
  });
  const slide = (name: string, frameCount: number, transition?: { duration: number }) => ({
    ctx: { name, timeline: { sounds: [clip(name)] } },
    frameCount,
    ...(transition && { transition: { type: 'fade' as const, ...transition } }),
  });

  it('starts each slide’s sounds where its own timeline starts', () => {
    const slides = [slide('intro', 30), slide('outro', 60)];
    const { fps, shots } = sampleSlides(slides, { frameRate: 30 });
    expect(slideSoundtrackParts(slides, shots, fps)).toEqual([
      { clips: [clip('intro')], at: 0, startFrame: 0, endFrame: 29 },
      { clips: [clip('outro')], at: 1, startFrame: 0, endFrame: 59 },
    ]);
  });

  it('after the transitions before it: they play no slide’s sounds', () => {
    const slides = [
      slide('intro', 30),
      slide('middle', 60, { duration: 0.5 }),
      slide('outro', 30, { duration: 1 }),
    ];
    const { fps, shots } = sampleSlides(slides, { frameRate: 30 });
    expect(slideSoundtrackParts(slides, shots, fps).map((part) => part.at)).toEqual([
      0,
      // 1 s of the intro, then half a second of fade
      1.5,
      // …then 2 s of the middle slide and a second's fade
      4.5,
    ]);
    // At another rate and speed, the same seconds of the video
    const fast = sampleSlides(slides, { frameRate: 30, fps: 60, speed: 2 });
    expect(slideSoundtrackParts(slides, fast.shots, fast.fps).map((part) => part.at)).toEqual([
      0, 0.75, 2.25,
    ]);
  });

  it('leaves out a slide that plays no frames', () => {
    const slides = [slide('intro', 30), slide('empty', 0, { duration: 1 })];
    const { fps, shots } = sampleSlides(slides, { frameRate: 30 });
    expect(slideSoundtrackParts(slides, shots, fps)).toHaveLength(1);
  });
});

describe('mixSoundtrack', () => {
  it('mixes every play into one stereo track the video’s length', async () => {
    const plays = soundtrackPlays(
      [
        {
          clips: [clip('a', 'one', 0, { gain: 0.5 }), clip('b', 'two', 15, { offset: 1 })],
          at: 0,
          startFrame: 0,
          endFrame: 89,
        },
      ],
      30,
      2
    );
    const mixed = await mixSoundtrack(plays, [sound('one'), sound('two')], 1.5);
    expect(mixed).toEqual({ mixed: 2, length: 72000 });

    const context = FakeOfflineContext.made.at(-1)!;
    expect([context.channels, context.sampleRate]).toEqual([2, 48000]);
    expect(context.played).toEqual([
      { buffer: { decodedBytes: 3, rate: 48000 }, rate: 2, gain: 0.5, start: [0, 0, 2] },
      { buffer: { decodedBytes: 3, rate: 48000 }, rate: 2, gain: 1, start: [0.25, 1, 2] },
    ]);
  });

  it('fades each play in and out where it is in the video', async () => {
    const plays = soundtrackPlays(
      [
        {
          clips: [clip('a', 'one', 0, { gain: 0.8, fadeIn: 0.5, fadeOut: 1 })],
          at: 3,
          startFrame: 0,
          endFrame: 89,
        },
      ],
      30
    );
    await mixSoundtrack(plays, [sound('one')], 6);
    const [played] = FakeOfflineContext.made.at(-1)!.played;
    // The 2 s clip from 3 s into the video: up by 3.5 s, down from 4 s to 5 s
    expect(played!.ramps).toEqual([
      ['set', 0, 3],
      ['ramp', 0.8, 3.5],
      ['ramp', 0.8, 4],
      ['ramp', 0, 5],
    ]);
  });

  it('decodes each sound once, with the decoder it’s given', async () => {
    const decode = vi.fn(async (s: Sound) => ({ from: s.id }) as unknown as AudioBuffer);
    const plays = soundtrackPlays(
      [{ clips: [clip('a', 'one', 0), clip('b', 'one', 30)], at: 0, startFrame: 0, endFrame: 89 }],
      30
    );
    await mixSoundtrack(plays, [sound('one')], 3, decode);
    expect(decode).toHaveBeenCalledOnce();
    expect(FakeOfflineContext.made.at(-1)!.played.map((p) => p.buffer)).toEqual([
      { from: 'one' },
      { from: 'one' },
    ]);
  });

  it('mixes a clip at a speed of its own from the sound’s rendition at it', async () => {
    const decode = vi.fn(
      async (s: Sound, speed = 1) => ({ from: s.id, speed }) as unknown as AudioBuffer
    );
    const plays = soundtrackPlays(
      [
        {
          clips: [
            clip('a', 'one', 0),
            clip('b', 'one', 30, { offset: 1, speed: 2 }),
            clip('c', 'one', 60, { speed: 2, loop: true, loopFor: 1.5 }),
          ],
          at: 0,
          startFrame: 0,
          endFrame: 149,
        },
      ],
      30
    );
    await mixSoundtrack(plays, [sound('one')], 5, decode);
    // The sound itself and its rendition at 2×, each made once
    expect(decode.mock.calls.map(([s, speed]) => [s.id, speed])).toEqual([
      ['one', 1],
      ['one', 2],
    ]);
    expect(FakeOfflineContext.made.at(-1)!.played.map((p) => [p.buffer, p.rate, p.start])).toEqual([
      [{ from: 'one', speed: 1 }, 1, [0, 0, 2]],
      // 2 s of the sound from 1 s in, twice as fast: 1 s of the rendition from 0.5 s in
      [{ from: 'one', speed: 2 }, 1, [1, 0.5, 1]],
      // Looped: a pass of 1 s, then half of one
      [{ from: 'one', speed: 2 }, 1, [2, 0, 1]],
      [{ from: 'one', speed: 2 }, 1, [3, 0, 0.5]],
    ]);
  });

  it('makes the renditions itself without a decoder: the sound stretched, keeping its pitch', async () => {
    const audio = toneBuffer(1);
    const decoding = vi.spyOn(FakeOfflineContext.prototype, 'decodeAudioData');
    decoding.mockResolvedValue(audio as never);
    const plays = soundtrackPlays(
      [
        {
          clips: [clip('a', 'one', 0, { speed: 0.5 }), clip('b', 'one', 0)],
          at: 0,
          startFrame: 0,
          endFrame: 299,
        },
      ],
      30
    );
    await mixSoundtrack(plays, [sound('one')], 4);
    // Decoded once for both
    expect(decoding).toHaveBeenCalledOnce();
    const [slow, plain] = FakeOfflineContext.made.at(-1)!.played;
    expect(plain!.buffer).toBe(audio);
    const rendition = slow!.buffer as FakeAudioBuffer;
    expect(rendition.length).toBe(96000);
    expect(sameSamples(rendition.channels, stretch(audio.channels, 48000, 0.5))).toBe(true);
    decoding.mockRestore();
  });

  it('is silent when nothing plays, or its sound is missing', async () => {
    expect(await mixSoundtrack([], [sound('one')], 2)).toBeNull();
    const plays = soundtrackPlays(
      [{ clips: [clip('a', 'gone', 0)], at: 0, startFrame: 0, endFrame: 9 }],
      30
    );
    expect(await mixSoundtrack(plays, [sound('one')], 2)).toBeNull();
  });

  it('names a sound that can’t be read', async () => {
    const plays = soundtrackPlays(
      [{ clips: [clip('a', 'one', 0)], at: 0, startFrame: 0, endFrame: 9 }],
      30
    );
    await expect(
      mixSoundtrack(plays, [sound('one')], 1, () => Promise.reject(new Error('bad')))
    ).rejects.toThrow('The sound “one” can’t be read');
  });
});
