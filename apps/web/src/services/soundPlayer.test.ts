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

function player(decode = vi.fn(async (s: Sound) => ({ decoded: s.id }) as unknown as AudioBuffer)) {
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

  it('wakes a suspended context, and closes it when done', () => {
    const { player: p, context } = player();
    context.state = 'suspended';
    p.play(0, what([clip('a', 0)]));
    expect(context.resume).toHaveBeenCalled();
    p.dispose();
    expect(context.close).toHaveBeenCalled();
  });
});
