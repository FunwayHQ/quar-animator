/**
 * Time Stretch
 * A sound played faster or slower keeping its pitch: WSOLA (waveform
 * similarity overlap-add). The sound is cut into frames about 40 ms long,
 * Hann-windowed and laid half over one another at the pace of the output;
 * each frame is taken from near where the speed puts it in the sound —
 * within ±15 ms, where it best continues the frame before (the most alike,
 * by cross-correlation) — so the waveforms add up in step, without clicks
 * or a warble. All the channels take the same frames, so stereo stays
 * aligned. The sound's own samples, no dependencies.
 */

/** How long a frame is, in seconds. */
export const STRETCH_FRAME_SECONDS = 0.04;
/** How far from where the speed puts a frame it may be taken from, either way, in seconds. */
export const STRETCH_SEARCH_SECONDS = 0.015;
/**
 * The rates the search looks at a sound at, roughly first (all of its
 * reach), then closer and closer (around what it found), then at its own.
 */
const SEARCH_RATES = [4000, 16000];
/** How many frames are laid between the steps a stretch is made in. */
const FRAMES_PER_STEP = 32;
/** How many samples are mixed down or averaged between those steps. */
const SAMPLES_PER_STEP = 1 << 17;

/** How many samples `length` samples take at `speed`. */
export function stretchedLength(length: number, speed: number): number {
  return Math.max(0, Math.round(length / speed));
}

/** The channels mixed down into `mix` (the frames are chosen on all of them at once), in steps. */
function* mixing(channels: readonly Float32Array[], mix: Float32Array): Generator<number> {
  for (let from = 0; from < mix.length; from += SAMPLES_PER_STEP) {
    const to = Math.min(mix.length, from + SAMPLES_PER_STEP);
    for (const channel of channels) {
      for (let i = from; i < to; i++) mix[i]! += channel[i]!;
    }
    yield 0;
  }
}

/** `samples` averaged over every `step` of them into `out`: what the search looks at first. In steps. */
function* averaging(samples: Float32Array, step: number, out: Float32Array): Generator<number> {
  const each = Math.max(1, Math.floor(SAMPLES_PER_STEP / step));
  for (let from = 0; from < out.length; from += each) {
    const to = Math.min(out.length, from + each);
    for (let i = from; i < to; i++) {
      let sum = 0;
      const end = Math.min(samples.length, (i + 1) * step);
      for (let k = i * step; k < end; k++) sum += samples[k]!;
      out[i] = sum / step;
    }
    yield 0;
  }
}

/**
 * Where from `from` to `to` (samples, `step` apart) the `length` samples
 * of `samples` are most like those at `template`: their cross-correlation,
 * over the candidate's own loudness (so a loud stretch isn't chosen for
 * being loud). Past the end, the sound is silence.
 */
function mostAlike(
  samples: Float32Array,
  template: number,
  from: number,
  to: number,
  length: number
): number {
  const end = samples.length;
  let best = from;
  let bestScore = -Infinity;
  // The candidate's loudness, slid along with it
  let energy = 0;
  for (let i = 0; i < length && from + i < end; i++) energy += samples[from + i]! ** 2;
  for (let at = from; at <= to; at++) {
    let sum = 0;
    const span = Math.min(length, end - at, end - template);
    for (let i = 0; i < span; i++) sum += samples[template + i]! * samples[at + i]!;
    const score = sum / Math.sqrt(energy + 1e-9);
    if (score > bestScore) {
      bestScore = score;
      best = at;
    }
    if (at < end) energy -= samples[at]! ** 2;
    if (at + length < end) energy += samples[at + length]! ** 2;
    if (energy < 0) energy = 0;
  }
  return best;
}

/**
 * The channels stretched to play at `speed` (2: half as long, 0.5: twice),
 * keeping their pitch, in steps: each yields how far it has got (0–1), the
 * last returns the stretched channels (each `stretchedLength` long). At 1×
 * the channels themselves.
 */
export function* stretching(
  channels: readonly Float32Array[],
  sampleRate: number,
  speed: number
): Generator<number, Float32Array[], void> {
  if (speed === 1 || !(speed > 0) || channels.length === 0) return [...channels];
  const length = Math.min(...channels.map((channel) => channel.length));
  const outLength = stretchedLength(length, speed);
  // Half a frame apart in the output (frames half over one another), `speed` times that in the sound
  const half = Math.max(1, Math.round((STRETCH_FRAME_SECONDS * sampleRate) / 2));
  const frame = half * 2;
  const step = half * speed;
  const reach = Math.round(STRETCH_SEARCH_SECONDS * sampleRate);
  const window = new Float32Array(frame);
  for (let i = 0; i < frame; i++) window[i] = 0.5 - 0.5 * Math.cos((Math.PI * i) / half);

  const mix = new Float32Array(length);
  yield* mixing(channels, mix);
  // Each look: how many samples one of its samples stands for, and the sound so
  const scales = [...new Set([...SEARCH_RATES.map((rate) => Math.floor(sampleRate / rate)), 1])]
    .filter((every) => every >= 1)
    .sort((a, b) => b - a);
  const looks: Array<{ every: number; samples: Float32Array }> = [];
  for (const every of scales) {
    let samples = mix;
    if (every > 1) {
      samples = new Float32Array(Math.ceil(length / every));
      yield* averaging(mix, every, samples);
    }
    looks.push({ every, samples });
  }
  const out = channels.map(() => new Float32Array(outLength + frame));
  const frames = Math.ceil(outLength / half);
  // Frames are whole frames of the sound: the last ones taken from its end (a slowed end drawn out, not faded)
  const last = Math.max(0, length - frame);

  let previous = 0;
  for (let k = 0; k < frames; k++) {
    let at = 0;
    if (k > 0) {
      // What would carry on from the frame before, and where the speed puts this one
      const template = previous + half;
      const nominal = Math.min(last, Math.round(k * step));
      let from = Math.max(0, nominal - reach);
      let to = Math.min(last, nominal + reach);
      for (const { every, samples } of looks) {
        at =
          every *
          mostAlike(
            samples,
            Math.round(template / every),
            Math.ceil(from / every),
            Math.floor(to / every),
            Math.max(1, Math.floor(half / every))
          );
        // The next look closer, around what this one found
        from = Math.max(from, at - every);
        to = Math.min(to, at + every);
      }
    }
    const placed = k * half;
    const span = Math.min(frame, length - at);
    for (let c = 0; c < channels.length; c++) {
      const input = channels[c]!;
      const output = out[c]!;
      for (let i = 0; i < span; i++) {
        // The first frame comes in at full strength: nothing before it to fade from
        const weight = k === 0 && i < half ? 1 : window[i]!;
        output[placed + i]! += weight * input[at + i]!;
      }
    }
    previous = at;
    if ((k + 1) % FRAMES_PER_STEP === 0 && k + 1 < frames) yield (k + 1) / frames;
  }
  return out.map((channel) => channel.subarray(0, outLength));
}

/** The channels stretched to play at `speed` keeping their pitch, all at once (see stretching). */
export function stretch(
  channels: readonly Float32Array[],
  sampleRate: number,
  speed: number
): Float32Array[] {
  const steps = stretching(channels, sampleRate, speed);
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

export interface StretchInStepsOptions {
  /** How long each run of steps may take before pausing, in milliseconds (default 10) */
  slice?: number;
  /** Lets other work go on between runs (by default a macrotask) */
  pause?: () => Promise<void>;
  /** Told how far it has got (0–1) */
  progress?: (done: number) => void;
  /** Called off between runs: it stops, rejecting */
  cancelled?: () => boolean;
}

/** A pause that lets the page get on (rendering, input) before going on. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * The channels stretched as `stretch` does, a slice of time at a time with
 * pauses between, so the page stays responsive while a long sound is made.
 */
export async function stretchInSteps(
  channels: readonly Float32Array[],
  sampleRate: number,
  speed: number,
  options: StretchInStepsOptions = {}
): Promise<Float32Array[]> {
  const slice = options.slice ?? 10;
  const pause = options.pause ?? nextTask;
  const steps = stretching(channels, sampleRate, speed);
  let began = performance.now();
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
    options.progress?.(next.value);
    if (performance.now() - began >= slice) {
      await pause();
      if (options.cancelled?.()) throw new Error('The stretch was called off.');
      began = performance.now();
    }
  }
}
