import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Sound, SoundClip } from '@quar/types';
import { decodeSound, mixSoundtrack, soundBytes, soundtrackPlays } from './soundtrack';

/** What the mix asked the audio context to play */
interface Played {
  buffer: unknown;
  rate: number;
  gain: number;
  start: [number, number, number];
}

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
      connect: (gain: { gain: { value: number } }) => {
        played.gain = gain.gain.value;
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
    return { gain: { value: 1 }, connect: (node: unknown) => node };
  }
  startRendering() {
    return Promise.resolve({ mixed: this.played.length, length: this.length });
  }
  decodeAudioData(data: ArrayBuffer) {
    return Promise.resolve({ decodedBytes: data.byteLength, rate: this.sampleRate });
  }
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
});
afterEach(() => vi.unstubAllGlobals());

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
