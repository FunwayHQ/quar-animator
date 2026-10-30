/**
 * Sound files: read into the document's library as data, decoded once
 * each — and made once at each speed a clip plays one at, keeping its
 * pitch — (and let go when the library no longer has them) for playback,
 * waveforms and video exports alike, so they all sound the same.
 */

import { clipSpeed } from '@quar/animation';
import { SoundTooLong, decodeSound, soundAtSpeed } from '@quar/export';
import type { Sound, SoundClip } from '@quar/types';

/** The largest sound file read: the project keeps the whole file. */
export const MAX_SOUND_BYTES = 50 * 1024 * 1024;

/** What a sound file is, by its name, when the system doesn't say. */
const TYPES_BY_EXTENSION: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
};

/** A file's sound type: its own, or from its name; null for anything else. */
export function soundType(file: File): string | null {
  if (file.type.startsWith('audio/')) return file.type;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return (extension && TYPES_BY_EXTENSION[extension]) || null;
}

export function isSoundFile(file: File): boolean {
  return soundType(file) !== null;
}

/** What the file picker offers. */
export const SOUND_FILE_TYPES = `audio/*,${Object.keys(TYPES_BY_EXTENSION)
  .map((extension) => `.${extension}`)
  .join(',')}`;

function readAsDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('Unreadable'));
    reader.readAsDataURL(blob);
  });
}

const decoded = new Map<string, Promise<AudioBuffer>>();
/** Each sound's renditions, by the speed they play at */
const renditions = new Map<string, Map<number, Promise<AudioBuffer>>>();

/**
 * A sound file read into a sound for the library: its data, and its length
 * (decoded to learn it, and kept decoded).
 */
export async function readSoundFile(file: File): Promise<Sound> {
  const type = soundType(file);
  if (!type) throw new Error(`“${file.name}” isn’t a sound file.`);
  if (file.size > MAX_SOUND_BYTES) {
    throw new Error(`“${file.name}” is too large: a sound can be up to 50 MB.`);
  }
  // Typed as a sound, whatever the system called it
  const src = await readAsDataUri(new Blob([file], { type }));
  let audio: AudioBuffer;
  try {
    audio = await decodeSound(src);
  } catch (error) {
    if (error instanceof SoundTooLong) {
      throw new Error(
        `“${file.name}” is too long: a sound can be up to ${error.maxSeconds / 60} minutes.`
      );
    }
    throw new Error(`“${file.name}” can’t be played: this browser can’t read its format.`);
  }
  return keptDecoded(file.name.replace(/\.[^.]+$/, '') || 'Sound', src, audio);
}

/** A new sound of the library, its decoded audio kept. */
function keptDecoded(name: string, src: string, audio: AudioBuffer): Sound {
  const id = `sound_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  decoded.set(id, Promise.resolve(audio));
  return { id, name, src, duration: audio.duration };
}

/** A sound for the library from a file decoded already (a video's sound, taken out of it). */
export async function soundFromDecoded(
  name: string,
  file: Blob,
  audio: AudioBuffer
): Promise<Sound> {
  return keptDecoded(name, await readAsDataUri(file), audio);
}

/**
 * A sound's audio, decoded once — or at a clip's speed (other than 1), its
 * rendition at that speed, keeping its pitch: made once, a slice of time at
 * a time so the editor stays responsive meanwhile.
 */
export function decodedSound(sound: Sound, speed = 1): Promise<AudioBuffer> {
  if (speed !== 1) return rendition(sound, speed);
  let audio = decoded.get(sound.id);
  if (!audio) {
    audio = decodeSound(sound.src);
    decoded.set(sound.id, audio);
    // Tried again next time it's wanted
    audio.catch(() => decoded.delete(sound.id));
  }
  return audio;
}

function rendition(sound: Sound, speed: number): Promise<AudioBuffer> {
  let made = renditions.get(sound.id);
  if (!made) {
    made = new Map();
    renditions.set(sound.id, made);
  }
  const existing = made.get(speed);
  if (existing) return existing;
  const kept = made;
  // Stopped part way once it's let go of (no clip plays at that speed any more)
  const audio: Promise<AudioBuffer> = decodedSound(sound).then((original) =>
    soundAtSpeed(original, speed, {
      cancelled: () => renditions.get(sound.id)?.get(speed) !== audio,
    })
  );
  kept.set(speed, audio);
  // Made again next time it's wanted
  audio.catch(() => {
    if (kept.get(speed) === audio) kept.delete(speed);
  });
  return audio;
}

/** The speeds each sound is played at by these clips, other than 1×. */
export function speedsPlayed(clips: readonly SoundClip[] | undefined): Map<string, Set<number>> {
  const speeds = new Map<string, Set<number>>();
  for (const clip of clips ?? []) {
    const speed = clipSpeed(clip);
    if (speed === 1) continue;
    let known = speeds.get(clip.soundId);
    if (!known) {
      known = new Set();
      speeds.set(clip.soundId, known);
    }
    known.add(speed);
  }
  return speeds;
}

/**
 * Lets go of the decoded audio (and renditions) of sounds the library no
 * longer has — and, given the clips, of renditions at speeds none plays
 * (one still being made stops).
 */
export function keepDecodedSounds(sounds: readonly Sound[], clips?: readonly SoundClip[]): void {
  const kept = new Set(sounds.map((sound) => sound.id));
  for (const id of decoded.keys()) if (!kept.has(id)) decoded.delete(id);
  for (const id of renditions.keys()) if (!kept.has(id)) renditions.delete(id);
  if (!clips) return;
  const speeds = speedsPlayed(clips);
  for (const [id, made] of renditions) {
    for (const speed of made.keys()) if (!speeds.get(id)?.has(speed)) made.delete(speed);
  }
}

/** How many peaks a second a waveform is drawn from. */
export const PEAKS_PER_SECOND = 100;

const peaksOf = new WeakMap<AudioBuffer, Float32Array>();

/** The loudest sample (0–1) of each hundredth of a second, over all its channels. */
export function soundPeaks(audio: AudioBuffer): Float32Array {
  const known = peaksOf.get(audio);
  if (known) return known;
  const count = Math.max(1, Math.ceil(audio.duration * PEAKS_PER_SECOND));
  const peaks = new Float32Array(count);
  const span = audio.length / count;
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const samples = audio.getChannelData(channel);
    for (let i = 0; i < count; i++) {
      const end = Math.min(samples.length, Math.floor((i + 1) * span));
      let peak = peaks[i]!;
      for (let k = Math.floor(i * span); k < end; k++) {
        const level = Math.abs(samples[k]!);
        if (level > peak) peak = level;
      }
      peaks[i] = Math.min(1, peak);
    }
  }
  peaksOf.set(audio, peaks);
  return peaks;
}

/**
 * The waveform of a stretch of a sound (`offset` to `offset + duration`
 * seconds) as an SVG path in a 0–`width` × 0–1 box, mirrored about its
 * middle, from at most `width` peaks — as loud as it plays, `level` being
 * its volume `seconds` into the stretch (what's louder than full scale is
 * drawn at full scale, as it's heard).
 */
export function waveformPath(
  peaks: Float32Array,
  offset: number,
  duration: number,
  width: number,
  level: (seconds: number) => number = () => 1
): string {
  const from = Math.max(0, Math.floor(offset * PEAKS_PER_SECOND));
  const to = Math.min(peaks.length, Math.ceil((offset + duration) * PEAKS_PER_SECOND));
  const count = to - from;
  if (count <= 0 || width <= 0) return '';
  const columns = Math.max(1, Math.min(Math.round(width), count));
  const levels: number[] = [];
  for (let column = 0; column < columns; column++) {
    const start = from + Math.floor((column * count) / columns);
    const end = Math.max(start + 1, from + Math.floor(((column + 1) * count) / columns));
    let peak = 0;
    for (let i = start; i < end; i++) peak = Math.max(peak, peaks[i]!);
    const volume = level(((column + 0.5) / columns) * duration);
    levels.push(Math.min(1, peak * Math.max(0, volume)));
  }
  // Through each column's middle, out along the top and back along the bottom
  const x = (column: number) => (((column + 0.5) / columns) * width).toFixed(1);
  const top = levels.map((level, column) => `L${x(column)} ${(0.5 - level / 2).toFixed(3)}`);
  const bottom = levels.map((level, column) => `L${x(column)} ${(0.5 + level / 2).toFixed(3)}`);
  return `M0 0.5${top.join('')}L${width.toFixed(1)} 0.5${bottom.reverse().join('')}Z`;
}
