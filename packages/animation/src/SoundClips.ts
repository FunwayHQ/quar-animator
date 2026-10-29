/**
 * Sound Clips
 * Sounds placed on a timeline: what of each plays when part of the timeline
 * plays — at its speed (from the sound's rendition at that speed, which
 * keeps its pitch), looped a pass at a time — and how loud through its
 * fades (the editor's playback and video exports play them the same way),
 * moving and trimming them a frame at a time, the rows a sound lane shows
 * them in, and finding one on whichever timeline of a page it's on.
 */

import type { SoundClip, Timeline } from '@quar/types';
import type { TimelineScope } from './TimelineScope';
import { scopeSounds, withScopeSounds } from './TimelineScope';
import { clipSeconds, clipSpeed, trimmedVideoEnd, trimmedVideoStart } from './VideoClips';

/** Where a clip stops sounding on its timeline, in frames (not whole: a sound ends where it ends). */
export function clipEndFrame(clip: SoundClip, frameRate: number): number {
  return clip.start + clipSeconds(clip) * Math.max(1, frameRate);
}

/** The last frame any of the clips sounds on (-1 with none). */
export function lastSoundFrame(clips: readonly SoundClip[] | undefined, frameRate: number): number {
  let last = -1;
  for (const clip of clips ?? []) {
    last = Math.max(last, Math.ceil(clipEndFrame(clip, frameRate)) - 1);
  }
  return last;
}

/** What a clip's loudness through it depends on (its length on the timeline and fades). */
export type ClipShape = Pick<
  SoundClip,
  'duration' | 'fadeIn' | 'fadeOut' | 'speed' | 'loop' | 'loopFor'
>;

/**
 * A clip's fades, in seconds of its timeline, made to fit it: together no
 * longer than the clip lasts there (both shortened alike when they'd
 * overlap, as when it's trimmed or sped up). A looped clip fades in on its
 * first pass and out on its last.
 */
export function clipFades(clip: ClipShape): { fadeIn: number; fadeOut: number } {
  const fadeIn = Math.max(0, clip.fadeIn ?? 0) || 0;
  const fadeOut = Math.max(0, clip.fadeOut ?? 0) || 0;
  const both = fadeIn + fadeOut;
  const length = clipSeconds(clip);
  const fit = both > length && both > 0 ? length / both : 1;
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
  const length = clipSeconds(clip);
  const fit = (value: number, room: number) =>
    Math.min(Math.max(0, room), Math.max(0, Number.isFinite(value) ? value : 0));
  if (fades.fadeIn !== undefined) fadeIn = fit(fades.fadeIn, length - fadeOut);
  if (fades.fadeOut !== undefined) fadeOut = fit(fades.fadeOut, length - fadeIn);
  if (fadeIn === (clip.fadeIn ?? 0) && fadeOut === (clip.fadeOut ?? 0)) return clip;
  const { fadeIn: _in, fadeOut: _out, ...rest } = clip;
  return {
    ...rest,
    ...(fadeIn > 0 ? { fadeIn } : {}),
    ...(fadeOut > 0 ? { fadeOut } : {}),
  };
}

/**
 * How loud a clip is `seconds` of its timeline into it, before its volume:
 * 0–1, its fades rising and falling straight.
 */
export function clipLevel(clip: ClipShape, seconds: number): number {
  const { fadeIn, fadeOut } = clipFades(clip);
  let level = 1;
  if (seconds < fadeIn) level = Math.max(0, seconds / fadeIn);
  const left = clipSeconds(clip) - seconds;
  if (left < fadeOut) level = Math.min(level, Math.max(0, left / fadeOut));
  return level;
}

/** A clip's loudness (0–1, before its volume) `time` seconds of what it plays into a play of it. */
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
  /** Where in the sound (or its rendition at `speed`) it starts, in seconds of that */
  offset: number;
  /** How much of the sound (or its rendition) it plays, in seconds of that */
  duration: number;
  gain: number;
  /** How fast the sound plays (the timeline's speed: 2 is an octave up) */
  rate: number;
  /**
   * The clip's own speed, keeping its pitch: what plays is the sound's
   * rendition at that speed, a second of it a second of the timeline
   * (a moment s seconds into the sound is s / speed into it). Absent at 1×:
   * the sound itself.
   */
  speed?: number;
  /** Its fades, as loudness at points through it (straight between); absent without fades */
  levels?: SoundLevel[];
}

/** The loudness through the part of a clip from `skipped` seconds of its timeline into it, `duration` long. */
function playLevels(clip: SoundClip, skipped: number, duration: number): SoundLevel[] | undefined {
  const { fadeIn, fadeOut } = clipFades(clip);
  if (fadeIn === 0 && fadeOut === 0) return undefined;
  const end = skipped + duration;
  const times = [skipped, fadeIn, clipSeconds(clip) - fadeOut, end]
    .filter((time) => time >= skipped && time <= end)
    .sort((a, b) => a - b)
    .filter((time, i, sorted) => i === 0 || time - sorted[i - 1]! > 1e-9);
  return times.map((time) => ({ time: time - skipped, level: clipLevel(clip, time) }));
}

/** How loud a play is (0–1, before its volume) `seconds` of the sound into it. */
export function playLevel(play: SoundPlay, seconds: number): number {
  return levelAmong(play.levels, seconds);
}

/** The loudness at `seconds` along levels (straight between them; 1 with none). */
function levelAmong(levels: readonly SoundLevel[] | undefined, seconds: number): number {
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

/** Plays shorter than this (seconds) are slips in the sums, not sound. */
const SLIVER = 1e-9;

/** Seconds a looped clip dips to silence where it starts over, so the join doesn't click. */
const JOIN_FADE = 0.005;

/**
 * A pass's levels with a moment's dip where it meets the pass before it
 * (`fromJoin`) or the one after (`toJoin`): a loop seldom starts over on a
 * whole wave, and a cut there clicks.
 */
function withJoins(
  levels: SoundLevel[] | undefined,
  duration: number,
  fromJoin: boolean,
  toJoin: boolean
): SoundLevel[] | undefined {
  if (!fromJoin && !toJoin) return levels;
  const ramp = Math.min(JOIN_FADE, duration / 2);
  const times = new Set([0, duration, ...(levels ?? []).map((point) => point.time)]);
  if (fromJoin) times.add(ramp);
  if (toJoin) times.add(duration - ramp);
  return [...times]
    .sort((a, b) => a - b)
    .map((time) => {
      let level = levelAmong(levels, time);
      if (fromJoin && time < ramp) level *= time / ramp;
      if (toJoin && time > duration - ramp) level *= (duration - time) / ramp;
      return { time, level };
    });
}

/**
 * What of each clip plays when frames `startFrame` to `endFrame` of a
 * timeline play (frame f shows from f / frameRate seconds, for a frame), at
 * `speed`: 2 plays twice as fast, the sounds with it. A clip that started
 * before the range plays from where it has got to; one that runs past the
 * range is cut where it ends. A clip at a speed of its own plays from the
 * sound's rendition at it; a looped one plays a pass at a time, its last
 * cut where it ends. Muted and silent clips play nothing.
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
    const own = clipSpeed(clip);
    // A pass of its part of the sound, in seconds of the timeline (and of the rendition)
    const pass = clip.duration / own;
    const begins = clip.start / rate;
    const start = Math.max(begins, from);
    const end = Math.min(begins + clipSeconds(clip), to);
    if (!(end > start)) continue;
    for (let k = Math.floor((start - begins) / pass); begins + k * pass < end - SLIVER; k++) {
      const passBegins = begins + k * pass;
      const playFrom = Math.max(start, passBegins);
      const playTo = Math.min(end, passBegins + pass);
      if (!(playTo - playFrom > SLIVER)) continue;
      const levels = withJoins(
        playLevels(clip, playFrom - begins, playTo - playFrom),
        playTo - playFrom,
        k > 0 && playFrom - passBegins < SLIVER,
        passBegins + pass < begins + clipSeconds(clip) - SLIVER &&
          passBegins + pass - playTo < SLIVER
      );
      plays.push({
        clipId: clip.id,
        soundId: clip.soundId,
        at: (playFrom - from) / pace,
        offset: clip.offset / own + (playFrom - passBegins),
        duration: playTo - playFrom,
        gain: clip.gain,
        rate: pace,
        ...(levels ? { levels } : {}),
        ...(own !== 1 ? { speed: own } : {}),
      });
    }
  }
  return plays;
}

/** The clip moved to start on `frame` (a whole frame, not before the first). */
export function movedClip(clip: SoundClip, frame: number): SoundClip {
  const start = Math.max(0, Math.round(frame));
  return start === clip.start ? clip : { ...clip, start };
}

/**
 * The clip's beginning trimmed to `frame`, as a video clip's is
 * (trimmedVideoStart): the sound before it skipped, or more of it played,
 * at its speed; its end staying where it is.
 */
export function trimmedStart(clip: SoundClip, frame: number, frameRate: number): SoundClip {
  return trimmedVideoStart(clip, frame, frameRate);
}

/**
 * The clip's end trimmed to `frame`, as a video clip's is (trimmedVideoEnd):
 * at its speed, not past the sound's end (`soundDuration` seconds); a
 * looped one as long as it's made to.
 */
export function trimmedEnd(
  clip: SoundClip,
  frame: number,
  frameRate: number,
  soundDuration: number
): SoundClip {
  return trimmedVideoEnd(clip, frame, frameRate, soundDuration);
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
