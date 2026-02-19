# Appendix B — Node Type Reference

This appendix documents every node type in Quar Animator's scene graph, their properties, and the supporting types they reference. All types are defined in `packages/types/src/index.ts`.

## BaseNode (Common Properties)

Every node extends `BaseNode`. These properties are shared by all 12 node types:

```typescript
interface BaseNode {
  id: string; // Unique identifier (UUID)
  name: string; // Display name (shown in Layer Panel)
  type: NodeType; // Discriminant string
  parent: string | null; // Parent node ID (null for root nodes)
  children: string[]; // Child node IDs (ordered, front-to-back)
  transform: Transform; // Position, rotation, scale, anchor, skew
  visible: boolean; // Visibility toggle (eye icon)
  locked: boolean; // Lock toggle (prevents selection/editing)
  opacity: number; // 0–1 (multiplied with fill/stroke opacity)
  blendMode: BlendMode; // Compositing mode (default: 'normal')
  effects?: Effect[]; // Drop shadow, inner shadow, layer blur
  exports?: ExportSetting[]; // Per-element export presets
}
```

## Transform

```typescript
interface Transform {
  position: Vector2; // Local position relative to parent
  rotation: number; // Degrees, clockwise
  scale: Vector2; // Scale multiplier (1.0 = 100%)
  anchor: Vector2; // Normalized pivot point (0.5, 0.5 = center)
  skew: Vector2; // Skew in degrees (x, y)
}
```

## Node Types

### GroupNode

**Type discriminant:** `'group'`

Groups other nodes into a hierarchical container. Optionally performs non-destructive boolean operations on its children.

```typescript
interface GroupNode extends BaseNode {
  type: 'group';
  booleanOp?: BooleanOp; // undefined = normal group
  fills?: Fill[]; // Boolean result appearance
  strokes?: Stroke[]; // Boolean result appearance
}

type BooleanOp = 'union' | 'subtract' | 'intersect' | 'exclude';
```

### RectangleNode

**Type discriminant:** `'rectangle'`

```typescript
interface RectangleNode extends BaseNode {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number]; // [TL, TR, BR, BL]
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
}
```

### EllipseNode

**Type discriminant:** `'ellipse'`

```typescript
interface EllipseNode extends BaseNode {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
}
```

### PolygonNode

**Type discriminant:** `'polygon'`

Covers both regular polygons and star shapes.

```typescript
interface PolygonNode extends BaseNode {
  type: 'polygon';
  sides: number; // 3–12
  radius: number; // Circumscribed circle radius
  innerRadius?: number; // Star inner radius (same units as radius)
  cornerRadius?: number; // Uniform vertex rounding
  fills: Fill[];
  strokes: Stroke[];
  skinData?: SkinData;
}
```

### PathNode

**Type discriminant:** `'path'`

Arbitrary Bezier paths with optional multiple contours.

```typescript
interface PathNode extends BaseNode {
  type: 'path';
  points: PathPoint[]; // Primary contour
  subpaths?: PathPoint[][]; // Additional contours (holes, disjoint regions)
  closed: boolean;
  fillRule?: 'nonzero' | 'evenodd'; // Default: 'nonzero'
  fills: Fill[];
  strokes: Stroke[];
  brushData?: BrushData; // Present for brush-created strokes
  skinData?: SkinData;
}
```

### TextNode

**Type discriminant:** `'text'`

```typescript
interface TextNode extends BaseNode {
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
```

### ImageNode

**Type discriminant:** `'image'`

```typescript
interface ImageNode extends BaseNode {
  type: 'image';
  src: string; // Data URI or URL
  width: number;
  height: number;
  naturalWidth: number; // Original image dimensions
  naturalHeight: number;
  cornerRadius: [number, number, number, number];
  adjustments?: ImageAdjustments;
  skinData?: SkinData;
  vertexOffsets?: [Vector2, Vector2, Vector2, Vector2]; // [BL, BR, TL, TR]
}
```

### ArtboardNode

**Type discriminant:** `'artboard'`

Named composition frame with optional content clipping.

```typescript
interface ArtboardNode extends BaseNode {
  type: 'artboard';
  width: number;
  height: number;
  fills: Fill[]; // Background (supports gradients)
  clipContent: boolean; // Clip children to artboard bounds
}
```

### BoneNode

**Type discriminant:** `'bone'`

Skeletal animation bone. No fills, strokes, or skinData.

```typescript
interface BoneNode extends BaseNode {
  type: 'bone';
  length: number; // Extends along local +X axis
  boneStyle: 'stick' | 'octahedral';
  boneColor: string; // Hex color
  angleMin?: number; // FK rotation constraint (degrees)
  angleMax?: number;
}
```

### IKTargetNode

**Type discriminant:** `'ik-target'`

Inverse kinematics effector or pole target. No fills, strokes, or skinData.

```typescript
interface IKTargetNode extends BaseNode {
  type: 'ik-target';
  ikChainId: string;
  targetType: 'effector' | 'pole';
}
```

### VitruvianNode

**Type discriminant:** `'vitruvian'`

Bone group switching controller. No fills, strokes, or skinData.

```typescript
interface VitruvianNode extends BaseNode {
  type: 'vitruvian';
  controllerId: string;
}
```

### SymbolInstanceNode

**Type discriminant:** `'symbol-instance'`

Instance of a reusable symbol. Children are virtual (resolved from definition at render time).

```typescript
interface SymbolInstanceNode extends BaseNode {
  type: 'symbol-instance';
  symbolId: string;
  overrides: SymbolOverride[];
}

interface SymbolOverride {
  nodeId: string; // Descendant within definition
  properties: Record<string, unknown>; // Partial property overrides
}
```

## The Complete Node Union

```typescript
type Node =
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
  | ArtboardNode
  | SymbolInstanceNode;
```

## Supporting Types

### Fill

```typescript
interface Fill {
  type: 'solid' | 'gradient' | 'none';
  color?: Color;
  gradient?: Gradient;
  opacity: number; // 0–1
  visible: boolean;
}
```

### Stroke

```typescript
interface Stroke {
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
  widthProfile?: number[]; // Width multipliers sampled along path
}
```

### Color

```typescript
interface Color {
  r: number; // 0–255
  g: number; // 0–255
  b: number; // 0–255
  a: number; // 0–1
}
```

### Gradient

```typescript
interface Gradient {
  type: 'linear' | 'radial' | 'conic';
  stops: GradientStop[];
  angle?: number; // Degrees (linear, conic)
  center?: Vector2; // Normalized 0–1 (radial, conic)
  radius?: number; // Normalized (radial)
  start?: Vector2; // Normalized 0–1 (linear)
  end?: Vector2; // Normalized 0–1 (linear)
}

interface GradientStop {
  offset: number; // 0–1
  color: Color;
}
```

### PathPoint

```typescript
interface PathPoint {
  position: Vector2;
  handleIn: Vector2 | null; // null for corner points
  handleOut: Vector2 | null; // null for corner points
  type: 'corner' | 'smooth' | 'symmetric';
  cornerRadius?: number; // Per-vertex rounding
}
```

### ImageAdjustments

```typescript
interface ImageAdjustments {
  brightness: number; // -100 to 100
  contrast: number; // -100 to 100
  saturation: number; // -100 to 100
  hue: number; // -180 to 180 degrees
  exposure: number; // -100 to 100
  temperature: number; // -100 to 100
  tint: number; // -100 to 100
  blur: number; // 0 to 100
}
```

### SkinData

Mesh deformation binding for bone animation.

```typescript
interface SkinData {
  vertices: VertexSkinEntry[];
  inverseBindMatrices: Record<string, number[]>; // boneId → 6-element [a,b,c,d,tx,ty]
  meshBindMatrix: number[]; // 6-element affine matrix
  vertexCount: number;
}

interface VertexSkinEntry {
  influences: VertexBoneWeight[]; // Max 4, sorted by weight descending
}

interface VertexBoneWeight {
  boneId: string;
  weight: number; // 0–1
}
```

### BrushData

Stored on PathNodes created by the Brush tool.

```typescript
interface BrushData {
  spine: PathPoint[]; // Fitted center curve
  widths: number[]; // Per-point width values
  profileId: string | null; // Active brush profile (null = uniform)
  baseWidth?: number; // Override width for profile shaping
}
```

### Effect Types

```typescript
interface DropShadowEffect {
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

interface InnerShadowEffect {
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

interface LayerBlurEffect {
  id: string;
  type: 'layer-blur';
  visible: boolean;
  radius: number;
}

type Effect = DropShadowEffect | InnerShadowEffect | LayerBlurEffect;
```

### ExportSetting

```typescript
interface ExportSetting {
  format: 'png' | 'svg';
  multiplier: 1 | 2 | 3 | 4;
  includeBackground?: boolean;
}
```

### BlendMode

```typescript
type BlendMode =
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
```

### Primitive Types

```typescript
interface Vector2 {
  x: number;
  y: number;
}
interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
interface Matrix3 {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}
```

## Classification Tables

### Which Nodes Have Fills and Strokes?

| Node Type          | fills                 | strokes               |
| ------------------ | --------------------- | --------------------- |
| RectangleNode      | Yes                   | Yes                   |
| EllipseNode        | Yes                   | Yes                   |
| PolygonNode        | Yes                   | Yes                   |
| PathNode           | Yes                   | Yes                   |
| TextNode           | Yes                   | Yes                   |
| GroupNode          | Only with booleanOp   | Only with booleanOp   |
| ArtboardNode       | Yes (background)      | No                    |
| ImageNode          | No                    | No                    |
| BoneNode           | No                    | No                    |
| IKTargetNode       | No                    | No                    |
| VitruvianNode      | No                    | No                    |
| SymbolInstanceNode | No (virtual children) | No (virtual children) |

### Which Nodes Support Skin Binding?

| Node Type     | skinData            |
| ------------- | ------------------- |
| RectangleNode | Yes                 |
| EllipseNode   | Yes                 |
| PolygonNode   | Yes                 |
| PathNode      | Yes                 |
| ImageNode     | Yes (4-vertex quad) |
| All others    | No                  |
