/**
 * Sound data from outside the editor — a file, or layers pasted from another
 * window — read as the editor can use it: what's malformed is left out.
 */

import type { Sound, SoundClip } from '@quar/types';

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** The usable clips: each names its sound and has a place and a length. */
export function readSoundClips(clips: unknown): SoundClip[] {
  if (!Array.isArray(clips)) return [];
  return clips.flatMap((clip: Partial<Record<keyof SoundClip, unknown>>) => {
    if (!clip || typeof clip.id !== 'string' || typeof clip.soundId !== 'string') return [];
    if (!isNumber(clip.start) || !isNumber(clip.duration) || !(clip.duration > 0)) return [];
    return [
      {
        id: clip.id,
        soundId: clip.soundId,
        start: Math.max(0, Math.round(clip.start)),
        offset: isNumber(clip.offset) ? Math.max(0, clip.offset) : 0,
        duration: clip.duration,
        gain: isNumber(clip.gain) ? Math.max(0, clip.gain) : 1,
        ...(clip.muted === true ? { muted: true } : {}),
        ...(isNumber(clip.fadeIn) && clip.fadeIn > 0 ? { fadeIn: clip.fadeIn } : {}),
        ...(isNumber(clip.fadeOut) && clip.fadeOut > 0 ? { fadeOut: clip.fadeOut } : {}),
      },
    ];
  });
}

/** The usable sounds of a library: sound data, with a length. */
export function readSounds(sounds: unknown): Sound[] {
  if (!Array.isArray(sounds)) return [];
  return sounds.flatMap((sound: Partial<Record<keyof Sound, unknown>>) => {
    if (!sound || typeof sound.id !== 'string' || typeof sound.src !== 'string') return [];
    if (!sound.src.startsWith('data:audio/')) return [];
    if (!isNumber(sound.duration) || !(sound.duration > 0)) return [];
    return [
      {
        id: sound.id,
        name: typeof sound.name === 'string' ? sound.name : 'Sound',
        src: sound.src,
        duration: sound.duration,
      },
    ];
  });
}
