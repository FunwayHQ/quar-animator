# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quar Animator is a free, open-source, web-native 2D animation platform designed to fill the gap left by Adobe Animate's discontinuation. It's part of the QUAR Suite (alongside Quar Editor for 3D and Quar Vector for 2D illustration).

**Current Status**: Sprints X1-X3 (code review) complete. Full drawing toolkit with Brush and Eraser tools. Direct selection for path editing. Vector drawing tools (Rectangle, Ellipse, Polygon/Star, Pen). Selection infrastructure with transform handles. Canvas foundation with WebGL 2 rendering. LayerPanel and PropertiesPanel wired to SceneGraph. ErrorBoundary for resilience. Modern violet/bordeaux design system.

## Sprint Progress

### Sprint 1: Project Setup & Architecture ✅ COMPLETE

- [x] Monorepo structure (pnpm workspaces) - 9 packages
- [x] TypeScript configuration with strict mode
- [x] ESLint + Prettier + Husky pre-commit hooks
- [x] React + Vite project scaffold at `apps/web`
- [x] CI/CD pipeline (GitHub Actions)
- [x] Design tokens in `@quar/ui` theme
- [x] Storybook component library setup
- [x] **Bonus**: Full editor layout (MenuBar, Toolbar, Canvas, Properties, Layers, Timeline)
- [x] Test coverage: 57 tests passing (Vitest + React Testing Library)

### Sprint 2: Design System & Core UI Components ✅ COMPLETE

- [x] Design tokens finalized (globals.css with CSS custom properties)
- [x] Button component (primary, secondary, ghost, danger variants)
- [x] Input component (with label, helper text, error states, icons)
- [x] Select component (dropdown with options)
- [x] Checkbox component (with indeterminate state)
- [x] Panel component (collapsible with header actions)
- [x] Tooltip component (with positioning and shortcuts)
- [x] IconButton component (for toolbar buttons)
- [x] Toolbar component (with separator and group support)
- [x] Icon library integration (Lucide React)
- [x] Dark theme implementation
- [x] Storybook stories for all components

### Sprint 3: Canvas Foundation ✅ COMPLETE

- [x] WebGL 2 context initialization (WebGLRenderer with state caching, context loss handling)
- [x] Camera system (zoom, pan, fit bounds, screen/world coordinate transforms)
- [x] Grid rendering (infinite adaptive grid that scales with zoom)
- [x] Canvas resize handling (ResizeObserver integration)
- [x] Coordinate system utilities (vec2, mat3, rect in @quar/core/math)
- [x] Canvas interactions (middle-click/space pan, wheel zoom, keyboard shortcuts)
- [x] SceneGraph for hierarchical node management with events
- [x] Test coverage: 310 tests (core: 221, ui: 89)

**Test coverage milestone**: 622 core tests, 89 UI tests

### Sprint 3.5: Bug Fixes & UI Refresh ✅ COMPLETE

- [x] **Grid bug fix**: Fixed missing horizontal lines (Camera.getVisibleBounds Y-coordinate handling)
- [x] **Grid bug fix**: Fixed adaptive spacing calculation in Grid.calculateAdaptiveSpacing
- [x] **UI Refresh**: Modern "Neo-Industrial Studio" aesthetic
  - Violet (#A855F7) primary accent with bordeaux secondary
  - DM Sans font for UI, IBM Plex Mono for numbers
  - Subtle gradients, glass effects, noise texture overlay
  - Floating status bar with backdrop blur
  - Refined micro-interactions and hover states
  - Improved visual hierarchy across all panels

### Sprint 4: Vector Drawing Foundation ✅ COMPLETE

- [x] **Phase 1.1**: Zustand editor store (`apps/web/src/stores/editorStore.ts`) - 28 tests
- [x] **Phase 1.2**: Bezier utilities (`packages/core/src/path/bezier.ts`) - 53 tests
- [x] **Phase 1.3**: Path utilities (`packages/core/src/path/pathUtils.ts`) - 57 tests
- [x] **Phase 2**: ShapeRenderer (`packages/core/src/rendering/ShapeRenderer.ts`) - 40 tests
- [x] **Phase 3**: Tool System - 130 tests total
  - BaseTool abstract class
  - RectangleTool (shift for square, alt for center-origin)
  - EllipseTool (shift for circle, alt for center-origin)
  - PenTool (corner/smooth points, bezier handles, path closure)
  - SelectionTool (click/marquee selection, move, nudge, delete)
  - ToolManager (tool switching, keyboard shortcuts V/R/O/P)
- [x] **Phase 4**: Selection Infrastructure - 39 tests
  - SelectionManager (bounds calculation for selected nodes)
  - TransformHandles (handle positions, hit testing, cursors)
  - Selection types (HandlePosition, SelectionBounds, SelectionConfig)
- [x] **Phase 5**: UI Integration - 57 tests
  - useToolShortcuts hook (V/R/O/P shortcuts, input focus handling)
  - useCanvasTools hook (ToolManager lifecycle, store bridge)
  - SelectionOverlay component (SVG overlay for bounds and handles)
  - Canvas.tsx integration (tools, shapes, selection rendering)
  - Toolbar.tsx connected to EditorStore

### Sprint 5: Drawing Tools - Shapes ✅ COMPLETE

- [x] PolygonTool implementation - 55 tests
  - Regular polygons (3-12 sides: triangle, pentagon, hexagon, etc.)
  - Star shapes with configurable inner radius ratio (0.1-0.9)
  - Drag-to-create with bounding box inscription
  - Alt key for draw-from-center mode
  - Escape to cancel drawing
  - Automatic selection after creation
- [x] ShapeRenderer polygon support - 13 tests
  - Renders both regular polygons and star shapes
  - Fill and stroke rendering
  - Uses createPolygonPath/createStarPath from pathUtils
- [x] ToolManager polygon integration - 3 tests
  - 'U' keyboard shortcut for polygon tool
  - Tool registration and switching
- [x] Toolbar polygon button with icon

**Total test coverage**: ~622 core tests, 89 UI tests

### Sprint 6: Path Editing - Direct Selection ✅ COMPLETE

- [x] DirectSelectionTool implementation - 36 tests
  - Select individual path points and bezier handles
  - Multi-select with Shift+Click
  - Drag points to reposition
  - Drag handles to adjust curves
  - Handle symmetry for smooth points
  - Delete key removes selected points
  - Alt+Click converts point type (corner ↔ smooth)
- [x] PenTool enhancements
  - Visible control lines/handles during drawing
  - Click first point to close path
- [x] Path selection improvements
  - Precise bounds using bezier curve extrema
  - `bezier.bounds()` for accurate hit testing
- [x] 'A' keyboard shortcut for direct selection tool

### Sprint 7: Brush & Eraser Tools ✅ COMPLETE

- [x] BrushTool implementation - 32 tests
  - Freehand drawing with smooth strokes
  - Ramer-Douglas-Peucker path simplification
  - Bezier curve fitting for natural curves
  - Pressure sensitivity support (stylus)
  - Configurable size (1-100) and smoothing (0-100)
  - Preview while drawing
- [x] EraserTool implementation - 32 tests
  - Stroke mode: delete entire paths on contact
  - Point mode: delete individual path points
  - Configurable eraser size (1-100)
  - [ ] / ] keys to adjust size
  - Bounds-based quick rejection for performance
- [x] Editor store integration - 13 tests
  - brushSize, brushSmoothing settings
  - eraserSize, eraserMode settings
  - Selector hooks for React components
- [x] Tool registration with 'B' and 'E' shortcuts

**Total test coverage**: 736 core tests, 155 UI tests (891 total)

### Sprint X1: Code Review - Math & Core Fixes ✅ COMPLETE

- [x] Math guard clauses (`clamp`, `lerp`, `inverseLerp` handle NaN/edge cases)
- [x] DirectSelectionTool Y-coordinate bug fix
- [x] WebGL event listener cleanup on context loss
- [x] Canvas drag state cleanup on pointer leave
- [x] SceneGraph circular reference protection (`MAX_DEPTH = 100`)
- [x] SelectionTool escape key cancels in-progress operations

### Sprint X2: Code Review - UI Wiring & Components ✅ COMPLETE

- [x] Stroke outlines for all shape tools (Rectangle, Ellipse, Polygon/Star)
- [x] LayerPanel wired to SceneGraph (real nodes, selection highlighting, click-to-select)
- [x] PropertiesPanel wired to selection (position, size, rotation, fill, stroke, opacity)
- [x] ErrorBoundary component with recovery
- [x] Type-only import refactors across codebase

### Sprint X3: Code Review - Performance & Quality ✅ COMPLETE

- [x] Remove unnecessary `Array.from()` in ShapeRenderer (earcut accepts ArrayLike)
- [x] EraserTool immutability fix (use `updateNode()` instead of direct mutation)
- [x] BrushTool degenerate point handling (reuse last valid perpendicular)
- [x] PenTool degenerate path validation (discard zero-area paths)
- [x] Extract `forEachSegment()` and `getAbsoluteControlPoints()` helpers in pathUtils
- [x] Named constants replacing magic numbers (Grid, ShapeRenderer)
- [x] GPU resource nullification after deletion (Grid, ShapeRenderer)
- [x] CI coverage reporting with `@vitest/coverage-v8`

**Total test coverage**: 767 core tests, 158 UI tests (925 total)

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev server at localhost:3000
pnpm build            # Build all packages
pnpm storybook        # Run Storybook at localhost:6006
pnpm lint             # Run ESLint
pnpm typecheck        # TypeScript type checking
```

## Technology Stack

| Layer                | Technology         | Purpose                              |
| -------------------- | ------------------ | ------------------------------------ |
| Vector Rasterization | ThorVG (WASM)      | Path tessellation, Lottie parsing    |
| GPU Rendering        | WebGL 2 / WebGPU   | Mesh deformation, skinning shaders   |
| Physics              | Rapier (WASM)      | Dynamic secondary motion, cloth/hair |
| Video Export         | FFmpeg.wasm        | Client-side MP4, WebM, GIF encoding  |
| UI Framework         | React + TypeScript | Component architecture               |
| Desktop Wrapper      | Electron           | Native file access, menu integration |

## Architecture

The application is designed as five interconnected modules:

1. **Canvas & Vector Engine** - Drawing tools, vector editing, mesh generation (shares DNA with Quar Vector)
2. **Timeline & Animation** - Unified interpolation engine (no fragmented tween types), dope sheet, graph editor, onion skinning
3. **Rigging Laboratory** - Bone tools, FABRIK IK solver, weight painting, Smart Bones constraints, Vitruvian Bones
4. **State Machines** - Visual node-based editor for interactive animations without code
5. **Asset Management** - Symbol library with instances/overrides, multi-format import

## File Format

Native format is `.quar` based on glTF 2.0 with custom extensions:

- `QUAR_2d_shapes` - Bezier path data
- `QUAR_smart_constraints` - Smart Bones dependency graph
- `QUAR_vitruvian` - Bone group visibility switching
- `QUAR_state_machines` - Interactive state machine definitions

## Key Algorithms

- **IK Solver**: FABRIK (Forward And Backward Reaching Inverse Kinematics) - chosen for web performance, no matrix inversion
- **Auto-Rigging**: Bounded Biharmonic Weights for automatic smooth skinning
- **Physics**: Rapier WASM for deterministic cross-platform simulation

## Rendering Pipeline

```
Vector Path (Bezier) → WASM Tessellation → WebGL Vertex Buffers → GPU Skinning Shaders
```

ThorVG handles vector rasterization in WASM for 6-10x performance over JavaScript. Target: 60fps with 200+ mesh-deforming characters.

## Export Formats

Priority order:

- **P0**: Lottie JSON, dotLottie, GIF, PNG Sequence
- **P1**: Sprite Sheet, MP4, WebM, SVG+SMIL
- **P2**: Spine JSON, APNG, glTF/GLB, DragonBones

## Development Phases

| Phase            | Focus                               |
| ---------------- | ----------------------------------- |
| 1 (Months 1-6)   | Vector animation with Lottie export |
| 2 (Months 7-12)  | Rigging engine with Smart Bones     |
| 3 (Months 13-18) | State machines & audio sync         |
| 4 (Months 19-24) | Ecosystem integration               |

## Design Principles

- **Progressive Disclosure**: Simple interface revealing complexity as needed
- **QUAR Family Consistency**: Shared patterns across suite
- **Keyboard-First**: Comprehensive shortcuts (V=Selection, P=Pen, B=Brush, Space=Play)
- **Dark Mode Default**: For extended sessions
