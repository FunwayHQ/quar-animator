import { describe, expect, it, vi } from 'vitest';
import type { Sound, SoundClip } from '@quar/types';
import { SoundPlayer, type SoundsToPlay } from './soundPlayer';

interface Started {
  buffer: unknown;
  gain: number;
  when: number;
  offset: number;
  duration: number;
  /** Its fades, when it has any */
  ramps?: [string, number, number][];
}

type FakeGain = { gain: { value: number; ramps: [string, number, number][] } };

/** An audio context that notes what's set going and stopped. */
class FakeContext {
  currentTime = 10;
  state: AudioContextState = 'running';
  readonly destination = {};
  readonly started: Started[] = [];
  stopped = 0;
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
  createBufferSource() {
    const context = this;
    let buffer: unknown = null;
    let gain = 1;
    let ramps: [string, number, number][] = [];
    return {
      set buffer(value: unknown) {
        buffer = value;
      },
      connect(node: FakeGain) {
        gain = node.gain.value;
        ramps = node.gain.ramps;
        return node;
      },
      start(when: number, offset: number, duration: number) {
        context.started.push({
          buffer,
          gain,
          when,
          offset,
          duration,
          ...(ramps.length > 0 ? { ramps } : {}),
        });
      },
      stop() {
        context.stopped++;
      },
      disconnect() {},
    };
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
      disconnect() {},
    };
  }
}

const sound = (id: string): Sound => ({
  id,
  name: id,
  src: 'data:audio/wav;base64,AAAA',
  duration: 10,
});
const clip = (id: string, start: number, more: Partial<SoundClip> = {}): SoundClip => ({
  id,
  soundId: 'voice',
  start,
  offset: 0,
  duration: 2,
  gain: 1,
  ...more,
});
const what = (clips: SoundClip[], sounds = [sound('voice')]): SoundsToPlay => ({
  clips,
  sounds,
  frameRate: 30,
  lastFrame: 299,
});

/** A sound decoded, or its rendition at a speed (which it says). */
const decodedAt = (s: Sound, speed = 1) =>
  (speed === 1 ? { decoded: s.id } : { decoded: s.id, speed }) as unknown as AudioBuffer;

function player(decode = vi.fn(async (s: Sound, speed?: number) => decodedAt(s, speed))) {
  const context = new FakeContext();
  const createContext = vi.fn(() => context as unknown as AudioContext);
  return { context, createContext, decode, player: new SoundPlayer({ createContext, decode }) };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('SoundPlayer', () => {
  it('plays each clip from where the playhead is, at its volume', async () => {
    const { player: p, context } = player();
    // Frame 45 is 1.5 s in: the first clip half played, the second 1.5 s off
    p.play(45, what([clip('a', 30, { gain: 0.5 }), clip('b', 90)]));
    await settle();
    expect(context.started).toEqual([
      { buffer: { decoded: 'voice' }, gain: 0.5, when: 10.03, offset: 0.5, duration: 1.5 },
      { buffer: { decoded: 'voice' }, gain: 1, when: 11.53, offset: 0, duration: 2 },
    ]);
  });

  it('plays a sound decoded late from where it has got to', async () => {
    let decoded: (buffer: AudioBuffer) => void = () => {};
    const decode = vi.fn(() => new Promise<AudioBuffer>((resolve) => (decoded = resolve)));
    const { player: p, context } = player(decode);
    p.play(0, what([clip('a', 0)]));
    context.currentTime = 10.53;
    decoded({} as AudioBuffer);
    await settle();
    expect(context.started[0]).toMatchObject({ when: 10.53, offset: 0.5, duration: 1.5 });
  });

  it('fades a clip in and out, from wherever in its fade it starts', async () => {
    const { player: p, context } = player();
    // Frame 15 is half a second into a clip fading in over a second and out over one
    p.play(15, what([clip('a', 0, { gain: 0.8, fadeIn: 1, fadeOut: 1 })]));
    await settle();
    expect(context.started[0]).toMatchObject({ when: 10.03, offset: 0.5, duration: 1.5 });
    expect(context.started[0]!.ramps).toEqual([
      ['set', 0.4, 10.03],
      ['ramp', 0.8, 10.53],
      ['ramp', 0, 11.53],
    ]);
  });

  it('stops what it plays, and plays nothing decoded after it stopped', async () => {
    let decoded: (buffer: AudioBuffer) => void = () => {};
    const decode = vi
      .fn()
      .mockResolvedValueOnce({} as AudioBuffer)
      .mockImplementationOnce(() => new Promise<AudioBuffer>((resolve) => (decoded = resolve)));
    const { player: p, context } = player(decode);
    p.play(0, what([clip('a', 0)]));
    await settle();
    p.stop();
    expect(context.stopped).toBe(1);

    p.play(0, what([clip('b', 0)]));
    p.stop();
    decoded({} as AudioBuffer);
    await settle();
    expect(context.started).toHaveLength(1);
  });

  it('makes no audio context when nothing would sound', () => {
    const { player: p, createContext } = player();
    p.play(0, what([]));
    p.play(0, what([clip('a', 0, { muted: true })]));
    p.play(0, what([clip('a', 0)], []));
    expect(createContext).not.toHaveBeenCalled();
  });

  it('knows when the frame shown has left the sound behind', async () => {
    const { player: p, context } = player();
    p.play(45, what([clip('a', 30)]));
    context.currentTime = 11.03;
    // A second on: frame 75 is due, give or take a tenth of a second
    expect(p.inStep(77)).toBe(true);
    expect(p.inStep(79)).toBe(false);
    expect(p.inStep(45)).toBe(false);
  });

  it('gets the audio clock going before playing, once', () => {
    const { player: p, createContext } = player();
    p.warm();
    p.warm();
    p.play(0, what([clip('a', 0)]));
    expect(createContext).toHaveBeenCalledOnce();
  });

  it('scrubs: a moment of what sounds at a frame, from where it has got to, edges softened', async () => {
    const { player: p, context } = player();
    p.prepare([sound('voice')]);
    await settle();
    // Frame 45: clip a is half a second in (and fading in to 0.8); b starts later, so isn't heard
    p.scrub(45, what([clip('a', 30, { gain: 0.8, fadeIn: 1 }), clip('b', 46)]));
    const rounded = (value: unknown): unknown =>
      typeof value === 'number'
        ? Math.round(value * 1e6) / 1e6
        : Array.isArray(value)
          ? value.map(rounded)
          : value && typeof value === 'object'
            ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rounded(v)]))
            : value;
    expect(rounded(context.started)).toEqual([
      {
        buffer: { decoded: 'voice' },
        gain: 1,
        when: 10.005,
        offset: 0.5,
        duration: 0.1,
        ramps: [
          ['set', 0, 10.005],
          ['ramp', 0.4, 10.01],
          ['set', 0.4, 10.1],
          ['ramp', 0, 10.105],
        ],
      },
    ]);
    // The next frame cuts it off
    p.scrub(46, what([clip('a', 30)]));
    expect(context.stopped).toBe(1);
    expect(context.started).toHaveLength(2);
  });

  it('scrubs only sounds decoded already, getting the rest ready', async () => {
    const decode = vi.fn(async (s: Sound) => ({ decoded: s.id }) as unknown as AudioBuffer);
    const { player: p, context } = player(decode);
    p.scrub(0, what([clip('a', 0)]));
    expect(context.started).toEqual([]);
    expect(decode).toHaveBeenCalledOnce();
    await settle();
    p.scrub(1, what([clip('a', 0)]));
    expect(context.started).toHaveLength(1);
    expect(decode).toHaveBeenCalledOnce();
  });

  it('decodes the sounds ahead, settling once each is ready or found not to decode', async () => {
    const pending = new Map<string, { resolve: (b: AudioBuffer) => void; reject: () => void }>();
    const decode = vi.fn(
      (s: Sound) =>
        new Promise<AudioBuffer>((resolve, reject) => pending.set(s.id, { resolve, reject }))
    );
    const { player: p } = player(decode);
    const each = vi.fn();
    let settled = false;
    void p.prepare([sound('voice'), sound('drums')], each).then(() => (settled = true));

    pending.get('voice')?.resolve({} as AudioBuffer);
    await settle();
    expect(each.mock.calls.map(([s]) => (s as Sound).id)).toEqual(['voice']);
    expect(settled).toBe(false);
    // One that can't be decoded counts as done (it stays silent)
    pending.get('drums')?.reject();
    await settle();
    expect(each).toHaveBeenCalledTimes(2);
    expect(settled).toBe(true);
    // Ready already: settled at once, decoded no more
    await p.prepare([sound('voice')], each);
    expect(each).toHaveBeenCalledTimes(3);
    expect(decode).toHaveBeenCalledTimes(2);
  });

  it('plays a clip at a speed of its own from the sound’s rendition at it, a looped one a pass at a time', async () => {
    const { player: p, context, decode } = player();
    // From frame 15: half a second into a clip twice as fast (1 s of its sound, 0.5 s of the rendition)
    p.play(
      15,
      what([clip('a', 0, { speed: 2, offset: 1 }), clip('b', 60, { loop: true, loopFor: 3 })])
    );
    await settle();
    expect(decode.mock.calls.map(([s, speed]) => [s.id, speed])).toEqual([
      ['voice', 2],
      ['voice', 1],
      ['voice', 1],
    ]);
    const round = (value: number) => Math.round(value * 1e6) / 1e6;
    expect(
      context.started.map(({ buffer, when, offset, duration }) => [
        buffer,
        round(when),
        round(offset),
        round(duration),
      ])
    ).toEqual([
      [{ decoded: 'voice', speed: 2 }, 10.03, 1, 0.5],
      // A 2 s pass from 1.5 s on, then the second, cut to the 3 s it loops for
      [{ decoded: 'voice' }, 11.53, 0, 2],
      [{ decoded: 'voice' }, 13.53, 0, 1],
    ]);
  });

  it('plays a rendition made after it was due from where it has got to', async () => {
    let made: (buffer: AudioBuffer) => void = () => {};
    const decode = vi.fn(() => new Promise<AudioBuffer>((resolve) => (made = resolve)));
    const { player: p, context } = player(decode);
    p.play(0, what([clip('a', 0, { speed: 0.5 })]));
    // Made 1.5 s in: of the 4 s it lasts, from 1.5 s into the rendition
    context.currentTime = 11.53;
    made({} as AudioBuffer);
    await settle();
    expect(context.started[0]).toMatchObject({ when: 11.53, duration: 2.5 });
    expect(context.started[0]!.offset).toBeCloseTo(1.5);
  });

  it('makes the renditions the clips play ahead, a sound ready once all of its are', async () => {
    const { player: p, decode } = player();
    const each = vi.fn();
    await p.prepare([sound('voice')], each, [
      clip('a', 0, { speed: 2 }),
      clip('b', 0, { speed: 2 }),
      clip('c', 0, { speed: 0.5 }),
      clip('d', 0, { soundId: 'other', speed: 3 }),
    ]);
    expect(decode.mock.calls.map(([s, speed]) => [s.id, speed])).toEqual([
      ['voice', 1],
      ['voice', 2],
      ['voice', 0.5],
    ]);
    expect(each).toHaveBeenCalledOnce();
  });

  it('scrubs a sped-up, looped clip at the moment of it under the playhead', async () => {
    const { player: p, context } = player();
    const looped = clip('a', 0, { offset: 1, speed: 2, loop: true, loopFor: 4 });
    await p.prepare([sound('voice')], undefined, [looped]);
    // Frame 45 is 1.5 s in: half a second into its second pass of 1 s
    p.scrub(45, what([looped]));
    expect(context.started).toHaveLength(1);
    expect(context.started[0]).toMatchObject({ buffer: { decoded: 'voice', speed: 2 } });
    expect(context.started[0]!.offset).toBeCloseTo(1);
  });

  it('wakes a suspended context, and closes it when done', () => {
    const { player: p, context } = player();
    context.state = 'suspended';
    p.play(0, what([clip('a', 0)]));
    expect(context.resume).toHaveBeenCalled();
    p.dispose();
    expect(context.close).toHaveBeenCalled();
  });
});
