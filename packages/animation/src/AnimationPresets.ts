/**
 * Reusable, editable animation presets built from ordinary timeline keyframes.
 */

import type { EasingFunction, Node, PropertyTrack, Timeline } from '@quar/types';
import { addKeyframe, createTrack } from './Timeline';

export type AnimationPresetCategory = 'Entrance' | 'Emphasis' | 'Exit';

export type AnimationPresetId =
  | 'fade-in'
  | 'typewriter'
  | 'rise-in'
  | 'drop-in'
  | 'slide-in'
  | 'spin-in'
  | 'spin-out'
  | 'pop-in'
  | 'pulse'
  | 'bounce'
  | 'shake'
  | 'wobble'
  | 'heartbeat'
  | 'float'
  | 'draw-on'
  | 'fade-out'
  | 'shrink-out'
  | 'slide-out';

export interface AnimationPresetDefinition {
  id: AnimationPresetId;
  name: string;
  category: AnimationPresetCategory;
  description: string;
  nodeType?: 'text' | 'path';
}

export type AnimationPresetDirection = 'auto' | 'left' | 'right' | 'top' | 'bottom';

export interface AnimationPresetOptions {
  /** Direction presets enter from or exit toward. Auto preserves each preset's default. */
  direction?: AnimationPresetDirection;
  /** Scales the movement or emphasis amount. Values are clamped to 0.1–3. */
  intensity?: number;
}

export const ANIMATION_PRESETS: AnimationPresetDefinition[] = [
  { id: 'fade-in', name: 'Fade', category: 'Entrance', description: 'Fade into view' },
  {
    id: 'typewriter',
    name: 'Typewriter',
    category: 'Entrance',
    description: 'Reveal text one character at a time',
    nodeType: 'text',
  },
  { id: 'rise-in', name: 'Rise', category: 'Entrance', description: 'Rise into place from below' },
  {
    id: 'drop-in',
    name: 'Drop',
    category: 'Entrance',
    description: 'Drop in and settle with a soft landing',
  },
  { id: 'slide-in', name: 'Slide', category: 'Entrance', description: 'Slide in from the left' },
  {
    id: 'draw-on',
    name: 'Draw On',
    category: 'Entrance',
    description: 'Reveal the path stroke from start to finish',
    nodeType: 'path',
  },
  { id: 'spin-in', name: 'Spin', category: 'Entrance', description: 'Spin into view' },
  { id: 'pop-in', name: 'Pop', category: 'Entrance', description: 'Scale up into view' },
  { id: 'pulse', name: 'Pulse', category: 'Emphasis', description: 'Grow and settle' },
  { id: 'bounce', name: 'Bounce', category: 'Emphasis', description: 'Bounce in place' },
  { id: 'shake', name: 'Shake', category: 'Emphasis', description: 'Shake side to side' },
  {
    id: 'wobble',
    name: 'Wobble',
    category: 'Emphasis',
    description: 'Rock side to side and settle',
  },
  {
    id: 'heartbeat',
    name: 'Heartbeat',
    category: 'Emphasis',
    description: 'Pulse twice like a heartbeat',
  },
  {
    id: 'float',
    name: 'Float',
    category: 'Emphasis',
    description: 'Drift through a gentle loopable cycle',
  },
  { id: 'fade-out', name: 'Fade', category: 'Exit', description: 'Fade out of view' },
  { id: 'shrink-out', name: 'Shrink', category: 'Exit', description: 'Shrink out of view' },
  { id: 'slide-out', name: 'Slide', category: 'Exit', description: 'Slide out to the right' },
  { id: 'spin-out', name: 'Spin', category: 'Exit', description: 'Spin out of view' },
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

function normalizeIntensity(intensity: number | undefined): number {
  if (intensity === undefined || !Number.isFinite(intensity)) return 1;
  return Math.max(0.1, Math.min(3, intensity));
}

function resolveDirection(
  presetId: AnimationPresetId,
  direction: AnimationPresetDirection | undefined
): Exclude<AnimationPresetDirection, 'auto'> {
  if (direction && direction !== 'auto') return direction;
  switch (presetId) {
    case 'slide-in':
      return 'left';
    case 'slide-out':
      return 'right';
    case 'rise-in':
      return 'bottom';
    case 'bounce':
      return 'top';
    default:
      return 'top';
  }
}

function directionVector(direction: Exclude<AnimationPresetDirection, 'auto'>) {
  switch (direction) {
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    case 'top':
      return { x: 0, y: 1 };
    case 'bottom':
      return { x: 0, y: -1 };
  }
}

/** Create a preset's property keyframes relative to a selected node and frame. */
export function createAnimationPresetKeyframes(
  node: Node,
  presetId: AnimationPresetId,
  startFrame: number,
  durationFrames: number,
  options: AnimationPresetOptions = {}
): AnimationPresetKeyframes {
  const start = Math.max(0, Math.round(startFrame));
  const intensity = normalizeIntensity(options.intensity);
  const direction = resolveDirection(presetId, options.direction);
  const vector = directionVector(direction);
  const spinSegments = Math.ceil((360 * intensity) / 120);
  // Keep multi-beat keyframes distinct, and keep each spin segment within the
  // rotation track's shortest-path range so full turns remain visible.
  const duration = Math.max(
    4,
    Math.round(durationFrames),
    presetId === 'spin-in' || presetId === 'spin-out' ? spinSegments : 0
  );
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
    case 'typewriter':
      if (node.type === 'text') {
        add('visibleCharacters', start, 0);
        add('visibleCharacters', end, Array.from(node.content).length, 'linear');
      }
      break;
    case 'draw-on':
      if (node.type === 'path') {
        add('strokeProgress', start, 0);
        add('strokeProgress', end, 1, 'linear');
      }
      break;
    case 'fade-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      break;
    case 'rise-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      if (vector.x !== 0) {
        add('transform.position.x', start, x + vector.x * 48 * intensity);
        add('transform.position.x', end, x, easeOut);
      } else {
        add('transform.position.y', start, y + vector.y * 48 * intensity);
        add('transform.position.y', end, y, easeOut);
      }
      break;
    case 'drop-in': {
      add('opacity', start, 0);
      add('opacity', quarter, opacity, easeOut);
      const positionProperty = vector.x !== 0 ? 'transform.position.x' : 'transform.position.y';
      const position = vector.x !== 0 ? x : y;
      const offset = vector.x !== 0 ? vector.x : vector.y;
      add(positionProperty, start, position + offset * 64 * intensity);
      add(positionProperty, threeQuarter, position - offset * 8 * intensity, easeOut);
      add(positionProperty, end, position, easeInOut);
      break;
    }
    case 'slide-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      if (vector.x !== 0) {
        add('transform.position.x', start, x + vector.x * 64 * intensity);
        add('transform.position.x', end, x, easeOut);
      } else {
        add('transform.position.y', start, y + vector.y * 64 * intensity);
        add('transform.position.y', end, y, easeOut);
      }
      break;
    case 'spin-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      add('transform.scale.x', start, scaleX * Math.max(0.1, 1 - 0.15 * intensity));
      add('transform.scale.x', end, scaleX, easeOut);
      add('transform.scale.y', start, scaleY * Math.max(0.1, 1 - 0.15 * intensity));
      add('transform.scale.y', end, scaleY, easeOut);
      addSpinKeyframes(add, start, end, node.transform.rotation, -360 * intensity);
      break;
    case 'spin-out':
      add('opacity', start, opacity);
      add('opacity', end, 0, easeInOut);
      addSpinKeyframes(add, start, end, node.transform.rotation, 360 * intensity);
      break;
    case 'pop-in':
      add('opacity', start, 0);
      add('opacity', end, opacity, easeOut);
      add('transform.scale.x', start, scaleX * Math.max(0.1, 1 - 0.28 * intensity));
      add('transform.scale.x', end, scaleX, easeOut);
      add('transform.scale.y', start, scaleY * Math.max(0.1, 1 - 0.28 * intensity));
      add('transform.scale.y', end, scaleY, easeOut);
      break;
    case 'pulse':
      add('transform.scale.x', start, scaleX);
      add('transform.scale.x', middle, scaleX * (1 + 0.12 * intensity), 'easeOutBack');
      add('transform.scale.x', end, scaleX, easeInOut);
      add('transform.scale.y', start, scaleY);
      add('transform.scale.y', middle, scaleY * (1 + 0.12 * intensity), 'easeOutBack');
      add('transform.scale.y', end, scaleY, easeInOut);
      break;
    case 'bounce':
      {
        const property = vector.x !== 0 ? 'transform.position.x' : 'transform.position.y';
        const base = vector.x !== 0 ? x : y;
        const offset = vector.x !== 0 ? vector.x : vector.y;
        add(property, start, base);
        add(property, quarter, base + offset * 24 * intensity, 'easeOutCubic');
        add(property, middle, base, 'easeInOutCubic');
        add(property, threeQuarter, base + offset * 10 * intensity, 'easeOutCubic');
        add(property, end, base, easeInOut);
      }
      break;
    case 'shake':
      add('transform.position.x', start, x);
      add('transform.position.x', quarter, x - 12 * intensity, 'easeInOutCubic');
      add('transform.position.x', middle, x + 12 * intensity, 'easeInOutCubic');
      add('transform.position.x', threeQuarter, x - 8 * intensity, 'easeInOutCubic');
      add('transform.position.x', end, x, easeInOut);
      break;
    case 'wobble':
      add('transform.rotation', start, node.transform.rotation);
      add('transform.rotation', quarter, node.transform.rotation - 12 * intensity, 'easeOutCubic');
      add('transform.rotation', middle, node.transform.rotation + 9 * intensity, 'easeInOutCubic');
      add(
        'transform.rotation',
        threeQuarter,
        node.transform.rotation - 4 * intensity,
        'easeInOutCubic'
      );
      add('transform.rotation', end, node.transform.rotation, easeInOut);
      break;
    case 'heartbeat':
      for (const [property, base] of [
        ['transform.scale.x', scaleX],
        ['transform.scale.y', scaleY],
      ] as const) {
        add(property, start, base);
        add(property, quarter, base * (1 + 0.12 * intensity), easeInOut);
        add(property, middle, base, easeInOut);
        add(property, threeQuarter, base * (1 + 0.18 * intensity), easeInOut);
        add(property, end, base, easeInOut);
      }
      break;
    case 'float': {
      const distance = 12 * intensity;
      add('transform.position.y', start, y);
      add('transform.position.y', quarter, y + distance, 'easeInOutCubic');
      add('transform.position.y', middle, y, 'easeInOutCubic');
      add('transform.position.y', threeQuarter, y - distance, 'easeInOutCubic');
      add('transform.position.y', end, y, 'easeInOutCubic');
      break;
    }
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
      if (vector.x !== 0) {
        add('transform.position.x', start, x);
        add('transform.position.x', end, x + vector.x * 64 * intensity, easeInOut);
      } else {
        add('transform.position.y', start, y);
        add('transform.position.y', end, y + vector.y * 64 * intensity, easeInOut);
      }
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
  durationFrames: number,
  options: AnimationPresetOptions = {}
): Timeline {
  const start = Math.max(0, Math.round(startFrame));
  const preset = createAnimationPresetKeyframes(node, presetId, start, durationFrames, options);
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
    case 'transform.rotation':
      return node.transform.rotation;
    case 'transform.position.x':
      return node.transform.position.x;
    case 'transform.position.y':
      return node.transform.position.y;
    case 'transform.scale.x':
      return node.transform.scale.x;
    case 'transform.scale.y':
      return node.transform.scale.y;
    case 'visibleCharacters':
      return node.type === 'text' ? Array.from(node.content).length : undefined;
    case 'strokeProgress':
      return node.type === 'path' ? 1 : undefined;
    default:
      return undefined;
  }
}

function addSpinKeyframes(
  add: (property: string, time: number, value: number, easing?: EasingFunction) => number,
  start: number,
  end: number,
  baseRotation: number,
  delta: number
) {
  const segments = Math.ceil(Math.abs(delta) / 120);
  for (let segment = 0; segment <= segments; segment++) {
    const progress = segment / segments;
    const frame = start + Math.round((end - start) * progress);
    add('transform.rotation', frame, baseRotation + delta * progress, linear);
  }
}
