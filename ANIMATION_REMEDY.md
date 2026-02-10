# Animation System Remedy Plan

Systematic fix plan for all animation system bugs discovered during review.
Organized into 6 phases by dependency order and risk level.

**STATUS: ALL 6 PHASES COMPLETE** — 1831 tests passing (1043 core + 329 animation + 459 web)

---

## Phase 1: Core Animation Engine Fixes (packages/animation) ✅ COMPLETE

### 1.1 ✅ Fix rotation interpolation — use shortest-path instead of linear
- Added `'rotation'` to InterpolationType union, wired through getInterpolator and detectInterpolationType
- Fixed modulo bug in Timeline.ts interpolators.rotation using `(((x % n) + n) % n)`

### 1.2 ✅ Fix `moveKeyframe` duplicate-time keyframes
- Added replace-existing-keyframe-at-newTime logic in Timeline.ts

### 1.3 ✅ Add bisection fallback to cubic bezier solver
- Added 20-iteration bisection fallback after Newton-Raphson in Easing.ts

### 1.4 ✅ Fix `setKeyframeEasing` immutability
- Changed to clone-and-replace pattern in KeyframeManager.ts

### 1.5 ✅ Cap accumulator in PlaybackController for tab backgrounding
- Added iteration-count-based limit (MAX_CATCHUP_FRAMES = 10) to avoid float precision issues

### 1.6 ✅ Auto-rewind on play after reaching end
- Added auto-rewind to frame 0 when playing at end of non-looping animation

---

## Phase 2: Store & State Management Fixes (editorStore.ts) ✅ COMPLETE

### 2.1 ✅ Clean up keyframe tracks on node deletion
- deleteSelection now calls KeyframeManager.removeAllKeyframesForNode(id)

### 2.2 ✅ Preserve easing in auto-keyframe mode
- addKeyframeAtFrame checks for existing keyframe first, uses setKeyframeAtFrame to preserve easing

### 2.3 ✅ Fix `pasteKeyframes` missing `isDirty: true`
- Added isDirty: true to set() call

### 2.4 ✅ Sync timeline duration/frameRate between store and Timeline object
- setTimelineDuration and setFrameRate now update both store state and timeline object

---

## Phase 3: Playback & Animation Evaluation Fixes (usePlayback.ts) ✅ COMPLETE

### 3.1 ✅ Traverse all nodes, not just root nodes
- Changed to use getAnimatedNodes() to iterate ALL nodes with keyframes

### 3.2 ✅ Remove double `setCurrentFrame(0)` in stop
- Removed redundant setCurrentFrame(0) call

---

## Phase 4: PropertiesPanel KeyframeIndicator Fixes ✅ COMPLETE

### 4.1 ✅ Fix position keyframe indicator value
- Now passes node.transform.position.x/y instead of visual top-left

### 4.2 ✅ Fix size keyframe indicator value
- Added getSizePropertyValue() helper that returns actual property value per node type

---

## Phase 5: Rendering & Onion Skin Fixes ✅ COMPLETE

### 5.1 ✅ Fix ghost frame rendering to traverse children
- getNodesAtFrame now evaluates all animated nodes via getAnimatedNodes()

### 5.2 ✅ Add upper-bound check for "after" ghost frames
- Added timelineDuration parameter check in OnionSkinRenderer.render()

### 5.3 ✅ Fix ghost rendering to respect node opacity
- Ghost alpha now multiplied by node.opacity

### 5.4 ✅ Fix VBO leak in PostProcessShaders
- createFullscreenQuad now returns VBO, added to PostProcessPrograms, deleted in dispose

---

## Phase 6: Timeline UI & Shortcut Fixes ✅ COMPLETE

### 6.1 ✅ Subscribe to `nodeMoved`/`nodeChanged` events in Timeline
- Added sceneGraph.on('nodeMoved', update) and sceneGraph.on('nodeChanged', update)

### 6.2 ✅ Guard Shift+K and Shift+L in shortcuts
- Added `return;` after Shift-modified shortcuts block in useTimelineShortcuts.ts

### 6.3 ✅ Fix `pasteKeyframes` context menu stale state
- Added reactive keyframeClipboard and selectedNodeIds subscriptions via useEditorStore hooks
- Replaced imperative getState() calls with reactive deps in useMemo

---

## Out of Scope (tracked but deferred)

- **Cubic bezier caching** (Easing.ts:215-218) — perf optimization, not a bug
- **Per-frame earcut in ghost rendering** (ShapeRenderer.ts) — perf optimization
- **KeyframeIndicator hit target size** (10x10px) — UX improvement
- **OnionSkinPanel outside-click dismiss** — UX improvement
- **Stepper button disabled states** — UX improvement
- **ARIA labels on keyframe diamonds** — accessibility improvement
- **Depth testing disabled for 2D** — perf optimization
- **Index-based effect property paths** — design limitation
