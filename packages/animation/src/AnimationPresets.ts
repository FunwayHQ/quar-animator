/**
 * Reusable, editable animation presets built from ordinary timeline keyframes.
 */

import type { EasingFunction, Node, PropertyTrack, Timeline } from '@quar/types';
import { addKeyframe, createTrack } from './Timeline';

export type AnimationPresetCategory = 'Entrance' | 'Emphasis' | 'Exit';

export type AnimationPresetId =
  | 'fade-in'
  | 'rise-in'
  | 'slide-in'
  | 'pop-in'
  | 'pulse'
  | 'bounce'
  | 'shake'
  | 'fade-out'
  | 'shrink-out'
  | 'slide-out';

export interface AnimationPresetDefinition {
  id: AnimationPresetId;
  name: string;
  category: AnimationPresetCategory;
  description: string;
}

export const ANIMATION_PRESETS: AnimationPresetDefinition[] = [
  { id: 'fade-in', name: 'Fade', category: 'Entrance', description: 'Fade into view' },
  { id: 'rise-in', name: 'Rise', category: 'Entrance', description: 'Rise into place' },
  { id: 'slide-in', name: 'Slide', category: 'Entrance', description: 'Slide in from the left' },
  { id: 'pop-in', name: 'Pop', category: 'Entrance', description: 'Scale up into view' },
  { id: 'pulse', name: 'Pulse', category: 'Emphasis', description: 'Grow and settle' },
  { id: 'bounce', name: 'Bounce', category: 'Emphasis', description: 'Bounce in place' },
  { id: 'shake', name: 'Shake', category: 'Emphasis', description: 'Shake side to side' },
  { id: 'fade-out', name: 'Fade', category: 'Exit', description: 'Fade out of view' },
  { id: 'shrink-out', name: 'Shrink', category: 'Exit', description: 'Shrink out of view' },
  { id: 'slide-out', name: 'Slide', category: 'Exit', description: 'Slide out to the right' },
];

export interface PresetKeyframe {
  property: string;
  time: number;
  value: number;
  easing: EasingFunction;
}

export interface AnimationPresetKeyframes {
  keyframes: PresetKeyframe[];
  baseValues: Map<string, number>;
}

const linear: EasingFunction = 'linear';
const easeInOut: EasingFunction = 'easeInOutCubic';
const easeOut: EasingFunction = 'easeOutCubic';

/** Create a preset's property keyframes relative to a selected node and frame. */
export function createAnimationPresetKeyframes(
  node: Node,
  presetId: AnimationPresetId,
  startFrame: number,
  durationFrames: number
): AnimationPresetKeyframes {
  const start = Math.max(0, Math.round(startFrame));
  // Multi-beat presets need at least four frames to keep their beats distinct.
  const duration = Math.max(4, Math.round(durationFrames));
  const end = start + duration;
  const middle = start + Math.round(duration / 2);
  const quarter = start + Math.round(duration / 4);
  const threeQuarter = start + Math.round((duration * 3) / 4);

  const x = node.transform.position.x;
  const y = node.transform.position.y;
  const scaleX = node.transform.scale.x;
  const scaleY = node.transform.scale.y;
  const opacity = node.opacity;
  const keyframes: PresetKeyframe[] = [];

  const add = (property: string, time: number, value: number, easing: EasingFunction = linear) =>
    keyframes.push({ property, time, value, easing });

  switch (presetId) {
    case 'fade-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      break;
    case 'rise-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      add('transform.position.y', start, y - 48);
      add('transform.position.y', end, y, easeOut);
      break;
    case 'slide-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      add('transform.position.x', start, x - 64);
      add('transform.position.x', end, x, easeOut);
      break;
    case 'pop-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      add('transform.scale.x', start, scaleX * 0.72);
      add('transform.scale.x', end, scaleX, easeOut);
      add('transform.scale.y', start, scaleY * 0.72);
      add('transform.scale.y', end, scaleY, easeOut);
      break;
    case 'pulse':
      add('transform.scale.x', start, scaleX);
      add('transform.scale.x', middle, scaleX * 1.12, 'easeOutBack');
      add('transform.scale.x', end, scaleX, easeInOut);
      add('transform.scale.y', start, scaleY);
      add('transform.scale.y', middle, scaleY * 1.12, 'easeOutBack');
      add('transform.scale.y', end, scaleY, easeInOut);
      break;
    case 'bounce':
      add('transform.position.y', start, y);
      add('transform.position.y', quarter, y + 24, 'easeOutCubic');
      add('transform.position.y', middle, y, 'easeInOutCubic');
      add('transform.position.y', threeQuarter, y + 10, 'easeOutCubic');
      add('transform.position.y', end, y, easeInOut);
      break;
    case 'shake':
      add('transform.position.x', start, x);
      add('transform.position.x', quarter, x - 12, 'easeInOutCubic');
      add('transform.position.x', middle, x + 12, 'easeInOutCubic');
      add('transform.position.x', threeQuarter, x - 8, 'easeInOutCubic');
      add('transform.position.x', end, x, easeInOut);
      break;
    case 'fade-out':
      add('opacity', start, opacity);
      add('opacity', end, 0, easeInOut);
      break;
    case 'shrink-out':
      add('opacity', start, opacity);
      add('opacity', end, 0, easeInOut);
      add('transform.scale.x', start, scaleX);
      add('transform.scale.x', end, 0, easeInOut);
      add('transform.scale.y', start, scaleY);
      add('transform.scale.y', end, 0, easeInOut);
      break;
    case 'slide-out':
      add('opacity', start, opacity);
      add('opacity', end, 0, easeInOut);
      add('transform.position.x', start, x);
      add('transform.position.x', end, x + 64, easeInOut);
      break;
  }

  const baseValues = new Map<string, number>();
  for (const keyframe of keyframes) {
    if (!baseValues.has(keyframe.property)) {
      const initialValue = getBaseValue(node, keyframe.property);
      if (initialValue !== undefined) baseValues.set(keyframe.property, initialValue);
    }
  }

  return { keyframes, baseValues };
}

/**
 * Apply a preset to a timeline. Earlier keyframes on affected properties are
 * kept; keyframes at and after the start frame are replaced by the preset.
 */
export function applyAnimationPreset(
  timeline: Timeline,
  node: Node,
  presetId: AnimationPresetId,
  startFrame: number,
  durationFrames: number
): Timeline {
  const start = Math.max(0, Math.round(startFrame));
  const preset = createAnimationPresetKeyframes(node, presetId, start, durationFrames);
  const tracks = timeline.tracks.map((track) => ({
    ...track,
    keyframes: [...track.keyframes],
  }));

  for (const property of preset.baseValues.keys()) {
    let track = tracks.find(
      (candidate) => candidate.nodeId === node.id && candidate.property === property
    );
    if (!track) {
      track = createTrack(node.id, property);
      tracks.push(track as PropertyTrack);
    }

    track.keyframes = track.keyframes.filter((keyframe) => keyframe.time < start);
    if (start > 0 && track.keyframes.length === 0) {
      const baseValue = preset.baseValues.get(property);
      if (baseValue !== undefined) addKeyframe(track, 0, baseValue);
    }
  }

  for (const keyframe of preset.keyframes) {
    const track = tracks.find(
      (candidate) => candidate.nodeId === node.id && candidate.property === keyframe.property
    );
    if (track) addKeyframe(track, keyframe.time, keyframe.value, keyframe.easing);
  }

  const lastFrame = Math.max(...preset.keyframes.map((keyframe) => keyframe.time));
  return {
    ...timeline,
    duration: Math.max(timeline.duration, lastFrame + 1),
    tracks: tracks.filter((track) => track.keyframes.length > 0),
  };
}

function getBaseValue(node: Node, property: string): number | undefined {
  switch (property) {
    case 'opacity':
      return node.opacity;
    case 'transform.position.x':
      return node.transform.position.x;
    case 'transform.position.y':
      return node.transform.position.y;
    case 'transform.scale.x':
      return node.transform.scale.x;
    case 'transform.scale.y':
      return node.transform.scale.y;
    default:
      return undefined;
  }
}
