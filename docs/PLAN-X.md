# Sprints X1-X3: Comprehensive Bug Fix & Quality Plan

## Context

Code review of the full Quar Animator codebase (891 tests, 7 sprints complete) identified 32 issues ranging from critical bugs to code quality improvements. This plan addresses 20 of the most impactful issues across 3 sprints, organized by severity. The goal is to harden the codebase before moving to new features (Timeline, Rigging).

---

## Sprint X1: Critical Bug Fixes

**6 items | All independent, can be done in any order**

### X1-1. Math division-by-zero guards

**Files:** `packages/core/src/math.ts`, `packages/core/src/math.test.ts`

- Add `export const EPSILON = 1e-10` at module level
- `vec2.divide()` (line 33): Add `if (Math.abs(scalar) < EPSILON) throw new Error('Division by zero')`
- `vec2.normalize()` (line 54): Change `len === 0` to `len < EPSILON`
- `mat3.invert()` (line 162): Change `det === 0` to `Math.abs(det) < EPSILON`
- `mat3.decompose()` (lines 197-198): Guard `scaleX < EPSILON` - return early with zero rotation/scale
- `inverseLerp()` (line 311): Guard `Math.abs(b - a) < EPSILON` - return 0
- **Tests:** Add cases for zero-divide, near-zero normalize, near-singular matrix, zero-scale decompose, equal-value inverseLerp

### X1-2. DirectSelectionTool Y-coordinate bug

**File:** `packages/core/src/tools/DirectSelectionTool.ts:481`

- **Bug:** `y: p2World.y + (p2World.y - p1World.y) * hit.t`
- **Fix:** `y: p1World.y + (p2World.y - p1World.y) * hit.t`
- **Test:** Add case verifying inserted point Y is between p1.y and p2.y

### X1-3. WebGLRenderer event listener memory leak

**File:** `packages/core/src/rendering/WebGLRenderer.ts`

- Add class properties: `private boundHandleContextLost` and `boundHandleContextRestored`
- Constructor (lines 76-77): Store `.bind(this)` results in properties, use those for `addEventListener`
- `dispose()` (lines 413-414): Use stored properties for `removeEventListener`
- **Test:** Verify `removeEventListener` receives same function reference as `addEventListener`

### X1-4. Canvas.tsx global listener cleanup on unmount

**File:** `apps/web/src/components/layout/Canvas.tsx`

- Add `activeDragCleanupRef = useRef<(() => void) | null>(null)`
- Extract `setupGlobalDragListeners()` helper to replace 3 near-identical blocks (lines 584-611, 632-662, 681-710)
- Store cleanup function in ref; call it from each block's completion AND from the main useEffect cleanup (line 330)
- **Test:** Verify unmount during drag cleans up document listeners

### X1-5. SceneGraph circular reference prevention

**File:** `packages/core/src/SceneGraph.ts`

- Add private `isAncestorOf(ancestorId, nodeId)`: walks parent chain from nodeId up, returns true if ancestorId found
- In `moveNode()` (after line 135): If `newParentId && this.isAncestorOf(id, newParentId)`, throw error
- **Tests:** parent-to-child move (throws), grandparent-to-grandchild move (throws), sibling move (allowed)

### X1-6. SelectionTool Escape state cleanup

**File:** `packages/core/src/tools/SelectionTool.ts:279-300`

Current Escape handler only clears move state. Add handling for:

- **Resizing:** Revert nodes to `resizeState.initialNodeStates`, null out `resizeState`
- **Rotating:** Revert nodes to `rotationState.initialRotations`, null out `rotationState`
- **Marquee:** Clear `marqueeRect` and `startPoint`
- **Tests:** Escape during resize reverts, Escape during rotation reverts, Escape during marquee cancels

---

## Sprint X2: High-Priority Fixes

**5 items | Item 10 requires adding `generateStrokeOutline` to pathUtils first**

### X2-1. Fix ShapeRenderer stroke width (filled outlines)

**Files:** `packages/core/src/path/pathUtils.ts`, `packages/core/src/rendering/ShapeRenderer.ts`

WebGL `gl.lineWidth()` is capped at 1px on most browsers. BrushTool already solved this via filled outline polygons. Apply same approach to all shape strokes.

- Add `generateStrokeOutline(points, width)` to `pathUtils.ts` (shared utility)
  - Takes array of `{x, y}` points and stroke width
  - Returns closed polygon outline (leftSide + rightSide.reverse())
  - Handles degenerate points using last valid perpendicular (fixes BrushTool issue too)
- Rewrite `ShapeRenderer.renderStroke()` (lines 387-408): Generate outline, triangulate with earcut, render as filled
- Import `generateStrokeOutline` in ShapeRenderer
- **Tests:** Unit tests for `generateStrokeOutline` in pathUtils.test.ts, update ShapeRenderer stroke tests

### X2-2. Connect LayerPanel to EditorStore + SceneGraph

**Files:** New `apps/web/src/contexts/SceneGraphContext.tsx`, `apps/web/src/pages/Editor.tsx`, `apps/web/src/components/layout/LayerPanel.tsx`, `apps/web/src/components/layout/Canvas.tsx`

Current LayerPanel uses hardcoded sample data. Fix:

- Create `SceneGraphContext` with `useSceneGraph()` hook
- Lift SceneGraph creation from Canvas to Editor, pass as prop to Canvas, provide via context
- Rewrite LayerPanel: subscribe to SceneGraph events, build layer tree from `getRootNodes()`, use `useSelectedNodeIds()` for highlighting, call `setSelection()` on click
- **Tests:** Render with SceneGraphContext provider, verify layer list updates on node add/remove

### X2-3. Connect PropertiesPanel to selected nodes

**Files:** `apps/web/src/components/layout/PropertiesPanel.tsx`

Current panel shows hardcoded values. Fix:

- Use `useSceneGraph()` and `useSelectedNodeIds()` to get selected node
- Display actual transform (position, rotation, scale), fill, stroke, opacity
- On input change, call `sceneGraph.updateNode()` with new values
- Show empty state when nothing selected
- **Tests:** Render with selected node, verify values match node properties

### X2-4. Add Error Boundary around Canvas

**Files:** New `apps/web/src/components/ErrorBoundary.tsx`, `apps/web/src/pages/Editor.tsx`

- Create `ErrorBoundary` class component with `componentDidCatch`, retry button
- Wrap `<Canvas />` in Editor.tsx with `<ErrorBoundary>`
- Fallback UI explains WebGL failure with retry option
- **Tests:** Verify fallback renders on child error, retry resets state

### X2-5. Replace `as any` with proper node types in SelectionManager

**File:** `packages/core/src/selection/SelectionManager.ts`

- Import `RectangleNode, EllipseNode, PolygonNode, PathNode` from `@quar/types`
- Line 70: `node as any` -> `node as RectangleNode`
- Line 82: `node as any` -> `node as EllipseNode`
- Line 92: `node as any` -> `node as PolygonNode`
- Line 109: `node as any` -> `node as PathNode`
- No test changes needed (type-only refactor)

---

## Sprint X3: Medium-Priority & Quality

**9 items | All independent except X3-6 (pathUtils helpers) should go first**

### X3-1. Remove Array.from() in ShapeRenderer renderFill

**File:** `packages/core/src/rendering/ShapeRenderer.ts:365`

- `earcut(Array.from(vertices.subarray(...)))` -> `earcut(vertices.subarray(...))`
- earcut's `ArrayLike<number>` signature accepts Float32Array directly

### X3-2. Fix EraserTool immutability violation

**File:** `packages/core/src/tools/EraserTool.ts:225-228`

- Remove direct mutation: `node.points = ...; node.closed = ...;`
- Just call `sceneGraph.updateNode(nodeId, { points: updatedNode.points, closed: updatedNode.closed })`

### X3-3. Fix BrushTool degenerate point handling

**File:** `packages/core/src/tools/BrushTool.ts:476-478`

- Add `lastPerpX`/`lastPerpY` tracking variables before the loop
- On degenerate points (`len < 0.001`): use last valid perpendicular instead of `continue`
- This keeps leftSide/rightSide arrays in sync
- After X2-1 is done, consider replacing BrushTool's private method with shared `generateStrokeOutline`
- **Test:** Stroke with duplicate consecutive points doesn't crash

### X3-4. Add degenerate path validation to PenTool

**File:** `packages/core/src/tools/PenTool.ts:284-288`

- After `length < 2` check, compute bounding box of all points
- If width AND height < 0.1 (all points essentially at same location), call `cancelPath()`
- **Test:** Multiple clicks at same position doesn't create a node

### X3-5. Extract duplicated pathUtils helpers

**File:** `packages/core/src/path/pathUtils.ts`

Add two helpers, then refactor 12 call sites:

**`forEachSegment(points, closed, callback)`** - replaces 6 instances of the segment enumeration loop (lines 100, 148, 243, 271, 296, 341)

**`getAbsoluteControlPoints(p0, p1)`** - replaces 6 instances of the handle offset calculation (lines 123, 187, 258, 284, 307, 345)

- Refactor `getPathBounds`, `tessellatePathToVertices`, `getPathLength`, `getPointOnPath`, `getTangentOnPath`, `getNearestPointOnPath`, `getSegmentBounds`, `tessellateSegment`, `getSegmentLength`
- **Tests:** Add unit tests for both helpers; all existing pathUtils tests must still pass

### X3-6. Add Grid/ShapeRenderer named constants

**Files:** `packages/core/src/rendering/Grid.ts`, `packages/core/src/rendering/ShapeRenderer.ts`

Grid.ts:

- `const MIN_SCREEN_SPACING = 50;` `const MAX_SCREEN_SPACING = 200;`
- Replace lines 221, 226

ShapeRenderer.ts:

- `const DEFAULT_TESSELLATION_TOLERANCE = 1.0;` `const ELLIPSE_TESSELLATION_TOLERANCE = 0.5;`
- Replace lines 243, 271, 302, 327

### X3-7. Nullify GPU resources after deletion

**Files:** `packages/core/src/rendering/ShapeRenderer.ts:434-446`, `packages/core/src/rendering/Grid.ts:329-341`

- After each `gl.deleteBuffer()`/`gl.deleteVertexArray()`, set reference to `null`
- Prevents use-after-delete if dispose called multiple times

### X3-8. Add coverage reporting to CI

**File:** `.github/workflows/ci.yml`

- Change `pnpm test` to `pnpm test -- --coverage`
- Add `actions/upload-artifact@v4` step for coverage reports (14 day retention)
- Verify `@vitest/coverage-v8` is in devDependencies (add if missing)

### X3-9. Standardize epsilon (already done)

The `EPSILON` constant exported from math.ts in X1-1 serves as the standard. The different epsilon values in `vec2.equals` (visual comparison) and tessellation tolerance are intentionally different magnitudes. No further action needed.

---

## New Files Created

| Sprint | File                                          | Purpose                              |
| ------ | --------------------------------------------- | ------------------------------------ |
| X2     | `apps/web/src/contexts/SceneGraphContext.tsx` | React context for sharing SceneGraph |
| X2     | `apps/web/src/components/ErrorBoundary.tsx`   | Error boundary with retry UI         |

## Files Modified Summary

| Sprint | Files Modified      | Tests Modified/Added |
| ------ | ------------------- | -------------------- |
| X1     | 6 source files      | 6 test files         |
| X2     | 6 source + 2 new    | 5 test files + 1 new |
| X3     | 7 source + 1 config | 3 test files         |

## Verification Plan

After each sprint:

1. `pnpm typecheck` - all packages pass
2. `pnpm test` - all 891+ tests pass (plus new ones)
3. `pnpm build` - clean build
4. `pnpm dev` - manual smoke test:
   - X1: Draw with pen tool, double-click segment to add point (verify Y position), try creating circular node hierarchy (should fail), press Escape during resize/rotation
   - X2: Draw shapes and verify stroke width > 1px renders correctly, select objects and verify LayerPanel/PropertiesPanel update, trigger WebGL error and verify ErrorBoundary
   - X3: Verify brush strokes with fast movements render correctly, verify CI coverage report uploads
