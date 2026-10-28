/**
 * Sound Clips
 * Sounds placed on a timeline: what of each plays when part of the timeline
 * plays, and how loud through its fades (the editor's playback and video
 * exports play them the same way),
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

/** What a clip's loudness through it depends on (its length and fades). */
export type ClipShape = Pick<SoundClip, 'duration' | 'fadeIn' | 'fadeOut'>;

/**
 * A clip's fades, in seconds, made to fit it: together no longer than the
 * clip (both shortened alike when they'd overlap, as when it's trimmed).
 */
export function clipFades(clip: ClipShape): { fadeIn: number; fadeOut: number } {
  const fadeIn = Math.max(0, clip.fadeIn ?? 0) || 0;
  const fadeOut = Math.max(0, clip.fadeOut ?? 0) || 0;
  const both = fadeIn + fadeOut;
  const fit = both > clip.duration && both > 0 ? Math.max(0, clip.duration) / both : 1;
  return { fadeIn: fadeIn * fit, fadeOut: fadeOut * fit };
}

/**
 * The clip with a fade set (seconds): kept within what the other fade leaves
 * of it, and taken off at 0. The same clip when nothing changes.
 */
export function fadedClip(
  clip: SoundClip,
  fades: { fadeIn?: number; fadeOut?: number }
): SoundClip {
  let { fadeIn, fadeOut } = clipFades(clip);
  const fit = (value: number, room: number) =>
    Math.min(Math.max(0, room), Math.max(0, Number.isFinite(value) ? value : 0));
  if (fades.fadeIn !== undefined) fadeIn = fit(fades.fadeIn, clip.duration - fadeOut);
  if (fades.fadeOut !== undefined) fadeOut = fit(fades.fadeOut, clip.duration - fadeIn);
  if (fadeIn === (clip.fadeIn ?? 0) && fadeOut === (clip.fadeOut ?? 0)) return clip;
  const { fadeIn: _in, fadeOut: _out, ...rest } = clip;
  return {
    ...rest,
    ...(fadeIn > 0 ? { fadeIn } : {}),
    ...(fadeOut > 0 ? { fadeOut } : {}),
  };
}

/** How loud a clip is `seconds` into it, before its volume: 0–1, its fades rising and falling straight. */
export function clipLevel(clip: ClipShape, seconds: number): number {
  const { fadeIn, fadeOut } = clipFades(clip);
  let level = 1;
  if (seconds < fadeIn) level = Math.max(0, seconds / fadeIn);
  const left = clip.duration - seconds;
  if (left < fadeOut) level = Math.min(level, Math.max(0, left / fadeOut));
  return level;
}

/** A clip's loudness (0–1, before its volume) `time` seconds of the sound into a play of it. */
export interface SoundLevel {
  time: number;
  level: number;
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
  /** Its fades, as loudness at points through it (straight between); absent without fades */
  levels?: SoundLevel[];
}

/** The loudness through the part of a clip from `skipped` seconds into it, `duration` long. */
function playLevels(clip: SoundClip, skipped: number, duration: number): SoundLevel[] | undefined {
  const { fadeIn, fadeOut } = clipFades(clip);
  if (fadeIn === 0 && fadeOut === 0) return undefined;
  const end = skipped + duration;
  const times = [skipped, fadeIn, clip.duration - fadeOut, end]
    .filter((time) => time >= skipped && time <= end)
    .sort((a, b) => a - b)
    .filter((time, i, sorted) => i === 0 || time - sorted[i - 1]! > 1e-9);
  return times.map((time) => ({ time: time - skipped, level: clipLevel(clip, time) }));
}

/** How loud a play is (0–1, before its volume) `seconds` of the sound into it. */
export function playLevel(play: SoundPlay, seconds: number): number {
  const levels = play.levels;
  if (!levels || levels.length === 0) return 1;
  const first = levels[0]!;
  if (seconds <= first.time) return first.level;
  for (let i = 1; i < levels.length; i++) {
    const next = levels[i]!;
    if (seconds <= next.time) {
      const previous = levels[i - 1]!;
      const span = next.time - previous.time;
      const t = span > 0 ? (seconds - previous.time) / span : 1;
      return previous.level + (next.level - previous.level) * t;
    }
  }
  return levels[levels.length - 1]!.level;
}

/** A value set and ramped on the audio clock (a Web Audio AudioParam). */
export interface RampedValue {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
}

/**
 * A play's volume on `param` (a gain node's), for it starting at
 * `startTime` on the audio clock `from` seconds of the sound into it: its
 * fades as ramps, at the pace it plays.
 */
export function schedulePlayGain(
  param: RampedValue,
  play: SoundPlay,
  startTime: number,
  from = 0
): void {
  if (!play.levels) {
    param.value = play.gain;
    return;
  }
  param.setValueAtTime(play.gain * playLevel(play, from), startTime);
  for (const point of play.levels) {
    if (point.time <= from) continue;
    param.linearRampToValueAtTime(
      play.gain * point.level,
      startTime + (point.time - from) / play.rate
    );
  }
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
    const levels = playLevels(clip, start - begins, end - start);
    plays.push({
      clipId: clip.id,
      soundId: clip.soundId,
      at: (start - from) / pace,
      offset: clip.offset + (start - begins),
      duration: end - start,
      gain: clip.gain,
      rate: pace,
      ...(levels ? { levels } : {}),
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
