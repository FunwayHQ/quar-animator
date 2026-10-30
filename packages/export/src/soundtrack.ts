/**
 * Soundtrack
 * The sound of a video export: the clips on the timeline it plays (or on
 * each slide's, as each slide plays, once the transition into it is over),
 * mixed into one stereo track timed to the video, as the editor plays
 * them — fades, loops and clips at a speed of their own (from the sound's
 * rendition at that speed, keeping its pitch) too.
 */

import { schedulePlayGain, soundsPlayed } from '@quar/animation';
import type { SoundPlay } from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import { stretchInSteps, type StretchInStepsOptions } from './audio/timeStretch';
import type { ExportSlide, Shot } from './exportUtils';

/** The soundtrack's sample rate (sounds are resampled to it as they're decoded). */
export const SOUNDTRACK_RATE = 48000;

/** A sound file's bytes, from its data URI. */
export function soundBytes(src: string): Uint8Array<ArrayBuffer> {
  const binary = atob(src.slice(src.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * The longest sound decoded, in seconds: decoded, a sound takes about 23 MB
 * a minute (two channels at 48 kHz) — and a file of a few megabytes can
 * hold hours of quiet speech.
 */
export const MAX_SOUND_SECONDS = 30 * 60;

/** A sound that plays longer than may be decoded (MAX_SOUND_SECONDS). */
export class SoundTooLong extends Error {
  constructor(readonly maxSeconds: number) {
    super(`The sound is too long: it can be at most ${Math.round(maxSeconds / 60)} minutes.`);
  }
}

/** How long a sound file plays, read from its container (null: it can't be told that way). */
export async function soundDuration(bytes: Uint8Array): Promise<number | null> {
  try {
    const mb = await import('mediabunny');
    const input = new mb.Input({ source: new mb.BufferSource(bytes), formats: mb.ALL_FORMATS });
    const duration = await input.computeDuration();
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

/**
 * A sound decoded, at the soundtrack's rate (or `context`'s) — unless it
 * plays longer than `maxSeconds`, which throws before anything is decoded.
 */
export async function decodeSound(
  src: string,
  context?: BaseAudioContext,
  maxSeconds = MAX_SOUND_SECONDS
): Promise<AudioBuffer> {
  const bytes = soundBytes(src);
  const duration = await soundDuration(bytes);
  if (duration !== null && duration > maxSeconds) throw new SoundTooLong(maxSeconds);
  const decoder = context ?? new OfflineAudioContext(1, 1, SOUNDTRACK_RATE);
  return decoder.decodeAudioData(bytes.buffer);
}

/**
 * A sound's audio at `speed` (1 when absent), keeping its pitch: at 1× the
 * sound decoded, otherwise its rendition at that speed (see soundAtSpeed).
 */
export type SoundDecoder = (sound: Sound, speed?: number) => Promise<AudioBuffer>;

/**
 * A sound's rendition at a clip's speed: its audio time-stretched keeping
 * its pitch (a slice of time at a time, so the page stays responsive), a
 * buffer as long as the sound takes at that speed. At 1× the audio itself.
 */
export async function soundAtSpeed(
  audio: AudioBuffer,
  speed: number,
  options?: StretchInStepsOptions
): Promise<AudioBuffer> {
  if (speed === 1) return audio;
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) =>
    audio.getChannelData(channel)
  );
  const stretched = await stretchInSteps(channels, audio.sampleRate, speed, options);
  const rendition = new AudioBuffer({
    numberOfChannels: Math.max(1, stretched.length),
    length: Math.max(1, stretched[0]?.length ?? 0),
    sampleRate: audio.sampleRate,
  });
  stretched.forEach((samples, channel) => rendition.getChannelData(channel).set(samples));
  return rendition;
}

/** Sounds decoded (each once) and their renditions made, for one mix. */
function decodingOnce(): SoundDecoder {
  const decoded = new Map<string, Promise<AudioBuffer>>();
  return (sound, speed = 1) => {
    let audio = decoded.get(sound.id);
    if (!audio) {
      audio = decodeSound(sound.src);
      decoded.set(sound.id, audio);
    }
    return audio.then((buffer) => soundAtSpeed(buffer, speed));
  };
}

/** A stretch of the video: frames `startFrame`–`endFrame` of a timeline with these clips, from `at` seconds in. */
export interface SoundtrackPart {
  clips: readonly SoundClip[] | undefined;
  at: number;
  startFrame: number;
  endFrame: number;
}

/**
 * The stretches of a slides video: each slide's clips from where its own
 * timeline starts among the shots — after the transition into it, which
 * plays no slide's sounds.
 */
export function slideSoundtrackParts<Context extends { timeline?: { sounds?: SoundClip[] } }>(
  slides: readonly ExportSlide<Context>[],
  shots: readonly Shot<Context>[],
  fps: number
): SoundtrackPart[] {
  return slides.flatMap((slide) => {
    const first = shots.findIndex((shot) => shot.ctx === slide.ctx && !shot.transition);
    if (first < 0) return [];
    return [
      {
        clips: slide.ctx.timeline?.sounds,
        at: first / fps,
        startFrame: 0,
        endFrame: slide.frameCount - 1,
      },
    ];
  });
}

/** What plays in the video: each part's clips, at their times in it, at `speed`. */
export function soundtrackPlays(
  parts: readonly SoundtrackPart[],
  frameRate: number,
  speed = 1
): SoundPlay[] {
  return parts.flatMap((part) =>
    soundsPlayed(part.clips, frameRate, part.startFrame, part.endFrame, speed).map((play) => ({
      ...play,
      at: play.at + part.at,
    }))
  );
}

/** Which of a sound's audio a play plays: the sound itself, or its rendition at a speed. */
function renditionKey(play: SoundPlay): string {
  return `${play.soundId}@${play.speed ?? 1}`;
}

/**
 * The plays mixed into a stereo track `duration` seconds long, or null when
 * nothing plays (a clip whose sound isn't in the library plays nothing).
 * `decode` gives each sound's audio, or its rendition at a clip's speed;
 * by default they're decoded and made here.
 */
export async function mixSoundtrack(
  plays: readonly SoundPlay[],
  sounds: readonly Sound[],
  duration: number,
  decode: SoundDecoder = decodingOnce()
): Promise<AudioBuffer | null> {
  const library = new Map(sounds.map((sound) => [sound.id, sound]));
  const heard = plays.filter((play) => library.has(play.soundId));
  if (heard.length === 0 || !(duration > 0)) return null;

  const decoded = new Map<string, AudioBuffer>();
  for (const play of heard) {
    const sound = library.get(play.soundId);
    const key = renditionKey(play);
    if (!sound || decoded.has(key)) continue;
    try {
      decoded.set(key, await decode(sound, play.speed ?? 1));
    } catch {
      throw new Error(`The sound “${sound.name}” can’t be read, so the video can’t have it.`);
    }
  }

  const context = new OfflineAudioContext(
    2,
    Math.max(1, Math.ceil(duration * SOUNDTRACK_RATE)),
    SOUNDTRACK_RATE
  );
  for (const play of heard) {
    const buffer = decoded.get(renditionKey(play));
    if (!buffer) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = play.rate;
    const gain = context.createGain();
    schedulePlayGain(gain.gain, play, play.at);
    source.connect(gain).connect(context.destination);
    source.start(play.at, play.offset, play.duration);
  }
  return context.startRendering();
}
