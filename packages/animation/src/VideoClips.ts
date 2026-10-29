/**
 * Video Clips
 * When a video layer plays on its timeline and which moment of its video
 * each frame shows (the canvas, the presentation player and exports alike,
 * counting frames as sound clips do, so a video and its sound stay
 * together), moving a clip a frame at a time, and keeping its linked sound
 * clip where the video's clip is.
 */

import type { SoundClip, VideoClip } from '@quar/types';

/** Where a clip stops showing on its timeline, in frames (not whole: a video ends where it ends). */
export function videoClipEndFrame(clip: VideoClip, frameRate: number): number {
  return clip.start + clip.duration * Math.max(1, frameRate);
}

/**
 * The moment of the video, in seconds, a frame of its timeline shows. Frame
 * f begins at f / frameRate seconds, as it does for a sound clip; frames
 * needn't be whole (an export at another rate samples between them). Null
 * outside the clip, where the layer shows nothing.
 */
export function videoTimeAt(clip: VideoClip, frame: number, frameRate: number): number | null {
  const rate = Math.max(1, frameRate);
  if (!(frame >= clip.start) || frame >= videoClipEndFrame(clip, rate)) return null;
  return clip.offset + (frame - clip.start) / rate;
}

/**
 * The moment of the video a layer shows while its timeline isn't the one in
 * view (another artboard's): its clip's first, so it's never blank there.
 */
export function videoPosterTime(clip: VideoClip): number {
  return clip.offset;
}

/** The clip moved to start on `frame` (a whole frame, not before the first). */
export function movedVideoClip(clip: VideoClip, frame: number): VideoClip {
  const start = Math.max(0, Math.round(frame));
  return start === clip.start ? clip : { ...clip, start };
}

/**
 * A sound clip linked to a video layer, put where the layer's clip is: the
 * same start and the same part of the file (its gain, fades and mute stay
 * its own). Unchanged when it's there already.
 */
export function linkedSoundClip(sound: SoundClip, clip: VideoClip): SoundClip {
  if (
    sound.start === clip.start &&
    sound.offset === clip.offset &&
    sound.duration === clip.duration
  ) {
    return sound;
  }
  return { ...sound, start: clip.start, offset: clip.offset, duration: clip.duration };
}
