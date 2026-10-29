import { describe, expect, it } from 'vitest';
import { stretch, stretchedLength, stretchInSteps, stretching } from './timeStretch';

const RATE = 48000;

/** `seconds` of a sine at `hz`, `amplitude` high, starting `phase` radians in. */
function sine(hz: number, seconds: number, amplitude = 0.8, phase = 0): Float32Array {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE + phase);
  }
  return samples;
}

/** The pitch of a stretch of a sine, from how often it rises through zero. */
function pitch(samples: Float32Array, from = 0, to = samples.length): number {
  let first = -1;
  let last = -1;
  let crossings = 0;
  for (let i = Math.max(1, from); i < to; i++) {
    if (samples[i - 1]! < 0 && samples[i]! >= 0) {
      if (first < 0) first = i;
      else crossings++;
      last = i;
    }
  }
  return crossings / ((last - first) / RATE);
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

/** The largest step from one sample to the next. */
function largestStep(samples: Float32Array, from = 1, to = samples.length): number {
  let largest = 0;
  for (let i = Math.max(1, from); i < to; i++) {
    largest = Math.max(largest, Math.abs(samples[i]! - samples[i - 1]!));
  }
  return largest;
}

/** The quietest a sine gets at its peaks, over each of its periods. */
function lowestPeak(samples: Float32Array, period: number, from: number, to: number): number {
  let lowest = Infinity;
  for (let start = from; start + period <= to; start += period) {
    let peak = 0;
    for (let i = start; i < start + period; i++) peak = Math.max(peak, Math.abs(samples[i]!));
    lowest = Math.min(lowest, peak);
  }
  return lowest;
}

describe('stretch', () => {
  it('leaves the sound as it is at 1×', () => {
    const channels = [sine(440, 0.5), sine(220, 0.5)];
    const stretched = stretch(channels, RATE, 1);
    expect(stretched[0]).toBe(channels[0]);
    expect(stretched[1]).toBe(channels[1]);
  });

  it('makes it as long as its speed takes', () => {
    const channels = [sine(440, 1)];
    expect(stretch(channels, RATE, 0.5)[0]).toHaveLength(96000);
    expect(stretch(channels, RATE, 2)[0]).toHaveLength(24000);
    expect(stretch(channels, RATE, 0.25)[0]).toHaveLength(192000);
    expect(stretch(channels, RATE, 3)[0]).toHaveLength(16000);
    expect(stretchedLength(48001, 2)).toBe(24001);
    expect(stretch([new Float32Array(0)], RATE, 2)[0]).toHaveLength(0);
  });

  it.each([0.25, 0.5, 0.8, 1.5, 2, 4])('keeps a 440 Hz tone at 440 Hz at %s×', (speed) => {
    const [out] = stretch([sine(440, 2)], RATE, speed);
    // All through it, to its very end
    expect(pitch(out!)).toBeCloseTo(440, 0);
  });

  it('keeps other pitches too: a low hum and a high whistle', () => {
    for (const hz of [110, 2500]) {
      const [slow] = stretch([sine(hz, 1)], RATE, 0.5);
      const [fast] = stretch([sine(hz, 1)], RATE, 2);
      expect(Math.abs(pitch(slow!) - hz) / hz).toBeLessThan(0.005);
      expect(Math.abs(pitch(fast!) - hz) / hz).toBeLessThan(0.005);
    }
  });

  it('joins its frames without clicks or dips: a sine stays smooth and as loud', () => {
    const smoothest = (2 * Math.PI * 440 * 0.8) / RATE;
    for (const speed of [0.25, 0.5, 0.73, 2, 4]) {
      const [out] = stretch([sine(440, 1)], RATE, speed);
      expect(largestStep(out!)).toBeLessThan(smoothest * 1.1);
      expect(lowestPeak(out!, Math.ceil(RATE / 440), 0, out!.length)).toBeGreaterThan(0.8 * 0.97);
    }
  });

  it('starts where the sound starts', () => {
    const input = sine(440, 0.5);
    const [out] = stretch([input], RATE, 0.5);
    for (let i = 0; i < 400; i++) expect(out![i]).toBeCloseTo(input[i]!, 6);
  });

  it('keeps stereo in step: both channels take the same frames', () => {
    // The right channel the left a little later and quieter
    const lag = 12;
    const left = sine(440, 1, 0.8);
    const right = new Float32Array(left.length);
    for (let i = lag; i < left.length; i++) right[i] = 0.5 * left[i - lag]!;
    for (const speed of [0.5, 2]) {
      const [l, r] = stretch([left, right], RATE, speed);
      expect(r).toHaveLength(l!.length);
      // Still the left 12 samples on and half as loud, wherever it's looked at
      let worst = 0;
      for (let i = 2000; i < l!.length - 2000; i++) {
        worst = Math.max(worst, Math.abs(r![i]! - 0.5 * l![i - lag]!));
      }
      expect(worst).toBeLessThan(0.02);
    }
  });

  it('stretches a sound in steps, saying how far it has got, to the same result', () => {
    const channels = [sine(440, 1), sine(660, 1)];
    const steps = stretching(channels, RATE, 0.5);
    const progress: number[] = [];
    let step = steps.next();
    while (!step.done) {
      progress.push(step.value);
      step = steps.next();
    }
    expect(progress.length).toBeGreaterThan(2);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
    expect(progress.at(-1)).toBeLessThanOrEqual(1);
    expect(sameSamples(step.value, stretch(channels, RATE, 0.5))).toBe(true);
  });

  it('stretches in steps a moment at a time, pausing between them', async () => {
    let pauses = 0;
    const channels = [sine(440, 4)];
    const out = await stretchInSteps(channels, RATE, 0.5, {
      slice: 1,
      pause: async () => {
        pauses++;
      },
    });
    expect(sameSamples(out, stretch(channels, RATE, 0.5))).toBe(true);
    expect(pauses).toBeGreaterThan(1);
  });

  it('is quick enough for minutes of sound', () => {
    // A minute of stereo: two tones and some noise
    const length = 60 * RATE;
    let seed = 1;
    const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.2;
    const left = new Float32Array(length);
    const right = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      left[i] = 0.4 * Math.sin((2 * Math.PI * 330 * i) / RATE) + noise();
      right[i] = 0.4 * Math.sin((2 * Math.PI * 523 * i) / RATE) + noise();
    }
    const times: Record<string, number> = {};
    for (const speed of [0.5, 2]) {
      const began = performance.now();
      const [out] = stretch([left, right], RATE, speed);
      times[speed] = performance.now() - began;
      expect(out).toHaveLength(Math.round(length / speed));
    }
    // Under a second for the minute at 0.5× and a third of one at 2× on a busy laptop; loose for CI
    expect(times[0.5]).toBeLessThan(15000);
    expect(times[2]).toBeLessThan(8000);
  });
});
