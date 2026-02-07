/**
 * @quar/types
 * Shared TypeScript types for Quar Animator
 */

// ============================================================================
// Math Types
// ============================================================================

export interface Vector2 {
  x: number;
  y: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Matrix3 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

// ============================================================================
// Color Types
// ============================================================================

export interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
  a: number; // 0-1
}

export interface Gradient {
  type: 'linear' | 'radial' | 'conic';
  stops: GradientStop[];
  angle?: number; // For linear and conic (startAngle)
  center?: Vector2; // For radial and conic
  radius?: number; // For radial
}

export interface GradientStop {
  offset: number; // 0-1
  color: Color;
}

// ============================================================================
// Fill & Stroke
// ============================================================================

export interface Fill {
  type: 'solid' | 'gradient' | 'none';
  color?: Color;
  gradient?: Gradient;
  opacity: number;
}

export interface Stroke {
  color: Color;
  width: number;
  opacity: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  miterLimit?: number;
  dashArray?: number[];
  dashOffset?: number;
  gradient?: Gradient;
}

// ============================================================================
// Transform
// ============================================================================

export interface Transform {
  position: Vector2;
  rotation: number; // Degrees
  scale: Vector2;
  anchor: Vector2; // 0-1 normalized
  skew: Vector2;
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeType = 'group' | 'rectangle' | 'ellipse' | 'polygon' | 'path' | 'text' | 'image';

export interface BaseNode {
  id: string;
  name: string;
  type: NodeType;
  parent: string | null;
  children: string[];
  transform: Transform;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
}

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

// ============================================================================
// Shape Nodes
// ============================================================================

export interface GroupNode extends BaseNode {
  type: 'group';
}

export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number];
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides: number;
  radius: number;
  innerRadius?: number; // For star shapes
  cornerRadius?: number; // Uniform corner rounding for all vertices
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface PathPoint {
  position: Vector2;
  handleIn: Vector2 | null;
  handleOut: Vector2 | null;
  type: 'corner' | 'smooth' | 'symmetric';
  cornerRadius?: number; // Per-vertex rounding (only applies to corner points)
}

export interface PathNode extends BaseNode {
  type: 'path';
  points: PathPoint[];
  closed: boolean;
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  fill: Fill | null;
  stroke: Stroke | null;
}

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
}

export type Node =
  | GroupNode
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode;

// ============================================================================
// Animation Types
// ============================================================================

export type EasingType =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeInQuart'
  | 'easeOutQuart'
  | 'easeInOutQuart'
  | 'easeInQuint'
  | 'easeOutQuint'
  | 'easeInOutQuint'
  | 'easeInExpo'
  | 'easeOutExpo'
  | 'easeInOutExpo'
  | 'easeInCirc'
  | 'easeOutCirc'
  | 'easeInOutCirc'
  | 'easeInBack'
  | 'easeOutBack'
  | 'easeInOutBack'
  | 'easeInElastic'
  | 'easeOutElastic'
  | 'easeInOutElastic'
  | 'easeInBounce'
  | 'easeOutBounce'
  | 'easeInOutBounce';

export interface CubicBezierEasing {
  type: 'cubicBezier';
  points: [number, number, number, number];
}

export type EasingFunction = EasingType | CubicBezierEasing;

export interface Keyframe<T = unknown> {
  id: string;
  time: number; // Frame number
  value: T;
  easing: EasingFunction;
  tangentIn?: Vector2;
  tangentOut?: Vector2;
}

export interface PropertyTrack<T = unknown> {
  id: string;
  nodeId: string;
  property: string; // Dot notation: "transform.position.x"
  keyframes: Keyframe<T>[];
  expression?: string;
}

export interface Marker {
  id: string;
  time: number;
  name: string;
  color: string;
}

export interface Timeline {
  id: string;
  name: string;
  duration: number; // In frames
  frameRate: number;
  tracks: PropertyTrack[];
  markers: Marker[];
}

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  version: string;
  width: number;
  height: number;
  frameRate: number;
  backgroundColor: Color;
  nodes: Map<string, Node>;
  rootNodeIds: string[];
  timeline: Timeline;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Tool Types
// ============================================================================

export type ToolType =
  | 'selection'
  | 'direct-selection'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'text'
  | 'bone'
  | 'weight-paint'
  | 'camera';

export interface CanvasPointerEvent {
  screenPosition: Vector2;
  worldPosition: Vector2;
  button: number;
  buttons: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pressure: number;
  timestamp: number;
}

// ============================================================================
// Editor State Types
// ============================================================================

export interface EditorState {
  activeTool: ToolType;
  selectedNodeIds: Set<string>;
  currentTime: number;
  playing: boolean;
  loop: boolean;
  autoKeyframe: boolean;
  onionSkinEnabled: boolean;
  zoom: number;
  panOffset: Vector2;
}
