/**
 * Sound Clips
 * Sounds placed on a timeline: what of each plays when part of the timeline
 * plays (the editor's playback and video exports play them the same way),
 * moving and trimming them a frame at a time, the rows a sound lane shows
 * them in, and finding one on whichever timeline of a page it's on.
 */

import type { SoundClip, Timeline } from '@quar/types';
import type { TimelineScope } from './TimelineScope';
import { scopeSounds, withScopeSounds } from './TimelineScope';

/** Where a clip stops sounding on its timeline, in frames (not whole: a sound ends where it ends). */
export function clipEndFrame(clip: SoundClip, frameRate: number): number {
  return clip.start + clip.duration * Math.max(1, frameRate);
}

/** The last frame any of the clips sounds on (-1 with none). */
export function lastSoundFrame(clips: readonly SoundClip[] | undefined, frameRate: number): number {
  let last = -1;
  for (const clip of clips ?? []) {
    last = Math.max(last, Math.ceil(clipEndFrame(clip, frameRate)) - 1);
  }
  return last;
}

/** The part of a clip that plays. */
export interface SoundPlay {
  clipId: string;
  soundId: string;
  /** When it starts, in seconds after playing starts */
  at: number;
  /** Where in the sound it starts, in seconds */
  offset: number;
  /** How much of the sound it plays, in seconds of the sound */
  duration: number;
  gain: number;
  /** How fast the sound plays (the timeline's speed: 2 is an octave up) */
  rate: number;
}

/**
 * What of each clip plays when frames `startFrame` to `endFrame` of a
 * timeline play (frame f shows from f / frameRate seconds, for a frame), at
 * `speed`: 2 plays twice as fast, the sounds with it. A clip that started
 * before the range plays from where it has got to; one that runs past the
 * range is cut where it ends. Muted and silent clips play nothing.
 */
export function soundsPlayed(
  clips: readonly SoundClip[] | undefined,
  frameRate: number,
  startFrame: number,
  endFrame: number,
  speed = 1
): SoundPlay[] {
  const rate = Math.max(1, frameRate);
  const pace = speed > 0 ? speed : 1;
  const from = startFrame / rate;
  const to = (endFrame + 1) / rate;
  const plays: SoundPlay[] = [];
  for (const clip of clips ?? []) {
    if (clip.muted || !(clip.gain > 0) || !(clip.duration > 0)) continue;
    const begins = clip.start / rate;
    const start = Math.max(begins, from);
    const end = Math.min(begins + clip.duration, to);
    if (!(end > start)) continue;
    plays.push({
      clipId: clip.id,
      soundId: clip.soundId,
      at: (start - from) / pace,
      offset: clip.offset + (start - begins),
      duration: end - start,
      gain: clip.gain,
      rate: pace,
    });
  }
  return plays;
}

/** The clip moved to start on `frame` (a whole frame, not before the first). */
export function movedClip(clip: SoundClip, frame: number): SoundClip {
  const start = Math.max(0, Math.round(frame));
  return start === clip.start ? clip : { ...clip, start };
}

/**
 * The clip's beginning trimmed to `frame`: the sound before it is skipped,
 * or (moved earlier) more of it plays — back to the sound's start, and
 * never past its end less a frame.
 */
export function trimmedStart(clip: SoundClip, frame: number, frameRate: number): SoundClip {
  const rate = Math.max(1, frameRate);
  // Small enough a slip in the sums not to round a frame away
  const earliest = Math.max(0, Math.ceil(clip.start - clip.offset * rate - 1e-6));
  const latest = Math.floor(clipEndFrame(clip, rate) + 1e-6) - 1;
  if (latest < earliest) return clip;
  const start = Math.min(latest, Math.max(earliest, Math.round(frame)));
  if (start === clip.start) return clip;
  const shift = (start - clip.start) / rate;
  return {
    ...clip,
    start,
    offset: Math.max(0, clip.offset + shift),
    duration: clip.duration - shift,
  };
}

/** The clip's end trimmed to `frame`: at least a frame long, and not past the sound's end. */
export function trimmedEnd(
  clip: SoundClip,
  frame: number,
  frameRate: number,
  soundDuration: number
): SoundClip {
  const rate = Math.max(1, frameRate);
  const longest = Math.max(0, soundDuration - clip.offset);
  const duration = Math.min(longest, Math.max(1 / rate, (Math.round(frame) - clip.start) / rate));
  return duration === clip.duration ? clip : { ...clip, duration };
}

/**
 * The row of a sound lane each clip shows in: the first with room for it,
 * taking the clips in the order they start, so clips that play together
 * sit one under another. `count` is how many rows that takes (at least one).
 */
export function soundRows(
  clips: readonly SoundClip[],
  frameRate: number
): { rows: Map<string, number>; count: number } {
  const ordered = [...clips].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
  const ends: number[] = [];
  const rows = new Map<string, number>();
  for (const clip of ordered) {
    let row = ends.findIndex((end) => end <= clip.start);
    if (row < 0) row = ends.length;
    ends[row] = clipEndFrame(clip, frameRate);
    rows.set(clip.id, row);
  }
  return { rows, count: Math.max(1, ends.length) };
}

/** Every timeline a page has: the page's own (null), then each artboard's. */
function scopesOf(timeline: Timeline): TimelineScope[] {
  return [null, ...Object.keys(timeline.artboards ?? {})];
}

/** The clip and the timeline (scope) it's on, wherever on the page it is. */
export function findSoundClip(
  timeline: Timeline,
  clipId: string
): { scope: TimelineScope; clip: SoundClip } | null {
  for (const scope of scopesOf(timeline)) {
    const clip = scopeSounds(timeline, scope).find((candidate) => candidate.id === clipId);
    if (clip) return { scope, clip };
  }
  return null;
}

/** The timeline with a clip changed, or taken out (`change` returns null), wherever it is. */
export function withSoundClip(
  timeline: Timeline,
  clipId: string,
  change: (clip: SoundClip) => SoundClip | null
): Timeline {
  const found = findSoundClip(timeline, clipId);
  if (!found) return timeline;
  const changed = change(found.clip);
  if (changed === found.clip) return timeline;
  const sounds = scopeSounds(timeline, found.scope).flatMap((clip) =>
    clip.id !== clipId ? [clip] : changed ? [changed] : []
  );
  return withScopeSounds(timeline, found.scope, sounds);
}

/** The sounds (their ids) the clips on a page's timelines play. */
export function soundIdsUsed(timeline: Timeline): Set<string> {
  const ids = new Set<string>();
  for (const scope of scopesOf(timeline)) {
    for (const clip of scopeSounds(timeline, scope)) ids.add(clip.soundId);
  }
  return ids;
}
