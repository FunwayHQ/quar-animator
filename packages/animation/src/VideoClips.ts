/**
 * Video Clips
 * When a video layer plays on its timeline and which moment of its video
 * each frame shows (the canvas, the presentation player and exports alike,
 * counting frames as sound clips do, so a video and its sound stay
 * together) — at its speed, looped, holding its last frame — moving and
 * trimming a clip a frame at a time, setting its speed, loop and hold, and
 * keeping its linked sound clip where the video's clip is. The timing of a
 * clip's length and moments (clipSeconds, clipMomentAt), and trimming it
 * and setting its speed and loop, are a sound clip's too.
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
export function clipSeconds(
  clip: Pick<ClipTiming, 'duration' | 'speed' | 'loop' | 'loopFor'>
): number {
  const pass = Math.max(0, clip.duration) / clipSpeed(clip);
  if (!clip.loop) return pass;
  const { loopFor } = clip;
  return loopFor !== undefined && Number.isFinite(loopFor) && loopFor > 0 ? loopFor : pass;
}

/** Far less than a frame (or a hold's last moment), more than a slip in floating point, in seconds */
const LOOP_SLIP = 1e-9;

/**
 * The moment of a clip's file, in seconds, `elapsed` seconds of its
 * timeline after it starts: at its speed, starting over at the end of its
 * part when it loops (else stopping there).
 */
export function clipMomentAt(clip: ClipTiming, elapsed: number): number {
  const duration = Math.max(0, clip.duration);
  let played = Math.max(0, elapsed) * clipSpeed(clip);
  if (clip.loop && duration > 0) {
    played %= duration;
    // A whole number of passes, short by a slip in the sums: the next one starting
    if (duration - played < LOOP_SLIP) played = 0;
  }
  return clip.offset + Math.min(played, duration);
}

/** Where a clip stops playing on its timeline, in frames (not whole: a video ends where it ends). */
export function videoClipEndFrame(clip: VideoClip, frameRate: number): number {
  return clip.start + clipSeconds(clip) * Math.max(1, frameRate);
}

/**
 * The last frame any of the clips plays on (-1 with none): playing runs on
 * to it, as it does to the last sound. A held last frame isn't playing.
 */
export function lastVideoFrame(clips: Iterable<VideoClip>, frameRate: number): number {
  let last = -1;
  for (const clip of clips) {
    if (!(clipSeconds(clip) > 0)) continue;
    last = Math.max(last, Math.ceil(videoClipEndFrame(clip, frameRate) - 1e-6) - 1);
  }
  return last;
}

/**
 * How far into a clip its last frame on its timeline is, in seconds (the
 * last whole frame it plays on; a clip ending part way through a frame
 * plays on that one).
 */
function lastFrameElapsed(clip: VideoClip, rate: number): number {
  return Math.max(0, Math.ceil(clipSeconds(clip) * rate - 1e-6) - 1) / rate;
}

/**
 * The moment of the video a clip that holds its last frame goes on showing
 * after it ends: the one its last frame shows — where its part ends, or,
 * looped and cut part way through a pass, where it stopped. Null for a clip
 * that doesn't hold, or has nothing to show.
 */
export function heldVideoTime(clip: VideoClip, frameRate: number): number | null {
  if (!clip.holdLastFrame || !(clipSeconds(clip) > 0)) return null;
  return clipMomentAt(clip, lastFrameElapsed(clip, Math.max(1, frameRate)));
}

/**
 * The moment of the video, in seconds, a frame of its timeline shows. Frame
 * f begins at f / frameRate seconds, as it does for a sound clip; frames
 * needn't be whole (an export at another rate samples between them). Null
 * outside the clip, where the layer shows nothing — but a clip that holds
 * its last frame shows that frame's picture from it on (between it and the
 * clip's end too, so an export sampling between frames never goes back).
 */
export function videoTimeAt(clip: VideoClip, frame: number, frameRate: number): number | null {
  const rate = Math.max(1, frameRate);
  if (!(frame >= clip.start)) return null;
  const elapsed = (frame - clip.start) / rate;
  if (clip.holdLastFrame) {
    const last = lastFrameElapsed(clip, rate);
    if (elapsed >= last) return heldVideoTime(clip, rate);
  }
  return elapsed < clipSeconds(clip) ? clipMomentAt(clip, elapsed) : null;
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

/** Small enough a slip in the sums not to round a frame away. */
const SLIP = 1e-6;

/** A looped clip's length as it was made, in seconds (none: one pass). */
function loopLength(clip: Pick<ClipTiming, 'loop' | 'loopFor'>): number | undefined {
  const { loopFor } = clip;
  return clip.loop && loopFor !== undefined && Number.isFinite(loopFor) && loopFor > 0
    ? loopFor
    : undefined;
}

/**
 * The clip's beginning trimmed to `frame`: the video before it skipped, or
 * (moved earlier) more of it played — at its speed, a frame of the timeline
 * being `speed` frames' worth of the video — back to the file's start (and
 * the timeline's first frame), and never past the end of its first pass, or
 * its own, less a frame. Its end stays where it is: a looped clip's length
 * changes with its pass.
 */
export function trimmedVideoStart<C extends ClipTiming>(
  clip: C,
  frame: number,
  frameRate: number
): C {
  const rate = Math.max(1, frameRate);
  const speed = clipSpeed(clip);
  const earliest = Math.max(0, Math.ceil(clip.start - (clip.offset * rate) / speed - SLIP));
  const passEnd = clip.start + (Math.max(0, clip.duration) / speed) * rate;
  const end = clip.start + clipSeconds(clip) * rate;
  const latest = Math.floor(Math.min(passEnd, end) + SLIP) - 1;
  if (latest < earliest) return clip;
  const start = Math.min(latest, Math.max(earliest, Math.round(frame)));
  if (start === clip.start) return clip;
  const moved = (start - clip.start) / rate;
  const trimmed: C = {
    ...clip,
    start,
    offset: Math.max(0, clip.offset + moved * speed),
    duration: clip.duration - moved * speed,
  };
  const loopFor = loopLength(clip);
  if (loopFor !== undefined) trimmed.loopFor = loopFor - moved;
  return trimmed;
}

/**
 * The clip's end trimmed to `frame` (at least a frame after its start): an
 * unlooped clip plays more or less of the video at its speed, not past the
 * end of the file (`videoDuration` seconds); a looped one lasts that long,
 * as far past the video's end as it's made to, its pass as it was.
 */
export function trimmedVideoEnd<C extends ClipTiming>(
  clip: C,
  frame: number,
  frameRate: number,
  videoDuration: number
): C {
  const rate = Math.max(1, frameRate);
  const length = Math.max(1, Math.round(frame) - clip.start) / rate;
  if (clip.loop) return length === clip.loopFor ? clip : { ...clip, loopFor: length };
  const longest = Math.max(0, videoDuration - clip.offset);
  const duration = Math.min(longest, length * clipSpeed(clip));
  return duration === clip.duration ? clip : { ...clip, duration };
}

/**
 * The clip played at `speed` (kept to 0.25×–4×; a wrong one changes
 * nothing) from where it starts: it ends sooner or later, but a looped one
 * lasts as long as it was made to.
 */
export function withClipSpeed<C extends ClipTiming>(clip: C, speed: number): C {
  if (!Number.isFinite(speed) || speed <= 0) return clip;
  const next = Math.min(MAX_CLIP_SPEED, Math.max(MIN_CLIP_SPEED, speed));
  if (clip.speed === (next === 1 ? undefined : next)) return clip;
  const changed: C = { ...clip, speed: next };
  // 1× is playing as recorded: no speed of its own
  if (next === 1) delete changed.speed;
  return changed;
}

/** The clip looping (for a pass until it's lengthened), or not (its looped length gone with it). */
export function withLoop<C extends ClipTiming>(clip: C, on: boolean): C {
  if (on) return clip.loop ? clip : { ...clip, loop: true };
  if (clip.loop === undefined && clip.loopFor === undefined) return clip;
  const changed: C = { ...clip };
  delete changed.loop;
  delete changed.loopFor;
  return changed;
}

/**
 * The clip looping until `frame` of its timeline, for a pass at least (at
 * its speed): how a GIF fills the rest of the timeline it's put on.
 */
export function loopedUntil<C extends ClipTiming>(clip: C, frame: number, frameRate: number): C {
  const pass = Math.max(0, clip.duration) / clipSpeed(clip);
  const until = (frame - clip.start) / Math.max(1, frameRate);
  return { ...clip, loop: true, loopFor: Math.max(pass, until) };
}

/** The clip holding its last frame after it ends, or not. */
export function withHold(clip: VideoClip, on: boolean): VideoClip {
  if (on ? clip.holdLastFrame === true : clip.holdLastFrame === undefined) return clip;
  if (on) return { ...clip, holdLastFrame: true };
  const { holdLastFrame: _hold, ...changed } = clip;
  return changed;
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
