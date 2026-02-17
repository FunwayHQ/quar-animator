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
  start?: Vector2; // Normalized 0-1, relative to shape local bounds (linear)
  end?: Vector2; // Normalized 0-1, relative to shape local bounds (linear)
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
  visible: boolean;
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
  visible: boolean;
  align?: 'center' | 'inside' | 'outside';
  /** Optional width profile: multipliers [0-1] sampled uniformly along path.
   *  If present, width varies along path as width * profile[t]. */
  widthProfile?: number[];
}

export interface BrushProfile {
  id: string;
  name: string;
  /** Width multipliers sampled at uniform t=0..1 along the path.
   *  Values 0-1, where 1 = full stroke width, 0 = zero width. */
  samples: number[];
}

export interface BrushData {
  spine: PathPoint[]; // The fitted center curve
  widths: number[]; // Per-spine-point width values (world units)
  profileId: string | null; // Currently applied profile ID (null = uniform)
  baseWidth?: number; // Override: uniform width for profile shaping (world units)
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
// Effect Types
// ============================================================================

export interface DropShadowEffect {
  id: string;
  type: 'drop-shadow';
  visible: boolean;
  color: Color;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  opacity: number;
}

export interface InnerShadowEffect {
  id: string;
  type: 'inner-shadow';
  visible: boolean;
  color: Color;
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  opacity: number;
}

export interface LayerBlurEffect {
  id: string;
  type: 'layer-blur';
  visible: boolean;
  radius: number;
}

export type Effect = DropShadowEffect | InnerShadowEffect | LayerBlurEffect;
export type EffectType = Effect['type'];

// ============================================================================
// Export Settings
// ============================================================================

export interface ExportSetting {
  format: 'png' | 'svg';
  multiplier: 1 | 2 | 3 | 4; // Only meaningful for PNG
  includeBackground?: boolean; // For artboard export — include artboard background (default true)
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | 'group'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'path'
  | 'text'
  | 'image'
  | 'bone'
  | 'ik-target'
  | 'vitruvian'
  | 'artboard';

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
  effects?: Effect[];
  exports?: ExportSetting[];
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

export type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';

export interface GroupNode extends BaseNode {
  type: 'group';
  booleanOp?: BooleanOp; // undefined = normal group, set = boolean group
  fills?: Fill[]; // appearance of boolean result
  strokes?: Stroke[]; // appearance of boolean result
}

export interface RectangleNode extends BaseNode {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number];
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
}

export interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
}

export interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides: number;
  radius: number;
  innerRadius?: number; // For star shapes
  cornerRadius?: number; // Uniform corner rounding for all vertices
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
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
  points: PathPoint[]; // Primary contour (backward compat)
  subpaths?: PathPoint[][]; // Additional contours (holes or disjoint regions)
  closed: boolean;
  fillRule?: 'nonzero' | 'evenodd'; // Default: 'nonzero'
  fills: Fill[];
  strokes: Stroke[];
  brushData?: BrushData; // Present for brush strokes — stores spine + widths for profile reshaping
  skinData?: SkinData;
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
  fills: Fill[];
  strokes: Stroke[];
}

export interface ImageAdjustments {
  brightness: number; // -100 to 100, default 0
  contrast: number; // -100 to 100, default 0
  saturation: number; // -100 to 100, default 0
  hue: number; // -180 to 180 degrees, default 0
  exposure: number; // -100 to 100, default 0
  temperature: number; // -100 to 100 (cool to warm), default 0
  tint: number; // -100 to 100 (green to magenta), default 0
  blur: number; // 0 to 100, default 0
}

export interface ImageNode extends BaseNode {
  type: 'image';
  src: string;
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  cornerRadius: [number, number, number, number]; // [TL, TR, BR, BL]
  adjustments?: ImageAdjustments;
  skinData?: SkinData;
  /** Optional per-vertex offsets for free-form distortion [BL, BR, TL, TR] */
  vertexOffsets?: [Vector2, Vector2, Vector2, Vector2];
}

export type BoneStyle = 'stick' | 'octahedral';

export interface BoneNode extends BaseNode {
  type: 'bone';
  length: number; // Extends along local +X axis
  boneStyle: BoneStyle;
  boneColor: string; // Hex color e.g. '#E0E0E0'
  angleMin?: number; // FK rotation constraint (degrees)
  angleMax?: number; // FK rotation constraint (degrees)
}

export interface IKTargetNode extends BaseNode {
  type: 'ik-target';
  ikChainId: string;
  targetType: 'effector' | 'pole';
}

export interface VitruvianNode extends BaseNode {
  type: 'vitruvian';
  controllerId: string;
}

export interface ArtboardNode extends BaseNode {
  type: 'artboard';
  width: number;
  height: number;
  fills: Fill[];
  clipContent: boolean;
}

// ============================================================================
// IK Chain Types
// ============================================================================

export interface IKChain {
  id: string;
  name: string;
  rootBoneId: string;
  endEffectorBoneId: string;
  targetNodeId: string;
  poleTargetNodeId?: string;
  maxIterations: number;
  tolerance: number;
  enabled: boolean;
}

// ============================================================================
// Skin Binding Types (Mesh Deformation)
// ============================================================================

/** Per-vertex bone influence (bone ID + weight) */
export interface VertexBoneWeight {
  boneId: string;
  weight: number; // 0..1
}

/** Per-vertex skin entry: up to 4 bone influences */
export interface VertexSkinEntry {
  influences: VertexBoneWeight[]; // max 4, sorted by weight descending
}

/** Skin binding data stored on shape nodes */
export interface SkinData {
  /** Per-vertex weights, indexed by tessellated vertex index */
  vertices: VertexSkinEntry[];
  /** Inverse bind matrices per bone (bone ID → 6-element [a,b,c,d,tx,ty]) */
  inverseBindMatrices: Record<string, number[]>;
  /** World matrix of mesh at bind time (6 elements) */
  meshBindMatrix: number[];
  /** Number of vertices at bind time (for validation) */
  vertexCount: number;
}

export type Node =
  | GroupNode
  | RectangleNode
  | EllipseNode
  | PolygonNode
  | PathNode
  | TextNode
  | ImageNode
  | BoneNode
  | IKTargetNode
  | VitruvianNode
  | ArtboardNode;

/** Node types that can have skin bindings */
export type SkinnableNode = RectangleNode | EllipseNode | PolygonNode | PathNode | ImageNode;

// ============================================================================
// Smart Bones Types (Corrective Morph Targets)
// ============================================================================

/** Sparse vertex offset for a morph target */
export interface MorphVertexOffset {
  vertexIndex: number; // Tessellated vertex index
  dx: number;
  dy: number;
}

/** A morph target snapshot at a specific driver value */
export interface MorphTarget {
  id: string;
  name: string;
  driverValue: number; // Driver property value where this target is fully active
  offsets: Record<string, MorphVertexOffset[]>; // nodeId → sparse vertex offsets
}

/** Defines which bone property drives a Smart Bone action */
export interface SmartBoneDriver {
  boneId: string;
  property: 'transform.rotation'; // Extensible later
  rangeMin: number; // Blend weight = 0
  rangeMax: number; // Blend weight = 1
}

/** A Smart Bone action with driver and morph targets */
export interface SmartBoneAction {
  id: string;
  name: string;
  driver: SmartBoneDriver;
  targets: MorphTarget[]; // Ordered by driverValue ascending
  enabled: boolean;
}

// ============================================================================
// Vitruvian Bones Types (Bone Group Switching)
// ============================================================================

/** Snapshot of SkinData for a specific node at bone-group capture time */
export interface BoneGroupSkinSnapshot {
  nodeId: string;
  skinData: SkinData;
}

/** A named group of bones for Vitruvian switching */
export interface BoneGroup {
  id: string;
  name: string;
  boneIds: string[];
  skinSnapshots: BoneGroupSkinSnapshot[];
}

/** Controller that manages multiple bone groups for pose topology switching */
export interface VitruvianController {
  id: string;
  name: string;
  groups: BoneGroup[];
  activeGroupId: string;
  enabled: boolean;
}

// ============================================================================
// Dynamic Bone Chain Types (Physics)
// ============================================================================

/** Configuration for a dynamic bone chain with Verlet physics */
export interface DynamicChain {
  id: string;
  name: string;
  rootBoneId: string;
  boneIds: string[];
  enabled: boolean;
  stiffness: number; // 0-1, joint stiffness
  damping: number; // 0-1, velocity damping
  gravity: number; // Gravity strength
  gravityAngle: number; // Gravity direction in degrees (default -90 = downward)
  windInfluence: number; // 0-1, how much wind affects this chain
  elasticity: number; // 0-1, spring-back to rest pose
  collisionRadius: number; // Per-bone collision sphere radius
  freezeAxis?: 'x' | 'y'; // Optional axis lock
}

/** Global wind settings for all dynamic chains */
export interface WindSettings {
  strength: number;
  direction: number; // Degrees
  turbulence: number; // 0-1
  frequency: number; // Oscillation frequency
  enabled: boolean;
}

/** Transient particle state for Verlet simulation (NOT persisted) */
export interface DynamicParticle {
  position: Vector2;
  prevPosition: Vector2;
  restLength: number;
  restAngle: number;
  mass: number;
}

/** Transient chain simulation state (NOT persisted) */
export interface DynamicChainState {
  chainId: string;
  particles: DynamicParticle[];
  initialized: boolean;
}

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
  | 'hand'
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
  | 'point-magnet'
  | 'camera'
  | 'artboard';

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
  clickCount?: number;
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
