/**
 * Animation spans — the frame ranges where a node is actually animating, used
 * to draw a line through the keyframes that make up one animation.
 */

import type { Keyframe, PropertyTrack } from '@quar/types';

export interface AnimationSpan {
  start: number;
  end: number;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Runs of consecutive keyframes over which a track's value changes. A hold
 * (equal values) only counts when it leads straight into a one-frame jump —
 * the hold-then-step pattern of stepped reveals — so animations with a rest
 * between them stay separate. Runs also break where Animation Sequence steps
 * meet.
 */
function trackSpans(keyframes: Keyframe[]): AnimationSpan[] {
  const spans: AnimationSpan[] = [];
  let run: (AnimationSpan & { stepId: string | undefined }) | null = null;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const from = keyframes[i]!;
    const to = keyframes[i + 1]!;
    if (to.time <= from.time) continue;
    const changes = !valuesEqual(from.value, to.value);
    const next = keyframes[i + 2];
    const leadsIntoStep =
      next !== undefined && next.time - to.time <= 1 && !valuesEqual(to.value, next.value);
    if (!(changes || leadsIntoStep)) {
      run = null;
      continue;
    }
    // A segment belongs to the step of its first keyframe; where two steps
    // meet, the shared keyframe is the later step's.
    if (run && run.end === from.time && run.stepId === from.sequenceStepId) {
      run.end = to.time;
    } else {
      run = { start: from.time, end: to.time, stepId: from.sequenceStepId };
      spans.push(run);
    }
  }
  return spans.map(({ start, end }) => ({ start, end }));
}

/**
 * Merge the animated ranges of all of a node's tracks. Overlapping ranges
 * merge; ranges that only touch stay separate, so back-to-back animations
 * remain distinguishable.
 */
export function getAnimationSpans(tracks: PropertyTrack[]): AnimationSpan[] {
  const spans = tracks
    .flatMap((track) => trackSpans(track.keyframes))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: AnimationSpan[] = [];
  for (const span of spans) {
    const last = merged[merged.length - 1];
    if (last && span.start < last.end) {
      last.end = Math.max(last.end, span.end);
    } else if (!last || span.start !== last.start || span.end !== last.end) {
      merged.push({ ...span });
    }
  }
  return merged;
}
