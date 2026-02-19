# How to Code a Graphic Editor

### A Practical Guide from Architecture to Interaction

_Based on the development of Quar Animator — a production web-native 2D graphic editor built from scratch with TypeScript, React, and WebGL 2._

---

## About This Book

This book teaches you how to build a full-featured graphic editor from the ground up. Not a toy demo — a real application with vector drawing, GPU rendering, visual effects, and file export. Each chapter corresponds to a system we actually built, in the order we built it. You'll see the real decisions, the real bugs, and the real solutions.

**Prerequisites**: Intermediate TypeScript/JavaScript, basic linear algebra (vectors, matrices), familiarity with React.

**What you'll build**: A complete 2D graphic editor with vector drawing tools, text rendering, boolean operations, SVG import/export, GPU-accelerated rendering, and multiple export formats.

---

## Introduction

_Why this book exists and what you'll learn._

- The gap: university courses teach isolated algorithms, open-source editors have millions of lines, tutorials stop at "draw a rectangle"
- What Quar Animator is: a production web-native graphic editor with 7 packages, 15 tools, 10 shaders
- What you'll build: foundation → rendering → interaction → text → export
- How to read the code: real TypeScript from the actual codebase, simplified but never fabricated
- Prerequisites: intermediate TypeScript, basic linear algebra, familiarity with React
- Development environment: Node.js 18+, pnpm, Vite, Vitest, TypeScript 5+, React 18+, WebGL 2

---

## Part I: Foundation

### Chapter 1 — Project Architecture & Monorepo Setup

_How to structure a large creative application for long-term success._

- Why monorepos work for editor projects (shared math, types, rendering across packages)
- pnpm workspaces: `core`, `export`, `types`, `ui`, `web`
- TypeScript strict mode configuration across packages
- Testing strategy: Vitest with JSDOM, package-level test isolation
- CI/CD pipeline (lint, typecheck, test in parallel)
- The dependency rule: `core` knows nothing about React; `web` orchestrates everything

### Chapter 2 — Design System & Editor Shell

_Building the chrome around your canvas before touching pixels._

- Design tokens: CSS custom properties for a dark-mode-first theme
- Core UI components: Button, Input, Select, Panel, Tooltip, IconButton
- Editor layout architecture: MenuBar, Toolbar, Canvas, PropertiesPanel, LayerPanel
- Why you build the shell first: it forces you to think about data flow before rendering
- Panel component with collapse/expand (progressive disclosure)

### Chapter 3 — The Scene Graph

_The data structure at the heart of every graphic editor._

- What a scene graph is and why it's a tree, not a flat list
- Node types: the `BaseNode` with `id`, `type`, `transform`, `parent`, `children`
- Hierarchical transforms: local vs. world space
- CRUD operations: `addNode`, `removeNode`, `updateNode`, `reparentNode`
- Traversal: `traverseVisible`, `getDescendants`, `getAncestors`
- Serialization: `toJSON()` / `fromJSON()` for persistence and undo
- Event system: `nodeAdded`, `nodeRemoved`, `nodeUpdated` for reactive UI
- The atomic swap pattern: replacing the entire tree safely

### Chapter 4 — Coordinate Systems & Camera

_Getting the math right so everything else falls into place._

- Screen space vs. world space vs. local space
- The Camera class: zoom, pan, `screenToWorld`, `worldToScreen`
- Visible bounds calculation for culling
- Y-up world coordinate system (and why it matters for SVG interop)
- Viewport resize handling with ResizeObserver (rounding to avoid 0.5px offsets)
- Fit-to-bounds for centering content

### Chapter 5 — State Management for Editors

_Why graphic editors need different state patterns than typical web apps._

- Zustand store: why a single mutable store beats Redux for editors
- The EditorStore: active tool, selection, zoom, pages, guides
- Reactive selectors: `useEditorStore(s => s.activeTool)` for surgical re-renders
- The `getState()` trap: when to use reactive hooks vs. imperative reads
- Store actions as the single mutation path
- Why `structuredClone` is your best friend in editor state

---

## Part II: Rendering

### Chapter 6 — WebGL 2 from Scratch

_Setting up a GPU rendering pipeline without a framework._

- WebGL 2 context creation and capabilities
- State caching: why `useProgram`, `bindVAO`, `bindTexture` should be wrapped
- The VAO pattern: vertex array objects for efficient geometry binding
- Shader compilation and program linking (GLSL ES 3.0)
- Context loss handling and recovery
- The rendering loop: `requestAnimationFrame` with frame timing

### Chapter 7 — Shape Rendering Pipeline

_From vector paths to GPU triangles._

- The tessellation pipeline: Bezier paths → line segments → earcut triangulation
- Geometry caching: tessellate once, render many times (cache key design)
- Fill rendering: solid colors and gradients (linear, radial)
- Stroke rendering: why strokes are harder than fills
  - `generateStrokeOutlineVertices`: perpendicular offset, miter joins, miter limits
  - The `TRIANGLE_STRIP` solution for concave polygons (avoiding earcut on self-intersecting outlines)
  - Gradient strokes: the same strip technique with a gradient shader
- Multi-contour rendering: `groupContoursByContainment` with AABB + point-in-polygon, odd-depth = hole
- The transform pipeline: model matrix × view-projection matrix

### Chapter 8 — The Infinite Grid

_A detail that makes your editor feel professional._

- Adaptive grid spacing that scales with zoom
- Drawing grid lines with a single shader
- Major/minor line distinction
- Why the grid renders first (and behind everything)

### Chapter 9 — Texture & Image Rendering

_Displaying raster content in a vector editor._

- Texture creation from Image elements, data URIs
- Texture caching and disposal (preventing WebGL memory leaks)
- The texture shader: UV coordinates, sampling
- Image adjustments in the fragment shader (brightness, contrast, saturation, hue rotation)
- Corner radius via `roundedBoxSDF` signed distance function
- `preserveDrawingBuffer` and when you need it

### Chapter 10 — Visual Effects & Compositing

_Drop shadows, blur, blend modes — the FBO pipeline._

- Framebuffer objects (FBOs): rendering to texture
- FramebufferManager: object pooling with acquire/release
- The multi-pass pipeline: shape → FBO → shadow → blur → composite → screen
- Drop shadows: render silhouette with offset, blur, composite behind
- Inner shadows: inverted silhouette clipped to shape bounds
- Layer blur: separable Gaussian (horizontal + vertical passes)
- Blend modes: 16 standard modes in a fragment shader
- The clearColor state leak: why FBO operations must restore GL state
- The VAO cache desync bug: never bypass the renderer's state cache

---

## Part III: Interaction

### Chapter 11 — The Tool System

_An extensible architecture for every drawing and editing tool._

- `BaseTool` abstract class: `onPointerDown`, `onPointerMove`, `onPointerUp`, `onKeyDown`
- `ToolManager`: tool registration, switching, keyboard shortcuts
- `ToolContext`: the interface between tools and the editor (scene graph, camera, selection, undo)
- Why tools should never store permanent state
- The `onDeactivate` cleanup contract

### Chapter 12 — Shape Tools: Rectangle, Ellipse, Polygon, Star

_Drag-to-create primitives with modifier keys._

- Common pattern: `pointerDown` captures start, `pointerMove` computes bounds, `pointerUp` commits
- Shift for constrained proportions (square, circle)
- Alt for draw-from-center
- Escape to cancel
- Auto-select after creation, auto-switch to selection tool
- Polygon tool: inscribed regular polygons (3-12 sides)
- Star tool: configurable inner radius ratio

### Chapter 13 — The Pen Tool

_Bezier path creation, the most complex single tool._

- Path point types: corner (no handles) vs. smooth (symmetric handles)
- Click to add corner points, drag to add smooth points with handles
- Closing the path: click first point
- The state machine: idle → placing → dragging handle
- Preview rendering during drawing (overlay SVG)
- Path centering: computing AABB center, setting anchor to (0.5, 0.5)
- The `resetPenState()` ordering bug: reset before switching tools, or infinite recursion

### Chapter 14 — Brush & Eraser Tools

_Freehand drawing with real-time smoothing._

- Collecting raw pointer events with timestamps and pressure
- Kalman filter for input smoothing
- Ramer-Douglas-Peucker simplification for point reduction
- Schneider curve fitting: raw points → optimal cubic Bezier segments
- Pressure sensitivity: variable stroke width
- Brush profiles: configurable width envelope
- `generateBrushOutline`: stroke points → closed polygon outline
- Eraser as boolean subtraction: accumulate stroke → `performBoolean(shape, eraser, 'subtract')`

### Chapter 15 — Selection & Transform

_Click, marquee, move, resize, rotate — the selection tool is an editor within the editor._

- Hit testing: point-in-polygon for filled shapes, distance-to-segment for strokes
- Marquee selection with Set dedup
- `SelectionManager`: computing bounds across multiple selected nodes
- `TransformHandles`: 8 resize handles + rotation handle, cursor mapping
- Move: delta-based position updates
- Resize: `captureNodeStates` → `performResize` with proportional mapping
  - Shift for aspect-ratio lock
  - Alt for center-origin resize
  - Node-type dispatch: width/height (rect), radiusX/Y (ellipse), scale (path/polygon/group)
- Rotation: atan2 angle from center, Shift for 15-degree snapping
- The anchor math: why anchor (0.5, 0.5) means transforms pivot around the visual center

### Chapter 16 — Direct Selection & Path Editing

_Editing individual path points and Bezier handles._

- Selecting points vs. selecting shapes (two levels of selection)
- Point dragging with world transform chains for nested nodes
- Handle dragging: symmetric by default, Ctrl to break symmetry
- Alt+Click to convert point type (corner ↔ smooth)
- Delete to remove points from a path
- The anchor drift bug: compose local matrix WITHOUT anchor for point editing

### Chapter 17 — Group Selection (Figma-Style)

_Double-click to enter, Escape to exit — scoped selection._

- `enteredGroupId` state: which group the user has "entered"
- `resolveHitToScope`: walking the ancestor chain to the right selection level
- Double-click → enter group → selection scoped to immediate children
- Escape → exit group → select the group itself
- Recursive: groups within groups
- Safety clears: undo, redo, delete, new project all reset entered group

### Chapter 18 — Undo/Redo

_The snapshot approach: simple, correct, and fast enough._

- `structuredClone(sceneGraph.toJSON())` as undo snapshot
- `sceneGraph.fromJSON()` for restore + selection restore
- 50-entry stacks (undo and redo)
- `pushUndo` at the start of each discrete mutation
- Continuous operations: `onTransformStart` snapshots once at drag start
- `onScrubStart` for property panel scrub gestures
- Pitfall: `cutSelection` does its own `pushUndo`, so `deleteSelection` must not double-push
- Clear history on new/open/import project

---

## Part IV: Properties & Panels

### Chapter 19 — The Properties Panel

_Editing every attribute of every node type._

- Reactive property display: Zustand selectors for each field
- Position, size, rotation with ScrubLabel (drag-to-adjust)
- Node-type dispatch: rectangle shows W/H, ellipse shows radiusX/Y, path shows scale-based size
- Fill & stroke editing: hex input, native color picker, opacity slider
- Gradient editor: linear/radial with draggable stops
- Blend mode dropdown
- Effects section: drop shadow, inner shadow, layer blur parameters
- Multi-selection: applying changes to all selected nodes
- The `getState()` in render trap: always use reactive hooks, never `getState()` in JSX

### Chapter 20 — The Layer Panel

_A tree view of your scene graph._

- Recursive node tree rendering with indentation
- Visibility toggle (eye icon) and lock toggle (lock icon)
- Click to select, Shift+Click to multi-select
- Double-click to rename (inline text input with auto-focus)
- Drag-to-reorder (z-order within siblings)
- Node type icons: rectangle, ellipse, path, text, image, group, artboard
- Context menu: Rename, Duplicate, Delete, Show/Hide, Lock/Unlock

### Chapter 21 — The Toolbar

_Tool buttons, active state, and keyboard shortcuts._

- Tool button grid synced to EditorStore `activeTool`
- Keyboard shortcut hints in tooltips
- Separator groups for logical tool categories
- Active tool highlighting

### Chapter 22 — The Menu Bar

_File, Edit, View, and beyond._

- Menu architecture: single `openMenu` state with hover-to-switch
- MenuItem, Separator, SectionHeader helper components
- Checkmark toggles for boolean settings
- Keyboard shortcut labels
- Custom events for menu → canvas communication (zoom, camera commands)
- Submenus: Group/Ungroup, Z-Order, Boolean operations

---

## Part V: Text & Typography

### Chapter 23 — The Text Tool & Font Pipeline

_From TTF files to GPU triangles._

- TextNode type: content, fontFamily, fontSize, fontWeight, alignment
- Font loading with opentype.js: TTF/OTF parsing, glyph access
- FontManager singleton: caching, `getFontOrFallback`, web-safe font list
- The glyph conversion pipeline: `getPath()` → M/L/C/Q/Z commands → PathPoints
  - Quadratic-to-cubic Bezier promotion
  - Y-axis flip (font coordinates are Y-down)
- `textToSubpaths`: per-letter glyph decomposition
- `textMetrics`: fast bounds via opentype.js metrics or Canvas 2D `measureText()` fallback
- Inline text editing: TextEditOverlay with positioned `<textarea>`
  - Double-click text node → enter edit mode
  - Focus management: the double-click focus steal problem

### Chapter 24 — Text-to-Path & Outline Stroke

_Converting live text to editable vector outlines._

- `convertTextToPath`: TextNode → GroupNode with per-letter PathNode children
- Each glyph centered at its own AABB center, positioned relative to group
- Font weight preservation during conversion
- `outlineStroke`: converting a stroke into a filled path
  - Tessellate contour → `generateStrokeOutlineVertices` → corner PathPoints
  - Center at AABB → PathNode with fill = original stroke color

---

## Part VI: Boolean Operations & SVG

### Chapter 25 — Non-Destructive Boolean Operations

_Union, subtract, intersect, exclude — without destroying source shapes._

- The `polygon-clipping` library: why we don't implement Weiler-Atherton from scratch
- Non-destructive approach: GroupNode with `booleanOp` property, children preserved
- `nodeToPolygon`: converting any shape to polygon rings
- `performBoolean`: accumulating operations across children
- `renderBooleanGroup`: computed result → earcut → `renderFillsAndStrokes`
- `traverseVisible` returning `false` to skip children (render computed result instead)
- Flatten (destructive), Release (ungroup), Change Operation
- Boolean group anchor must be (0,0) — the -0.5 offset bug

### Chapter 26 — SVG Import & Export

_Interoperating with the vector graphics ecosystem._

- SVG Import pipeline: `svgParser` → `svgConverter` → `svgImporter`
  - Parsing SVG DOM: elements → intermediate representation
  - Converting primitives: `<rect>`, `<circle>`, `<ellipse>`, `<polygon>`, `<path>`
  - SVG path `d` attribute parsing: M, L, C, Q, A, Z commands
  - Arc-to-cubic conversion (SVG arcs → Bezier approximation)
  - Y-axis flip for world coordinate conversion
  - Compound paths: multiple subpaths → single PathNode with `fillRule: 'evenodd'`
  - Centering with anchor (0.5, 0.5)
- SVG Export: `nodeToSvgElement` → `exportNodesToSvg` with Y-flip transform
- Drag-and-drop import: detecting `image/svg+xml` MIME type vs. raster images
- External clipboard paste: parsing SVG from `text/html` (Figma/Illustrator)

---

## Part VII: Pages, Symbols & Organization

### Chapter 27 — Multi-Page Projects

_Independent scene graphs and undo stacks per page._

- PageData: id, name, sceneGraphJSON, selectedNodeIds, undoStack, redoStack
- `switchPage`: save current → load target via `sceneGraph.fromJSON()`
- Clearing transient state on page switch (entered group, clipboard)
- PageTabs UI: click to switch, double-click to rename, right-click context menu
- Project serialization v2.0: `pages[]` + `activePageId`
- v1 → v2 migration: wrapping single page into `pages[0]`

### Chapter 28 — Symbols (Reusable Components)

_Figma-style components with instances and overrides._

- SymbolDefinition: stored globally, cross-page
- SymbolInstanceNode: `symbolId` + `overrides[]`
- `resolveSymbolInstance`: deep-clone definition + apply overrides, with cache
- Creating symbols: selection → definition + instance at AABB center
  - Position re-centering: subtract AABB center from root positions
- Instance overrides: shallow-merge per nodeId
- Symbol editing mode: `fromJSON`/`toJSON` swap (like page switching)
- Detach instance: resolve → group (breaks link to definition)
- SymbolLibraryPanel: list view with instance count, click to place
- The "no scene graph children" problem: instances have virtual children

### Chapter 29 — Artboards

_Named frames for organizing compositions._

- ArtboardNode: width, height, fills (with gradient support), clipContent
- ArtboardTool (F shortcut): drag-to-create
- Clip content: `gl.scissor` stack for nested artboard intersection
- Auto-reparent: nodes dragged into/out of artboards
- Artboard-aware selection: `enteredGroupId` reuse
- Export: per-artboard PNG/SVG with optional background
- The geometry cache key bug: missing `A:${w}:${h}` caused resize to show stale geometry

---

## Part VIII: Export & File Format

### Chapter 30 — The Binary File Format

_Designing a compact, extensible project format._

- Format evolution: v1 (single page JSON) → v2 (multi-page JSON) → v3 (binary container)
- Binary layout: magic bytes ("QUAR") + version + flags + JSON chunk + binary buffers
- Image extraction: data URIs → raw binary buffers (~33% size savings)
- Buffer deduplication: identical images share one buffer
- `parseQuarFile`: auto-detect binary vs JSON, run migration chain
- `writeQuarFile`: extract images + encode binary
- Backward compatibility: old JSON files load seamlessly
- Validation: structural checks without a schema library

### Chapter 31 — Selected Element Export

_Per-element PNG and SVG export._

- `svgExporter`: nodes → SVG markup with Y-flip transform
- `exportService`: offscreen WebGL render → `toBlob()` → browser download
- Export presets on nodes: format + multiplier (PNG 1x/2x/3x/4x, SVG)
- The `preserveDrawingBuffer` requirement for `toBlob()` after rendering

---

## Part IX: Editor Polish

### Chapter 32 — Keyboard Shortcuts

_Making the editor feel professional and fast._

- Tool shortcuts: V, A, H, R, O, U, S, P, B, E, T, F
- Modifier combos: Ctrl+Z/Y, Ctrl+Shift+U/D/I/X (boolean ops)
- The Ctrl+Shift conflict: when Ctrl+Shift+D exists, Ctrl+D must check `!e.shiftKey`
- Input focus handling: skip shortcuts when typing in text fields
- Multiple shortcut hooks: `useToolShortcuts`, `useProjectShortcuts`

### Chapter 33 — Canvas Rulers & Guides

_Precision alignment tools._

- CanvasRuler: horizontal and vertical rulers with adaptive tick marks
- Drag from ruler → create guide (cyan line)
- Guide snapping: check all edges (left, right, top, bottom, center)
- Guide snap wins over grid snap when closer
- Drag guide back onto ruler to delete (Figma behavior)
- Project serialization: guides saved and restored

### Chapter 34 — Context Menus & Clipboard

_Right-click everywhere, copy-paste everything._

- Reusable ContextMenu component: portal rendering, viewport edge flipping, keyboard navigation
- Canvas context menu, layer context menu
- Deep-clone with `structuredClone` for clipboard
- Paste with offset (20, -20) and new unique IDs
- External clipboard: parsing SVG from system clipboard (Figma interop)

### Chapter 35 — Drag-and-Drop Import

_SVG, PNG, JPG directly onto the canvas._

- Detecting MIME types: `image/svg+xml` → vector import, raster → ImageNode
- SVG files: full `importSvg` pipeline with vector paths
- Raster images: File → data URI → ImageNode at drop position
- Undo support for imported content

---

## Part X: Lessons Learned

### Chapter 36 — WebGL Pitfalls & Solutions

_Every GPU bug we hit and how we fixed it._

- State leaks: `clearColor`, `scissor`, `depthTest` are global
- VAO cache desync: never bypass the renderer's `bindVAO()`
- FBO operations: save/disable scissor, disable depth, premultiplied alpha blending
- Texture memory: dispose on node removal
- `preserveDrawingBuffer: false` means `readPixels` returns black after compositing

### Chapter 37 — React in Real-Time Applications

_Making React work for 60fps interactive editors._

- Hooks ordering: all `useEditorStore()` calls must precede any early returns
- StrictMode: create WebGL resources in `useEffect`, never during render
- `onWheel` is passive by default: use native `addEventListener({ passive: false })`
- `useMemo` stale state: never read store via `getState()` inside memoized computations
- Batched state updates: Zustand `setState` in `requestAnimationFrame` callbacks

### Chapter 38 — Testing Graphic Editors

_3000+ tests for visual software — what to test and how._

- Pure function testing: math, path operations, boolean operations
- Tool testing: mock ToolContext with fake scene graph and pointer events
- Component testing: React Testing Library with mocked stores and SceneGraph context
- WebGL mocking: what to mock (context creation) vs. what to test (shader output)
- The opentype.js mock pattern for JSDOM environments
- Performance benchmarks as tests: `performance.now()` with time budgets

### Chapter 39 — Architecture Decisions We'd Make Again

_Patterns that paid off across the project._

- Monorepo with strict package boundaries (core has zero React imports)
- Pure functions for all math and algorithms (testable, composable, cacheable)
- Scene graph as the single source of truth (not the GPU, not the DOM)
- Snapshot-based undo (simple to implement, impossible to have inconsistent state)
- Zustand over Redux (less boilerplate, better for imperative editor patterns)
- CSS custom properties over CSS-in-JS (fast theme switching, no runtime cost)
- Test each sprint before moving on (catch regressions early, build confidence)

---

## Appendices

### Appendix A — Complete Keyboard Shortcut Reference

### Appendix B — Node Type Reference (all shape/group/artboard types)

### Appendix C — WebGL Shader Source Code (all GLSL programs)

### Appendix D — File Format Specification (v1, v2, v3 binary)

### Appendix E — Project Setup Checklist (monorepo, TypeScript, Vitest, ESLint, Prettier)
