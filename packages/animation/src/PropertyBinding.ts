/**
 * PropertyBinding - Get/set node properties via dot-notation paths
 *
 * Supports paths like:
 *   "transform.position.x"
 *   "transform.rotation"
 *   "opacity"
 *   "fill.color.r"
 */

import type { Node, PropertyTrack, Timeline } from '@quar/types';
import { interpolateValue, interpolators } from './Timeline';

// ============================================================================
// Property path get/set
// ============================================================================

/**
 * Get a nested property value from a node using a dot-notation path.
 */
export function getProperty(node: Node, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = node;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Set a nested property value on a node using a dot-notation path.
 * Returns a shallow-cloned object with the updated value (immutable).
 */
export function setProperty<N extends Node>(node: N, path: string, value: unknown): N {
  const parts = path.split('.');
  if (parts.length === 0) return node;

  // Single-level path
  if (parts.length === 1) {
    return { ...node, [parts[0]!]: value };
  }

  // Multi-level: clone each level on the path
  const root = { ...node } as Record<string, unknown>;
  let current = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const existing = current[key];
    const cloned =
      typeof existing === 'object' && existing !== null
        ? Array.isArray(existing)
          ? [...existing]
          : { ...(existing as Record<string, unknown>) }
        : {};
    current[key] = cloned;
    current = cloned as Record<string, unknown>;
  }
  current[parts[parts.length - 1]!] = value;

  return root as N;
}

// ============================================================================
// Animatable property definitions
// ============================================================================

export type InterpolationType = 'number' | 'vector2' | 'color' | 'discrete';

export interface AnimatableProperty {
  path: string;
  displayName: string;
  interpolationType: InterpolationType;
}

/**
 * Common animatable properties shared by all nodes.
 */
export const COMMON_ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  { path: 'transform.position.x', displayName: 'Position X', interpolationType: 'number' },
  { path: 'transform.position.y', displayName: 'Position Y', interpolationType: 'number' },
  { path: 'transform.rotation', displayName: 'Rotation', interpolationType: 'number' },
  { path: 'transform.scale.x', displayName: 'Scale X', interpolationType: 'number' },
  { path: 'transform.scale.y', displayName: 'Scale Y', interpolationType: 'number' },
  { path: 'transform.anchor.x', displayName: 'Anchor X', interpolationType: 'number' },
  { path: 'transform.anchor.y', displayName: 'Anchor Y', interpolationType: 'number' },
  { path: 'transform.skew.x', displayName: 'Skew X', interpolationType: 'number' },
  { path: 'transform.skew.y', displayName: 'Skew Y', interpolationType: 'number' },
  { path: 'opacity', displayName: 'Opacity', interpolationType: 'number' },
];

/**
 * Shape-specific animatable properties (rectangle, ellipse, polygon).
 */
export const SHAPE_ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  { path: 'fills.0.color', displayName: 'Fill Color', interpolationType: 'color' },
  { path: 'fills.0.opacity', displayName: 'Fill Opacity', interpolationType: 'number' },
  {
    path: 'fills.0.gradient.angle',
    displayName: 'Fill Gradient Angle',
    interpolationType: 'number',
  },
  {
    path: 'fills.0.gradient.stops.0.offset',
    displayName: 'Fill Stop 1 Offset',
    interpolationType: 'number',
  },
  {
    path: 'fills.0.gradient.stops.0.color',
    displayName: 'Fill Stop 1 Color',
    interpolationType: 'color',
  },
  {
    path: 'fills.0.gradient.stops.1.offset',
    displayName: 'Fill Stop 2 Offset',
    interpolationType: 'number',
  },
  {
    path: 'fills.0.gradient.stops.1.color',
    displayName: 'Fill Stop 2 Color',
    interpolationType: 'color',
  },
  {
    path: 'fills.0.gradient.stops.2.offset',
    displayName: 'Fill Stop 3 Offset',
    interpolationType: 'number',
  },
  {
    path: 'fills.0.gradient.stops.2.color',
    displayName: 'Fill Stop 3 Color',
    interpolationType: 'color',
  },
  {
    path: 'fills.0.gradient.stops.3.offset',
    displayName: 'Fill Stop 4 Offset',
    interpolationType: 'number',
  },
  {
    path: 'fills.0.gradient.stops.3.color',
    displayName: 'Fill Stop 4 Color',
    interpolationType: 'color',
  },
  { path: 'strokes.0.color', displayName: 'Stroke Color', interpolationType: 'color' },
  { path: 'strokes.0.width', displayName: 'Stroke Width', interpolationType: 'number' },
  { path: 'strokes.0.opacity', displayName: 'Stroke Opacity', interpolationType: 'number' },
  {
    path: 'strokes.0.gradient.angle',
    displayName: 'Stroke Gradient Angle',
    interpolationType: 'number',
  },
  {
    path: 'strokes.0.gradient.stops.0.offset',
    displayName: 'Stroke Stop 1 Offset',
    interpolationType: 'number',
  },
  {
    path: 'strokes.0.gradient.stops.0.color',
    displayName: 'Stroke Stop 1 Color',
    interpolationType: 'color',
  },
  {
    path: 'strokes.0.gradient.stops.1.offset',
    displayName: 'Stroke Stop 2 Offset',
    interpolationType: 'number',
  },
  {
    path: 'strokes.0.gradient.stops.1.color',
    displayName: 'Stroke Stop 2 Color',
    interpolationType: 'color',
  },
];

/**
 * Rectangle-specific animatable properties.
 */
export const RECTANGLE_ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  { path: 'width', displayName: 'Width', interpolationType: 'number' },
  { path: 'height', displayName: 'Height', interpolationType: 'number' },
  { path: 'cornerRadius.0', displayName: 'Corner TL', interpolationType: 'number' },
  { path: 'cornerRadius.1', displayName: 'Corner TR', interpolationType: 'number' },
  { path: 'cornerRadius.2', displayName: 'Corner BR', interpolationType: 'number' },
  { path: 'cornerRadius.3', displayName: 'Corner BL', interpolationType: 'number' },
];

/**
 * Ellipse-specific animatable properties.
 */
export const ELLIPSE_ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  { path: 'radiusX', displayName: 'Radius X', interpolationType: 'number' },
  { path: 'radiusY', displayName: 'Radius Y', interpolationType: 'number' },
];

/**
 * Polygon-specific animatable properties.
 */
export const POLYGON_ANIMATABLE_PROPERTIES: AnimatableProperty[] = [
  { path: 'radius', displayName: 'Radius', interpolationType: 'number' },
  { path: 'cornerRadius', displayName: 'Corner Radius', interpolationType: 'number' },
];

/**
 * Get all animatable properties for a given node type.
 */
export function getAnimatableProperties(nodeType: string): AnimatableProperty[] {
  const props = [...COMMON_ANIMATABLE_PROPERTIES];

  switch (nodeType) {
    case 'rectangle':
      props.push(...SHAPE_ANIMATABLE_PROPERTIES, ...RECTANGLE_ANIMATABLE_PROPERTIES);
      break;
    case 'ellipse':
      props.push(...SHAPE_ANIMATABLE_PROPERTIES, ...ELLIPSE_ANIMATABLE_PROPERTIES);
      break;
    case 'polygon':
      props.push(...SHAPE_ANIMATABLE_PROPERTIES, ...POLYGON_ANIMATABLE_PROPERTIES);
      break;
    case 'path':
      props.push(...SHAPE_ANIMATABLE_PROPERTIES);
      break;
    case 'text':
      props.push(...SHAPE_ANIMATABLE_PROPERTIES);
      break;
    case 'image':
      props.push(
        { path: 'width', displayName: 'Width', interpolationType: 'number' },
        { path: 'height', displayName: 'Height', interpolationType: 'number' },
        { path: 'cornerRadius.0', displayName: 'Corner TL', interpolationType: 'number' },
        { path: 'cornerRadius.1', displayName: 'Corner TR', interpolationType: 'number' },
        { path: 'cornerRadius.2', displayName: 'Corner BR', interpolationType: 'number' },
        { path: 'cornerRadius.3', displayName: 'Corner BL', interpolationType: 'number' },
        { path: 'adjustments.brightness', displayName: 'Brightness', interpolationType: 'number' },
        { path: 'adjustments.contrast', displayName: 'Contrast', interpolationType: 'number' },
        { path: 'adjustments.saturation', displayName: 'Saturation', interpolationType: 'number' },
        { path: 'adjustments.hue', displayName: 'Hue', interpolationType: 'number' },
        { path: 'adjustments.exposure', displayName: 'Exposure', interpolationType: 'number' },
        { path: 'adjustments.temperature', displayName: 'Temperature', interpolationType: 'number' },
      );
      break;
    case 'group':
      // Groups support only transform and opacity (COMMON_ANIMATABLE_PROPERTIES)
      break;
  }

  return props;
}

// ============================================================================
// Interpolator selection
// ============================================================================

/**
 * Get the appropriate interpolator function for a given interpolation type.
 */
export function getInterpolator(
  type: InterpolationType
): (a: unknown, b: unknown, t: number) => unknown {
  switch (type) {
    case 'number':
      return interpolators.number as (a: unknown, b: unknown, t: number) => unknown;
    case 'vector2':
      return interpolators.vector2 as (a: unknown, b: unknown, t: number) => unknown;
    case 'color':
      return interpolators.color as (a: unknown, b: unknown, t: number) => unknown;
    case 'discrete':
      return interpolators.discrete as (a: unknown, b: unknown, t: number) => unknown;
  }
}

/**
 * Detect interpolation type from a property path.
 */
export function detectInterpolationType(path: string): InterpolationType {
  // Color properties (including gradient stop colors, with array index support)
  if (/^fills\.\d+\.color$/.test(path) || /^strokes\.\d+\.color$/.test(path)) return 'color';
  // Legacy singular paths
  if (path === 'fill.color' || path === 'stroke.color') return 'color';
  if (/\.gradient\.stops\.\d+\.color$/.test(path)) return 'color';

  // Vector2 properties
  if (
    path === 'transform.position' ||
    path === 'transform.scale' ||
    path === 'transform.anchor' ||
    path === 'transform.skew'
  )
    return 'vector2';

  // Number properties (individual components, opacity, width, etc.)
  if (
    path.endsWith('.x') ||
    path.endsWith('.y') ||
    path.endsWith('.r') ||
    path.endsWith('.g') ||
    path.endsWith('.b') ||
    path.endsWith('.a') ||
    path === 'opacity' ||
    path === 'width' ||
    path === 'height' ||
    path === 'radiusX' ||
    path === 'radiusY' ||
    path === 'radius' ||
    path === 'transform.rotation' ||
    path === 'fontSize' ||
    path === 'lineHeight' ||
    path === 'letterSpacing' ||
    path === 'cornerRadius' ||
    path.startsWith('cornerRadius.')
  ) {
    return 'number';
  }

  // Fill/stroke array number properties (opacity, width)
  if (/^fills\.\d+\.opacity$/.test(path)) return 'number';
  if (/^strokes\.\d+\.width$/.test(path)) return 'number';
  if (/^strokes\.\d+\.opacity$/.test(path)) return 'number';
  // Legacy singular paths
  if (path === 'fill.opacity' || path === 'stroke.width' || path === 'stroke.opacity')
    return 'number';

  // Gradient number properties (angle, offset, radius)
  if (/\.gradient\.angle$/.test(path)) return 'number';
  if (/\.gradient\.stops\.\d+\.offset$/.test(path)) return 'number';
  if (/\.gradient\.radius$/.test(path)) return 'number';
  if (/\.gradient\.center\.[xy]$/.test(path)) return 'number';

  // Image adjustment properties
  if (path.startsWith('adjustments.')) return 'number';

  return 'discrete';
}

// ============================================================================
// Evaluate animated values
// ============================================================================

/**
 * Evaluate a single animated property track at a given frame.
 * Returns the interpolated value, or undefined if no keyframes.
 */
export function evaluateTrack(track: PropertyTrack, frame: number): unknown {
  if (track.keyframes.length === 0) return undefined;

  const type = detectInterpolationType(track.property);
  const interp = getInterpolator(type);
  return interpolateValue(track, frame, interp as (a: unknown, b: unknown, t: number) => unknown);
}

/**
 * Evaluate all animated properties for a node at a given frame.
 * Returns a map of property path -> interpolated value.
 */
export function evaluateNodeAtFrame(
  timeline: Timeline,
  nodeId: string,
  frame: number
): Map<string, unknown> {
  const values = new Map<string, unknown>();

  for (const track of timeline.tracks) {
    if (track.nodeId !== nodeId) continue;
    if (track.keyframes.length === 0) continue;

    const val = evaluateTrack(track, frame);
    if (val !== undefined) {
      values.set(track.property, val);
    }
  }

  return values;
}

/**
 * Apply animated values to a node. Returns a new node with animated properties applied.
 */
export function applyAnimatedValues<N extends Node>(
  node: N,
  animatedValues: Map<string, unknown>
): N {
  let result = node;
  for (const [path, value] of animatedValues) {
    result = setProperty(result, path, value);
  }
  return result;
}
