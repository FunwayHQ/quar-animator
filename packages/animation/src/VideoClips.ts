/**
 * Video Clips
 * When a video layer plays on its timeline and which moment of its video
 * each frame shows (the canvas, the presentation player and exports alike,
 * counting frames as sound clips do, so a video and its sound stay
 * together) — at its speed, looped, holding its last frame — moving a clip
 * a frame at a time, and keeping its linked sound clip where the video's
 * clip is. The timing of a clip's length and moments (clipSeconds,
 * clipMomentAt) is a sound clip's too.
 */

import type { SoundClip, VideoClip } from '@quar/types';

/** What a clip's timing on its timeline is made of, a video's or a sound's. */
export type ClipTiming = Pick<
  VideoClip,
  'start' | 'offset' | 'duration' | 'speed' | 'loop' | 'loopFor'
>;

/** The slowest and fastest a clip plays. */
export const MIN_CLIP_SPEED = 0.25;
export const MAX_CLIP_SPEED = 4;

/** How fast a clip plays: its speed kept to the range, 1 when it has none (or a wrong one). */
export function clipSpeed(clip: Pick<ClipTiming, 'speed'>): number {
  const { speed } = clip;
  if (speed === undefined || !Number.isFinite(speed) || speed <= 0) return 1;
  return Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed));
}

/**
 * How long a clip lasts on its timeline, in seconds: one pass of its part
 * of the file at its speed, or, looped, as long as it's made to (one pass
 * when it hasn't been).
 */
export function clipSeconds(clip: ClipTiming): number {
  const pass = Math.max(0, clip.duration) / clipSpeed(clip);
  if (!clip.loop) return pass;
  const { loopFor } = clip;
  return loopFor !== undefined && Number.isFinite(loopFor) && loopFor > 0 ? loopFor : pass;
}

/**
 * The moment of a clip's file, in seconds, `elapsed` seconds of its
 * timeline after it starts: at its speed, starting over at the end of its
 * part when it loops (else stopping there).
 */
export function clipMomentAt(clip: ClipTiming, elapsed: number): number {
  const duration = Math.max(0, clip.duration);
  let played = Math.max(0, elapsed) * clipSpeed(clip);
  if (clip.loop && duration > 0) played %= duration;
  return clip.offset + Math.min(played, duration);
}

/** Where a clip stops playing on its timeline, in frames (not whole: a video ends where it ends). */
export function videoClipEndFrame(clip: VideoClip, frameRate: number): number {
  return clip.start + clipSeconds(clip) * Math.max(1, frameRate);
}

/** Just short of a clip's end: its last picture is the one showing there. */
const LAST_MOMENT = 1e-6;

/**
 * The moment of the video, in seconds, a frame of its timeline shows. Frame
 * f begins at f / frameRate seconds, as it does for a sound clip; frames
 * needn't be whole (an export at another rate samples between them). Null
 * outside the clip, where the layer shows nothing — but after it, a clip
 * that holds its last frame shows that.
 */
export function videoTimeAt(clip: VideoClip, frame: number, frameRate: number): number | null {
  const rate = Math.max(1, frameRate);
  if (!(frame >= clip.start)) return null;
  const elapsed = (frame - clip.start) / rate;
  const length = clipSeconds(clip);
  if (elapsed < length) return clipMomentAt(clip, elapsed);
  if (!clip.holdLastFrame || !(length > 0)) return null;
  return clipMomentAt(clip, length - LAST_MOMENT);
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

/** The timing a linked sound takes from its video's clip (holding a last frame isn't a sound's). */
const LINKED_TIMING = ['start', 'offset', 'duration', 'speed', 'loop', 'loopFor'] as const;

/**
 * A sound clip linked to a video layer, put where the layer's clip is: the
 * same start, the same part of the file, at the same speed, looped alike
 * (its gain, fades and mute stay its own). Unchanged when it's there already.
 */
export function linkedSoundClip(sound: SoundClip, clip: VideoClip): SoundClip {
  if (LINKED_TIMING.every((key) => sound[key] === clip[key])) return sound;
  const linked: SoundClip = { ...sound };
  for (const key of LINKED_TIMING) {
    if (clip[key] === undefined) delete linked[key];
    else Object.assign(linked, { [key]: clip[key] });
  }
  return linked;
}
