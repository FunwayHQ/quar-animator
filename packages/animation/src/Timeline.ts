/**
 * Timeline management for Quar Animator
 */

import type { Timeline, PropertyTrack, Keyframe, Marker, EasingFunction } from '@quar/types';
import { applyEasing } from './Easing';

// ============================================================================
// ID Generation
// ============================================================================

let idCounter = 0;

export function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now()}_${++idCounter}`;
}

// ============================================================================
// Timeline Factory
// ============================================================================

export function createTimeline(options: Partial<Timeline> = {}): Timeline {
  return {
    id: options.id ?? generateId('timeline'),
    name: options.name ?? 'Main Timeline',
    duration: options.duration ?? 300, // 10 seconds at 30fps
    frameRate: options.frameRate ?? 30,
    tracks: options.tracks ?? [],
    markers: options.markers ?? [],
  };
}

// ============================================================================
// Track Operations
// ============================================================================

export function createTrack<T>(
  nodeId: string,
  property: string,
  keyframes: Keyframe<T>[] = []
): PropertyTrack<T> {
  return {
    id: generateId('track'),
    nodeId,
    property,
    keyframes,
  };
}

export function findTrack<T>(
  timeline: Timeline,
  nodeId: string,
  property: string
): PropertyTrack<T> | undefined {
  return timeline.tracks.find((t: PropertyTrack) => t.nodeId === nodeId && t.property === property);
}

export function getOrCreateTrack<T>(
  timeline: Timeline,
  nodeId: string,
  property: string
): PropertyTrack<T> {
  let track = findTrack<T>(timeline, nodeId, property);

  if (!track) {
    track = createTrack<T>(nodeId, property);
    timeline.tracks.push(track as PropertyTrack);
  }

  return track;
}

// ============================================================================
// Binary Search Helper
// ============================================================================

/**
 * Binary search over a sorted keyframes array.
 * Returns the index of the first keyframe with time >= targetTime.
 * If all keyframes have time < targetTime, returns keyframes.length.
 * This is equivalent to a "lower bound" search.
 */
export function binarySearchKeyframes<T>(
  keyframes: readonly Keyframe<T>[],
  targetTime: number
): number {
  let lo = 0;
  let hi = keyframes.length;

  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (keyframes[mid].time < targetTime) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  return lo;
}

// ============================================================================
// Keyframe Operations
// ============================================================================

export function createKeyframe<T>(
  time: number,
  value: T,
  easing: EasingFunction = 'linear'
): Keyframe<T> {
  return {
    id: generateId('kf'),
    time,
    value,
    easing,
  };
}

export function addKeyframe<T>(
  track: PropertyTrack<T>,
  time: number,
  value: T,
  easing: EasingFunction = 'linear'
): Keyframe<T> {
  const keyframe = createKeyframe(time, value, easing);

  // Binary search: find index of first keyframe with time >= target
  const index = binarySearchKeyframes(track.keyframes, time);

  if (index < track.keyframes.length && track.keyframes[index].time === time) {
    // Update existing keyframe at this time
    track.keyframes[index] = keyframe;
  } else {
    // Insert at the found position to maintain sorted order
    track.keyframes.splice(index, 0, keyframe);
  }

  return keyframe;
}

export function removeKeyframe<T>(track: PropertyTrack<T>, keyframeId: string): boolean {
  const index = track.keyframes.findIndex((kf: Keyframe<T>) => kf.id === keyframeId);
  if (index === -1) return false;

  track.keyframes.splice(index, 1);
  return true;
}

export function moveKeyframe<T>(
  track: PropertyTrack<T>,
  keyframeId: string,
  newTime: number
): boolean {
  const keyframe = track.keyframes.find((kf: Keyframe<T>) => kf.id === keyframeId);
  if (!keyframe) return false;

  // Remove and re-insert to maintain sorted order
  removeKeyframe(track, keyframeId);
  keyframe.time = newTime;

  const insertIndex = binarySearchKeyframes(track.keyframes, newTime);

  // Replace existing keyframe at newTime if present (maintain sorted-unique invariant)
  if (insertIndex < track.keyframes.length && track.keyframes[insertIndex].time === newTime) {
    track.keyframes[insertIndex] = keyframe;
  } else {
    track.keyframes.splice(insertIndex, 0, keyframe);
  }

  return true;
}

// ============================================================================
// Interpolation
// ============================================================================

export function findSurroundingKeyframes<T>(
  track: PropertyTrack<T>,
  time: number
): [Keyframe<T> | null, Keyframe<T> | null] {
  const keyframes = track.keyframes;

  if (keyframes.length === 0) {
    return [null, null];
  }

  // Binary search: find index of first keyframe with time >= target
  const index = binarySearchKeyframes(keyframes, time);

  // Determine the "before" keyframe (at or before the given time)
  let beforeIndex: number;
  if (index < keyframes.length && keyframes[index].time === time) {
    // Exact match — this keyframe is the "before"
    beforeIndex = index;
  } else {
    // index points to the first keyframe AFTER time, so before is index - 1
    beforeIndex = index - 1;
  }

  const before = beforeIndex >= 0 ? keyframes[beforeIndex] : null;
  const after = beforeIndex < keyframes.length - 1 ? keyframes[beforeIndex + 1] : null;

  return [before, after];
}

export function interpolateValue<T>(
  track: PropertyTrack<T>,
  time: number,
  interpolator: (a: T, b: T, t: number) => T
): T | undefined {
  const [before, after] = findSurroundingKeyframes(track, time);

  if (!before && !after) {
    return undefined;
  }

  if (!before) {
    return after!.value;
  }

  if (!after || before.time === after.time) {
    return before.value;
  }

  // Calculate normalized time between keyframes
  const localT = (time - before.time) / (after.time - before.time);

  // Apply easing
  const easedT = applyEasing(localT, before.easing);

  // Interpolate
  return interpolator(before.value, after.value, easedT);
}

// ============================================================================
// Common Interpolators
// ============================================================================

export const interpolators = {
  number: (a: number, b: number, t: number): number => {
    return a + (b - a) * t;
  },

  vector2: (
    a: { x: number; y: number },
    b: { x: number; y: number },
    t: number
  ): { x: number; y: number } => {
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    };
  },

  color: (
    a: { r: number; g: number; b: number; a: number },
    b: { r: number; g: number; b: number; a: number },
    t: number
  ): { r: number; g: number; b: number; a: number } => {
    // Interpolate all channels as floats; rounding to integer should happen at render time
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
      a: a.a + (b.a - a.a) * t,
    };
  },

  rotation: (a: number, b: number, t: number): number => {
    // Shortest-path interpolation: wrap difference to [-180, 180]
    // Use true mathematical modulo ((x % n) + n) % n to handle negative values
    const diff = (((b - a + 180) % 360) + 360) % 360 - 180;
    return a + diff * t;
  },

  // Discrete - no interpolation, just snap to value
  discrete: <T>(a: T, _b: T, _t: number): T => {
    return a;
  },
};

// ============================================================================
// Marker Operations
// ============================================================================

export function addMarker(
  timeline: Timeline,
  time: number,
  name: string,
  color: string = '#FF6B6B'
): Marker {
  const marker: Marker = {
    id: generateId('marker'),
    time,
    name,
    color,
  };

  timeline.markers.push(marker);
  timeline.markers.sort((a: Marker, b: Marker) => a.time - b.time);

  return marker;
}

export function removeMarker(timeline: Timeline, markerId: string): boolean {
  const index = timeline.markers.findIndex((m: Marker) => m.id === markerId);
  if (index === -1) return false;

  timeline.markers.splice(index, 1);
  return true;
}

// ============================================================================
// Timeline Utilities
// ============================================================================

export function getTracksByNode(timeline: Timeline, nodeId: string): PropertyTrack[] {
  return timeline.tracks.filter((t: PropertyTrack) => t.nodeId === nodeId);
}

export function getKeyframeCount(timeline: Timeline): number {
  return timeline.tracks.reduce((sum: number, track: PropertyTrack) => sum + track.keyframes.length, 0);
}

export function getAnimatedNodes(timeline: Timeline): Set<string> {
  const nodes = new Set<string>();
  for (const track of timeline.tracks) {
    if (track.keyframes.length > 0) {
      nodes.add(track.nodeId);
    }
  }
  return nodes;
}

export function frameToTime(frame: number, frameRate: number): number {
  return frame / frameRate;
}

export function timeToFrame(time: number, frameRate: number): number {
  return Math.round(time * frameRate);
}

export function formatTimecode(frame: number, frameRate: number): string {
  const totalSeconds = frame / frameRate;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = frame % frameRate;

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}
