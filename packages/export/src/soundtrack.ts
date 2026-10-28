/**
 * Soundtrack
 * The sound of a video export: the clips on the timeline it plays (or on
 * each slide's, as each slide plays), mixed into one stereo track timed to
 * the video, as the editor plays them — fades too.
 */

import { schedulePlayGain, soundsPlayed } from '@quar/animation';
import type { SoundPlay } from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';

/** The soundtrack's sample rate (sounds are resampled to it as they're decoded). */
export const SOUNDTRACK_RATE = 48000;

/** A sound file's bytes, from its data URI. */
export function soundBytes(src: string): Uint8Array<ArrayBuffer> {
  const binary = atob(src.slice(src.indexOf(',') + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A sound decoded, at the soundtrack's rate (or `context`'s). */
export async function decodeSound(src: string, context?: BaseAudioContext): Promise<AudioBuffer> {
  const decoder = context ?? new OfflineAudioContext(1, 1, SOUNDTRACK_RATE);
  return decoder.decodeAudioData(soundBytes(src).buffer);
}

/** A stretch of the video: frames `startFrame`–`endFrame` of a timeline with these clips, from `at` seconds in. */
export interface SoundtrackPart {
  clips: readonly SoundClip[] | undefined;
  at: number;
  startFrame: number;
  endFrame: number;
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

/**
 * The plays mixed into a stereo track `duration` seconds long, or null when
 * nothing plays (a clip whose sound isn't in the library plays nothing).
 */
export async function mixSoundtrack(
  plays: readonly SoundPlay[],
  sounds: readonly Sound[],
  duration: number,
  decode: (sound: Sound) => Promise<AudioBuffer> = (sound) => decodeSound(sound.src)
): Promise<AudioBuffer | null> {
  const library = new Map(sounds.map((sound) => [sound.id, sound]));
  const heard = plays.filter((play) => library.has(play.soundId));
  if (heard.length === 0 || !(duration > 0)) return null;

  const decoded = new Map<string, AudioBuffer>();
  for (const play of heard) {
    const sound = library.get(play.soundId);
    if (!sound || decoded.has(sound.id)) continue;
    try {
      decoded.set(sound.id, await decode(sound));
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
    const buffer = decoded.get(play.soundId);
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
