/**
 * Lottie JSON TypeScript Types (v5.7.4)
 *
 * Based on the Lottie specification for bodymovin animations.
 * Only covers features used in the Quar Animator foundation export.
 */

// ============================================================================
// Top-Level
// ============================================================================

export interface LottieAnimation {
  v: string; // Bodymovin version (e.g. "5.7.4")
  fr: number; // Frame rate
  ip: number; // In point (start frame)
  op: number; // Out point (end frame, exclusive)
  w: number; // Width
  h: number; // Height
  nm?: string; // Name
  ddd?: 0 | 1; // 3D flag (always 0 for 2D)
  assets?: LottieAsset[];
  layers: LottieLayer[];
}

// ============================================================================
// Assets
// ============================================================================

export interface LottieAsset {
  id: string;
  w?: number;
  h?: number;
  u?: string; // Path
  p?: string; // Filename, or a data URI when embedded
  e?: 0 | 1; // Embedded
  layers?: LottieLayer[]; // Precomposition
}

// ============================================================================
// Layers
// ============================================================================

export type LottieLayerType =
  | 0 // Precomp
  | 1 // Solid
  | 2 // Image
  | 3 // Null
  | 4; // Shape

export interface LottieLayer {
  ind: number; // Layer index
  ty: LottieLayerType;
  nm?: string; // Layer name
  sr?: number; // Time stretch (default 1)
  ks: LottieTransform; // Transform
  ip: number; // In point
  op: number; // Out point
  st: number; // Start time
  bm?: number; // Blend mode (0=normal, 1=multiply, etc.)
  shapes?: LottieShapeItem[]; // Shape layer content (ty=4)
  parent?: number; // Parent layer index
  refId?: string; // Asset id (image and precomp layers)
  w?: number; // Precomp width
  h?: number; // Precomp height
  td?: number; // 1 = this layer is the track matte for the layer after it
  tt?: number; // Track matte applied from the layer before it (1=alpha, 3=luma)
  hasMask?: boolean;
  masksProperties?: LottieMask[];
}

/** A layer mask (e.g. an artboard's clip). */
export interface LottieMask {
  nm?: string;
  mode: 'a' | 's' | 'i' | 'n'; // add, subtract, intersect, none
  inv: boolean;
  pt: LottieAnimatedShape;
  o: LottieAnimatedValue;
}

// ============================================================================
// Transform
// ============================================================================

export interface LottieTransform {
  a: LottieAnimatedMulti; // Anchor point [x, y]
  p: LottieAnimatedMulti; // Position [x, y]
  r: LottieAnimatedValue; // Rotation (degrees)
  s: LottieAnimatedMulti; // Scale [x, y] (100 = 100%)
  o: LottieAnimatedValue; // Opacity (0-100)
}

// ============================================================================
// Animated Values
// ============================================================================

/** Single-dimension animated value (rotation, opacity, etc.) */
export interface LottieAnimatedValue {
  a: 0 | 1; // 0=static, 1=animated
  k: number | LottieKeyframe[]; // Static value OR keyframe array
}

/** Multi-dimension animated value (position, scale, anchor — [x, y]) */
export interface LottieAnimatedMulti {
  a: 0 | 1;
  k: number[] | LottieMultiKeyframe[];
}

/** Animated color value ([r, g, b, a] each 0-1) */
export interface LottieAnimatedColor {
  a: 0 | 1;
  k: number[] | LottieColorKeyframe[];
}

// ============================================================================
// Keyframes
// ============================================================================

export interface LottieKeyframe {
  t: number; // Time (frame)
  s: [number]; // Start value
  e?: [number]; // End value (omitted on last keyframe)
  i?: { x: number[]; y: number[] }; // In tangent
  o?: { x: number[]; y: number[] }; // Out tangent
  h?: 0 | 1; // Hold keyframe
}

export interface LottieMultiKeyframe {
  t: number;
  s: number[]; // Start value [x, y]
  e?: number[]; // End value [x, y]
  i?: { x: number[]; y: number[] };
  o?: { x: number[]; y: number[] };
  h?: 0 | 1;
}

export interface LottieColorKeyframe {
  t: number;
  s: number[]; // Start color [r, g, b, a] (0-1)
  e?: number[]; // End color
  i?: { x: number[]; y: number[] };
  o?: { x: number[]; y: number[] };
  h?: 0 | 1;
}

// ============================================================================
// Shape Items
// ============================================================================

export type LottieShapeItemType =
  | 'gr' // Group
  | 'sh' // Path
  | 'rc' // Rectangle
  | 'el' // Ellipse
  | 'sr' // Polystar
  | 'fl' // Fill
  | 'gf' // Gradient fill
  | 'st' // Stroke
  | 'tr' // Transform
  | 'tm' // Trim paths
  | 'mm'; // Merge paths

export type LottieShapeItem =
  | LottieShapeGroup
  | LottieShapeTrim
  | LottieShapePath
  | LottieShapeRect
  | LottieShapeEllipse
  | LottieShapePolyStar
  | LottieShapeFill
  | LottieShapeGradientFill
  | LottieShapeStroke
  | LottieShapeTransform;

export interface LottieShapeGroup {
  ty: 'gr';
  nm?: string;
  it: LottieShapeItem[];
}

export interface LottieShapePath {
  ty: 'sh';
  nm?: string;
  ks: LottieAnimatedShape;
}

export interface LottieAnimatedShape {
  a: 0 | 1;
  k: LottieShapeVertices | LottieShapeKeyframe[];
}

export interface LottieShapeVertices {
  v: number[][]; // Vertices [[x,y], ...]
  i: number[][]; // In tangent handles (relative)
  o: number[][]; // Out tangent handles (relative)
  c: boolean; // Closed
}

export interface LottieShapeKeyframe {
  t: number;
  s: [LottieShapeVertices];
  e?: [LottieShapeVertices];
  i?: { x: number[]; y: number[] };
  o?: { x: number[]; y: number[] };
  h?: 0 | 1;
}

export interface LottieShapeRect {
  ty: 'rc';
  nm?: string;
  p: LottieAnimatedMulti; // Position (center)
  s: LottieAnimatedMulti; // Size [w, h]
  r: LottieAnimatedValue; // Corner radius
}

export interface LottieShapeEllipse {
  ty: 'el';
  nm?: string;
  p: LottieAnimatedMulti; // Position (center)
  s: LottieAnimatedMulti; // Size [w, h]
}

export interface LottieShapePolyStar {
  ty: 'sr';
  nm?: string;
  sy: 1 | 2; // 1=star, 2=polygon
  p: LottieAnimatedMulti; // Position
  pt: LottieAnimatedValue; // Points/sides
  r: LottieAnimatedValue; // Rotation
  or: LottieAnimatedValue; // Outer radius
  os: LottieAnimatedValue; // Outer roundness
  ir?: LottieAnimatedValue; // Inner radius (star only)
  is?: LottieAnimatedValue; // Inner roundness (star only)
}

export interface LottieShapeFill {
  ty: 'fl';
  nm?: string;
  c: LottieAnimatedColor; // Color [r, g, b, a] (0-1)
  o: LottieAnimatedValue; // Opacity (0-100)
  r?: 1 | 2; // Fill rule (1=nonzero, 2=evenodd)
}

export interface LottieShapeGradientFill {
  ty: 'gf';
  nm?: string;
  o: LottieAnimatedValue; // Opacity (0-100)
  r?: 1 | 2; // Fill rule
  t: 1 | 2; // 1 = linear, 2 = radial
  s: LottieAnimatedMulti; // Start point
  e: LottieAnimatedMulti; // End point (radial: a point on the radius)
  g: {
    p: number; // Number of color stops
    k: LottieAnimatedMulti; // [offset, r, g, b]… then optional [offset, alpha]…
  };
}

export interface LottieShapeStroke {
  ty: 'st';
  nm?: string;
  c: LottieAnimatedColor; // Color
  o: LottieAnimatedValue; // Opacity (0-100)
  w: LottieAnimatedValue; // Width
  lc?: 1 | 2 | 3; // Line cap (1=butt, 2=round, 3=square)
  lj?: 1 | 2 | 3; // Line join (1=miter, 2=round, 3=bevel)
  ml?: number; // Miter limit
}

/** Trim paths: shows the part of the paths above it between start and end (%). */
export interface LottieShapeTrim {
  ty: 'tm';
  nm?: string;
  s: LottieAnimatedValue; // Start (0-100)
  e: LottieAnimatedValue; // End (0-100)
  o: LottieAnimatedValue; // Offset (degrees)
  m: 1 | 2; // 1 = trim each path simultaneously, 2 = one after another
}

export interface LottieShapeTransform {
  ty: 'tr';
  a?: LottieAnimatedMulti; // Anchor
  p: LottieAnimatedMulti; // Position
  r: LottieAnimatedValue; // Rotation
  s: LottieAnimatedMulti; // Scale
  o: LottieAnimatedValue; // Opacity
}
