# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Quar Animator is a free, open-source, web-native 2D animation platform an actively developed alternative to Adobe Animate, which Adobe keeps in maintenance mode (fixes, no new features) since reversing its February 2026 end-of-life notice. It's part of the QUAR Suite (alongside Quar Editor for 3D and Quar Vector for 2D illustration).

**Current Status** (2026-10-21): Sprints 1–26 complete — Sprint 24 shape tweening, Sprint 25 export pipeline (sprite sheet, PNG sequence, Lottie), Sprint 26 `.quar` v3 binary format. Code-review remediation R1–R7 done (2026-10-22: all 202 findings fixed or found already fixed) — see `docs/CODE_REVIEW_REMEDIATION_PLAN.md`. October 2026 additions: GIF/MP4 export, smart alignment guides, animation presets, light theme, mask groups (clip/alpha/luminance, incl. symbols and Lottie track mattes), artboards selected by their corner label, timeline layer context menu (Delete Animation), tool palette centered in the menu bar, and a timeline resizable by its top border. Animation Sequence mode (PowerPoint-style numbered preset steps, after/with previous or step #N, live-compiled into tagged keyframes; floating window via View menu / Shift+A — `packages/animation/src/AnimationSequence.ts`, `apps/web/src/stores/sequenceActions.ts`), keyframe span lines and a zoom-aware ruler in the dope sheet, integer-first numeric fields, exact nonzero fills for overlapping/self-intersecting SVG contours (`packages/core/src/rendering/contourTriangulation.ts`), a near-complete Lottie export (text as glyph outlines with typewriter reveals, stroke draw-on as trim paths, gradients, animated paint, grouped children and artboards, shape tweens baked per frame, images as image layers with precomps for groups containing them — `packages/export/src/lottie/`), GIF compression (changed-pixel frames, palette size/tolerance slider), frame rate (≤50 fps, exact centisecond delays) and playback speed controls for GIF and MP4 (`packages/export/src/gifExporter.ts`, shared `sampleTimeline` in `exportUtils.ts`), and layers that keep their place on screen — transform, keyframes and sequence rest pose re-expressed — when moved into or out of groups (`apps/web/src/stores/reparent.ts`, `moveNodeKeepingPlacement`). The Animation Sequence window explains its Add step button (why it's disabled, what Own keyframes will add). Rigging fixes from the 2026-10-17 bone review: exports pose IK/physics/Smart Bones and leave bones out, bound meshes follow their own transform (`SkinData.meshBindLocal`), page-scoped undo of rigging, rig-aware copy/paste/delete (`apps/web/src/stores/clipboardRig.ts`), images bend as meshes (`packages/core/src/rendering/imageMesh.ts`), artboards adopt layers drawn around them, Lucide layer icons, global Cmd/Ctrl+Z. Rigging open items, 2026-10-20: bound shapes bend as meshes (`packages/core/src/rendering/bendMesh.ts`, `SkinData.bendMesh`) with joint-aware auto weights; weights follow geometry edits (`SkinData.bindVertices`, `fitSkinToVertices`); weight paint and the Point Magnet work on the posed mesh; IK exact under scale/mirror/offsets, solved from the authored pose; physics chains step per timeline frame (`evaluateDynamicChainsAtFrame`) and restore the rest pose; Smart Bones handle inverted ranges and angle turns; Vitruvian groups swap bones and bindings; onion skin ghosts the posed scene (`apps/web/src/components/canvas/onionSkinScenes.ts`); Lottie bakes bound shapes as animated paths (`packages/export/src/lottie/lottieSkinning.ts`); layers drop into artboards keeping their animation; the Rigging menu and the canvas right-click menu bind through one helper (`apps/web/src/components/canvas/bindToBones.ts`). Additions 2026-10-20: project-card thumbnails (first artboard, else the artwork's bounds; cached in their own IndexedDB — `apps/web/src/services/projectThumbnail.ts`, `hooks/useProjectThumbnails.ts`); Figma-style text boxes (click = auto width, drag = fixed size, handles resize the box and never stretch glyphs; `TextNode.textResize`/`boxWidth`/`boxHeight`, one line breaker in `packages/core/src/font/textLayout.ts`, `keepTextInPlace` in `textPlacement.ts`); Space plays/pauses with any focus, on the canvas on release unless it panned (`useTimelineShortcuts.ts`); a document background color (store `documentBackground`, file `settings.backgroundColor`, `packages/core/src/rendering/documentBackground.ts`) used by the canvas, grid, raster exports and thumbnails; two tutorial projects seeded once on first visit, plus Help > Restore Tutorials (`apps/web/src/tutorials/`). Fixes: world/local matrices no longer offset by the normalized anchor — never pass `transform.anchor` to `mat3.compose` (exports had a gray top/right edge line); text hit-testing includes the anchor; shared GPU buffers grow for long text; symbol instances draw in raster exports (`FrameRenderContext.symbols`). Later on 2026-10-20: rename the project by clicking its name in the menu bar; seven tutorials in their own Projects-page section (`apps/web/src/tutorials/moreTutorials.ts`), Help > Restore Tutorials; an FPS field beside Frames (document-wide, every page's timeline); Figma keys when editing text (Enter = new line, Escape/click away finishes) and the edit box follows the text's world transform; Google Fonts asked for on first pick (`ensureGoogleFontsConsent`, `confirmDialog`). Fixes: exports, playback, scrubbing and IK/physics posing don't mark the project dirty or trigger autosave (`isExporting`, `stores/scenePosing.ts` poseScene); whole-scene exports frame the animated artwork (`services/sceneExtent.ts`, core `getArtworkBounds`); Fit to Window fits the artwork (`components/canvas/fitView.ts`); images inside symbols preload for exports; every toolbar tool key works without canvas focus (W = Weight Paint); the Projects page scrolls. 2026-10-21: SVG gradient import in user space (Figma) with gradientTransform and Y flip; radial gradient focal points (`Gradient.focal`; Shift-drag a radial center handle); Flip Horizontal/Vertical (Shift+H/V, `stores/flip.ts`); Help > Report Issues → github.com/FunwayHQ/quar-animator/issues; copy/paste across windows and browsers (layers as JSON on the system clipboard with their rigging, symbols and keyframes — `services/systemClipboard.ts`, `hooks/useSystemClipboard.ts`, `stores/clipboardAnimation.ts`; pasted keyframes follow the layer's offset/new parent and are retimed to the target frame rate). Path editing: curve-preserving point insert (`pathUtils.splitSegment`, shared `path/pathEditing.ts`), point keyframes kept on their points when points are added/deleted/extended (`stores/vertexTracks.ts`, `ToolContext.onPathPointsChange`), Direct Selection marquee, arrow nudge, Ctrl+A points, segment bending (`bendSegment`), point snapping, locks respected, Alt-drag breaks handles; the Pen shows its path and a line to the pointer, Shift 45°, Alt breaks handles, adds/removes points on a selected path and continues open paths from their ends. The promo video's scripts are in `marketing/source` (the videos themselves are git-ignored). 2026-10-21: quick wins — the default stroke contrasts with what's behind it (`components/canvas/backdrop.ts`), Ctrl/Cmd+0/1/=/− work with any focus (`useViewShortcuts`), export defaults to a page's only artboard, undoing a paste removes the symbols it brought, Help > Use Google Fonts, tutorials update to their latest version unless edited (`Tutorial.version`, `seedTutorials.ts`). Path editing batch 2 — Vertex section point-type buttons and handle fields; Edit > Path (and the canvas menu): Reverse, Simplify (`simplifyContour`, Schneider refit, skips point-animated paths), Close/Open, Join (Ctrl+J, `joinContours`), Cut at Point (`cutContour`; pieces carry the layer's keyframes); a path fill rule select; Convert to Path takes rectangles/ellipses/polygons in place, keeping id and animation (size keyframes become outline keyframes, `stores/shapeToPathAnimation.ts`); whole-path helpers in `stores/pathCommands.ts`; Paths tutorial v2. Lint debt cleared (1,136 → 0): `!` allowed only on index reads (`no-restricted-syntax`, since `noUncheckedIndexedAccess` is on), every other assertion narrowed; stale hook deps fixed; clickable elements keyboard-reachable; `pnpm lint` and the commit hook (`lint-staged.config.cjs`) now allow no warnings. Path editing batch 3 — a Shape keyframe holds the whole path (`PathShape` in `@quar/types`: main contour, holes, closed; older keyframes are a bare `PathPoint[]`, tweened as a closed main contour): holes tween with the outline (one only a shape has grows from or shrinks to its middle), open paths tween as open, closed contours running opposite ways no longer turn inside out (`preparePathShapeTween` in `packages/core/src/tweening/shapeTween.ts`); point edits on a path whose Shape is keyed key the Shape, topology edits and Open/Close keep Shape keyframes in step (`vertexTracks.shapeContours`, `pathCommands.closedShapeTracks`); Lottie keeps contours only some frames have. Bound shapes edit where their bones pose them: each point maps through the skinning of its nearest mesh vertex (`posedPointFrames`, `pointFrameLookup`, `posedSegmentPoints` in `path/pathEditing.ts`), used by Direct Selection and its overlay. Fixes: Open Path/Cut keep fill-only shapes visible (stroke in the fill's color, `strokeForOpening`); Convert to Path keeps skin data and export settings; panels follow `graphReplaced`, so projects that open on a later page list their layers. Quick wins after batch 3: WebM export (VP9, VP8 fallback, transparent option — `exportVideo('mp4' | 'webm')` in `packages/export/src/videoExporter.ts`); SVG export of one posed frame (`exportSvgFrame` in `svgFrame.ts`: bound shapes written as their bent outlines; the SVG writer now exports masks as clipPath/mask, boolean groups as their result, and clips artboards with `clipContent`); whole-scene export bounds follow IK, physics and bound shapes (`sceneExtent.ts`, now in @quar/export); one scene poser for exports that can't skin (`createScenePoser` in `scenePosing.ts`, also used by Lottie skinning); the Layers panel lists a group's layers topmost first like the top level (drops go on top inside a group; Shift-click follows the listed order). 2026-10-22: playback about 3× faster on heavy scenes — the Layers, Timeline, Properties and menu bar don't redraw for each frame shown (`isPosingScene()`; leaf components follow `currentFrame`), a frame is evaluated in one pass over the tracks (`evaluateTimelineAtFrame`), compound paths/text/boolean groups cache their stroke outlines, blend modes copy the backdrop on the GPU (`copyTexSubImage2D`); rotation keyframes tween the authored degrees (no shortest-path wrap; the rotate handle and physics bakes stay continuous); SVG import reads `<style>` stylesheets, fills open paths as SVG does and bakes shear into outlines. 2026-10-24 to 27: unchanged shapes draw from GPU buffers of their own; shadows and blurs scale with the zoom and are worked out round their layer (wide ones smaller); dashed strokes dash on the canvas and in raster exports (`packages/core/src/path/dashes.ts`); each artboard has a timeline of its own (`Timeline.artboards`, `packages/animation/src/TimelineScope.ts`, core `timelineScope.ts`; the selection, or the timeline's picker, chooses which is in view; layers outside artboards keep the page's); with no artboard chosen, MP4/WebM/GIF/PNG-sequence exports play every artboard as a slide, one after another (`sampleSlides`, `framePlan`; app `services/exportScene.ts` `getSlides`/`slideShow`); PDF export, vector, a page a slide at its timeline's last frame (`packages/export/src/pdf/`, written directly: painted as the canvas paints, with layer blurs, drop shadows and bent or adjusted pictures drawn as pictures by the renderer); layers drawn, dropped, pasted or imported onto an artboard go into it (`BaseTool.addDrawnNode`, `services/intoArtboard.ts`); sounds are kept in a .quar as binary buffers, like pictures (groundwork for sound clips); pictures load only from the document (a CSP in `index.html`); rigging binds reach as far as the shape round the bones. Deployed at https://animator.quar.pro. 4870 tests passing (`pnpm -r exec vitest run --passWithNoTests`; plain `pnpm test` starts watch mode).

Earlier milestones: Sprint 23 (Graph Editor for Animation Curves) — visual curve editor in Timeline panel with tangent handle editing, pan/zoom, marquee selection, keyframe drag, and property track list. G shortcut toggles between dope sheet and graph editor views. Sprint 22 added Figma-style Symbols. Sprint 21 added multi-page projects. Sprints 13-20 added full rigging pipeline (bones, IK, mesh binding, weight painting, GPU skinning, Smart Bones, Vitruvian Bones, dynamic chains). Full drawing toolkit, canvas foundation with WebGL 2 rendering.

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

### Sprint 8: Selection & Transform Enhancements ✅ COMPLETE

- [x] Editable Size W/H in PropertiesPanel - 6 tests
  - Rectangle: sets width/height directly
  - Ellipse: sets radiusX/radiusY (value / 2)
  - Polygon: adjusts transform.scale relative to base radius
  - Path nodes remain read-only
  - Validates: rejects NaN, zero, negative values
- [x] Fill/Stroke color editing - 7 tests
  - Hex text input editing with `hexToColor` parser
  - Hidden `<input type="color">` behind color swatches
  - Click swatch opens native color picker
  - Preserves existing fill opacity and stroke properties
- [x] Alt key for center-origin resize - 3 tests
  - Doubles size delta symmetrically around original center
  - Combines with Shift for constrained center-origin resize
  - Center position stays fixed during alt-resize
- [x] Aspect ratio lock toggle - 7 tests
  - `aspectRatioLocked` boolean + `toggleAspectRatioLock` in editor store
  - Lucide Lock/Unlock icon button between W and H inputs
  - When locked: changing W auto-computes H (and vice versa)
- [x] Scrub-to-adjust labels (ScrubLabel component) - 4 tests
  - Reusable component: click-drag on label to scrub value
  - Props: label, value, onChange, sensitivity, min, max
  - CSS cursor `ew-resize` during drag
  - Replaces static labels for X, Y, W, H in PropertiesPanel

**Total test coverage**: 770 core tests, 182 UI tests (952 total)

### Sprint 9: Timeline Foundation ✅ COMPLETE

- [x] Easing system (`packages/animation/src/Easing.ts`) - 101 tests
  - 30 standard easing functions (linear, ease-in/out/inOut for quad, cubic, quart, quint, sine, expo, circ, back, elastic, bounce)
  - Custom cubic bezier with Newton-Raphson + bisection solver
  - Step easing (start/end modes)
  - Spring-based easing with damping/stiffness/mass/velocity
- [x] Timeline engine (`packages/animation/src/Timeline.ts`) - 61 tests
  - Keyframe tracks with per-keyframe easing
  - Value interpolation (number, color, vector2)
  - Track enable/disable, keyframe CRUD
  - Serialization/deserialization
- [x] PlaybackController (`packages/animation/src/PlaybackController.ts`) - 33 tests
  - requestAnimationFrame-based playback loop
  - Play/pause/stop/seek, loop modes, speed control
  - Frame-accurate timing with configurable frame rate
- [x] Editor store timeline state - 16 tests
  - currentFrame, isPlaying, isLooping, timelineDuration, frameRate
  - timelineExpanded toggle for collapsible UI
- [x] Timeline UI component - 16 tests
  - Collapsible timeline panel with expand/collapse toggle
  - Transport controls (play/pause, step forward/back, go to start/end)
  - Timecode display (MM:SS:FF format)
  - Ruler with frame markers and playhead
  - Layer labels synced to SceneGraph
  - Loop toggle, onion skinning button (placeholder)
- [x] usePlayback hook - 12 tests
  - Bridges PlaybackController with editor store
  - Auto-creates/disposes controller on mount/unmount
- [x] useTimelineShortcuts hook - 9 tests
  - Space=play/pause, Home/End=start/end, comma/period=prev/next frame, L=loop
- [x] Auto-switch to selection tool after shape/path creation
- [x] Color swatch CSS fix (checkerboard no longer bleeds through solid colors)
- [x] Cubic bezier Horner form bug fix (quadratic→cubic evaluation)

**Total test coverage**: 770 core tests, 195 animation tests, 224 web tests (1189 total)

### Context Menus & Clipboard Operations ✅ COMPLETE

- [x] Reusable ContextMenu component - 10 tests
  - Portal rendering to escape overflow clipping
  - Viewport edge flipping (repositions if near edge)
  - Keyboard navigation (ArrowUp/Down, Enter to activate, Escape to close)
  - `role="menu"` / `role="menuitem"` for accessibility
  - Scale+opacity entrance animation
  - Separator, disabled, and danger item styling
- [x] useContextMenu hook for state management
- [x] Editor store clipboard operations - 10 tests
  - `copySelection` - deep-clones selected nodes via structuredClone
  - `pasteClipboard` - creates new nodes with unique IDs, offsets position by (20, -20)
  - `duplicateSelection` - copy + paste in one operation
  - `deleteSelection` - removes nodes, clears selection
  - `selectAll` - selects all root nodes and descendants
- [x] Canvas context menu
  - With selection: Copy (Ctrl+C), Duplicate (Ctrl+D), Show/Hide, Lock/Unlock, Delete (Del)
  - Without selection: Paste (Ctrl+V, disabled if clipboard empty), Select All (Ctrl+A)
- [x] LayerPanel context menu
  - Rename (inline text input with auto-focus), Duplicate, Delete
  - Show/Hide, Lock/Unlock (labels adapt to current state)
  - Right-click auto-selects the targeted layer
- [x] Timeline context menu
  - Go To Frame N (clicked frame), Go To Start (Home), Go To End (End)
- [x] Keyboard shortcuts
  - Ctrl+C/V/D/A for copy/paste/duplicate/select all
  - Delete/Backspace for delete selection
  - Skipped when focus is in input/textarea/select elements

**Total test coverage**: 770 core tests, 195 animation tests, 244 web tests (1209 total)

### Sprint 10: Keyframe System ✅ COMPLETE

- [x] PropertyBinding system - 30 tests
  - `getProperty`/`setProperty` for dot-notation nested property access (immutable)
  - `getAnimatableProperties` returns available properties per node type
  - `detectInterpolationType` for number/vector2/color/discrete
  - `getInterpolator` for type-appropriate interpolation functions
  - `evaluateTrack`/`evaluateNodeAtFrame`/`applyAnimatedValues` for animation evaluation
- [x] KeyframeManager class - 28 tests
  - CRUD operations wrapping Timeline.ts functions
  - Clipboard support (copy/paste with relative time offsets)
  - Batch operations (moveKeyframes, removeKeyframes)
  - Query methods (getKeyframeAt, getKeyframesInRange, getAllKeyframesForNode)
  - Auto-cleanup of empty tracks when last keyframe removed
- [x] Editor store keyframe state - 12 tests
  - `timeline`, `autoKeyframe`, `selectedKeyframeIds`, `keyframeClipboard` state
  - Full keyframe CRUD: add, remove, move, set easing
  - Keyframe selection: select, add, clear
  - Clipboard: copy/paste keyframes
- [x] Timeline UI keyframe rendering & interaction
  - Diamond-shaped keyframe markers on tracks
  - Click-to-select (Shift for multi-select)
  - Drag-to-move keyframes via pointer events
  - Auto-keyframe toggle button in controls
  - Context menu on keyframes: easing presets (8 options), copy, delete
  - Paste keyframes option in ruler context menu
- [x] Auto-keyframe mode in PropertiesPanel
  - All property change handlers (position, rotation, size, fill, stroke, opacity) auto-create keyframes
  - Respects node-type-specific property paths (width/height, radiusX/Y, scale)
- [x] Playback evaluates animated values
  - `usePlayback` subscribes to currentFrame changes, evaluates timeline, applies to scene graph
  - Works for both playback and manual scrubbing
- [x] K keyboard shortcut for auto-keyframe toggle
- [x] ContextMenu UX fixes: auto-focus for Escape key, right-click overlay closes menu

**Total test coverage**: 770 core tests, 253 animation tests, 256 web tests (1279 total)

### Sprint 11: Properties Panel Keyframe Indicators ✅ COMPLETE

- [x] KeyframeIndicator component - 5 tests
  - Diamond icon with 3 states: none (empty), active (filled), inactive (half-filled)
  - Click toggles keyframe at current frame (add/remove)
  - Integrates with getKeyframeState helper
- [x] getKeyframeState helper - 4 tests
  - Returns 'none' | 'active' | 'inactive' based on track/frame state
  - removeKeyframeAtFrame store action for keyframe removal
- [x] Per-property keyframe indicators in PropertiesPanel
  - Position, Size, Rotation, Opacity all have keyframe indicators
  - Indicators update reactively based on current frame and timeline state
- [x] Rotation ScrubLabel in PropertiesPanel
  - Drag-to-scrub rotation value with degree symbol display

**Total test coverage**: 770 core tests, 253 animation tests, 274 web tests (1297 total)

### Sprint 12: Onion Skinning & Playback Polish ✅ COMPLETE

- [x] ShapeRenderer ghost rendering - 4 tests
  - `renderGhostNode` renders nodes with tint color and alpha override
  - `applyTintAndAlpha` blends 50% tint mix and multiplies alpha
  - Per-shape override methods (rectangle, ellipse, polygon, path)
  - `renderFillWithColor` / `renderStrokeWithColor` for color bypass
- [x] OnionSkinRenderer class - 5 tests
  - Renders before frames (red tint) and after frames (teal tint)
  - Configurable frame count (1-5), opacity, and falloff
  - Furthest frames rendered first so closest overlaps
  - Skips negative frame indices
  - `getNodesAtFrame` callback keeps renderer decoupled from animation
- [x] Editor store onion skin state - 4 tests
  - Full OnionSkinSettings with getters/setters and clamping
  - `toggleOnionSkin`, `setOnionSkinEnabled`, count/color/opacity/falloff setters
- [x] Canvas integration
  - Ghost frames rendered before current frame shapes in render loop
  - Evaluates timeline at ghost frame numbers via `evaluateNodeAtFrame`
  - Respects `showDuringPlayback` setting
- [x] OnionSkinPanel UI - 4 tests
  - Popover from timeline onion skin button (click opens, right-click quick-toggles)
  - Enable toggle, before/after count steppers with color swatches
  - Opacity and falloff sliders, show-during-playback checkbox
- [x] Keyboard shortcuts - 3 tests
  - Shift+O: toggle onion skinning
  - Shift+,: jump 10 frames backward
  - Shift+.: jump 10 frames forward
  - Tool shortcuts (useToolShortcuts) now skip when Shift is held to avoid conflicts

**Total test coverage**: 779 core tests, 253 animation tests, 285 web tests (1317 total)

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
- **Keyboard-First**: Comprehensive shortcuts (V=Selection, P=Pen, B=Brush, Space=Play, Shift+O=Onion Skin)
- **Dark Mode Default**: For extended sessions
