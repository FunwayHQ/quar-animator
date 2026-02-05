# Quar Animator Sprint Plan

**Total Duration**: 24 months (48 two-week sprints)
**Sprint Length**: 2 weeks
**Start Date**: TBD

---

## Overview

This document breaks down the PRD roadmap into actionable sprints with detailed LLM prompts for each sprint. Each sprint includes:

- **Goals**: What we're trying to achieve
- **Agent Assignments**: Which agents own which tasks
- **Deliverables**: Concrete outputs
- **LLM Prompt**: Detailed prompt for executing the sprint

---

## Phase 1: Foundation (Sprints 1-12)

### Sprint 1: Project Setup & Architecture

**Goals**: Establish project structure, tooling, and core architecture decisions.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Project Lead | Architecture design, tech decisions |
| Frontend Designer | Design system setup |

**Deliverables**:

- [ ] Monorepo structure (pnpm workspaces)
- [ ] TypeScript configuration
- [ ] ESLint + Prettier setup
- [ ] React + Vite project scaffold
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Design tokens (colors, spacing, typography)
- [ ] Component library setup (Storybook)

**LLM Prompt**:

```
You are setting up the Quar Animator project from scratch. This is a web-native 2D animation tool built with React, TypeScript, WebGL, and WASM.

## Task 1: Create Monorepo Structure

Create a pnpm workspace monorepo with the following packages:
- `apps/web` - Main React application
- `apps/electron` - Electron wrapper (later)
- `packages/core` - Rendering engine, scene graph
- `packages/animation` - Timeline, keyframes, interpolation
- `packages/rigging` - Bones, IK, weight painting
- `packages/ui` - Shared UI components
- `packages/export` - Export pipeline
- `packages/types` - Shared TypeScript types

## Task 2: Configure TypeScript

Set up strict TypeScript configuration with:
- Strict mode enabled
- Path aliases for clean imports
- Project references for monorepo

## Task 3: Configure Development Tools

Set up:
- ESLint with TypeScript, React, and accessibility rules
- Prettier for formatting
- Husky for pre-commit hooks
- lint-staged for incremental linting

## Task 4: Create React Application Shell

In `apps/web`, create a Vite + React application with:
- React 18 with concurrent features
- React Router for navigation
- Basic layout structure (Tools, Canvas, Properties, Timeline)

## Task 5: Set Up Storybook

Configure Storybook for the `packages/ui` package with:
- TypeScript support
- Dark theme
- Accessibility addon
- Controls addon

## Task 6: Configure CI/CD

Create GitHub Actions workflows for:
- Lint and type-check on PR
- Build all packages
- Run tests (placeholder)
- Deploy Storybook to GitHub Pages

Output the complete file structure and all configuration files.
```

---

### Sprint 2: Design System & Core UI Components

**Goals**: Establish visual design language and build foundational UI components.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Frontend Designer | All UI components |
| QA Tester | Component testing in Storybook |

**Deliverables**:

- [ ] Design tokens finalized
- [ ] Button, Input, Select, Checkbox components
- [ ] Panel, Toolbar, Tooltip components
- [ ] Icon library integration
- [ ] Dark theme implementation

**LLM Prompt**:

````
/frontend-design

You are building the design system for Quar Animator, a professional 2D animation tool.

## Design Requirements

- **Theme**: Dark mode only (for now)
- **Font**: Inter for UI, JetBrains Mono for code/numbers
- **Grid**: 8px base unit
- **Colors**: Professional, high contrast, accessible

## Task 1: Design Tokens

Create a comprehensive token system in CSS custom properties:

```css
:root {
  /* Colors - Background */
  --color-bg-primary: ...;
  --color-bg-secondary: ...;
  --color-bg-tertiary: ...;
  --color-bg-elevated: ...;

  /* Colors - Text */
  --color-text-primary: ...;
  --color-text-secondary: ...;
  --color-text-disabled: ...;

  /* Colors - Accent */
  --color-accent-primary: ...;
  --color-accent-hover: ...;
  --color-accent-active: ...;

  /* Colors - Semantic */
  --color-success: ...;
  --color-warning: ...;
  --color-error: ...;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Typography */
  --font-family-ui: 'Inter', sans-serif;
  --font-family-mono: 'JetBrains Mono', monospace;
  --font-size-xs: 10px;
  --font-size-sm: 12px;
  --font-size-md: 14px;
  --font-size-lg: 16px;

  /* Borders */
  --border-radius-sm: 4px;
  --border-radius-md: 6px;
  --border-radius-lg: 8px;

  /* Shadows */
  --shadow-sm: ...;
  --shadow-md: ...;
  --shadow-lg: ...;
}
````

## Task 2: Core Components

Create these foundational components with full variants:

### Button

- Variants: primary, secondary, ghost, danger
- Sizes: sm, md, lg
- States: default, hover, active, disabled, loading
- Icon support (left, right, icon-only)

### Input

- Types: text, number, color
- States: default, focus, error, disabled
- Label and helper text support
- Numeric input with scrub-to-adjust

### Panel

- Collapsible with header
- Resizable edges
- Dockable indicators

### Toolbar

- Vertical and horizontal variants
- Tool button with active state
- Separator and group support

### Tooltip

- Positions: top, right, bottom, left
- Keyboard shortcut display
- Delay on hover

Create all components with:

- TypeScript interfaces for props
- Storybook stories with all variants
- Keyboard accessibility
- ARIA attributes

```

---

### Sprint 3: Canvas Foundation

**Goals**: Implement basic WebGL canvas with zoom, pan, and grid.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | WebGL setup, rendering |
| Frontend Designer | Canvas UI chrome |

**Deliverables**:
- [ ] WebGL 2 context initialization
- [ ] Camera system (zoom, pan)
- [ ] Grid rendering
- [ ] Canvas resize handling
- [ ] Coordinate system utilities

**LLM Prompt**:
```

You are implementing the canvas system for Quar Animator using WebGL 2.

## Architecture

The canvas system should be structured as:

- `CanvasManager` - High-level canvas management
- `WebGLRenderer` - WebGL abstraction layer
- `Camera` - 2D camera with zoom/pan
- `Grid` - Background grid rendering

## Task 1: WebGL Renderer

Create `packages/core/src/rendering/WebGLRenderer.ts`:

```typescript
interface WebGLRendererOptions {
  canvas: HTMLCanvasElement;
  antialias?: boolean;
  preserveDrawingBuffer?: boolean;
}

class WebGLRenderer {
  // Initialize WebGL 2 context with fallback error handling
  // Manage viewport and resolution (handle devicePixelRatio)
  // Provide clear, draw call abstractions
  // State caching to avoid redundant GL calls
  // Context loss/restore handling
}
```

## Task 2: Camera System

Create `packages/core/src/Camera.ts`:

```typescript
interface Camera {
  position: Vector2; // World position of camera center
  zoom: number; // Zoom level (1.0 = 100%)
  rotation: number; // Canvas rotation (degrees)

  // Transform methods
  worldToScreen(point: Vector2): Vector2;
  screenToWorld(point: Vector2): Vector2;

  // Manipulation
  pan(delta: Vector2): void;
  zoomAt(point: Vector2, factor: number): void; // Zoom toward point
  fitBounds(bounds: Rect): void;

  // Matrix generation for shaders
  getViewMatrix(): Matrix3;
  getProjectionMatrix(): Matrix3;
}
```

Implement smooth zoom that zooms toward the mouse cursor position.

## Task 3: Grid Rendering

Create an infinite grid system:

- Major and minor grid lines
- Grid spacing adapts to zoom level
- Render efficiently using instanced lines
- Subtle appearance that doesn't distract

## Task 4: Canvas React Component

Create `apps/web/src/components/Canvas.tsx`:

```typescript
interface CanvasProps {
  className?: string;
}

function Canvas({ className }: CanvasProps) {
  // Initialize WebGL renderer
  // Handle mouse events (pan, zoom)
  // Handle keyboard shortcuts
  // Handle resize with ResizeObserver
  // Implement render loop with requestAnimationFrame
}
```

Mouse interactions:

- Middle mouse drag or Space+drag: Pan
- Scroll wheel: Zoom at cursor
- Ctrl+0: Fit to window
- Ctrl+1: Zoom to 100%

## Task 5: Coordinate Display

Show current mouse coordinates in world space in the status bar.
Format: "X: 123.4 Y: 567.8" with 1 decimal precision.

Output complete, working code for all files.

```

---

### Sprint 4: Scene Graph & Basic Shapes

**Goals**: Implement scene graph data structure and basic vector shape rendering.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | Scene graph, shape rendering |
| Animation System | Layer system foundation |

**Deliverables**:
- [ ] Scene graph with node hierarchy
- [ ] Rectangle and ellipse shape nodes
- [ ] Fill and stroke rendering
- [ ] Selection system foundation
- [ ] Layer panel data binding

**LLM Prompt**:
```

You are implementing the scene graph and basic shape rendering for Quar Animator.

## Task 1: Scene Graph Architecture

Create `packages/core/src/SceneGraph.ts`:

```typescript
interface Node {
  id: string;
  name: string;
  parent: string | null;
  children: string[];

  // Transform
  transform: Transform;

  // Visibility
  visible: boolean;
  locked: boolean;

  // Type-specific data (discriminated union)
  type: 'group' | 'rectangle' | 'ellipse' | 'path' | 'text';
}

interface Transform {
  position: Vector2;
  rotation: number; // Degrees
  scale: Vector2;
  anchor: Vector2; // 0-1 normalized
  skew: Vector2;
}

interface RectangleNode extends Node {
  type: 'rectangle';
  width: number;
  height: number;
  cornerRadius: [number, number, number, number]; // Per-corner
  fill: Fill | null;
  stroke: Stroke | null;
}

interface EllipseNode extends Node {
  type: 'ellipse';
  radiusX: number;
  radiusY: number;
  fill: Fill | null;
  stroke: Stroke | null;
}

interface Fill {
  type: 'solid' | 'gradient';
  color?: string; // For solid
  gradient?: Gradient; // For gradient
  opacity: number;
}

interface Stroke {
  color: string;
  width: number;
  opacity: number;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
  dashArray?: number[];
}

class SceneGraph {
  // CRUD operations for nodes
  addNode(node: Node, parentId?: string): void;
  removeNode(id: string): void;
  moveNode(id: string, newParentId: string, index?: number): void;

  // Queries
  getNode(id: string): Node | undefined;
  getChildren(id: string): Node[];
  getWorldTransform(id: string): Matrix3;

  // Traversal
  traverse(callback: (node: Node, depth: number) => void): void;
  traverseVisible(callback: (node: Node) => void): void;

  // Events
  on(event: 'nodeAdded' | 'nodeRemoved' | 'nodeChanged', callback): void;
}
```

## Task 2: Shape Rendering

Create `packages/core/src/rendering/ShapeRenderer.ts`:

Implement efficient rendering of rectangles and ellipses:

- Generate geometry (triangles) for shapes
- Support rounded corners on rectangles
- Support fill and stroke (stroke as separate geometry)
- Use vertex colors for solid fills
- Batch similar shapes to reduce draw calls

## Task 3: Transform Hierarchy

Implement world transform calculation:

- Cache world transforms
- Invalidate cache on ancestor change
- Support all transform properties (position, rotation, scale, anchor, skew)

## Task 4: Selection System

Create `packages/core/src/Selection.ts`:

```typescript
interface Selection {
  selectedIds: Set<string>;

  select(id: string, additive?: boolean): void;
  deselect(id: string): void;
  clear(): void;
  toggle(id: string): void;

  // Multi-select
  selectAll(): void;
  selectRect(bounds: Rect): void; // Marquee selection

  // Query
  isSelected(id: string): boolean;
  getSelectedNodes(): Node[];
  getBoundingBox(): Rect | null;
}
```

## Task 5: Layer Panel Integration

Create `apps/web/src/components/LayerPanel.tsx`:

Display scene graph as a hierarchical list:

- Indentation for nesting
- Visibility toggle (eye icon)
- Lock toggle (lock icon)
- Selection highlight
- Drag to reorder (later sprint)
- Double-click to rename

```

---

### Sprint 5: Drawing Tools - Shapes

**Goals**: Implement shape creation tools (rectangle, ellipse, polygon).

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | Tool system architecture |
| Frontend Designer | Tool UI, cursors |
| QA Tester | Tool interaction testing |

**Deliverables**:
- [ ] Tool manager with mode switching
- [ ] Rectangle tool with drag-to-create
- [ ] Ellipse tool
- [ ] Polygon tool (star, triangle, etc.)
- [ ] Shift to constrain proportions
- [ ] Alt to draw from center

**LLM Prompt**:
```

You are implementing the shape drawing tools for Quar Animator.

## Tool System Architecture

Create `packages/core/src/tools/ToolManager.ts`:

```typescript
interface Tool {
  name: string;
  icon: string;
  shortcut: string;
  cursor: string;

  // Lifecycle
  activate(): void;
  deactivate(): void;

  // Input handling
  onPointerDown(event: CanvasPointerEvent): void;
  onPointerMove(event: CanvasPointerEvent): void;
  onPointerUp(event: CanvasPointerEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;

  // Rendering (for guides, previews)
  render(ctx: RenderContext): void;
}

interface CanvasPointerEvent {
  screenPosition: Vector2;
  worldPosition: Vector2;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  pressure: number; // For stylus
}

class ToolManager {
  tools: Map<string, Tool>;
  activeTool: Tool | null;

  registerTool(tool: Tool): void;
  setActiveTool(name: string): void;
  handlePointerEvent(event: CanvasPointerEvent): void;
}
```

## Rectangle Tool

Create `packages/core/src/tools/RectangleTool.ts`:

Behavior:

1. Click and drag to create rectangle
2. Rectangle defined by start and current pointer position
3. Show preview outline while dragging
4. On release, create RectangleNode in scene graph

Modifiers:

- **Shift**: Constrain to square (1:1 aspect ratio)
- **Alt**: Draw from center (start point is center, not corner)
- **Shift+Alt**: Square from center

Properties Panel Integration:

- After creation, show properties: width, height, corner radius, fill, stroke
- Numeric inputs should update the shape live

## Ellipse Tool

Create `packages/core/src/tools/EllipseTool.ts`:

Same interaction model as rectangle:

- Drag to create ellipse bounded by rectangle
- Shift: Constrain to circle
- Alt: Draw from center

## Polygon Tool

Create `packages/core/src/tools/PolygonTool.ts`:

Additional UI:

- Properties panel shows: sides (3-12), inner radius (for stars)
- Preview updates as properties change during drag

Calculation:

```typescript
function generatePolygon(
  center: Vector2,
  radius: number,
  sides: number,
  innerRadius?: number
): Vector2[] {
  // Generate regular polygon vertices
  // If innerRadius provided, create star shape
}
```

## Toolbar Integration

Update the toolbar to show shape tools:

- Single-click selects tool
- Tool options appear in properties panel
- Active tool is highlighted
- Keyboard shortcuts work (R for rectangle, E for ellipse, etc.)

## Task: Cursor Feedback

Implement custom cursors:

- Crosshair cursor when tool is active
- Show "+" icon when Alt is held (draw from center)
- Cursor changes near canvas edge

Output complete implementation with all tool files.

```

---

### Sprint 6: Drawing Tools - Pen & Bezier

**Goals**: Implement pen tool for Bezier path creation.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | Path data structure, rendering |
| Frontend Designer | Path editing UI |

**Deliverables**:
- [ ] Path node type with Bezier curves
- [ ] Pen tool for path creation
- [ ] Click for corner points
- [ ] Drag for smooth curves
- [ ] Alt-click to convert point type
- [ ] Close path on start point click

**LLM Prompt**:
```

You are implementing the Pen tool and Bezier path system for Quar Animator.

## Path Data Structure

Create `packages/core/src/shapes/Path.ts`:

```typescript
interface PathPoint {
  position: Vector2; // Anchor point
  handleIn: Vector2 | null; // Incoming bezier handle (relative to position)
  handleOut: Vector2 | null; // Outgoing bezier handle (relative to position)
  type: 'corner' | 'smooth' | 'symmetric';
}

interface PathNode extends Node {
  type: 'path';
  points: PathPoint[];
  closed: boolean;
  fill: Fill | null;
  stroke: Stroke | null;
}
```

Point types:

- **Corner**: Handles are independent, can be at any angle
- **Smooth**: Handles are collinear (same line) but can have different lengths
- **Symmetric**: Handles are collinear and same length

## Path Rendering

Implement Bezier curve tessellation:

1. Convert path to series of cubic Bezier segments
2. Subdivide each segment to line segments (adaptive based on curvature)
3. Generate fill triangles using ear-clipping or tessellation library
4. Generate stroke geometry with proper joins and caps

For performance, cache tessellated geometry and only regenerate when path changes.

## Pen Tool Implementation

Create `packages/core/src/tools/PenTool.ts`:

### Creating Points

**Click (no drag)**:

- Creates corner point
- Handles are null

**Click and drag**:

- Creates smooth point
- Drag direction sets handleOut
- handleIn is mirror of handleOut

**Click on first point (when path has 2+ points)**:

- Closes the path
- Finishes path creation

**Enter or Escape**:

- Finishes path (open)
- Deselects path

### Modifying While Drawing

**Alt + click on existing point**:

- Converts point type (corner ↔ smooth)
- If smooth, removes handles
- If corner, resets to smooth with default handles

**Click on last point**:

- Allows adjusting the last point's handleOut

### Visual Feedback

While drawing, show:

- Completed segments as solid stroke
- Current segment preview (last point to cursor) as dashed line
- Points as small squares
- Handles as circles with connecting lines
- Hover highlight on first point (showing it will close)

## Direct Selection Tool

Create `packages/core/src/tools/DirectSelectTool.ts`:

For editing existing paths:

- Click point to select it
- Drag point to move it
- Click and drag handle to adjust curve
- Shift+click to add to selection
- Delete key removes selected points
- Double-click segment to add point

## Keyboard Shortcuts

- P: Pen tool
- A: Direct selection tool
- While using Pen: Escape to finish, Backspace to undo last point

Implement complete pen tool with all interactions.

```

---

### Sprint 7: Drawing Tools - Brush & Eraser ✅ COMPLETE

**Goals**: Implement freehand brush and eraser tools.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | Stroke smoothing algorithm |
| Frontend Designer | Brush settings UI |

**Deliverables**:
- [x] Brush tool with freehand drawing
- [x] Ramer-Douglas-Peucker smoothing
- [x] Pressure sensitivity support
- [x] Eraser tool
- [x] Brush size and smoothing settings

**Completion Notes**:
- BrushTool: 32 tests, filled outline paths for WebGL compatibility
- EraserTool: 32 tests, stroke mode + point mode
- Editor store integration with Zustand selector hooks
- Keyboard shortcuts: B (brush), E (eraser), [ ] (eraser size)
- Total: 891 tests passing (736 core + 155 web)

**LLM Prompt**:
```

You are implementing the brush and eraser tools for Quar Animator.

## Brush Tool

Create `packages/core/src/tools/BrushTool.ts`:

### Stroke Recording

During drawing:

1. Capture points at pointer events (use pointermove with coalesced events)
2. Store position, pressure, and timestamp for each point
3. Build path in real-time for visual feedback

### Smoothing Algorithm

Implement Ramer-Douglas-Peucker algorithm:

```typescript
function simplifyPath(points: Vector2[], epsilon: number): Vector2[] {
  // Find point with maximum distance from line between first and last
  // If max distance > epsilon, recursively simplify both halves
  // Otherwise, return just first and last points
}
```

Epsilon should be adjustable (Smoothing setting: 0-100, maps to epsilon 0.5-10 pixels).

### Pressure Sensitivity

Use Pointer Events API `pressure` property:

- Map pressure 0-1 to stroke width multiplier
- Interpolate pressure between points for smooth width variation
- Create variable-width stroke geometry

```typescript
interface BrushPoint {
  position: Vector2;
  pressure: number; // 0-1
  timestamp: number;
}

function generateVariableWidthStroke(
  points: BrushPoint[],
  baseWidth: number,
  pressureRange: [number, number] // min/max multiplier
): Geometry {
  // Generate mesh with width based on pressure
}
```

### Brush Settings

Properties panel shows:

- Size: 1-100px (slider + numeric input)
- Smoothing: 0-100 (affects simplification epsilon)
- Pressure: Toggle on/off
- Pressure range: min-max width multiplier

## Eraser Tool

Create `packages/core/src/tools/EraserTool.ts`:

The eraser removes parts of paths it touches.

### Mode 1: Stroke Eraser (default)

Deletes entire strokes that the eraser touches:

1. On pointer move, check collision with paths
2. If eraser circle intersects any path segment, delete that path
3. Show eraser as circle cursor with size indicator

### Mode 2: Point Eraser

More precise erasing:

1. Check collision with path points
2. Delete points that fall within eraser radius
3. If deleting a point breaks a path, split into multiple paths

### Settings

- Size: 1-100px
- Mode: Stroke / Point toggle

## Path Boolean Operations (Foundation)

For future Boolean Brush, establish path boolean foundation:

```typescript
interface PathBoolean {
  union(pathA: PathNode, pathB: PathNode): PathNode;
  subtract(pathA: PathNode, pathB: PathNode): PathNode;
  intersect(pathA: PathNode, pathB: PathNode): PathNode;
}
```

Use a library like paper.js boolean operations or implement Vatti clipping algorithm.

## Keyboard Shortcuts

- B: Brush tool
- E: Eraser tool
- [: Decrease brush size
- ]: Increase brush size

Implement complete brush and eraser tools with all features.

```

---

### Sprint 8: Selection & Transform Tools

**Goals**: Implement selection tool with transform handles.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | Transform handle system |
| Frontend Designer | Handle visuals |
| QA Tester | Transform accuracy testing |

**Deliverables**:
- [ ] Selection tool (click, marquee)
- [ ] Transform handles (corners, edges, rotation)
- [ ] Move, scale, rotate via handles
- [ ] Numeric transform input in properties
- [ ] Multi-select transform

**LLM Prompt**:
```

You are implementing the selection and transform tools for Quar Animator.

## Selection Tool

Create `packages/core/src/tools/SelectionTool.ts`:

### Click Selection

1. On click, raycast to find topmost shape at point
2. If found, select it (clear previous selection unless Shift held)
3. If nothing found, clear selection

Hit testing:

```typescript
function hitTest(point: Vector2, nodes: Node[]): Node | null {
  // Test from top to bottom (reverse render order)
  // For paths: test if point is inside fill or near stroke
  // For shapes: test bounds first, then precise geometry
}
```

### Marquee Selection

1. If click starts on empty space, begin marquee
2. Drag to define selection rectangle
3. On release, select all nodes intersecting/contained by rectangle
4. Shift+marquee adds to selection

Visual: Dashed rectangle with semi-transparent fill.

### Keyboard Modifiers

- **Click**: Select single, clear others
- **Shift+Click**: Add to selection
- **Ctrl+Click**: Toggle selection
- **Ctrl+A**: Select all

## Transform Handles

Create `packages/core/src/tools/TransformHandles.ts`:

When selection exists, show transform handles around bounding box:

```
    [R]─────────[·]─────────[R]
     │                       │
    [·]                     [·]
     │         [+]           │    [+] = rotation handle (above)
    [·]                     [·]
     │                       │
    [R]─────────[·]─────────[R]

[R] = Corner (resize proportionally)
[·] = Edge (resize one axis)
```

### Handle Interactions

**Corner handles**:

- Drag to scale from opposite corner
- Shift: Maintain aspect ratio
- Alt: Scale from center

**Edge handles**:

- Drag to scale one axis
- Alt: Scale from center

**Rotation**:

- Handle appears above top-center
- Drag to rotate around selection center
- Shift: Snap to 15° increments
- Alt: Rotate around opposite corner

### Move

- Drag inside selection bounds to move
- Arrow keys: Move by 1px (10px with Shift)

### Transform Origin

Show transform origin (anchor point) as crosshair.

- Can be dragged to new position
- Double-click to reset to center

## Properties Panel

When selection exists, show transform properties:

```
Transform
├── Position   X: [  0.0 ] Y: [  0.0 ]
├── Size       W: [100.0 ] H: [100.0 ] [🔗]  (link to maintain aspect)
├── Rotation   [ 0.0 ]°
├── Scale      X: [100.0 ]% Y: [100.0 ]%
└── Anchor     X: [ 50.0 ]% Y: [ 50.0 ]%
```

All numeric inputs should:

- Support scrub-to-adjust (drag on label)
- Support math expressions (e.g., "100+50")
- Update live as values change

## Multi-Select Transform

When multiple objects selected:

- Show combined bounding box
- Transform all objects together
- Maintain relative positions during scale/rotate

Implement complete selection and transform system.

```

---

### Sprint 9: Timeline Foundation

**Goals**: Build timeline UI with layer tracks and playhead.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Animation System | Timeline data, playback |
| Frontend Designer | Timeline UI components |

**Deliverables**:
- [ ] Timeline component with tracks
- [ ] Playhead with scrubbing
- [ ] Frame number display
- [ ] Zoom and scroll controls
- [ ] Layer track rows

**LLM Prompt**:
```

You are building the timeline component for Quar Animator.

## Timeline Data Structure

Create `packages/animation/src/Timeline.ts`:

```typescript
interface Timeline {
  id: string;
  duration: number; // In frames
  frameRate: number; // FPS (default 30)
  currentTime: number; // Current frame

  // Layer-based organization
  layers: TimelineLayer[];

  // Audio tracks
  audioTracks: AudioTrack[];

  // Markers
  markers: Marker[];
}

interface TimelineLayer {
  nodeId: string; // Reference to scene graph node
  tracks: PropertyTrack[];
  expanded: boolean;
}

interface PropertyTrack {
  property: string; // e.g., "transform.position.x"
  keyframes: Keyframe[];
}

interface Keyframe {
  time: number; // Frame number
  value: any; // Property value
  easing: EasingFunction;
  tangentIn?: Vector2; // For graph editor
  tangentOut?: Vector2;
}

interface Marker {
  time: number;
  name: string;
  color: string;
}
```

## Playback Controller

Create `packages/animation/src/PlaybackController.ts`:

```typescript
class PlaybackController {
  timeline: Timeline;
  playing: boolean;
  loop: boolean;
  playRange: [number, number] | null;

  play(): void;
  pause(): void;
  stop(): void; // Stop and return to start
  gotoFrame(frame: number): void;
  gotoTime(seconds: number): void;

  // Called each animation frame
  tick(deltaTime: number): void;
}
```

Use `requestAnimationFrame` for smooth playback. Accumulate time and advance frames when threshold reached.

## Timeline UI Component

Create `apps/web/src/components/timeline/Timeline.tsx`:

Layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ [◀][▶][⏹] | 00:00:15 / 00:01:00 | [🔁] | ◀──●──▶ Zoom         │ <- Controls
├──────────┬──────────────────────────────────────────────────────┤
│          │  0    15    30    45    60    75    90  ...         │ <- Ruler
│  Layers  ├──────────────────────────────────────────────────────┤
│          │  ▼ Rectangle 1                                       │
│          │    ├─ Position ──◆────────◆─────────────            │
│          │    ├─ Scale    ────◆──────────◆─────────            │
│          │    └─ Rotation ──────◆────────────◆─────            │
│          │  ▼ Ellipse 1                                         │
│          │    └─ Position ◆──────────────◆─────────            │
└──────────┴──────────────────────────────────────────────────────┘
                               ▲
                        Playhead (red line)
```

### Controls Bar

- Play/Pause toggle button
- Stop button (reset to frame 0)
- Current time display (frames and timecode)
- Loop toggle
- Zoom slider (affects horizontal scale)

### Ruler

- Shows frame numbers
- Click to move playhead
- Drag to scrub
- Double-click to set playback range
- Markers shown as colored triangles

### Layer Tracks

- Left sidebar shows layer names (synced with Layer Panel)
- Expand/collapse property tracks
- Keyframes shown as diamonds
- Selection: click keyframe, shift+click for range, drag to marquee

### Playhead

- Red vertical line at current time
- Draggable
- Snaps to frames

### Interactions

- Space: Play/Pause
- Home: Go to start
- End: Go to end
- Left/Right arrows: Previous/Next frame
- Shift+Left/Right: Previous/Next keyframe
- Mouse wheel: Scroll horizontally
- Ctrl+Mouse wheel: Zoom timeline

Implement complete timeline component with all features.

```

---

### Sprint 10: Keyframe System

**Goals**: Implement keyframe creation, editing, and interpolation.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Animation System | Keyframe logic, interpolation |
| Core Engine | Property binding system |

**Deliverables**:
- [ ] Keyframe creation on property change
- [ ] Auto-keyframe mode toggle
- [ ] Keyframe selection and manipulation
- [ ] Linear and bezier interpolation
- [ ] Copy/paste keyframes

**LLM Prompt**:
```

You are implementing the keyframe system for Quar Animator.

## Property Binding

Create `packages/animation/src/PropertyBinding.ts`:

```typescript
interface PropertyBinding {
  nodeId: string;
  property: string; // Dot-notation path: "transform.position.x"

  // Get current value from scene graph
  getValue(): any;

  // Set value on scene graph
  setValue(value: any): void;

  // Get interpolated value at time
  getValueAtTime(time: number): any;
}

class PropertyBindingManager {
  // Create binding for a node property
  createBinding(nodeId: string, property: string): PropertyBinding;

  // Get all animated properties for a node
  getAnimatedProperties(nodeId: string): string[];

  // Evaluate all bindings at a given time
  evaluateAtTime(time: number): void;
}
```

## Keyframe Operations

Create `packages/animation/src/KeyframeManager.ts`:

```typescript
class KeyframeManager {
  timeline: Timeline;

  // Creation
  addKeyframe(nodeId: string, property: string, time: number, value: any): Keyframe;
  addKeyframeAtCurrentTime(nodeId: string, property: string): Keyframe;

  // Editing
  moveKeyframe(keyframe: Keyframe, newTime: number): void;
  moveKeyframes(keyframes: Keyframe[], deltaTime: number): void;
  setKeyframeValue(keyframe: Keyframe, value: any): void;
  setKeyframeEasing(keyframe: Keyframe, easing: EasingFunction): void;

  // Deletion
  removeKeyframe(keyframe: Keyframe): void;
  removeKeyframes(keyframes: Keyframe[]): void;

  // Clipboard
  copyKeyframes(keyframes: Keyframe[]): KeyframeClipboard;
  pasteKeyframes(clipboard: KeyframeClipboard, targetTime: number): Keyframe[];

  // Queries
  getKeyframeAt(nodeId: string, property: string, time: number): Keyframe | null;
  getKeyframesInRange(nodeId: string, property: string, start: number, end: number): Keyframe[];
}
```

## Auto-Keyframe Mode

When enabled:

1. Any property change during playback or at non-zero time creates/updates keyframe
2. If keyframe exists at current time, update its value
3. If no keyframe exists, create new one

When disabled:

- Property changes only affect the current value
- No keyframes created automatically

Toggle in toolbar or via K shortcut.

## Interpolation Engine

Create `packages/animation/src/Interpolation.ts`:

```typescript
type InterpolationType = 'number' | 'vector2' | 'color' | 'path';

interface Interpolator<T> {
  lerp(a: T, b: T, t: number): T;
}

const interpolators: Record<InterpolationType, Interpolator<any>> = {
  number: {
    lerp: (a, b, t) => a + (b - a) * t,
  },
  vector2: {
    lerp: (a, b, t) => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    }),
  },
  color: {
    lerp: (a, b, t) => {
      // Interpolate in Lab color space for perceptual smoothness
    },
  },
  path: {
    lerp: (a, b, t) => {
      // Interpolate path points
      // Handle different point counts via point matching
    },
  },
};

function getInterpolatedValue(track: PropertyTrack, time: number): any {
  const [before, after] = findSurroundingKeyframes(track, time);

  if (!before) return after?.value;
  if (!after) return before?.value;
  if (before.time === after.time) return before.value;

  const localT = (time - before.time) / (after.time - before.time);
  const easedT = applyEasing(localT, before.easing, before.tangentOut, after.tangentIn);

  const interpolator = getInterpolatorForType(before.value);
  return interpolator.lerp(before.value, after.value, easedT);
}
```

## Easing Functions

Implement easing library in `packages/animation/src/Easing.ts`:

```typescript
type EasingFunction =
  | 'linear'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  // ... all standard easing functions
  | { type: 'cubicBezier'; points: [number, number, number, number] };

function applyEasing(t: number, easing: EasingFunction): number {
  // Return eased t value
}
```

## Keyframe UI Interactions

In the timeline:

- Click keyframe to select
- Double-click to edit value in popup
- Right-click for context menu (delete, copy, ease type)
- Drag keyframe to move in time
- Drag multiple selected keyframes together
- Box select keyframes

Implement complete keyframe system with all features.

```

---

### Sprint 11: Properties Panel & Animation Recording

**Goals**: Context-sensitive properties panel with animation controls.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Frontend Designer | Properties panel UI |
| Animation System | Recording integration |

**Deliverables**:
- [ ] Context-sensitive properties panel
- [ ] Animatable property indicators
- [ ] Per-property keyframe buttons
- [ ] Numeric scrubbing
- [ ] Color picker integration

**LLM Prompt**:
```

You are building the properties panel for Quar Animator.

## Properties Panel Architecture

Create `apps/web/src/components/PropertiesPanel.tsx`:

```typescript
interface PropertiesPanelProps {
  selection: Node[];
}

function PropertiesPanel({ selection }: PropertiesPanelProps) {
  // Show properties for selected nodes
  // Aggregate common properties for multi-selection
  // Show "Mixed" for differing values
}
```

## Property Sections

Organize properties into collapsible sections:

```
┌─ Transform ─────────────────────────────────┐
│ Position    X [◆ 100.0 ] Y [  200.0 ]       │  ◆ = has keyframe
│ Size        W [  50.0  ] H [  50.0  ] [🔗]  │  🔗 = link dimensions
│ Rotation    [◇  45.0  ]°                    │  ◇ = animatable (no keyframe yet)
│ Scale       X [ 100.0  ]% Y [ 100.0  ]%     │
│ Anchor      X [  50.0  ]% Y [  50.0  ]%     │
│ Skew        X [   0.0  ]° Y [   0.0  ]°     │
└─────────────────────────────────────────────┘
┌─ Appearance ────────────────────────────────┐
│ Fill        [■ #3B82F6 ▼] [100]%            │
│ Stroke      [■ #1E40AF ▼] [  2]px [100]%    │
│ Blend Mode  [ Normal ▼ ]                    │
│ Opacity     [═══════●══] 80%                │
└─────────────────────────────────────────────┘
┌─ Effects ───────────────────────────────────┐
│ + Add Effect                                │
│ [✓] Drop Shadow                        [⋮]  │
│     Offset X [5] Y [5] Blur [10] #000       │
│ [✓] Blur                               [⋮]  │
│     Radius [5]                              │
└─────────────────────────────────────────────┘
```

## Animatable Property Indicators

For each animatable property:

- **No keyframe**: Empty diamond ◇ (click to add keyframe)
- **Has keyframe at current time**: Filled diamond ◆
- **Has keyframes, but not at current time**: Half-filled diamond

Click diamond to:

- Add keyframe if none exists
- Remove keyframe if at current time

Right-click diamond for menu:

- Add Keyframe
- Remove Keyframe
- Go to Previous Keyframe
- Go to Next Keyframe
- Clear All Keyframes

## Numeric Input Component

Create `packages/ui/src/components/NumericInput.tsx`:

Features:

- Scrub-to-adjust: Drag on label to change value
- Math expressions: Type "100+50" and it evaluates to 150
- Unit suffix display (px, %, °)
- Min/max constraints
- Step increment
- Undo integration

```typescript
interface NumericInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  label?: string;
  scrubSensitivity?: number;
}
```

## Color Picker

Create `packages/ui/src/components/ColorPicker.tsx`:

Features:

- Saturation/brightness square
- Hue slider
- Alpha slider
- Hex input
- RGB/HSL toggle
- Eyedropper tool
- Recent colors
- Saved swatches

## Multi-Selection Properties

When multiple nodes selected:

- Show properties common to all selected types
- Show actual value if all selected have same value
- Show "Mixed" placeholder if values differ
- Editing a mixed value sets all selected to new value

## Expression Toggle

Each animatable property can have an expression:

- Click expression icon (fx) to toggle expression mode
- In expression mode, show text input instead of value
- Expression evaluated each frame
- Error indicator if expression is invalid

Implement complete properties panel with all features.

```

---

### Sprint 12: Onion Skinning & Playback Polish

**Goals**: Implement onion skinning and polish playback experience.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Core Engine | FBO-based onion skinning |
| Animation System | Playback improvements |
| QA Tester | Full Phase 1 testing |

**Deliverables**:
- [ ] Onion skinning with before/after frames
- [ ] Configurable onion skin settings
- [ ] Smooth playback at target framerate
- [ ] Frame stepping and scrubbing polish
- [ ] Phase 1 bug fixes

**LLM Prompt**:
```

You are implementing onion skinning and polishing playback for Quar Animator.

## Onion Skinning Rendering

Create `packages/core/src/rendering/OnionSkin.ts`:

### GPU-Accelerated Approach

Use Frame Buffer Objects (FBOs) for efficient rendering:

```typescript
class OnionSkinRenderer {
  // FBOs for before/after frames
  beforeFBO: WebGLFramebuffer;
  afterFBO: WebGLFramebuffer;

  // Settings
  enabled: boolean;
  beforeCount: number; // Frames before current (1-5)
  afterCount: number; // Frames after current (1-5)
  beforeColor: string; // Tint color for past frames
  afterColor: string; // Tint color for future frames
  opacity: number; // Base opacity (0-1)
  opacityFalloff: number; // How much opacity decreases per frame

  render(currentFrame: number): void {
    // 1. Clear both FBOs

    // 2. Render before frames to beforeFBO
    for (let i = 1; i <= beforeCount; i++) {
      const frameOpacity = opacity * Math.pow(opacityFalloff, i);
      renderFrameToFBO(currentFrame - i, beforeFBO, beforeColor, frameOpacity);
    }

    // 3. Render after frames to afterFBO
    for (let i = 1; i <= afterCount; i++) {
      const frameOpacity = opacity * Math.pow(opacityFalloff, i);
      renderFrameToFBO(currentFrame + i, afterFBO, afterColor, frameOpacity);
    }

    // 4. Composite: beforeFBO (behind) → current frame → afterFBO (optional)
  }
}
```

### Tint Shader

```glsl
// Fragment shader for onion skin tinting
uniform sampler2D u_texture;
uniform vec3 u_tintColor;
uniform float u_opacity;

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);

  // Apply tint while preserving luminance
  vec3 tinted = mix(texColor.rgb, u_tintColor, 0.5);

  gl_FragColor = vec4(tinted, texColor.a * u_opacity);
}
```

### Settings UI

Add onion skin controls to the timeline or view menu:

```
┌─ Onion Skin ────────────────────────────────┐
│ [✓] Enabled                         [ O ]   │  O = Toggle shortcut
│                                             │
│ Before Frames  [◀ 2 ▶]  Color [■ #FF6B6B]  │
│ After Frames   [◀ 2 ▶]  Color [■ #4ECDC4]  │
│                                             │
│ Opacity        [═══════●══] 50%             │
│ Falloff        [═══●══════] 30%             │
│                                             │
│ [ ] Show during playback                    │
└─────────────────────────────────────────────┘
```

## Playback Polish

### Frame-Accurate Playback

```typescript
class PlaybackController {
  private lastTimestamp: number = 0;
  private accumulator: number = 0;
  private frameDuration: number; // 1000 / frameRate

  tick(timestamp: number): void {
    const delta = timestamp - this.lastTimestamp;
    this.lastTimestamp = timestamp;

    this.accumulator += delta;

    // Advance frames based on accumulated time
    while (this.accumulator >= this.frameDuration) {
      this.advanceFrame();
      this.accumulator -= this.frameDuration;
    }

    // Optionally: interpolate for sub-frame smoothness
    // const subFrameT = this.accumulator / this.frameDuration;
    // this.renderInterpolated(this.currentFrame, subFrameT);
  }
}
```

### Audio Sync

If audio tracks exist:

- Sync playhead to audio time
- Audio is authoritative for timing
- Handle audio buffer underruns gracefully

### Scrubbing Improvements

- Scrubbing should feel responsive (< 16ms to update)
- Cache recent frames for fast scrubbing
- Show frame number tooltip while scrubbing
- Audio scrub preview (short audio snippets)

## Keyboard Shortcuts Polish

Ensure these all work smoothly:

| Shortcut | Action                  |
| -------- | ----------------------- |
| Space    | Play/Pause              |
| K        | Stop (return to start)  |
| .        | Next frame              |
| ,        | Previous frame          |
| Shift+.  | Jump 10 frames forward  |
| Shift+,  | Jump 10 frames backward |
| Home     | Go to start             |
| End      | Go to end               |
| O        | Toggle onion skinning   |
| L        | Toggle loop             |

## Phase 1 Integration Testing

QA Testing checklist:

- [ ] Create shapes with all tools
- [ ] Move, scale, rotate shapes
- [ ] Create keyframes at different times
- [ ] Play animation at correct framerate
- [ ] Verify onion skinning appearance
- [ ] Test undo/redo for all operations
- [ ] Save and load project
- [ ] Test with 100+ shapes
- [ ] Test with 1000+ keyframes

Implement onion skinning and playback polish.

```

---

## Phase 1 Complete: Sprint 12 Checkpoint

At this point, Quar Animator should have:
- ✅ WebGL canvas with zoom/pan
- ✅ Shape drawing tools (rectangle, ellipse, polygon)
- ✅ Path drawing tools (pen, brush, eraser)
- ✅ Selection and transform tools
- ✅ Timeline with layer tracks
- ✅ Keyframe system with interpolation
- ✅ Properties panel with animation controls
- ✅ Onion skinning
- ✅ Project save/load

---

## Phase 2: Rigging Engine (Sprints 13-24)

### Sprint 13: Bone System Foundation

**Goals**: Implement bone data structure and basic bone tool.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Rigging Engine | Bone system |
| Frontend Designer | Bone visualization |

**Deliverables**:
- [ ] Bone data structure
- [ ] Skeleton hierarchy
- [ ] Bone tool for creation
- [ ] FK animation support

**LLM Prompt**:
```

You are implementing the bone system for Quar Animator.

## Bone Data Structure

Create `packages/rigging/src/Bone.ts`:

```typescript
interface Bone {
  id: string;
  name: string;

  // Hierarchy
  parent: string | null;
  children: string[];

  // Transform (local space)
  position: Vector2; // Position relative to parent
  rotation: number; // Rotation in radians
  scale: Vector2; // Usually (1, 1)
  length: number; // Visual length of bone

  // Constraints
  angleMin: number; // Minimum rotation (radians)
  angleMax: number; // Maximum rotation (radians)
  lengthLocked: boolean; // Prevent stretching

  // IK settings
  ikEnabled: boolean;
  ikTarget: string | null;
  ikPole: string | null; // Pole target for elbow/knee direction

  // Visibility
  visible: boolean;
  locked: boolean;
}

class Skeleton {
  bones: Map<string, Bone>;
  rootBones: string[]; // Bones with no parent

  // CRUD
  addBone(bone: Bone): void;
  removeBone(id: string): void;
  reparentBone(boneId: string, newParentId: string | null): void;

  // Queries
  getBone(id: string): Bone | undefined;
  getChildren(boneId: string): Bone[];
  getChain(startId: string, endId: string): Bone[];

  // Transform calculation
  getWorldTransform(boneId: string): Matrix3;
  getWorldPosition(boneId: string): Vector2;
  getWorldRotation(boneId: string): number;
}
```

## Bone Tool

Create `packages/rigging/src/tools/BoneTool.ts`:

### Creation Mode

1. Click to place bone origin
2. Drag to set bone length and rotation
3. Release to create bone
4. If clicking on existing bone tip, create child bone (auto-parenting)
5. Continue clicking to build chains

### Selection Mode

- Click bone to select
- Shift+click to add to selection
- Selected bones show rotation handle

### Manipulation

- Drag bone body to move (if root) or rotate (if child)
- Drag bone tip to change length
- Drag rotation handle to rotate

## Bone Rendering

Create `packages/rigging/src/rendering/BoneRenderer.ts`:

Visual style options:

1. **Stick**: Simple line with circle at joints
2. **Octahedral**: 3D-style bone shape (default in many tools)
3. **Custom**: User-defined shape

```typescript
function renderBone(bone: Bone, style: BoneStyle, selected: boolean): void {
  const startPos = getWorldPosition(bone);
  const endPos = getBoneTip(bone);

  switch (style) {
    case 'stick':
      drawLine(startPos, endPos, selected ? accentColor : boneColor);
      drawCircle(startPos, 4, jointColor);
      break;

    case 'octahedral':
      // Draw bone as tapered shape
      const width = bone.length * 0.15;
      drawBoneShape(startPos, endPos, width, selected);
      break;
  }
}
```

## Forward Kinematics

When a parent bone rotates, all children rotate with it:

```typescript
function updateBoneTransforms(skeleton: Skeleton): void {
  // Process bones in hierarchy order (parents before children)
  const sortedBones = topologicalSort(skeleton);

  for (const bone of sortedBones) {
    if (bone.parent) {
      const parentTransform = skeleton.getWorldTransform(bone.parent);
      bone.worldTransform = parentTransform.multiply(bone.localTransform);
    } else {
      bone.worldTransform = bone.localTransform;
    }
  }
}
```

## Bone Hierarchy Panel

Create `apps/web/src/components/rigging/BoneHierarchy.tsx`:

Display skeleton as tree:

- Expand/collapse bone children
- Drag to reparent
- Right-click for context menu (rename, delete, create child)
- Show IK chain indicators

Implement complete bone system foundation.

```

---

### Sprint 14: Mesh Binding & Weight Painting

**Goals**: Bind meshes to bones and implement weight painting.

**Agent Assignments**:
| Agent | Tasks |
|-------|-------|
| Rigging Engine | Mesh binding, weight system |
| Core Engine | GPU skinning preparation |

**Deliverables**:
- [ ] Create mesh from path
- [ ] Bind mesh to skeleton
- [ ] Weight painting tools
- [ ] Weight visualization

**LLM Prompt**:
```

You are implementing mesh binding and weight painting for Quar Animator.

## Mesh Data Structure

Create `packages/rigging/src/Mesh.ts`:

```typescript
interface MeshVertex {
  position: Vector2;
  weights: VertexWeight[]; // Max 4 bone influences
}

interface VertexWeight {
  boneId: string;
  weight: number; // 0.0 to 1.0
}

interface Mesh {
  id: string;
  vertices: MeshVertex[];
  triangles: number[]; // Indices into vertices (3 per triangle)
  uvs?: Vector2[]; // For textured meshes

  // Reference to source (optional)
  sourcePathId?: string; // If generated from path
  sourceImageId?: string; // If generated from image
}

class MeshManager {
  // Generation
  createMeshFromPath(pathNode: PathNode, resolution?: number): Mesh;
  createMeshFromImage(imageNode: ImageNode, resolution?: number): Mesh;

  // Binding
  bindMeshToSkeleton(meshId: string, skeletonId: string): void;

  // Weight operations
  getVertexWeights(meshId: string, vertexIndex: number): VertexWeight[];
  setVertexWeight(meshId: string, vertexIndex: number, boneId: string, weight: number): void;
  normalizeWeights(meshId: string, vertexIndex: number): void;
}
```

## Mesh Generation

### From Path (Vector)

1. Take path points as boundary
2. Generate Delaunay triangulation inside boundary
3. Add Steiner points for better deformation:
   - Grid pattern inside
   - Extra points near expected bend areas

```typescript
function generateMeshFromPath(path: PathNode, gridSpacing: number = 20): Mesh {
  // 1. Convert path to polygon (sample beziers)
  const boundary = samplePath(path, 0.5); // Sample at 0.5px tolerance

  // 2. Generate interior points (grid + boundary offset)
  const interiorPoints = generateGridPoints(boundary, gridSpacing);

  // 3. Triangulate using Delaunay
  const triangulation = delaunay([...boundary, ...interiorPoints]);

  // 4. Filter triangles outside boundary
  const mesh = filterTriangles(triangulation, boundary);

  return mesh;
}
```

### From Image (Bitmap)

1. Create rectangular mesh over image bounds
2. User can add Steiner points manually
3. UV coordinates map to image

## Weight Painting

Create `packages/rigging/src/tools/WeightPaintTool.ts`:

### Brush Modes

| Mode         | Behavior                        |
| ------------ | ------------------------------- |
| **Add**      | Increase selected bone's weight |
| **Subtract** | Decrease selected bone's weight |
| **Smooth**   | Average weights with neighbors  |
| **Blur**     | Gaussian blur on weight map     |

### Brush Settings

- Size: 1-100px
- Strength: 0-100%
- Falloff: Linear, Smooth, Constant

### Painting Logic

```typescript
function paintWeight(
  mesh: Mesh,
  brushCenter: Vector2,
  brushRadius: number,
  selectedBone: string,
  mode: 'add' | 'subtract' | 'smooth' | 'blur',
  strength: number
): void {
  for (let i = 0; i < mesh.vertices.length; i++) {
    const vertex = mesh.vertices[i];
    const distance = vertex.position.distanceTo(brushCenter);

    if (distance > brushRadius) continue;

    // Calculate falloff
    const falloff = 1 - distance / brushRadius;
    const influence = falloff * strength;

    switch (mode) {
      case 'add':
        increaseWeight(vertex, selectedBone, influence);
        break;
      case 'subtract':
        decreaseWeight(vertex, selectedBone, influence);
        break;
      case 'smooth':
        smoothWeightWithNeighbors(mesh, i, influence);
        break;
      case 'blur':
        blurWeight(mesh, i, influence);
        break;
    }

    normalizeWeights(vertex); // Always sum to 1.0
  }
}
```

## Weight Visualization

Create `packages/rigging/src/rendering/WeightVisualizer.ts`:

Heat map display:

- Blue (0%) → Cyan → Green → Yellow → Red (100%)
- Show for selected bone's influence
- Render as colored triangles over mesh

```typescript
function getWeightColor(weight: number): Color {
  // Interpolate through color stops
  const stops = [
    { t: 0.0, color: '#0000FF' }, // Blue
    { t: 0.25, color: '#00FFFF' }, // Cyan
    { t: 0.5, color: '#00FF00' }, // Green
    { t: 0.75, color: '#FFFF00' }, // Yellow
    { t: 1.0, color: '#FF0000' }, // Red
  ];
  return interpolateColorStops(stops, weight);
}
```

## Auto-Rig: Bounded Biharmonic Weights

Create `packages/rigging/src/AutoRig.ts`:

Automatically calculate initial weights:

```typescript
async function autoRig(mesh: Mesh, skeleton: Skeleton): Promise<void> {
  // 1. For each vertex, calculate distance to each bone
  // 2. Use bounded biharmonic weights algorithm
  // 3. Assign weights based on calculation
  // 4. Normalize weights
  // This provides a good starting point for manual refinement
}
```

Note: BBW is computationally expensive. Consider using a WASM implementation or web worker.

Implement complete mesh binding and weight painting system.

```

---

### Sprint 15-16: IK Solver & GPU Skinning

**Goals**: FABRIK IK solver and WebGL skinning shaders.

**LLM Prompt**:
```

You are implementing IK solving and GPU skinning for Quar Animator.

## FABRIK Algorithm

Create `packages/rigging/src/IKSolver.ts`:

```typescript
interface IKChain {
  bones: string[]; // Bone IDs in order (root to tip)
  target: Vector2; // Target position for end effector
  poleTarget?: Vector2; // Pole target for elbow/knee direction
  iterations: number; // Max iterations (default 10)
  tolerance: number; // Distance tolerance (default 0.1)
}

class FABRIKSolver {
  solve(skeleton: Skeleton, chain: IKChain): void {
    const positions = getChainPositions(skeleton, chain.bones);
    const lengths = getChainLengths(skeleton, chain.bones);

    for (let iter = 0; iter < chain.iterations; iter++) {
      // Check if close enough
      const endPos = positions[positions.length - 1];
      if (endPos.distanceTo(chain.target) < chain.tolerance) {
        break;
      }

      // Backward reaching (from target to root)
      positions[positions.length - 1] = chain.target;
      for (let i = positions.length - 2; i >= 0; i--) {
        const direction = positions[i].subtract(positions[i + 1]).normalize();
        positions[i] = positions[i + 1].add(direction.multiply(lengths[i]));
      }

      // Forward reaching (from root to target)
      positions[0] = getWorldPosition(skeleton, chain.bones[0]);
      for (let i = 1; i < positions.length; i++) {
        const direction = positions[i].subtract(positions[i - 1]).normalize();
        positions[i] = positions[i - 1].add(direction.multiply(lengths[i - 1]));

        // Apply angle constraints
        applyAngleConstraint(skeleton, chain.bones[i], positions[i - 1], positions[i]);
      }

      // Apply pole target (for elbow/knee direction)
      if (chain.poleTarget && positions.length >= 3) {
        applyPoleTarget(positions, chain.poleTarget);
      }
    }

    // Update skeleton with solved positions
    applyPositionsToSkeleton(skeleton, chain.bones, positions);
  }
}
```

### Angle Constraints

```typescript
function applyAngleConstraint(
  skeleton: Skeleton,
  boneId: string,
  parentPos: Vector2,
  currentPos: Vector2
): Vector2 {
  const bone = skeleton.getBone(boneId);
  const parentBone = skeleton.getBone(bone.parent);

  if (!parentBone) return currentPos;

  // Calculate current angle relative to parent
  const toParent = parentPos.subtract(/* grandparent pos */);
  const toCurrent = currentPos.subtract(parentPos);
  const angle = angleBetween(toParent, toCurrent);

  // Clamp to constraints
  const clampedAngle = clamp(angle, bone.angleMin, bone.angleMax);

  if (angle !== clampedAngle) {
    // Rotate position to match constrained angle
    const correctedDir = rotateVector(toParent.normalize(), clampedAngle);
    return parentPos.add(correctedDir.multiply(toCurrent.length()));
  }

  return currentPos;
}
```

## GPU Skinning

Create `packages/core/src/shaders/skinning.vert`:

```glsl
#version 300 es
precision highp float;

// Vertex attributes
in vec2 a_position;
in vec2 a_texCoord;
in vec4 a_boneIndices;   // Up to 4 bone indices
in vec4 a_boneWeights;   // Corresponding weights

// Uniforms
uniform mat3 u_boneMatrices[64];  // Max 64 bones
uniform mat3 u_viewProjection;

// Outputs
out vec2 v_texCoord;

void main() {
  // Calculate skinned position
  mat3 skinMatrix = mat3(0.0);

  skinMatrix += u_boneMatrices[int(a_boneIndices.x)] * a_boneWeights.x;
  skinMatrix += u_boneMatrices[int(a_boneIndices.y)] * a_boneWeights.y;
  skinMatrix += u_boneMatrices[int(a_boneIndices.z)] * a_boneWeights.z;
  skinMatrix += u_boneMatrices[int(a_boneIndices.w)] * a_boneWeights.w;

  vec3 skinnedPos = skinMatrix * vec3(a_position, 1.0);
  vec3 projected = u_viewProjection * vec3(skinnedPos.xy, 1.0);

  gl_Position = vec4(projected.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
```

### Bone Matrix Calculation

```typescript
function calculateBoneMatrices(skeleton: Skeleton, bindPose: Map<string, Matrix3>): Float32Array {
  const matrices = new Float32Array(64 * 9); // 64 bones × 3x3 matrix

  skeleton.bones.forEach((bone, index) => {
    // World transform
    const worldTransform = skeleton.getWorldTransform(bone.id);

    // Bind pose inverse
    const bindInverse = bindPose.get(bone.id)!.inverse();

    // Final bone matrix = worldTransform × bindPoseInverse
    const boneMatrix = worldTransform.multiply(bindInverse);

    // Store in array
    matrices.set(boneMatrix.toArray(), index * 9);
  });

  return matrices;
}
```

### Skinned Mesh Renderer

```typescript
class SkinnedMeshRenderer {
  mesh: Mesh;
  skeleton: Skeleton;
  bindPose: Map<string, Matrix3>;

  // GPU resources
  vao: WebGLVertexArrayObject;
  positionBuffer: WebGLBuffer;
  weightBuffer: WebGLBuffer;
  boneMatrixUniform: WebGLUniformLocation;

  render(): void {
    // 1. Calculate bone matrices
    const boneMatrices = calculateBoneMatrices(this.skeleton, this.bindPose);

    // 2. Upload to GPU
    gl.uniformMatrix3fv(this.boneMatrixUniform, false, boneMatrices);

    // 3. Draw mesh
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.mesh.triangles.length, gl.UNSIGNED_SHORT, 0);
  }
}
```

Implement FABRIK IK solver and GPU skinning.

```

---

### Sprint 17-18: Smart Bones System

**Goals**: Implement Smart Bones for corrective deformation.

**LLM Prompt**:
```

You are implementing the Smart Bones system for Quar Animator.

## Smart Bones Concept

Smart Bones solve joint deformation issues (candy-wrapper effect) by driving morph targets based on bone rotation.

Example: When forearm rotates 0° → 90°, a corrective shape blends in to fix elbow distortion.

## Data Structure

Create `packages/rigging/src/SmartBone.ts`:

```typescript
interface SmartBoneAction {
  id: string;
  name: string; // e.g., "Elbow Bend"

  // Driver configuration
  driver: {
    boneId: string;
    property: 'rotation' | 'position.x' | 'position.y' | 'scale.x' | 'scale.y';
    range: [number, number]; // Driver value range
  };

  // Driven morph targets
  targets: MorphTarget[];

  // Interpolation
  interpolation: 'linear' | 'smooth' | 'custom';
  customCurve?: BezierCurve;
}

interface MorphTarget {
  meshId: string;
  vertexOffsets: Vector2[]; // Offset for each vertex
  weight: number; // 0.0 to 1.0
}

class SmartBoneManager {
  actions: Map<string, SmartBoneAction>;

  // Create action
  createAction(boneId: string, name: string): SmartBoneAction;

  // Record morph target
  startRecording(actionId: string): void;
  recordVertexOffsets(actionId: string, meshId: string, offsets: Vector2[]): void;
  stopRecording(actionId: string): void;

  // Evaluation
  evaluateActions(skeleton: Skeleton): Map<string, number>; // Returns target weights
}
```

## Action Workflow

### 1. Create Action

```typescript
function createSmartBoneAction(boneId: string): void {
  // 1. Create new action with default settings
  const action = {
    id: generateId(),
    name: 'New Action',
    driver: {
      boneId,
      property: 'rotation',
      range: [0, Math.PI / 2], // 0 to 90 degrees
    },
    targets: [],
    interpolation: 'linear',
  };

  // 2. Enter isolation mode in timeline
  enterIsolationMode(action);

  // 3. Show action editor panel
  showActionEditor(action);
}
```

### 2. Isolation Mode

When editing an action:

- Only the relevant mesh and skeleton are visible
- Timeline shows only the driver property
- Canvas shows comparison: rest pose ←→ current

### 3. Point Magnet Tool

Create `packages/rigging/src/tools/PointMagnetTool.ts`:

For manipulating mesh vertices to create corrective shapes:

```typescript
class PointMagnetTool implements Tool {
  radius: number;
  falloff: 'linear' | 'smooth' | 'constant';

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.dragging) return;

    const mesh = getActiveMesh();
    const delta = event.worldPosition.subtract(this.lastPosition);

    for (let i = 0; i < mesh.vertices.length; i++) {
      const vertex = mesh.vertices[i];
      const distance = vertex.position.distanceTo(this.dragStart);

      if (distance > this.radius) continue;

      // Calculate influence based on falloff
      const t = distance / this.radius;
      const influence =
        this.falloff === 'linear' ? 1 - t : this.falloff === 'smooth' ? smoothstep(1 - t) : 1;

      // Move vertex
      vertex.position = vertex.position.add(delta.multiply(influence));
    }

    this.lastPosition = event.worldPosition;
  }
}
```

### 4. Recording System

```typescript
function recordMorphTarget(action: SmartBoneAction, mesh: Mesh): void {
  // 1. Get current vertex positions
  const currentPositions = mesh.vertices.map((v) => v.position.clone());

  // 2. Get rest pose positions (stored at action creation)
  const restPositions = action.restPose.get(mesh.id);

  // 3. Calculate offsets
  const offsets = currentPositions.map((pos, i) => pos.subtract(restPositions[i]));

  // 4. Store morph target
  action.targets.push({
    meshId: mesh.id,
    vertexOffsets: offsets,
    weight: 1.0,
  });
}
```

## Runtime Evaluation

```typescript
function evaluateSmartBones(
  skeleton: Skeleton,
  actions: SmartBoneAction[],
  meshes: Map<string, Mesh>
): void {
  for (const action of actions) {
    // 1. Get driver value
    const bone = skeleton.getBone(action.driver.boneId);
    const driverValue = getPropertyValue(bone, action.driver.property);

    // 2. Calculate normalized position in range
    const [min, max] = action.driver.range;
    const t = clamp((driverValue - min) / (max - min), 0, 1);

    // 3. Apply interpolation
    const weight = applyInterpolation(t, action.interpolation, action.customCurve);

    // 4. Apply morph targets
    for (const target of action.targets) {
      const mesh = meshes.get(target.meshId);
      applyMorphTarget(mesh, target, weight);
    }
  }
}

function applyMorphTarget(mesh: Mesh, target: MorphTarget, weight: number): void {
  for (let i = 0; i < mesh.vertices.length; i++) {
    const offset = target.vertexOffsets[i];
    mesh.vertices[i].position = mesh.vertices[i].restPosition.add(
      offset.multiply(weight * target.weight)
    );
  }
}
```

## Action Editor Panel

```
┌─ Smart Bone Action: "Elbow Bend" ───────────────────┐
│                                                      │
│ Driver                                               │
│ ├─ Bone:     [ Forearm ▼ ]                          │
│ ├─ Property: [ Rotation ▼ ]                         │
│ └─ Range:    [ 0° ] to [ 90° ]                      │
│                                                      │
│ Interpolation: [═══●═══] Linear                      │
│ [ Edit Curve ]                                       │
│                                                      │
│ Targets                                              │
│ ├─ ArmMesh (12 vertices affected)            [Edit] │
│ └─ ShoulderMesh (5 vertices affected)        [Edit] │
│                                                      │
│ [ + Add Target ]  [ Test Action ]  [ Delete Action ] │
└──────────────────────────────────────────────────────┘
```

Implement complete Smart Bones system.

```

---

### Sprint 19-20: Vitruvian Bones & Physics

**Goals**: Bone group switching and physics-based secondary motion.

**LLM Prompt**:
```

You are implementing Vitruvian Bones and physics integration for Quar Animator.

## Vitruvian Bones

Handle topology changes where different bone configurations are needed for different poses.

### Problem Example

A character arm needs:

- **Extended pose**: Shoulder → Upper Arm → Forearm → Hand (4 bones)
- **Foreshortened pose**: Shoulder → Hand (2 bones, arm bent toward camera)

### Solution: Bone Groups

```typescript
interface BoneGroup {
  id: string;
  name: string; // e.g., "Extended Arm", "Foreshortened Arm"
  bones: string[]; // Bone IDs in this group
  meshBindings: MeshBinding[]; // Which meshes use this configuration
}

interface MeshBinding {
  meshId: string;
  weights: Map<number, VertexWeight[]>; // Per-vertex weights for this group
}

interface VitruvianSystem {
  groups: BoneGroup[];
  activeGroup: string; // Currently visible group

  // Keyframeable
  setActiveGroup(groupId: string, time?: number): void;
}
```

### Group Switching

```typescript
function switchBoneGroup(system: VitruvianSystem, groupId: string): void {
  const prevGroup = system.groups.find((g) => g.id === system.activeGroup);
  const nextGroup = system.groups.find((g) => g.id === groupId);

  // 1. Hide bones from previous group
  for (const boneId of prevGroup.bones) {
    const bone = skeleton.getBone(boneId);
    bone.visible = false;
    // Exclude from IK solving
  }

  // 2. Show bones from next group
  for (const boneId of nextGroup.bones) {
    const bone = skeleton.getBone(boneId);
    bone.visible = true;
  }

  // 3. Update mesh bindings
  for (const mesh of meshes) {
    const binding = nextGroup.meshBindings.find((b) => b.meshId === mesh.id);
    if (binding) {
      mesh.activeWeights = binding.weights;
    }
  }

  system.activeGroup = groupId;
}
```

### Keyframing Groups

Bone group can be keyframed:

- At frame 10: "Extended Arm" active
- At frame 11: "Foreshortened Arm" active
- Instant switch (no interpolation)

## Physics Integration

Create `packages/rigging/src/physics/PhysicsRig.ts`:

### Rapier WASM Integration

```typescript
import RAPIER from '@dimforge/rapier2d';

class PhysicsWorld {
  world: RAPIER.World;
  bodies: Map<string, RAPIER.RigidBody>;
  joints: Map<string, RAPIER.ImpulseJoint>;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: 9.81 });
  }

  step(deltaTime: number): void {
    this.world.step();
  }
}
```

### Dynamic Bone Chains

Tag bone chains for physics simulation (hair, cloth, tail):

```typescript
interface DynamicChain {
  id: string;
  bones: string[]; // Bone IDs in chain
  settings: PhysicsSettings;
}

interface PhysicsSettings {
  gravity: number; // Gravity multiplier (0 = no gravity)
  stiffness: number; // How much chain resists bending (0-1)
  damping: number; // How quickly motion settles (0-1)
  windInfluence: number; // How much wind affects chain (0-1)
}
```

### Physics Bone Setup

```typescript
function createPhysicsChain(skeleton: Skeleton, chain: DynamicChain): void {
  const { bones, settings } = chain;

  // Create rigid bodies for each bone
  for (let i = 0; i < bones.length; i++) {
    const bone = skeleton.getBone(bones[i]);

    // First bone is kinematic (driven by animation)
    const bodyType =
      i === 0 ? RAPIER.RigidBodyType.KinematicPositionBased : RAPIER.RigidBodyType.Dynamic;

    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.new(bodyType).setTranslation(bone.worldPosition.x, bone.worldPosition.y)
    );

    // Add collider (capsule shape along bone)
    const colliderDesc = RAPIER.ColliderDesc.capsule(bone.length / 2, 2);
    world.createCollider(colliderDesc, body);

    bodies.set(bone.id, body);
  }

  // Create joints between bones
  for (let i = 1; i < bones.length; i++) {
    const parentBody = bodies.get(bones[i - 1]);
    const childBody = bodies.get(bones[i]);

    const jointParams = RAPIER.JointData.revolute(
      { x: 0, y: 0 }, // Anchor on parent
      { x: 0, y: 0 } // Anchor on child
    );

    // Apply stiffness
    jointParams.stiffness = settings.stiffness * 1000;
    jointParams.damping = settings.damping * 100;

    const joint = world.createImpulseJoint(jointParams, parentBody, childBody, true);
    joints.set(`${bones[i - 1]}-${bones[i]}`, joint);
  }
}
```

### Physics Update Loop

```typescript
function updatePhysics(deltaTime: number): void {
  // 1. Update kinematic bones from animation
  for (const chain of dynamicChains) {
    const rootBone = skeleton.getBone(chain.bones[0]);
    const body = bodies.get(rootBone.id);
    body.setNextKinematicTranslation({
      x: rootBone.worldPosition.x,
      y: rootBone.worldPosition.y,
    });
  }

  // 2. Apply wind forces
  if (windEnabled) {
    for (const chain of dynamicChains) {
      for (const boneId of chain.bones.slice(1)) {
        const body = bodies.get(boneId);
        body.applyForce(
          {
            x: windForce.x * chain.settings.windInfluence,
            y: windForce.y * chain.settings.windInfluence,
          },
          true
        );
      }
    }
  }

  // 3. Step physics simulation
  world.step();

  // 4. Update bone transforms from physics
  for (const chain of dynamicChains) {
    for (let i = 1; i < chain.bones.length; i++) {
      const bone = skeleton.getBone(chain.bones[i]);
      const body = bodies.get(bone.id);
      const translation = body.translation();
      const rotation = body.rotation();

      bone.worldPosition = new Vector2(translation.x, translation.y);
      bone.worldRotation = rotation;
    }
  }
}
```

### Physics Settings Panel

```
┌─ Physics Chain: "Hair" ─────────────────────────────┐
│                                                      │
│ Bones: Skull → Hair1 → Hair2 → Hair3 → HairTip      │
│                                                      │
│ Gravity      [═══════●══] 1.0x                       │
│ Stiffness    [═══●══════] 0.3                        │
│ Damping      [═════●════] 0.5                        │
│ Wind         [═●════════] 0.1                        │
│                                                      │
│ [✓] Enable collision                                 │
│ [ ] Self-collision                                   │
│                                                      │
│ [ Simulate ] [ Reset ] [ Bake to Keyframes ]        │
└──────────────────────────────────────────────────────┘
```

Implement Vitruvian Bones and physics integration.

```

---

### Sprint 21-24: Rigging Polish & Phase 2 Completion

Remaining Phase 2 sprints cover:
- Graph editor for animation curves
- Shape tweening (path interpolation)
- .quar file format finalization
- Sprite sheet export
- Phase 2 integration testing and bug fixes

---

## Phase 3: Production Features (Sprints 25-36)

### Key Sprints

| Sprint | Focus |
|--------|-------|
| 25-26 | State machine visual editor |
| 27-28 | State transitions and conditions |
| 29-30 | Audio import and waveform display |
| 31-32 | Symbol library with instances |
| 33-34 | Video export (MP4, WebM) |
| 35-36 | Plugin architecture, polish |

---

## Phase 4: Ecosystem (Sprints 37-48)

### Key Sprints

| Sprint | Focus |
|--------|-------|
| 37-38 | Quar Vector integration |
| 39-40 | PSD import |
| 41-42 | Runtime library (web) |
| 43-44 | Runtime library (Unity, Godot) |
| 45-46 | FLA/XFL import |
| 47-48 | Documentation, tutorials, v1.0 release |

---

## Using This Document

### For Each Sprint

1. **Read the sprint goals** and understand the deliverables
2. **Copy the LLM prompt** to your AI assistant
3. **Iterate** on the generated code with follow-up questions
4. **Test** deliverables using the QA Tester agent
5. **Document** changes using the Documentation agent
6. **Review** with Project Lead agent before sprint close

### Customizing Prompts

The prompts are templates. Customize based on:
- Actual codebase structure as it evolves
- Lessons learned from previous sprints
- Changing requirements or priorities

### Tracking Progress

Update this document as sprints complete:
- [ ] → [x] for completed items
- Add notes for deviations from plan
- Document technical decisions made

---

*This sprint plan is a living document. Update as the project evolves.*
```
