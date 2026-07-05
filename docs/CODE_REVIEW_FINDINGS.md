# Code Review Findings — Whole-Project Multi-Agent Review

_Generated from a 26-reviewer adversarially-verified review (Jul 2026). Findings in `tools/quar-mcp` are excluded (that MCP is being replaced by the Rust backend — see docs/BACKEND_PLAN.md)._

**Totals (excl. MCP):** 202 confirmed — 4 critical, 60 high, 90 medium, 48 low.

> Verification note: the verify pass confirmed 214/218 findings with 0 disputed. Treat `confirmed` as _worth investigating_, not proven — re-confirm each before fixing. Status column tracks remediation.

| #   | Sev      | File:Line                                                         | Category                | Summary                                                                                                                                                                                                                                                                                                           | Status |
| --- | -------- | ----------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 1   | critical | `apps/web/src/services/projectSerializer.ts:174`                  | data-loss               | serializeProject/deserializeProject silently drop ikChains and smartBoneActions, so all IK chains and Smart Bone constraints are lost on every save/reload.                                                                                                                                                       | ☐      |
| 2   | critical | `apps/web/src/stores/editorStore.ts:3079`                         | data-corruption         | switchPage/addPage/deletePage do not guard against symbol-edit mode, so the active page's stored scene is overwritten with the symbol's contents.                                                                                                                                                                 | ☐      |
| 3   | critical | `packages/core/src/boolean/booleanOps.ts:63`                      | data-loss               | nodeToPolygon lumps all path contours (including disjoint subpaths) into one Polygon, so disjoint pieces are treated as holes and their area is silently destroyed by subsequent boolean/eraser operations.                                                                                                       | ☐      |
| 4   | critical | `packages/core/src/tools/SelectionTool.ts:1450`                   | data-corruption         | autoReparentAfterMove reparents any moved node whose parent is not an artboard (group children, bone children) to root, silently destroying hierarchy.                                                                                                                                                            | ☐      |
| 5   | high     | `apps/web/src/components/canvas/BoneOverlay.tsx:74`               | correctness             | Bone, IK-target, and chain-line markers freeze at stale screen positions during camera pan/zoom because none of the three useMemos are invalidated on camera change.                                                                                                                                              | ☐      |
| 6   | high     | `apps/web/src/components/canvas/GuideOverlay.tsx:122`             | correctness             | The window-level Delete/Backspace handler for a selected guide never checks whether focus is in an input or whether the user is deleting something else, so once a guide is selected any later Delete/Backspace press deletes the guide and preventDefault breaks Backspace in text fields.                       | ☐      |
| 7   | high     | `apps/web/src/components/common/ConsentBanner.tsx:44`             | correctness             | The GDPR banner reappears on every page load for any user who accepted it without opting into Google Fonts.                                                                                                                                                                                                       | ☐      |
| 8   | high     | `apps/web/src/components/layout/Canvas.tsx:194`                   | memory-leak             | GPU textures of deleted image nodes are never disposed because the nodeRemoved listener treats the SceneGraphEvent payload as a Node, making the only disposeTexture call site dead code.                                                                                                                         | ☐      |
| 9   | high     | `apps/web/src/components/layout/Canvas.tsx:234`                   | correctness             | Ctrl+Shift+G is handled twice when the canvas is focused (canvas onKeyDown + window keydown listener), cascading ungroup into nested groups and pushing a spurious undo snapshot.                                                                                                                                 | ☐      |
| 10  | high     | `apps/web/src/components/layout/Canvas.tsx:578`                   | performance             | With any enabled IK chain, the RAF loop forces a full React re-render of the Canvas subtree at 60fps even when completely idle.                                                                                                                                                                                   | ☐      |
| 11  | high     | `apps/web/src/components/layout/Canvas.tsx:1057`                  | correctness             | Releasing the mouse outside the canvas mid-drag leaves the active tool stuck in dragging mode; the shape keeps following the cursor when the pointer re-enters.                                                                                                                                                   | ☐      |
| 12  | high     | `apps/web/src/components/layout/LayerPanel.tsx:804`               | correctness             | Drag-reorder drops layers at the wrong position: root rows are displayed reversed but insertion uses raw array indices, and same-parent moves have no removal-shift adjustment.                                                                                                                                   | ☐      |
| 13  | high     | `apps/web/src/components/layout/MenuBar.tsx:310`                  | data-loss               | File > New Project (and Ctrl+N) wipes the current project and clears undo history without any unsaved-changes confirmation.                                                                                                                                                                                       | ☐      |
| 14  | high     | `apps/web/src/components/layout/PageTabs.tsx:140`                 | data-loss               | Single click on a page tab's X icon permanently deletes the entire page with no confirmation and no undo.                                                                                                                                                                                                         | ☐      |
| 15  | high     | `apps/web/src/components/layout/PropertiesPanel.tsx:247`          | stale-event-listener    | numericInputProps attaches a wheel listener once per DOM element (guarded by the \_\_numWheel marker) and never rebinds or removes it, so the listener permanently uses first-render getValue/onChange closures.                                                                                                  | ☐      |
| 16  | high     | `apps/web/src/components/layout/PropertiesPanel.tsx:249`          | correctness             | numericInputProps attaches a wheel listener once per DOM element and never refreshes it, so the captured getValue/onChange closures are permanently stale for every input except position/rotation                                                                                                                | ☐      |
| 17  | high     | `apps/web/src/components/layout/PropertiesPanel.tsx:2521`         | data-corruption         | Vertex keyframes use the combined getAllPoints index in a 'points.N' property path, which corrupts the path node when the selected vertex belongs to a subpath                                                                                                                                                    | ☐      |
| 18  | high     | `apps/web/src/components/layout/SymbolLibraryPanel.tsx:121`       | correctness             | Double-click-to-edit a symbol first fires click twice, placing two unwanted symbol instances into the scene before entering edit mode.                                                                                                                                                                            | ☐      |
| 19  | high     | `apps/web/src/components/layout/Timeline.tsx:303`                 | data-loss               | Dragging a keyframe across another keyframe on the same track in the dope sheet silently and permanently deletes the keyframe it passes over.                                                                                                                                                                     | ☐      |
| 20  | high     | `apps/web/src/components/timeline/GraphEditor.tsx:345`            | data-corruption         | Graph-editor keyframe drag creates two keyframes at the same time on one track (violating the sorted-unique invariant) and can silently switch which keyframe is being dragged.                                                                                                                                   | ☐      |
| 21  | high     | `apps/web/src/components/timeline/GraphEditor.tsx:557`            | data-corruption         | Arrow-key nudge of multiple selected keyframes on one track corrupts values when keyframes are adjacent: one keyframe's value overwrites another's and one keyframe moves twice.                                                                                                                                  | ☐      |
| 22  | high     | `apps/web/src/hooks/useProjectActions.ts:159`                     | data-loss               | saveProject clears isDirty before the IndexedDB write completes, and MenuBar discards the promise, so a failed save is silent and never retried.                                                                                                                                                                  | ☐      |
| 23  | high     | `apps/web/src/hooks/useTimelineShortcuts.ts:102`                  | shortcut-conflict       | Space toggles playback even while the focused canvas uses Space for pan mode, so every space-pan also starts/stops the animation.                                                                                                                                                                                 | ☐      |
| 24  | high     | `apps/web/src/pages/Projects.tsx:79`                              | state-leak              | New Project from the landing page resets only 4 store fields, so the previous project's pages, timeline, symbols and rigging state leak into (and get saved with) the new project.                                                                                                                                | ☐      |
| 25  | high     | `apps/web/src/services/projectStorage.ts:95`                      | error-handling          | saveProject only listens to tx.onerror, but quota-exceeded failures at IndexedDB commit time fire only the transaction's abort event, so the returned promise never settles.                                                                                                                                      | ☐      |
| 26  | high     | `apps/web/src/stores/editorStore.ts:86`                           | data-loss               | HistorySnapshot omits the timeline, so undoing a node deletion restores the node but its keyframes are permanently lost.                                                                                                                                                                                          | ☐      |
| 27  | high     | `apps/web/src/stores/editorStore.ts:2341`                         | correctness             | bringForward moves the node two z-positions instead of one due to an off-by-one insert index.                                                                                                                                                                                                                     | ☐      |
| 28  | high     | `apps/web/src/stores/editorStore.ts:3387`                         | data-loss               | detachInstance (and deleteSymbol's detach paths) only re-add the definition's root nodes, dropping all descendants and leaving dangling children ids in the scene graph.                                                                                                                                          | ☐      |
| 29  | high     | `apps/web/src/stores/editorStore.ts:3434`                         | data-corruption         | enterSymbolEdit leaves the page-level undo/redo stacks live, so Ctrl+Z inside symbol edit restores the page scene into the symbol session and exitSymbolEdit then saves the whole page as the symbol definition.                                                                                                  | ☐      |
| 30  | high     | `packages/animation/src/Timeline.ts:167`                          | data-loss               | moveKeyframe silently deletes any pre-existing keyframe at the destination time, so dragging a keyframe across another one in the timeline permanently destroys it.                                                                                                                                               | ☐      |
| 31  | high     | `packages/core/src/boolean/booleanOps.ts:376`                     | data-loss               | booleanOperation silently drops nested boolean-group children (nodeToPolygon returns null for groups), so flattening a boolean group that contains another boolean group loses that geometry while deleting the children.                                                                                         | ☐      |
| 32  | high     | `packages/core/src/font/FontManager.ts:89`                        | correctness             | loadFontFromUrl and loadGoogleFont permanently cache a rejected promise on failure, so a single transient network error makes that font unloadable for the rest of the session.                                                                                                                                   | ☐      |
| 33  | high     | `packages/core/src/font/textToShape.ts:57`                        | correctness             | convertTextToPath/convertTextToPathGroup misplace the converted paths: they ignore the anchor-based metric centering that renderText applies, and do not rotate/skew the center offset.                                                                                                                           | ☐      |
| 34  | high     | `packages/core/src/gradient/gradientUtils.ts:244`                 | correctness             | getNodeLocalBounds for polygons multiplies by transform.scale and uses the circumscribed-circle box, mismatching the renderer's gradient space, so gradient handles are misplaced and drags write wrong gradient coordinates.                                                                                     | ☐      |
| 35  | high     | `packages/core/src/path/pathUtils.ts:855`                         | correctness             | Stroke align 'inside'/'outside' is inverted for every shape generated by the app's own shape tools (rectangle, ellipse, polygon, star).                                                                                                                                                                           | ☐      |
| 36  | high     | `packages/core/src/rendering/FramebufferManager.ts:67`            | performance             | The framebuffer pool has a global size cap but no eviction of stale-size entries, so after canvas resizes the pool fills with unusable sizes and every effect frame permanently creates and destroys canvas-sized FBOs/textures.                                                                                  | ☐      |
| 37  | high     | `packages/core/src/rendering/ShapeRenderer.ts:1184`               | memory-leak             | invalidateCache()/clearCache() have zero production callers, so geometryCache and booleanRingCache entries for deleted nodes and for previously opened projects accumulate for the lifetime of the editor.                                                                                                        | ☐      |
| 38  | high     | `packages/core/src/rendering/ShapeRenderer.ts:2062`               | performance             | Compound-path rendering re-runs applyCornerRadius + tessellatePathToVertices on every contour every frame, even when the node has no visible strokes.                                                                                                                                                             | ☐      |
| 39  | high     | `packages/core/src/rendering/ShapeRenderer.ts:3270`               | correctness             | renderSkinnedFillsGPU restores the VAO but leaves the skinned shader program bound, so the next non-skinned shape's u_model upload is silently dropped and it renders with a stale model matrix.                                                                                                                  | ☐      |
| 40  | high     | `packages/core/src/rendering/ShapeRenderer.ts:3377`               | correctness             | Skinned nodes are permanently invisible after project reload because renderSkinnedNode requires a geometry-cache entry that only the non-skinned render path populates.                                                                                                                                           | ☐      |
| 41  | high     | `packages/core/src/rendering/WebGLRenderer.ts:144`                | context-loss-recovery   | After a WebGL context restore, the renderer resumes with dead GPU objects because handleContextRestored never invalidates cached programs/buffers and no recreation path exists, leaving the canvas permanently blank.                                                                                            | ☐      |
| 42  | high     | `packages/core/src/SceneGraph.ts:446`                             | crash                   | fromJSON accepts cyclic children arrays and nodes with missing/non-array children, causing stack-overflow crashes or infinite-loop hangs when the graph is later traversed.                                                                                                                                       | ☐      |
| 43  | high     | `packages/core/src/svg/svgConverter.ts:424`                       | correctness             | Group transform Y-flip formula shifts all group children by viewBoxHeight: position.y is set to viewBoxHeight - ty instead of -ty.                                                                                                                                                                                | ☐      |
| 44  | high     | `packages/core/src/svg/svgConverter.ts:543`                       | correctness             | buildTransform applies only the translation components of an element's SVG transform to its center, so any transform containing rotation/scale (rotate(a), scale(k), matrix with rotation) places the element at the wrong position.                                                                              | ☐      |
| 45  | high     | `packages/core/src/svg/svgExporter.ts:396`                        | correctness             | Text (and image) elements are exported inside the global scale(1,-1) Y-flip group without a counter-flip, so all exported text and images render vertically mirrored (upside-down).                                                                                                                               | ☐      |
| 46  | high     | `packages/core/src/svg/svgParser.ts:217`                          | correctness             | Gradient coordinates given as percentages (x1="0%" x2="100%", the most common authoring form) are parsed with parseFloat, yielding 100 instead of 1.0 — gradients render wrong and round-trip corrupts.                                                                                                           | ☐      |
| 47  | high     | `packages/core/src/svg/svgPathParser.ts:35`                       | correctness             | Path tokenizer cannot parse SVG's compact arc-flag syntax (e.g. "a1 1 0 011 1"), producing short arg lists that the parser turns into NaN coordinates.                                                                                                                                                            | ☐      |
| 48  | high     | `packages/core/src/tools/EraserTool.ts:568`                       | data-loss               | Point-mode eraser deletes points from locked and hidden path nodes, and can remove those nodes entirely.                                                                                                                                                                                                          | ☐      |
| 49  | high     | `packages/core/src/tools/RectangleTool.ts:80`                     | correctness             | Alt (center-origin) drag toward the left or up silently fails to create a rectangle because BaseTool.getRectFromPoints returns negative width/height in the fromCenter branch.                                                                                                                                    | ☐      |
| 50  | high     | `packages/core/src/tools/SelectionTool.ts:328`                    | coordinate-space        | Move drag adds the world-space delta directly to a node's local transform.position, so children of scaled/rotated groups move at the wrong speed/direction and snap against the wrong grid.                                                                                                                       | ☐      |
| 51  | high     | `packages/core/src/tools/SelectionTool.ts:347`                    | data-corruption         | A mere click on a node (no drag) fires onTransformComplete('move'), inserting spurious position keyframes into the animation timeline.                                                                                                                                                                            | ☐      |
| 52  | high     | `packages/core/src/tools/SelectionTool.ts:488`                    | correctness             | Ctrl+A selects every node including descendants of groups, so a subsequent drag or arrow-nudge moves nested children twice (parent delta plus own delta).                                                                                                                                                         | ☐      |
| 53  | high     | `packages/core/src/tools/SelectionTool.ts:555`                    | feature-bypass          | Locked nodes are fully selectable, movable, resizable, rotatable, and deletable via the canvas — node.locked is never checked by SelectionTool or DirectSelectionTool.                                                                                                                                            | ☐      |
| 54  | high     | `packages/core/src/tools/SelectionTool.ts:1102`                   | coordinate-space        | Resizing a rotated shape applies the raw world-space drag delta to the un-rotated bounds, so handles resize along the wrong axis (or not at all).                                                                                                                                                                 | ☐      |
| 55  | high     | `packages/core/src/tools/WeightPaintTool.ts:230`                  | correctness             | Weight paint brush compares the world-space cursor against node-LOCAL tessellated vertices, so painting lands at the wrong location for any bound node not at the world origin.                                                                                                                                   | ☐      |
| 56  | high     | `packages/export/src/lottie/lottieConverter.ts:73`                | correctness             | Layers get ip:0/op:duration while the animation uses ip:startFrame/op:endFrame, so any export with startFrame > 0 produces a completely blank Lottie.                                                                                                                                                             | ☐      |
| 57  | high     | `packages/export/src/lottie/lottieConverter.ts:277`               | correctness             | Group children have their parent-local position flipped with canvasH, displacing every group child by the full canvas height.                                                                                                                                                                                     | ☐      |
| 58  | high     | `packages/export/src/lottie/lottieConverter.ts:318`               | correctness             | Local shape geometry is never Y-flipped, so exported paths, polygons, and stars render vertically mirrored about their anchor.                                                                                                                                                                                    | ☐      |
| 59  | high     | `packages/export/src/lottie/lottieConverter.ts:472`               | correctness             | Layer anchor is set to [w*ax, h*ay] while rect/ellipse shapes are emitted centered at local [0,0], displacing every rectangle by half its size and every ellipse by its radius in the exported Lottie.                                                                                                            | ☐      |
| 60  | high     | `packages/export/src/lottie/lottieConverter.ts:481`               | correctness             | Animated rotation keyframe values are not negated, so keyframed rotation plays in the opposite direction (and static single-keyframe rotation is un-negated too).                                                                                                                                                 | ☐      |
| 61  | high     | `packages/export/src/lottie/lottieKeyframes.ts:124`               | correctness             | All named easing presets (every option in the Timeline easing menu) export as hold keyframes, turning smooth animation into stepped jumps.                                                                                                                                                                        | ☐      |
| 62  | high     | `packages/rigging/src/ik.ts:351`                                  | correctness             | positionsToRotations sets the chain-root bone's LOCAL rotation to its solved WORLD angle, ignoring the root bone's parent world rotation, so IK breaks for any rig nested under a rotated/scaled group or symbol instance.                                                                                        | ☐      |
| 63  | high     | `packages/rigging/src/ik.ts:428`                                  | performance             | applyIKResult unconditionally calls updateNode on every bone every RAF frame, causing a permanent 60fps React re-render storm across the whole UI whenever any IK chain exists                                                                                                                                    | ☐      |
| 64  | high     | `packages/rigging/src/smartBones.ts:162`                          | correctness             | When the driver value is below the first morph target, evaluateSmartBoneAction applies that target's offsets at FULL strength instead of scaling them, so a single-target Smart Bone action deforms the mesh permanently regardless of bone rotation.                                                             | ☐      |
| 65  | medium   | `apps/web/src/components/canvas/GradientHandleOverlay.tsx:153`    | data-loss               | Dragging gradient handles mutates the node via sceneGraph.updateNode without ever calling pushUndo, so a gradient drag creates no undo entry and Ctrl+Z afterwards jumps back past the previous operation as well.                                                                                                | ☐      |
| 66  | medium   | `apps/web/src/components/canvas/GradientHandleOverlay.tsx:168`    | memory-leak             | Document pointermove/pointerup listeners registered on handle drag are not cleaned up on unmount, so pressing Escape mid-drag dismisses the overlay while the invisible drag keeps mutating the gradient until the next pointerup.                                                                                | ☐      |
| 67  | medium   | `apps/web/src/components/canvas/GuideOverlay.tsx:195`             | correctness             | Guide deselection via `handleSvgPointerDown` is unreachable: the SVG root has `pointerEvents: 'none'` so empty-area clicks pass through, and guide-line clicks call stopPropagation, so a selected guide can never be deselected by clicking.                                                                     | ☐      |
| 68  | medium   | `apps/web/src/components/canvas/TextEditOverlay.tsx:37`           | correctness             | The text-edit textarea is positioned from the node's local transform.position instead of its world transform, so editing a text node inside a moved group or artboard places the textarea at the wrong screen location.                                                                                           | ☐      |
| 69  | medium   | `apps/web/src/components/canvas/WeightPaintOverlay.tsx:22`        | correctness             | The weight-paint brush circle reads `weightPaintBrushSize` from the editor store, which is never synced with the WeightPaintTool's actual brush radius, so after pressing [ or ] the displayed circle no longer matches the painted area.                                                                         | ☐      |
| 70  | medium   | `apps/web/src/components/common/ColorPicker.tsx:71`               | duplication             | Color<->hex conversion is independently implemented in at least 7 places and has already drifted: the UI copies break on the fractional/overshoot channel values the animation engine deliberately produces.                                                                                                      | ☐      |
| 71  | medium   | `apps/web/src/components/common/ExportDialog.tsx:151`             | data-loss               | A filename pattern without the {N} placeholder makes every frame get the same zip entry name, so the exported PNG-sequence zip silently contains only the last frame.                                                                                                                                             | ☐      |
| 72  | medium   | `apps/web/src/components/common/ExportDialog.tsx:190`             | ui-state                | Cancelling an export leaves the dialog permanently stuck in the progress view because `exporting` is never reset to false on the cancellation path.                                                                                                                                                               | ☐      |
| 73  | medium   | `apps/web/src/components/common/ExportDialog.tsx:346`             | correctness             | The header X button is not disabled during export; clicking it hides the dialog while the export keeps running invisibly and later triggers an unexpected download.                                                                                                                                               | ☐      |
| 74  | medium   | `apps/web/src/components/common/ExportDialog.tsx:400`             | validation              | Typed width/height and frame-range values are not clamped or cross-validated, producing silently broken exports (oversized canvases, empty zips).                                                                                                                                                                 | ☐      |
| 75  | medium   | `apps/web/src/components/layout/Canvas.tsx:354`                   | stale-state             | boneNodes/ikTargetNodes/artboardNodes memos keyed only on sceneGraphVersion go stale after undo/redo, page switches, and symbol-edit transitions because SceneGraph.fromJSON emits no events.                                                                                                                     | ☐      |
| 76  | medium   | `apps/web/src/components/layout/Canvas.tsx:553`                   | performance             | Onion skinning re-evaluates the entire timeline and allocates fresh Sets/Maps/arrays for every ghost frame on every RAF frame, even when the playhead and scene are unchanged.                                                                                                                                    | ☐      |
| 77  | medium   | `apps/web/src/components/layout/Canvas.tsx:1007`                  | performance             | setMouseWorldPos stores a fresh object on every mousemove with no equality bail-out, re-rendering the entire Canvas subtree at pointer-event rate while merely hovering.                                                                                                                                          | ☐      |
| 78  | medium   | `apps/web/src/components/layout/Canvas.tsx:1114`                  | data-loss               | Date.now()-seeded node ID counters collide across rapid SVG pastes/drops, making the second import throw and be silently swallowed after already pushing an undo snapshot.                                                                                                                                        | ☐      |
| 79  | medium   | `apps/web/src/components/layout/LayerPanel.tsx:293`               | correctness             | Layer rename never works for nested layers: the recursive child renderer hardcodes isRenaming={false}.                                                                                                                                                                                                            | ☐      |
| 80  | medium   | `apps/web/src/components/layout/LayerPanel.tsx:771`               | correctness             | Drag state is never cleared when the pointer is released outside the panel (no pointer capture, no global pointerup), leaving a stale active drag.                                                                                                                                                                | ☐      |
| 81  | medium   | `apps/web/src/components/layout/PropertiesPanel.tsx:763`          | correctness             | Removing a fill/stroke/effect leaves behind index-based keyframe tracks, which then animate the wrong element or resurrect a malformed entry at the deleted index during playback                                                                                                                                 | ☐      |
| 82  | medium   | `apps/web/src/components/layout/PropertiesPanel.tsx:1115`         | correctness             | Uniform corner-radius edits gate keyframing on the property string 'cornerRadius.undefined', so existing corner-radius keyframes are not updated and the edit is silently reverted                                                                                                                                | ☐      |
| 83  | medium   | `apps/web/src/components/layout/PropertiesPanel.tsx:1771`         | correctness             | Inner Radius keyframe indicator defaults an unset innerRadius to 1 instead of poly.radius, turning a regular polygon into a degenerate 1px-inner star when keyframed                                                                                                                                              | ☐      |
| 84  | medium   | `apps/web/src/components/layout/PropertiesPanel.tsx:1845`         | data-loss               | Bone Length ScrubLabel calls pushUndo on every pointermove, flooding the 50-entry undo stack and destroying all prior undo history in a single scrub gesture                                                                                                                                                      | ☐      |
| 85  | medium   | `apps/web/src/components/layout/Timeline.tsx:134`                 | correctness             | Dope sheet only renders keyframes for root nodes, so keyframes on nodes inside groups are invisible and uneditable in the timeline.                                                                                                                                                                               | ☐      |
| 86  | medium   | `apps/web/src/components/layout/Timeline.tsx:250`                 | correctness             | After dragging a multi-selected group of keyframes in the dope sheet, the selection collapses to just the dragged keyframe.                                                                                                                                                                                       | ☐      |
| 87  | medium   | `apps/web/src/components/layout/Timeline.tsx:357`                 | correctness             | Dragging the work-area body past either timeline edge permanently shrinks the work area instead of preserving its width.                                                                                                                                                                                          | ☐      |
| 88  | medium   | `apps/web/src/components/timeline/GraphEditor.tsx:504`            | shortcut-conflict       | GraphEditor's window-level Delete/arrow-key handler fires regardless of focus, so keypresses aimed at the canvas also delete or nudge keyframes.                                                                                                                                                                  | ☐      |
| 89  | medium   | `apps/web/src/components/timeline/GraphEditorPropertyList.tsx:43` | ui-consistency          | Curve colors and property-list legend colors diverge whenever node selection filters tracks, because the two components count globalIndex differently.                                                                                                                                                            | ☐      |
| 90  | medium   | `apps/web/src/hooks/useCanvasTools.ts:733`                        | type-safety             | deleteDirectSelectionPoints is returned from useCanvasTools and destructured in Canvas.tsx but is missing from the UseCanvasToolsReturn interface, producing TypeScript strict-mode errors that break `pnpm typecheck`.                                                                                           | ☐      |
| 91  | medium   | `apps/web/src/hooks/usePlayback.ts:91`                            | state-desync            | Store isPlaying is never reset when non-looping playback reaches the end, leaving the UI stuck in 'playing' state and blocking frame-step shortcuts.                                                                                                                                                              | ☐      |
| 92  | medium   | `apps/web/src/hooks/useProjectActions.ts:117`                     | state-leak              | newProject does not reset guides, vitruvianControllers, dynamicChains, globalWind, ikChains, or smartBoneActions, so the old project's rigging state and guides bleed into (and get saved with) the new project.                                                                                                  | ☐      |
| 93  | medium   | `apps/web/src/hooks/useToolShortcuts.ts:57`                       | correctness             | Tool shortcuts do not ignore focused <select> elements, so type-ahead in any native dropdown switches tools and preventDefault blocks the dropdown's own keyboard navigation.                                                                                                                                     | ☐      |
| 94  | medium   | `apps/web/src/pages/Editor.tsx:31`                                | data-loss               | Dirty-tracking subscribes to nodeAdded/nodeChanged/nodeRemoved but not nodeMoved, so layer drag-reorder never marks the project dirty and is silently lost.                                                                                                                                                       | ☐      |
| 95  | medium   | `apps/web/src/pages/Projects.tsx:127`                             | correctness             | Project rename on the landing page silently fails for every project saved by the editor, because it JSON.parses binary ArrayBuffer data.                                                                                                                                                                          | ☐      |
| 96  | medium   | `apps/web/src/services/exportService.ts:138`                      | resource-leak           | Every PNG export creates a new WebGL2 context that is never explicitly released, so repeated exports exhaust the browser's WebGL context limit and force-evict the main editor canvas context.                                                                                                                    | ☐      |
| 97  | medium   | `apps/web/src/services/exportService.ts:170`                      | correctness             | PNG export mutates the live artboard (fills cleared) across await points with no try/finally, so an exception mid-export permanently strips the artboard background, and the mutation spuriously marks a clean project dirty.                                                                                     | ☐      |
| 98  | medium   | `apps/web/src/services/projectSerializer.ts:403`                  | data-corruption         | deserializeProject replaces the live scene graph before timeline migration, which can throw on data that passes validateProjectData, leaving a half-imported state that autosave then persists over the old project.                                                                                              | ☐      |
| 99  | medium   | `apps/web/src/services/projectStorage.ts:123`                     | performance             | listProjects uses getAll() on the projects store, deserializing every project's full binary payload just to build an id/name/updatedAt list.                                                                                                                                                                      | ☐      |
| 100 | medium   | `apps/web/src/stores/editorStore.ts:1641`                         | data-loss               | pasteClipboard never sets isDirty, so paste/duplicate as the last edit is skipped by auto-save.                                                                                                                                                                                                                   | ☐      |
| 101 | medium   | `apps/web/src/stores/editorStore.ts:1660`                         | correctness             | deleteSelection only cleans up IK chains when the ik-target node itself is deleted; deleting a bone that belongs to a chain leaves the stale chain and its orphaned target node in the scene.                                                                                                                     | ☐      |
| 102 | medium   | `apps/web/src/stores/editorStore.ts:1934`                         | correctness             | updateKeyframeTimeAndValue can produce two keyframes at the same time on one track, violating the one-keyframe-per-frame invariant maintained everywhere else.                                                                                                                                                    | ☐      |
| 103 | medium   | `apps/web/src/stores/editorStore.ts:2879`                         | state-coherence         | clearHistory resets vitruvianControllers and dynamicChains but not ikChains and smartBoneActions, so rigging state leaks across projects.                                                                                                                                                                         | ☐      |
| 104 | medium   | `apps/web/src/stores/editorStore.ts:3093`                         | state-coherence         | switchPage/addPage/deletePage swap the timeline object but never sync the separate timelineDuration/frameRate store scalars, desynchronizing ruler, playback, and export from the page's actual timeline.                                                                                                         | ☐      |
| 105 | medium   | `packages/animation/src/Easing.ts:137`                            | memory-leak             | cubicBezierCache is an unbounded module-level Map that grows by one entry per unique cubic-bezier control-point tuple and is never evicted.                                                                                                                                                                       | ☐      |
| 106 | medium   | `packages/animation/src/GraphEditorUtils.ts:362`                  | correctness             | fitKeyframesToView clamps scaleX/scaleY to a minimum of 1 px-per-unit, so 'fit to view' fails whenever the frame or value range exceeds the usable pixel size — common for position tracks.                                                                                                                       | ☐      |
| 107 | medium   | `packages/animation/src/PropertyBinding.ts:60`                    | data-corruption         | setProperty creates a plain object `{}` for missing intermediate segments of numeric-index paths, corrupting array-typed node fields (fills, strokes, effects, vertexOffsets) into non-iterable objects.                                                                                                          | ☐      |
| 108 | medium   | `packages/animation/src/PropertyBinding.ts:588`                   | performance             | evaluateNodeAtFrame scans ALL timeline tracks for each node, making per-frame playback evaluation O(animatedNodes x totalTracks) — quadratic in scene size                                                                                                                                                        | ☐      |
| 109 | medium   | `packages/animation/src/Timeline.ts:275`                          | correctness             | The rotation interpolator forces shortest-path wrapping to [-180, 180], making it impossible to animate rotations of more than 180 degrees between two keyframes; a 0-to-360 keyframe pair produces no motion at all.                                                                                             | ☐      |
| 110 | medium   | `packages/core/src/boolean/booleanOps.ts:176`                     | correctness             | performBoolean spreads polyB's polygons as separate clipping geometries, which breaks 'intersect' when polyB is a multi-part MultiPolygon: intersection(A, B1, B2) computes A∩B1∩B2 instead of A∩(B1∪B2).                                                                                                         | ☐      |
| 111 | medium   | `packages/core/src/font/glyphConverter.ts:62`                     | correctness             | Every anchor adjacent to a curve segment is unconditionally marked type 'smooth', so sharp glyph corners become symmetry-enforced points that distort when edited.                                                                                                                                                | ☐      |
| 112 | medium   | `packages/core/src/path/bezier.ts:134`                            | crash                   | bezier.cubicLength recurses without a depth cap, so any non-finite control point causes infinite recursion and a RangeError stack-overflow crash.                                                                                                                                                                 | ☐      |
| 113 | medium   | `packages/core/src/path/brushOutline.ts:236`                      | correctness             | generateRoundCap sweeps the semicircular cap backward into the stroke body instead of extending beyond the endpoint, producing a self-intersecting outline and no visible round cap.                                                                                                                              | ☐      |
| 114 | medium   | `packages/core/src/path/outlineStroke.ts:185`                     | correctness             | outlineStroke places the result at the wrong world position for rotated nodes because the local centering offset is not rotated (or skewed).                                                                                                                                                                      | ☐      |
| 115 | medium   | `packages/core/src/path/pathUtils.ts:972`                         | correctness             | Stroke widthProfile is interpolated by tessellation vertex index instead of arc length, distorting the taper on paths with mixed straight and curved segments.                                                                                                                                                    | ☐      |
| 116 | medium   | `packages/core/src/rendering/EffectRenderer.ts:164`               | performance             | compositeWithBlendMode performs a synchronous full-canvas gl.readPixels plus texSubImage2D upload per blended node per frame, stalling the GPU pipeline and breaking the 60fps target.                                                                                                                            | ☐      |
| 117 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:335`                | cpu-gpu-skinning-parity | GPU skinning shader's zero-weight fallback uses the raw bind-pose LOCAL position (`skinned = pos`) while CPU deformVertices transforms zero-weight vertices through skinData.meshBindMatrix, so unweighted vertices render in the wrong place on the GPU path whenever the mesh's bind transform is non-identity. | ☐      |
| 118 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:2084`               | performance             | renderPath clones every path point (applyCornerRadius) and builds an O(points) geometry-key string on every frame for every path node, even on tessellation-cache hits                                                                                                                                            | ☐      |
| 119 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:2146`               | cache-invalidation      | Text tessellated with a fallback font is cached under a geoKey that omits the actually-used font, so the text keeps rendering in the wrong font after the requested font finishes loading.                                                                                                                        | ☐      |
| 120 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:2439`               | memory-leak             | Boolean-group tessellation cache grows without bound while children move: the cache key embeds child world transforms, and old entries are never evicted.                                                                                                                                                         | ☐      |
| 121 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:2690`               | correctness             | All draw paths upload into fixed 10,000-vertex GPU buffers with no size check, so complex geometry silently renders as garbage or disappears.                                                                                                                                                                     | ☐      |
| 122 | medium   | `packages/core/src/rendering/ShapeRenderer.ts:4178`               | correctness             | Ghost (onion-skin) rendering of text earcuts the concatenated multi-contour glyph array without hole indices, filling letter counters and bridging glyphs.                                                                                                                                                        | ☐      |
| 123 | medium   | `packages/core/src/SceneGraph.ts:77`                              | correctness             | addNode registers the node in the map before validating parentId, so a failed add leaves an orphaned zombie node that blocks re-adding under the same id.                                                                                                                                                         | ☐      |
| 124 | medium   | `packages/core/src/SceneGraph.ts:160`                             | data-loss               | moveNode detaches the node from its old parent before validating the new parent, so a failed move leaves the node (and its whole subtree) unreachable.                                                                                                                                                            | ☐      |
| 125 | medium   | `packages/core/src/selection/SelectionManager.ts:233`             | correctness             | Selection bounds for a group ignore symbol-instance descendants, producing undersized bounds or no selection overlay at all.                                                                                                                                                                                      | ☐      |
| 126 | medium   | `packages/core/src/svg/svgConverter.ts:345`                       | correctness             | Fill is silently discarded for open subpaths, but SVG fills open paths (implicitly closing them for the fill operation) — imported artwork loses visible filled areas.                                                                                                                                            | ☐      |
| 127 | medium   | `packages/core/src/svg/svgExporter.ts:390`                        | xss-injection           | SVG exporter interpolates untrusted node string properties into attribute values without XML-escaping (only node.content and fontFamily are escaped), enabling markup/script injection into the exported .svg.                                                                                                    | ☐      |
| 128 | medium   | `packages/core/src/svg/svgImporter.ts:97`                         | correctness             | importSvg's scale option breaks layout: group children's relative positions are never scaled, and an explicit target position is multiplied by scale.                                                                                                                                                             | ☐      |
| 129 | medium   | `packages/core/src/svg/svgImporter.ts:205`                        | correctness             | computeNodesBounds treats group nodes as zero-size points, so centerAtOrigin fails to center any SVG whose content is wrapped in a <g> (the common case).                                                                                                                                                         | ☐      |
| 130 | medium   | `packages/core/src/svg/svgParser.ts:143`                          | correctness             | Percentage width/height on the root <svg> ('width="100%"') parses to 1 instead of falling back to viewBox, and without a viewBox it corrupts all Y-flipped geometry.                                                                                                                                              | ☐      |
| 131 | medium   | `packages/core/src/svg/svgParser.ts:295`                          | correctness             | Gradient href inheritance resolves only one level in document order, so chained gradient references (a→b→c) can end with zero stops depending on element order.                                                                                                                                                   | ☐      |
| 132 | medium   | `packages/core/src/symbols/symbolResolver.ts:86`                  | correctness             | resolveSymbolInstance does not expand nested symbol-instance nodes, and no downstream consumer does either, so symbols nested inside symbols silently render nothing on canvas and are dropped from SVG export.                                                                                                   | ☐      |
| 133 | medium   | `packages/core/src/symbols/symbolResolver.ts:150`                 | correctness             | getSymbolBounds returns 0x0 extent for path/text/group nodes and mixes parent-local child positions with root coordinates, producing missing or misplaced selection bounds for symbol instances.                                                                                                                  | ☐      |
| 134 | medium   | `packages/core/src/tools/BoneTool.ts:108`                         | correctness             | Minimum bone length is documented as screen pixels but compared in world units, so bone creation silently fails when zoomed in and accidental click-bones appear when zoomed out.                                                                                                                                 | ☐      |
| 135 | medium   | `packages/core/src/tools/BrushTool.ts:247`                        | performance             | Brush preview re-runs a full Schneider curve fit over ALL captured points on every pointer move (O(n^2) per stroke), while the incremental commit pipeline that should prevent this is dead code.                                                                                                                 | ☐      |
| 136 | medium   | `packages/core/src/tools/DirectSelectionTool.ts:494`              | correctness             | Escape during a vertex/handle drag does not cancel the drag: points stay displaced, and clearing the selection mid-drag makes onPointerUp report an empty node set, skipping vertex keyframing.                                                                                                                   | ☐      |
| 137 | medium   | `packages/core/src/tools/EraserTool.ts:514`                       | correctness             | Stroke-erase of a shape inside a rotated or scaled group produces a wrongly-transformed result: only the position is converted to parent-local, not the world-baked geometry orientation.                                                                                                                         | ☐      |
| 138 | medium   | `packages/core/src/tools/SelectionTool.ts:252`                    | correctness             | Shift/Ctrl-clicking an already-selected node to deselect it still enters move mode, so any slight pre-release mouse motion drags the remaining selection.                                                                                                                                                         | ☐      |
| 139 | medium   | `packages/core/src/tools/SelectionTool.ts:1147`                   | correctness             | Resizing a selected symbol instance silently does nothing: handles are shown and 'resizing' mode engages, but performResize has no symbol-instance branch.                                                                                                                                                        | ☐      |
| 140 | medium   | `packages/core/src/tools/ToolManager.ts:277`                      | correctness             | The global 'f' tool shortcut (artboard) intercepts PointMagnetTool's documented F-key falloff cycling and yanks the user out of Smart Bone sculpting.                                                                                                                                                             | ☐      |
| 141 | medium   | `packages/core/src/tools/WeightPaintTool.ts:235`                  | data-loss               | When the tessellation cache misses, a single click paints EVERY vertex of the mesh at full brush strength, ignoring radius and falloff, silently flattening the weight map.                                                                                                                                       | ☐      |
| 142 | medium   | `packages/core/src/tweening/shapeTween.ts:278`                    | correctness             | addPointsToPath drops the corrected handleIn produced by segment subdivision, so the point following any subdivided curved segment keeps its original full-length handleIn and the normalized path is geometrically wrong.                                                                                        | ☐      |
| 143 | medium   | `packages/export/src/lottie/lottieKeyframes.ts:178`               | correctness             | positionTracksToLottie takes easing only from the X track, so easing on Y-only (or Y-differing) position/scale animation is silently dropped to linear.                                                                                                                                                           | ☐      |
| 144 | medium   | `packages/export/src/spriteSheet.ts:131`                          | correctness             | exportSpriteSheet with multiplier > 1 draws oversized frame canvases into cells laid out at unscaled size, making frames overlap and corrupting the atlas.                                                                                                                                                        | ☐      |
| 145 | medium   | `packages/export/src/spriteSheetMetadata.ts:58`                   | correctness             | Metadata includes frames that failed to pack (x/y = -1 sentinel), so consumers read garbage regions for frames that are not in the atlas.                                                                                                                                                                         | ☐      |
| 146 | medium   | `packages/rigging/src/dynamicChain.ts:171`                        | correctness             | stepDynamicChain silently returns for dt > 0.1s, so bakeDynamicChainToKeyframes (dt = 1/frameRate) produces a completely frozen chain — constant keyframes — for any project frame rate of 9 fps or lower, with no error.                                                                                         | ☐      |
| 147 | medium   | `packages/rigging/src/ik.ts:193`                                  | correctness             | Pole targets are silently ignored for 2-bone chains (the primary elbow/knee use case) because applyPoleTarget is gated on joints.length >= 3, making applyPoleTarget's dedicated 'one middle joint' branch unreachable dead code.                                                                                 | ☐      |
| 148 | medium   | `packages/rigging/src/ik.ts:283`                                  | correctness             | applyPoleTarget's long-chain branch re-enforces bone lengths for all segments EXCEPT the last one, so with a pole target the solver can report converged=true while the reconstructed chain's end effector misses the target.                                                                                     | ☐      |
| 149 | medium   | `packages/rigging/src/ik.ts:307`                                  | correctness             | applyConstraints clamps each bone's WORLD-space segment angle against angleMin/angleMax, but everywhere else (fk.ts clampBoneRotation, applyIKResult) those limits are defined on LOCAL rotation, so constrained IK chains are clamped in the wrong frame for every non-root bone.                                | ☐      |
| 150 | medium   | `packages/ui/src/components/Checkbox.tsx:106`                     | controlled-uncontrolled | Uncontrolled Checkbox never renders the check mark: visuals are driven solely by the `checked` prop, not the input's actual DOM state.                                                                                                                                                                            | ☐      |
| 151 | medium   | `packages/ui/src/components/Checkbox.tsx:141`                     | accessibility           | The `indeterminate` prop is visual-only: the native input's `indeterminate` DOM property is never set, so ARIA/AT state contradicts what sighted users see.                                                                                                                                                       | ☐      |
| 152 | medium   | `packages/ui/src/components/Input.tsx:149`                        | accessibility           | Input's `<label>` is not associated with the input — no htmlFor/id and it does not wrap the input — so clicking the label does nothing and AT does not announce the field name.                                                                                                                                   | ☐      |
| 153 | medium   | `packages/ui/src/components/Panel.tsx:114`                        | accessibility           | Collapsible panel header is a plain div with onClick — no keyboard access, no role, no aria-expanded — so keyboard and screen-reader users cannot expand/collapse panels at all.                                                                                                                                  | ☐      |
| 154 | medium   | `packages/ui/src/components/Select.tsx:153`                       | accessibility           | Select has the same unassociated `<label>` defect as Input: no htmlFor/id association, so the combobox has no accessible name and label clicks are dead.                                                                                                                                                          | ☐      |
| 155 | low      | `apps/web/src/components/canvas/GuideOverlay.tsx:161`             | correctness             | Drag-guide-back-onto-ruler removal checks `screen.x <= 0` / `screen.y <= 0`, but the rulers occupy canvas-local 0..RULER_SIZE, so dropping a guide on the visible ruler strip does not remove it.                                                                                                                 | ☐      |
| 156 | low      | `apps/web/src/components/common/ColorPicker.tsx:179`              | correctness             | emitColor (parent onChange + setHexInput) is called inside setHsv updater functions, a side effect in a state updater that double-fires onChange under StrictMode and risks setState-during-render when updaters are replayed.                                                                                    | ☐      |
| 157 | low      | `apps/web/src/components/common/ExportDialog.tsx:333`             | correctness             | The Escape key handler is effectively dead: it is attached to a non-focusable backdrop div and the dialog never takes focus, so Escape neither closes the dialog when freshly opened nor cancels a running export.                                                                                                | ☐      |
| 158 | low      | `apps/web/src/components/common/ImageAdjustments.tsx:145`         | correctness             | Negative values cannot be typed into the adjustment value fields even though half of every bipolar range is negative.                                                                                                                                                                                             | ☐      |
| 159 | low      | `apps/web/src/components/common/PromptDialog.tsx:174`             | correctness             | A second promptDialog() call while one is pending orphans the first promise, leaving its awaiting caller hung forever.                                                                                                                                                                                            | ☐      |
| 160 | low      | `apps/web/src/components/layout/Canvas.tsx:634`                   | performance             | Smart Bones evaluation allocates fresh morph-offset Float32Arrays every RAF frame, permanently defeating the GPU skinning cache — packSkinnedVertices and a full VBO re-upload run per morphed node per frame even when the pose is static                                                                        | ☐      |
| 161 | low      | `apps/web/src/components/layout/Canvas.tsx:697`                   | performance             | getDeformedBounds runs a second full CPU skinning pass (deformVertices over all mesh vertices) for every selected skinned node on every RAF frame, even when idle                                                                                                                                                 | ☐      |
| 162 | low      | `apps/web/src/components/layout/MenuBar.tsx:209`                  | performance             | MenuBar subscribes to currentFrame and traverses the entire scene graph on every render, so it re-renders and does an O(n) traversal every frame during playback.                                                                                                                                                 | ☐      |
| 163 | low      | `apps/web/src/components/layout/PropertiesPanel.tsx:361`          | performance             | PropertiesPanel subscribes directly to currentFrame, so the entire 4,200-line panel re-renders on every frame during playback just to refresh keyframe indicator diamonds                                                                                                                                         | ☐      |
| 164 | low      | `apps/web/src/components/layout/PropertiesPanel.tsx:2294`         | correctness             | Line Height scrub passes sensitivity 0.01 for a fractional property, but ScrubLabel rounds every output to an integer, so scrubbing snaps lineHeight to whole numbers                                                                                                                                             | ☐      |
| 165 | low      | `apps/web/src/components/layout/Timeline.tsx:180`                 | correctness             | Releasing a work-area handle/body drag fires a click that bubbles to the ruler, jumping the playhead to the release position and clearing keyframe selection.                                                                                                                                                     | ☐      |
| 166 | low      | `apps/web/src/components/timeline/GraphEditor.tsx:337`            | correctness             | Shift-constrained keyframe drag never locks its axis: the second setDragMode in the same handler overwrites the first, so the constraint axis can flip mid-drag.                                                                                                                                                  | ☐      |
| 167 | low      | `apps/web/src/hooks/useProjectActions.ts:164`                     | performance             | saveProject serializes the entire project twice per save (serializeProject, then serializeProjectToBinary which calls serializeProject again), doubling deep-clone cost on every 30s autosave.                                                                                                                    | ☐      |
| 168 | low      | `apps/web/src/hooks/useProjectActions.ts:171`                     | race-condition          | An in-flight autosave of the previous project can overwrite lastProjectId after openProject sets it, so the next app launch reopens the wrong project.                                                                                                                                                            | ☐      |
| 169 | low      | `apps/web/src/services/projectSerializer.ts:331`                  | duplication             | The v1->v2 .quar migration is maintained in three places (core TS, web TS, Python MCP) and the copies have already drifted; the web copy is dead code that silently drops symbols.                                                                                                                                | ☐      |
| 170 | low      | `apps/web/src/services/projectSerializer.ts:463`                  | correctness             | uploadProjectFile's promise never settles when the user cancels the file picker, leaving importProject permanently pending.                                                                                                                                                                                       | ☐      |
| 171 | low      | `apps/web/src/stores/editorStore.ts:1664`                         | correctness             | deleteSelection removes keyframe tracks only for the selected node ids, leaving orphaned tracks for all descendants of deleted groups.                                                                                                                                                                            | ☐      |
| 172 | low      | `apps/web/src/stores/editorStore.ts:3251`                         | correctness             | createSymbol on a node nested inside a transformed group places the new instance at the node's parent-relative coordinates at scene root, making the artwork jump.                                                                                                                                                | ☐      |
| 173 | low      | `packages/animation/src/KeyframeManager.ts:200`                   | data-loss               | copyKeyframes discards the source nodeId, so copying keyframes selected across multiple nodes and pasting merges them all onto one node, with same-property collisions silently overwriting each other.                                                                                                           | ☐      |
| 174 | low      | `packages/animation/src/PlaybackController.ts:229`                | race-condition          | If pause() (or dispose()) is called from within the onFrameChange callback, the tick's catch-up loop keeps advancing frames after the pause and \_scheduleFrame() still queues another rAF.                                                                                                                       | ☐      |
| 175 | low      | `packages/animation/src/PropertyBinding.ts:17`                    | boundary-violation      | @quar/animation deep-imports core source via a relative path ('../../core/src/tweening/shapeTween') instead of the @quar/core package entry, duplicating the module into animation's build output.                                                                                                                | ☐      |
| 176 | low      | `packages/core/src/Camera.ts:163`                                 | correctness             | pan() rotates the pan delta even though getViewMatrix composes translation before rotation (T(-pos)·R(-θ)), so panning moves the view in the wrong direction whenever camera rotation is non-zero.                                                                                                                | ☐      |
| 177 | low      | `packages/core/src/Camera.ts:314`                                 | correctness             | getVisibleBounds computes the world AABB from only two viewport corners, which is wrong when camera rotation is non-zero.                                                                                                                                                                                         | ☐      |
| 178 | low      | `packages/core/src/font/FontManager.ts:57`                        | correctness             | loadFontFromBuffer inserts into loadingPromises after the delete has already run, so the entry is never removed and isLoading() reports true forever for buffer-loaded fonts.                                                                                                                                     | ☐      |
| 179 | low      | `packages/core/src/font/FontManager.ts:227`                       | race-condition          | removeFont does not cancel in-flight loads: a pending loadFontFromUrl/loadGoogleFont for the removed family re-populates fontCache and availableFonts after removal.                                                                                                                                              | ☐      |
| 180 | low      | `packages/core/src/font/glyphConverter.ts:246`                    | correctness             | textToSubpaths pairs glyphs with characters by index, but opentype.js stringToGlyphs applies GSUB ligature substitution by default, so glyph/char indices desynchronize.                                                                                                                                          | ☐      |
| 181 | low      | `packages/core/src/font/textMetrics.ts:25`                        | correctness             | getTextBounds ignores font weight, measuring bold text with the regular-weight font, so bounds and the renderer's anchor centering are computed from the wrong glyph widths.                                                                                                                                      | ☐      |
| 182 | low      | `packages/core/src/rendering/ShapeRenderer.ts:981`                | memory-leak             | An image load that resolves after dispose() re-creates and caches a WebGL texture that is never deleted.                                                                                                                                                                                                          | ☐      |
| 183 | low      | `packages/core/src/rendering/ShapeRenderer.ts:984`                | performance             | A failing image src is retried on every render frame forever, spamming network requests and image decodes.                                                                                                                                                                                                        | ☐      |
| 184 | low      | `packages/core/src/rendering/ShapeRenderer.ts:2702`               | performance             | renderFill converts the cached number[] fillIndices to a new Uint32Array on every draw call, allocating per fill per node per frame in the hottest render path                                                                                                                                                    | ☐      |
| 185 | low      | `packages/core/src/rendering/WebGLRenderer.ts:200`                | resource-leak           | createShaderProgram leaks GL objects on its error paths: the vertex shader is never deleted if the fragment shader fails to compile, and the program plus both shaders leak on link failure.                                                                                                                      | ☐      |
| 186 | low      | `packages/core/src/SceneGraph.ts:345`                             | correctness             | computeLocalMatrix passes the normalized anchor (0-1 fraction) to mat3.compose, which subtracts it as absolute local units, offsetting every world transform by a scale-dependent sub-pixel-to-multi-pixel amount.                                                                                                | ☐      |
| 187 | low      | `packages/core/src/SceneGraph.ts:448`                             | data-loss               | fromJSON's orphan repair nulls the bad parent reference but never adds the node to rootNodeIds, so the node silently disappears yet keeps getting re-saved.                                                                                                                                                       | ☐      |
| 188 | low      | `packages/core/src/svg/svgExporter.ts:210`                        | round-trip-fidelity     | transformToSvgAttr silently drops the skew component of a node transform, so skewed nodes (including ones just imported from SVGs with skewX/matrix shear) export unskewed.                                                                                                                                       | ☐      |
| 189 | low      | `packages/core/src/tools/EraserTool.ts:182`                       | correctness             | Eraser stroke preview fill uses 0-1 color components against the project's 0-255 Color convention, rendering near-black instead of red.                                                                                                                                                                           | ☐      |
| 190 | low      | `packages/core/src/tools/EraserTool.ts:527`                       | correctness             | Sibling indices captured before mutation cause z-order shuffling when one eraser stroke removes some shapes and replaces others under the same parent.                                                                                                                                                            | ☐      |
| 191 | low      | `packages/core/src/tools/PenTool.ts:288`                          | correctness             | Degenerate-path check only inspects anchor positions and ignores bezier handles, discarding valid loop-shaped paths whose anchors coincide.                                                                                                                                                                       | ☐      |
| 192 | low      | `packages/export/src/exportUtils.ts:33`                           | data-loss               | A filename pattern without the {N} placeholder generates identical filenames for every frame, so JSZip silently overwrites and the exported ZIP contains only the last frame.                                                                                                                                     | ☐      |
| 193 | low      | `packages/export/src/lottie/lottieExporter.ts:102`                | correctness             | buildNodeResolver claims to walk children recursively but only maps the passed array, so exportToLottieJson without an explicit resolver silently drops every group.                                                                                                                                              | ☐      |
| 194 | low      | `packages/export/src/lottie/lottieExporter.ts:104`                | correctness             | buildNodeResolver claims to walk children recursively but only maps the top-level array, so groups silently export empty whenever no explicit nodeResolver is passed.                                                                                                                                             | ☐      |
| 195 | low      | `packages/export/src/lottie/lottieKeyframes.ts:302`               | correctness             | bakeTrackToLinearKeyframes samples with plain linear interpolation, ignoring keyframe easing, so 'baking' produces output identical to linear and cannot preserve bounce/elastic as documented.                                                                                                                   | ☐      |
| 196 | low      | `packages/rigging/src/ik.ts:145`                                  | correctness             | solveFABRIK initializes the end-effector tip along the direction from the second-to-last joint to the last joint (the parent bone's segment direction) instead of along the last bone's own world rotation, so the initial tip is wrong whenever the last bone is bent.                                           | ☐      |
| 197 | low      | `packages/ui/src/components/Button.tsx:149`                       | ui-state                | Loading buttons keep enabled styling and hover state, and `isHovered` sticks true when the button becomes disabled while hovered because disabled elements do not dispatch mouseleave.                                                                                                                            | ☐      |
| 198 | low      | `packages/ui/src/components/Button.tsx:168`                       | accessibility           | iconOnly buttons drop `children` from the DOM with no accessible-name fallback, producing nameless buttons for screen readers.                                                                                                                                                                                    | ☐      |
| 199 | low      | `packages/ui/src/components/Tooltip.tsx:76`                       | race-condition          | showTooltip never clears an already-pending timer, so the mouseenter+focus double-arm leaves an orphaned timeout that makes the tooltip appear and stick after the pointer has left.                                                                                                                              | ☐      |
| 200 | low      | `packages/ui/src/components/Tooltip.tsx:99`                       | tooltip-positioning     | Tooltip has no viewport clamping or flipping, so tooltips on elements near screen edges render fully or partially off-screen.                                                                                                                                                                                     | ☐      |
| 201 | low      | `packages/ui/src/components/Tooltip.tsx:155`                      | accessibility           | Tooltip content is not exposed to assistive technology: no role="tooltip", no aria-describedby link, and the shortcut text is invisible to screen readers.                                                                                                                                                        | ☐      |
| 202 | low      | `packages/ui/src/theme.ts:39`                                     | theme-consistency       | theme.ts (and the Storybook preview that mirrors it) still carries the pre-Sprint-3.5 token set — blue #3B82F6 accent, Inter/JetBrains fonts, z-tooltip 500 — diverging from every value the app actually uses.                                                                                                   | ☐      |

---

## Detail

### 1. [critical] apps/web/src/services/projectSerializer.ts:174 _(data-loss)_

**serializeProject/deserializeProject silently drop ikChains and smartBoneActions, so all IK chains and Smart Bone constraints are lost on every save/reload.**

EditorStateSnapshot (lines 93-106) and the rigging block (lines 174-180) only cover vitruvianControllers, dynamicChains, and globalWind. The editor store holds two more rigging collections — ikChains (editorStore.ts line 260) and smartBoneActions (line 274) — which are consumed at runtime by usePlayback (evaluateIKChains), Canvas.tsx line 576-578, and PropertiesPanel, but are never read by getEditorSnapshot in useProjectActions.ts (lines 72-88) nor written by serializeProject, and deserializeProject never restores them. Repro: create a bone chain, add an IK chain and a Smart Bone action, Ctrl+S, reload the page (or File > Open the project) — the bones come back but every IK chain and Smart Bone constraint is gone. The 939-line projectSerializer.test.ts never mentions these fields, so tests miss it. This defeats the QUAR_smart_constraints persistence promised in the file-format design.

_Suggested fix:_ Add ikChains and smartBoneActions to EditorStateSnapshot, include them in getEditorSnapshot, serialize them under rigging, and restore them (defaulting to []) in deserializeProject.

### 2. [critical] apps/web/src/stores/editorStore.ts:3079 _(data-corruption)_

**switchPage/addPage/deletePage do not guard against symbol-edit mode, so the active page's stored scene is overwritten with the symbol's contents.**

enterSymbolEdit (line 3446) loads the symbol definition into the live scene graph and leaves editingSymbolId set. switchPage (line 3079) and addPage (line 2940) then save the active page as `sceneGraphJSON: structuredClone(sceneGraph.toJSON())` without checking editingSymbolId. PageTabs.tsx calls switchPage/addPage with no guard either. Scenario: user double-clicks a symbol to edit it, then clicks another page tab -> page A's sceneGraphJSON is replaced by the few symbol nodes; page A's real artwork is gone from the page record. Worse, editingSymbolId stays set on page B, so a later exitSymbolEdit saves page B's content as the symbol definition and restores page A's old scene into page B.

_Suggested fix:_ In switchPage/addPage/deletePage, either call exitSymbolEdit first (so the symbol is saved and the real page scene is restored before snapshotting) or refuse to switch pages while editingSymbolId is set.

### 3. [critical] packages/core/src/boolean/booleanOps.ts:63 _(data-loss)_

**nodeToPolygon lumps all path contours (including disjoint subpaths) into one Polygon, so disjoint pieces are treated as holes and their area is silently destroyed by subsequent boolean/eraser operations.**

nodeToPolygon returns `[transformedContours as Ring[]]` — every subpath becomes an interior ring of the first contour. polygon-clipping treats interior rings strictly as holes (verified in polygon-clipping@0.15.7 dist: a region with non-zero winding only in a non-exterior ring is excluded from the poly), so a subpath that is a disjoint piece rather than a hole contributes zero area. This is a real end-to-end flow: EraserTool stroke erase (EraserTool.ts:418-424) subtracts the eraser circle and stores a multi-piece result as points+subpaths via createBooleanResultNode (contours[0] -> points, rest -> subpaths, rendered with evenodd so it LOOKS correct). On the next eraser pass over that node, nodeToPolygon converts piece 2 into a hole of piece 1, and the recomputed node replaces the original — piece 2 vanishes from the artwork entirely. Same lumping corrupts multi-piece path children inside boolean groups (ShapeRenderer.renderBooleanGroup calls nodeToPolygon at line 2328) and flattenBooleanGroup results reused in further booleans. Concrete repro: draw a rectangle, erase a stripe through the middle (two visible pieces remain), then erase a small corner of one piece — the entire other piece disappears.

_Suggested fix:_ Classify contours by containment/winding parity when building the MultiPolygon: emit each top-level (non-contained) contour as its own Polygon with only its actually-contained subpaths as holes, e.g., using even-odd nesting depth of tessellated contours.

### 4. [critical] packages/core/src/tools/SelectionTool.ts:1450 _(data-corruption)_

**autoReparentAfterMove reparents any moved node whose parent is not an artboard (group children, bone children) to root, silently destroying hierarchy.**

Claim is accurate as stated; two refinements: (a) the defect also detaches child BONES themselves (autoReparentAfterMove skips only type==='artboard', and clicking a mid-chain bone resolves to itself via the line-580 bone break), so a single click on a bone rips it out of the skeleton chain — worse than the claimed shape-only detachment; it likewise rips children out of entered symbol-instances. (b) The corruption is fully silent only for translation-only parents: position is converted through the full parent world transform (lines 1459-1481) so world position is preserved exactly, but the parent's rotation/scale contribution is not compensated, so children of rotated/scaled groups visibly change orientation/size. Additionally, for a click without drag the undo snapshot (onTransformStart) is never pushed, so the hierarchy destruction is not undoable as a discrete step.

_Suggested fix:_ Only auto-reparent when the node's current parent is null or an artboard (i.e., restrict the feature to artboard containment), and skip the whole call when no actual movement occurred.

### 5. [high] apps/web/src/components/canvas/BoneOverlay.tsx:74 _(correctness)_

**Bone, IK-target, and chain-line markers freeze at stale screen positions during camera pan/zoom because none of the three useMemos are invalidated on camera change.**

Accurate as described. One clarification: because the overlay SVG sets pointerEvents:'none', bone selection/click hit-testing is unaffected (it goes through the WebGL/tool layer against true world coordinates). The impact is strictly visual — bone/IK/chain markers render at stale pixel positions during camera pan/zoom and self-correct on the next sceneGraphVersion/selection/ikChains change.

_Suggested fix:_ Pass `cameraVersion` from Canvas.tsx into BoneOverlay and add it to all three useMemo dependency arrays (mirroring ArtboardOverlay), or drop the memos and compute positions on every render.

### 6. [high] apps/web/src/components/canvas/GuideOverlay.tsx:122 _(correctness)_

**The window-level Delete/Backspace handler for a selected guide never checks whether focus is in an input or whether the user is deleting something else, so once a guide is selected any later Delete/Backspace press deletes the guide and preventDefault breaks Backspace in text fields.**

When `selectedGuideId` is set, a `window` keydown listener (lines 119-130) fires on every Delete/Backspace with `e.preventDefault()` and removes the guide. Unlike Canvas.tsx:1502 which guards with `!isInput`, this handler has no focus check. Combined with the fact that guide deselection on empty-canvas click is dead code (see separate finding), the guide stays selected indefinitely. Scenario A: click a guide, then click a shape and press Delete to delete the shape -> Canvas's handler deletes the shape AND this handler silently deletes the guide. Scenario B: click a guide, then click into a PropertiesPanel numeric input and press Backspace to edit the value -> `e.preventDefault()` blocks the character deletion and the guide is removed instead. Both listeners fire because neither stops propagation.

_Suggested fix:_ In the keydown handler, bail out when `document.activeElement` is an input/textarea/select or contentEditable, and only handle the key when the guide overlay interaction is actually the active context (e.g., only while a guide was the last thing clicked, cleared on any other pointerdown).

### 7. [high] apps/web/src/components/common/ConsentBanner.tsx:44 _(correctness)_

**The GDPR banner reappears on every page load for any user who accepted it without opting into Google Fonts.**

The spot actually contains TWO distinct defects, and the reviewer's crash description understates the blast radius. (a) The primary, always-reproducible bug is the visibility logic on line 44: OR-ing `!hasGoogleFontsConsent()` into visibility, combined with the fact that declining Google Fonts records no persistent flag, makes the banner reappear on every load for every user who accepts without ticking Google Fonts. (b) The secondary bug is the unguarded direct localStorage calls (lines 44 and 50) throwing in cookie-blocked/sandboxed environments. Correction to the failure scenario: ConsentBanner is mounted at the App root (App.tsx line 34) and there is NO error boundary above it — main.tsx renders only `StrictMode > App`, and the only ErrorBoundary lives deep inside Editor.tsx. So an unguarded throw in the useState initializer does not merely fall back to "the nearest error boundary"; under React 18 createRoot an uncaught render error unmounts the entire app (blank page), which makes the crash impact worse, not better.

_Suggested fix:_ Make visibility depend only on STORAGE_KEY: `useState(() => localStorage.getItem(STORAGE_KEY) !== 'true')`. Google Fonts consent should be a separate setting, not a reason to re-show the acceptance banner.

### 8. [high] apps/web/src/components/layout/Canvas.tsx:194 _(memory-leak)_

**GPU textures of deleted image nodes are never disposed because the nodeRemoved listener treats the SceneGraphEvent payload as a Node, making the only disposeTexture call site dead code.**

SceneGraph.emit (packages/core/src/SceneGraph.ts:527-534) invokes callbacks with the event object `{ type: 'nodeRemoved', nodeId }` (removeNode, line 124), not the removed Node. Canvas.tsx declares `handleNodeRemoved = (node: Node) => { if (node.type === 'image' && ...) shapeRendererRef.current.disposeTexture(node.src); }` — at runtime `node.type` is the string 'nodeRemoved', so the condition is always false and `node.src` would be undefined anyway. This is the ONLY caller of ShapeRenderer.disposeTexture in the app (verified by grep). Concrete scenario: import a 4000x4000 photo (stored as a unique data URL), delete it — its ~85MB RGBA+mipmap texture stays in ShapeRenderer.textureCache until the whole Editor unmounts. Repeated import/delete of images grows GPU memory without bound. Note the node is already deleted from the graph when the event fires and the event only carries nodeId, so the fix must capture node.src before removal (or emit the node in the event).

_Suggested fix:_ Change the listener signature to `(event: SceneGraphEvent) => void`, look up the node BEFORE removal is finalized (e.g. capture node data in the event payload, or have SceneGraph include the removed node in the event), then dispose by src — with a ref-count or scan so a texture shared by duplicated image nodes isn't disposed while still in use.

### 9. [high] apps/web/src/components/layout/Canvas.tsx:234 _(correctness)_

**Ctrl+Shift+G is handled twice when the canvas is focused (canvas onKeyDown + window keydown listener), cascading ungroup into nested groups and pushing a spurious undo snapshot.**

The canvas element's onKeyDown handler (line 1471-1478) handles Ctrl+G/Ctrl+Shift+G and calls preventDefault but not stopPropagation; the same event then bubbles to the window listener installed at line 240, which re-checks only ctrlKey and key ('g'/'G') and neither checks e.defaultPrevented nor whether the canvas already handled it. Scenario: canvas focused (tabIndex=0, focused by clicking), selection = group G1 containing nested group G2; press Ctrl+Shift+G. Canvas handler runs ungroupSelection → G1 dissolved, selection becomes its children including G2; then the window handler runs ungroupSelection again → G2 is also dissolved. Even without nesting, the second call passes the `selectedNodeIds.size === 0` guard (selection = moved children) and calls pushUndo (editorStore.ts:1747) unconditionally, adding an identical snapshot — the next Ctrl+Z appears to do nothing. (Ctrl+G group is masked only because the second call bails at `size < 2`.)

_Suggested fix:_ In the window-level handler, bail out when `e.defaultPrevented` is true (the canvas handler already calls preventDefault), or remove the Ctrl+G case from the canvas onKeyDown and rely solely on the window listener.

### 10. [high] apps/web/src/components/layout/Canvas.tsx:578 _(performance)_

**With any enabled IK chain, the RAF loop forces a full React re-render of the Canvas subtree at 60fps even when completely idle.**

The finding is accurate as written. One clarification: this is a performance/efficiency defect, not a correctness bug — output pixels and data are unaffected; the cost is wasted CPU/battery and potential jank. Note also that under React 18 automatic batching the multiple per-bone `incrementVersion` calls within one frame collapse into a single re-render per frame (still 60Hz), rather than one re-render per bone; the net "full re-render every idle frame" conclusion is unchanged.

_Suggested fix:_ In applyIKResult, skip updateNode when the clamped rotation equals the bone's current rotation (epsilon compare); alternatively evaluate IK only when the target/pole/root transforms changed since the last frame.

### 11. [high] apps/web/src/components/layout/Canvas.tsx:1057 _(correctness)_

**Releasing the mouse outside the canvas mid-drag leaves the active tool stuck in dragging mode; the shape keeps following the cursor when the pointer re-enters.**

Canvas-initiated drags use only the canvas element's onMouseDown/Move/Up — no pointer capture and no document-level listeners (setupGlobalDragListeners at line 1998 is wired only for overlay-initiated drags). handleMouseLeave (line 1057) resets only isPanningRef and the cursor; it never notifies the tool. SelectionTool.onPointerMove (packages/core/src/tools/SelectionTool.ts:295-342) continues moving/resizing as long as its internal `state.isDragging` is true and never checks `event.buttons`; only onPointerUp clears it. Scenario: drag-move a rectangle quickly, cursor crosses the canvas edge into a side panel, release button there — canvas never receives mouseup. Move back over the canvas: every mousemove still calls toolPointerMove, so the shape stays glued to the cursor with no button pressed until the user clicks again; editorStore.isDrawing also stays true, and onTransformComplete (auto-keyframe/undo finalization) fires later at an unintended position.

_Suggested fix:_ On canvas mousedown for tool interactions, register document-level mousemove/mouseup listeners (reuse setupGlobalDragListeners) or use pointer events with setPointerCapture, so pointer-up is always delivered regardless of where the button is released.

### 12. [high] apps/web/src/components/layout/LayerPanel.tsx:804 _(correctness)_

**Drag-reorder drops layers at the wrong position: root rows are displayed reversed but insertion uses raw array indices, and same-parent moves have no removal-shift adjustment.**

rootNodes are rendered reversed (line 412: [...getRootNodes()].reverse()) while handlePointerUp computes insertIndex in un-reversed array coordinates (lines 799-804), and SceneGraph.moveNode removes the node before splicing at that raw index (SceneGraph.ts:140-175). Concrete case 1: rootNodeIds [A,B,C] display top-to-bottom C,B,A; drag row C onto the upper quarter of row A ('before', indicator line drawn ABOVE A via .dropBefore box-shadow 0 -2px). insertIndex=indexOf(A)=0 → moveNode(C,null,0) → [C,A,B] → display B,A,C: C lands at the BOTTOM, two rows away and on the opposite side of the drop indicator. Concrete case 2 (inside a group, displayed non-reversed): children [X,Y,Z], drag X 'before' Z → insertIndex=2, but after X is removed the array is [Y,Z], so splice(2) yields [Y,Z,X] — X lands below Z instead of above it. Additionally, group children are listed in the opposite stacking order from root rows (children not reversed at line 283), so 'before'/'after' mean opposite z-directions at different depths.

_Suggested fix:_ Convert hit-test positions to array indices consistently (account for the reversed root display, or render children reversed too), and when moving within the same parent decrement insertIndex if the node's old index was less than the insertion point.

### 13. [high] apps/web/src/components/layout/MenuBar.tsx:310 _(data-loss)_

**File > New Project (and Ctrl+N) wipes the current project and clears undo history without any unsaved-changes confirmation.**

handleNew (MenuBar.tsx:307-311) calls projectActions.newProject() unconditionally. useProjectActions.newProject (useProjectActions.ts:96-138) removes every scene node, resets pages/timeline/selection and calls clearHistory(), without checking isDirty or prompting. For a never-saved project (projectId === null) auto-save has never run, so all work since app start is unrecoverable; for saved projects, up to 30s of changes are silently lost. The same unguarded path is wired to the keyboard shortcut via Editor.tsx onNew (Editor.tsx:74) and useProjectShortcuts. Open Project similarly replaces the current project with no dirty check.

_Suggested fix:_ Check useEditorStore.getState().isDirty in handleNew/handleOpen and show a confirm dialog (Save / Discard / Cancel) before destroying the current project.

### 14. [high] apps/web/src/components/layout/PageTabs.tsx:140 _(data-loss)_

**Single click on a page tab's X icon permanently deletes the entire page with no confirmation and no undo.**

Accurate as written, with one refinement: auto-save only persists the loss to disk when projectId is set (an already-saved project); for a brand-new, never-saved project the auto-save branch is skipped. Regardless, the in-memory deletion is immediate and non-undoable, and the guard at PageTabs.tsx:133 / editorStore.ts:2974 only prevents deleting the final remaining page.

_Suggested fix:_ Require confirmation (two-click confirm like Projects.tsx, or a dialog) before deletePage, and/or make page deletion undoable by snapshotting the deleted page.

### 15. [high] apps/web/src/components/layout/PropertiesPanel.tsx:247 _(stale-event-listener)_

**numericInputProps attaches a wheel listener once per DOM element (guarded by the \_\_numWheel marker) and never rebinds or removes it, so the listener permanently uses first-render getValue/onChange closures.**

The ref callback sets `el.__numWheel = true` and attaches the wheel listener exactly once; on every later render the new ref callback returns early, so the listener keeps the closures from the render when the input first mounted. React reuses the same <input> element across re-renders and selection changes, and there is no key remounting the Transform section. Two concrete failures: (1) select rectangle A (W=100), resize it on canvas to 300, focus the W input and scroll up — the stale `() => Math.round(size.width)` (line 1509) returns 100, so handleSizeChange sets W to 101, snapping the shape from 300 back to 101; (2) select rectangle A, then select rectangle B and scroll on B's W input — the stale handleSizeChange (line 607, useCallback capturing `selectedId` = A) resizes node A, silently corrupting a node that is not even selected (and auto-save persists it). The Position inputs were already fixed via the `numericRef` indirection (lines 1199, 1305, 1456-1477), but the other ~28 numericInputProps call sites (size, corner radius, rotation, bone length, etc.) capture render-scope values directly.

_Suggested fix:_ Route all numericInputProps callers through a ref that is refreshed each render (like numericRef for position), or store the latest getValue/onChange on the element and have the single listener read them, or remove/re-add the listener in the ref callback (handling the null call).

### 16. [high] apps/web/src/components/layout/PropertiesPanel.tsx:249 _(correctness)_

**numericInputProps attaches a wheel listener once per DOM element and never refreshes it, so the captured getValue/onChange closures are permanently stale for every input except position/rotation**

The ref callback marks the element with \_\_numWheel and returns early on all later renders, so el.addEventListener('wheel', ...) runs exactly once with the first render's closures. Only the position/rotation inputs route through the render-synced numericRef (lines 1456-1459, 2390-2393); Size W/H (lines 1508-1511, 1537-1540), corner radius, sides, inner radius, bone length, font size, fill/stroke opacity, stroke width, effect fields, and opacity all capture render-scope values directly. Failure 1 (same node): select a rectangle with width 100, focus the W input, scroll the wheel 5 notches up -> each event computes Math.round(size.width)+1 from the frozen first-render size (100), so width goes to 101 and then sticks at 101 forever. Failure 2 (selection switch): with rect A selected the listener captures handleSizeChange bound to selectedId=A; click rect B (input element is reused, so no remount), focus W, scroll -> the stale closure resizes node A (the previously selected node) while B is selected, with no visual feedback in the panel.

_Suggested fix:_ Store the latest getValue/onChange in a per-element property (e.g. el.\_\_numWheelHandlers = {getValue, onChange} updated on every ref call) and have the single listener read through that, or remove/re-add the listener each render, mirroring the numericRef pattern already used for position/rotation.

### 17. [high] apps/web/src/components/layout/PropertiesPanel.tsx:2521 _(data-corruption)_

**Vertex keyframes use the combined getAllPoints index in a 'points.N' property path, which corrupts the path node when the selected vertex belongs to a subpath**

dsPoints.pointIndex indexes the concatenated array returned by getAllPoints (points + all subpaths flattened, pathUtils.ts:444-449), and handleVertexPosChange correctly writes edits back via setAllPoints. But the keyframe it creates uses path `points.${sp.pointIndex}.position.${axis}` (also the indicator at lines 2595/2634 and handleVertexCornerRadiusChange at 2554), which indexes node.points only. For a compound path (e.g. produced by flattenBooleanGroup, editorStore.ts:2703 sets subpaths) with points.length=8, selecting a subpath vertex gives pointIndex>=8; with auto-keyframe on, editing its X creates a track 'points.10.position.x'. On the next scrub/playback, setProperty (PropertyBinding.ts:40-67) clones points, finds points[10] undefined, replaces it with a bare {position:{x:v}} object and leaves holes at indices 8-9. The path node now contains undefined entries and a point with no type/handles/position.y, crashing or misrendering the renderer and permanently corrupting the saved path, while the actual subpath vertex is never animated.

_Suggested fix:_ Map the combined index back to the correct contour via getSubpathBoundaries and use a path addressing the real location (e.g. `subpaths.${si}.${pi}.position.x`), or restrict vertex keyframing to indices < node.points.length.

### 18. [high] apps/web/src/components/layout/SymbolLibraryPanel.tsx:121 _(correctness)_

**Double-click-to-edit a symbol first fires click twice, placing two unwanted symbol instances into the scene before entering edit mode.**

The symbol item has both onClick={() => handleClick(...)} (place instance) and onDoubleClick={() => handleDoubleClick(...)} (enter edit) on the same div (lines 121-122). The DOM dispatches click, click, dblclick, so a double-click runs placeSymbolInstance twice (editorStore.ts:3397-3432 unconditionally adds a new instance node at (0,0) and pushes undo each time) before enterSymbolEdit snapshots the scene — including the two stray instances — into editingSymbolPrevState. When the user exits symbol edit, the scene is restored with two unwanted instances that get saved into the project unless the user notices and deletes them. This is the component's own documented primary interaction ('click-to-place, double-click-to-edit').

_Suggested fix:_ Debounce placement (delay single-click action by ~250ms and cancel it on dblclick), or move click-to-place to an explicit drag/button so double-click does not place instances.

### 19. [high] apps/web/src/components/layout/Timeline.tsx:303 _(data-loss)_

**Dragging a keyframe across another keyframe on the same track in the dope sheet silently and permanently deletes the keyframe it passes over.**

The claim is accurate; one refinement: the overwrite is not strictly guaranteed on every pass-over. A very fast drag whose single pointermove jumps two or more frames can skip B's exact integer frame (e.g. moving A directly to 12 while B is at 11 splices A after B, leaving B intact). However, any normal or slow drag reliably samples B's frame and destroys it, and the lack of any timeline undo history means the loss is permanent as described.

_Suggested fix:_ During drag, either skip/slide over occupied frames, or defer the merge to pointer-up (track a floating position during drag and only commit-with-merge on release).

### 20. [high] apps/web/src/components/timeline/GraphEditor.tsx:345 _(data-corruption)_

**Graph-editor keyframe drag creates two keyframes at the same time on one track (violating the sorted-unique invariant) and can silently switch which keyframe is being dragged.**

The claim's mechanism (duplicate creation, orphaned keyframe, silent drag-target switch, setKeyframeAtFrame replacing only one duplicate) is all correct. One nuance: the phrase "evaluation at that frame is ambiguous" should not be read as a NaN/crash. interpolateValue (Timeline.ts:223) guards `before.time === after.time` and returns before.value, so evaluation is deterministic-by-array-order and produces a curve discontinuity/vertical jump rather than a divide-by-zero. The corruption is a persistent bad data state, not a runtime crash.

_Suggested fix:_ Look up the dragged keyframe by id (store the kf id in drag state, it is already in dragMode.kfId), and on landing at an occupied time either merge (replace) or refuse the move, matching Timeline.moveKeyframe semantics.

### 21. [high] apps/web/src/components/timeline/GraphEditor.tsx:557 _(data-corruption)_

**Arrow-key nudge of multiple selected keyframes on one track corrupts values when keyframes are adjacent: one keyframe's value overwrites another's and one keyframe moves twice.**

The keydown handler iterates a snapshot of state.timeline.tracks captured before the loop, and identifies each keyframe by its stale kf.time via updateKeyframeTimeAndValue's time-based findIndex. With A@5(value 0) and B@6(value 100) both selected, ArrowRight first moves A to 6 (store now has A@6 and B@6, duplicates); the second iteration looks up time 6, findIndex returns A (first duplicate), and sets it to time 7 with B's snapshot value 100. Final state: [B@6 v=100, A@7 v=100] — A's original value 0 is destroyed, B never moved, and the expected result was [A@6 v=0, B@7 v=100]. ArrowLeft near frame 0 similarly piles clamped keyframes into duplicates at time 0.

_Suggested fix:_ Nudge by keyframe id (e.g. via KeyframeManager.moveKeyframes which sorts by direction to prevent cascades) instead of time-based lookup over a stale snapshot, and re-read store state between mutations.

### 22. [high] apps/web/src/hooks/useProjectActions.ts:159 _(data-loss)_

**saveProject clears isDirty before the IndexedDB write completes, and MenuBar discards the promise, so a failed save is silent and never retried.**

One minor nuance in the reviewer's wording: on failure no "Project saved" toast fires (the throw at `await dbSave` precedes line 172), so the user is not shown a false success message. The user is instead misled by the dirty indicator disappearing (isDirty was cleared at line 159 before the write) — that, plus the absence of any error toast, is what makes the failure silent and leads the user to believe the work is saved. This does not change the verdict or severity.

_Suggested fix:_ Set isDirty:false only after dbSave resolves; add a catch in handleSave/handleSaveAsConfirm that shows toast.error and restores the dirty flag.

### 23. [high] apps/web/src/hooks/useTimelineShortcuts.ts:102 _(shortcut-conflict)_

**Space toggles playback even while the focused canvas uses Space for pan mode, so every space-pan also starts/stops the animation.**

useTimelineShortcuts listens on window and only skips INPUT/TEXTAREA/SELECT targets. Canvas.tsx renders <canvas tabIndex={0}> with its own onKeyDown that enters space-pan mode on 'Space' (Canvas.tsx:1393-1400) with preventDefault but no stopPropagation. When the canvas is focused (normal after any canvas click) and the user holds Space to pan — a documented core interaction — the event bubbles to window and hits case ' ' here, calling callbacks.togglePlay(). Result: panning the canvas with Space simultaneously starts playback (scene starts animating mid-pan), and the next space-pan stops it.

_Suggested fix:_ In useTimelineShortcuts, skip Space when the event target is the drawing canvas (e.g. check target.tagName === 'CANVAS' or a data attribute), or have Canvas call stopPropagation for Space.

### 24. [high] apps/web/src/pages/Projects.tsx:79 _(state-leak)_

**New Project from the landing page resets only 4 store fields, so the previous project's pages, timeline, symbols and rigging state leak into (and get saved with) the new project.**

handleNewProject only sets projectId/projectName/isDirty/projectCreatedAt and navigates to /editor. The global Zustand store still holds the previously opened project's pages[], activePageId, timeline, symbols, undoStack, guides, vitruvianControllers and dynamicChains. Scenario: open project A in the editor, press browser Back to '/', click New Project. The Editor mounts with a fresh empty SceneGraph (SceneGraphProvider creates a new instance) but PageTabs shows A's page tabs, the Timeline shows A's keyframe tracks, and the Symbol library shows A's symbols. Clicking another page tab runs switchPage, which saves the empty scene into A's page entry and loads A's content into the 'new' project; saving then persists all of A's pages/symbols under the new Untitled project. useProjectActions.newProject (which does a fuller reset) also fails to reset guides/vitruvianControllers/dynamicChains/globalWind/timelineDuration/frameRate, which getEditorSnapshot serializes into the saved file.

_Suggested fix:_ Have handleNewProject perform the same full reset as useProjectActions.newProject (and extend both to reset guides, vitruvian controllers, dynamic chains, wind, duration, frame rate), e.g. via a shared store action.

### 25. [high] apps/web/src/services/projectStorage.ts:95 _(error-handling)_

**saveProject only listens to tx.onerror, but quota-exceeded failures at IndexedDB commit time fire only the transaction's abort event, so the returned promise never settles.**

IndexedDB buffers writes and can detect QuotaExceededError at commit, in which case no request error event fires — the transaction aborts and only tx.onabort fires with tx.error = QuotaExceededError (documented Chrome/web.dev behavior). saveProject (lines 91-104), deleteProject (141-146), and setSetting (170-175) never register onabort, so on a full disk `await dbSave(...)` hangs forever. Consequences in useProjectActions.saveProject: the `finally` at line 173 never runs, manualSavingRef stays true permanently, which disables ALL future auto-saves (condition at line 444), no error toast is ever shown, and the StorageQuotaError class built for this case is unreachable via the abort path. User keeps editing with autosave silently dead.

_Suggested fix:_ Add `tx.onabort = () => { const e = tx.error; reject(e?.name === 'QuotaExceededError' ? new StorageQuotaError() : (e ?? new Error('Transaction aborted'))); }` to all write transactions.

### 26. [high] apps/web/src/stores/editorStore.ts:86 _(data-loss)_

**HistorySnapshot omits the timeline, so undoing a node deletion restores the node but its keyframes are permanently lost.**

HistorySnapshot contains only sceneData and selectedNodeIds. deleteSelection (line 1664) and cutSelection (line 2907) call mgr.removeAllKeyframesForNode(id), which mutates timeline.tracks in place (KeyframeManager.ts:174 replaces this.timeline.tracks). undo() (line 2839) restores the scene graph via fromJSON but never touches the timeline. Scenario: animate a rectangle (position keyframes), press Delete, then Ctrl+Z -> the rectangle reappears but all its animation tracks are gone with no way to recover them. Likewise the ikChains/smartBoneActions/dynamicChains removed by deleteSelection are not restored by undo.

_Suggested fix:_ Include a structuredClone of the timeline (and rigging arrays affected by deleteSelection) in HistorySnapshot, and restore it in undo/redo.

### 27. [high] apps/web/src/stores/editorStore.ts:2341 _(correctness)_

**bringForward moves the node two z-positions instead of one due to an off-by-one insert index.**

bringForward calls sceneGraph.moveNode(id, parentId, index + 2) (editorStore.ts:2341), but moveNode removes the node from its parent before splicing at the given index (SceneGraph.ts:140-175), so indices past the old position shift left by one. Concrete: siblings [A,B,C,D], Bring Forward on A (index 0) → remove A → [B,C,D] → splice(2,0,A) → [B,C,A,D]: A skipped over both B and C. Expected one step: [B,A,C,D]. sendBackward correctly uses index - 1 (line 2364), making the asymmetry clear. This is wired to Ctrl+], the Edit menu (MenuBar.tsx:528-536) and the LayerPanel context menu.

_Suggested fix:_ Use sceneGraph.moveNode(id, parentId, index + 1).

### 28. [high] apps/web/src/stores/editorStore.ts:3387 _(data-loss)_

**detachInstance (and deleteSymbol's detach paths) only re-add the definition's root nodes, dropping all descendants and leaving dangling children ids in the scene graph.**

resolveSymbolInstance returns all definition nodes (roots + descendants, symbolResolver.ts:74), but detachInstance filters to rootNodes and adds only structuredClone(child) for each root (lines 3385-3389). The clone keeps its original children array referencing definition node ids that are never added, and the descendants themselves are discarded. Scenario: select a group, create a symbol from it (definition root = group with children), place/keep an instance, then use Detach Instance -> the result is an empty group whose children ids resolve to undefined; all nested artwork vanishes, and the dangling ids get persisted by toJSON into saved projects. The same pattern exists in deleteSymbol at lines 3302-3307 and 3326-3331.

_Suggested fix:_ Recursively clone the whole resolved subtree, remapping every node id and rewriting parent/children references (like pasteClipboard does), then add nodes parent-first.

### 29. [high] apps/web/src/stores/editorStore.ts:3434 _(data-corruption)_

**enterSymbolEdit leaves the page-level undo/redo stacks live, so Ctrl+Z inside symbol edit restores the page scene into the symbol session and exitSymbolEdit then saves the whole page as the symbol definition.**

enterSymbolEdit saves editingSymbolPrevState but does not clear or swap undoStack/redoStack (unlike switchPage, which swaps per-page stacks). The Ctrl+Z handler in Canvas.tsx:1454 calls undo(sceneGraph) with no editingSymbolId check, and undo() does sceneGraph.fromJSON(pageSnapshot). Scenario: draw a rect (pushUndo of page scene), enter symbol edit, press Ctrl+Z once -> the symbol canvas is replaced by the entire page scene; pressing Escape triggers exitSymbolEdit which writes sceneGraph.toJSON() (the page content) as the symbol's sceneGraphJSON (line 3462), permanently corrupting the symbol and every instance of it.

_Suggested fix:_ On enterSymbolEdit, stash and clear undoStack/redoStack (restore them on exit), or block undo/redo while editingSymbolId is set.

### 30. [high] packages/animation/src/Timeline.ts:167 _(data-loss)_

**moveKeyframe silently deletes any pre-existing keyframe at the destination time, so dragging a keyframe across another one in the timeline permanently destroys it.**

The mechanism is correct but the phrase "incremental 1-frame deltas" is an approximation: handleKeyframePointerMove applies the incremental delta since the last startX reset, which equals 1 frame per step only when the drag is slow relative to pixels-per-frame (common when zoomed in). When zoomed out, a fast drag can produce a multi-frame delta that skips over the victim frame and avoids the loss. So the bug reliably fires on slow/zoomed-in drags and on the left-clamp collapse, but is not guaranteed on every drag. This narrows when it occurs without refuting it.

_Suggested fix:_ During moves, either swap/skip when the destination is occupied (bounce off), or defer collision resolution to pointer-up (drop) instead of applying it on every incremental move; alternatively have moveKeyframe return a conflict so callers can preserve the displaced keyframe until the gesture commits.

### 31. [high] packages/core/src/boolean/booleanOps.ts:376 _(data-loss)_

**booleanOperation silently drops nested boolean-group children (nodeToPolygon returns null for groups), so flattening a boolean group that contains another boolean group loses that geometry while deleting the children.**

Claim is accurate as stated. One refinement: computeBooleanGroupResult being 'equally broken' is true in principle (its childToPolygon → computeNestedBooleanGroup path always returns null for nested groups), but it has no runtime impact today — editorStore.ts imports it (line 42) without ever calling it, and ShapeRenderer uses its own working recursive implementation instead. The user-facing defect is confined to booleanOperation as used by flattenBooleanGroup. Additionally, in the abort case (nested group as first child) a spurious undo entry is pushed because pushUndo (editorStore.ts:2515) runs before any validation.

_Suggested fix:_ In booleanOperation/childToPolygon, recursively compute nested boolean groups' polygons (mirror ShapeRenderer.computeNestedBooleanPolygon, taking a children-provider callback), or make flattenBooleanGroup use the renderer-equivalent computation.

### 32. [high] packages/core/src/font/FontManager.ts:89 _(correctness)_

**loadFontFromUrl and loadGoogleFont permanently cache a rejected promise on failure, so a single transient network error makes that font unloadable for the rest of the session.**

The defect is as described, but the claim's stated recovery path "(or removeFont)" is wrong — the bug is slightly worse. removeFont (lines 227-236) iterates `[...this.fontCache.keys()]` and only deletes loadingPromises entries whose key also exists in fontCache; a failed load never populates fontCache, so the stale rejected promise cannot be cleared by removeFont. Only dispose() or a page reload recovers. Fix should delete the loadingPromises entry in a finally/catch inside both async IIFEs.

_Suggested fix:_ Attach cleanup to the promise before storing it, e.g. `promise.catch(() => {}).finally(() => this.loadingPromises.delete(key))`, or wrap the loader body in try/finally that deletes the key.

### 33. [high] packages/core/src/font/textToShape.ts:57 _(correctness)_

**convertTextToPath/convertTextToPathGroup misplace the converted paths: they ignore the anchor-based metric centering that renderText applies, and do not rotate/skew the center offset.**

TextTool creates every text node with anchor (0.5,0.5) (TextTool.ts:117). ShapeRenderer.renderText (ShapeRenderer.ts:2119-2135) therefore translates the glyph geometry by -(rawBounds.x + width*ax, rawBounds.y + height*ay), making transform.position the visual (metric-bounds) center of the rendered text. convertTextToPath computes worldCenterX = textNode.transform.position.x + centerX \* scale.x (line 57-58) and convertTextToPathGroup does the same (lines 143-144), where centerX/centerY is the glyph-geometry bounds center (~textWidth/2, ~capHeight/2). It never subtracts the metric center that rendering subtracts. Concrete scenario: create a text node 'Hello' at 24px at position (100,200), then Text > Convert to Path (MenuBar -> editorStore.convertTextToPath -> convertTextToPathGroupFn): the resulting group lands at (100 + ~28, 200 + ~8) while the live text rendered centered at (100,200) — the vector output visibly jumps right by ~half the text width, growing with text length/font size. Additionally the local center offset is added unrotated, so for a rotated text node (rotation applied via mat3.compose T·R·S) the error is compounded: the converted group is placed at position + S·center instead of position + R·S·(center − metricCenter).

_Suggested fix:_ Compute the rendered-geometry center the same way renderText does: worldCenter = position + R·S·(geometryCenter − (metricBounds.x + metricBounds.width*anchor.x, metricBounds.y + metricBounds.height*anchor.y)), using getTextBounds for the metric bounds and applying the node's rotation/skew to the offset before adding it to position.

### 34. [high] packages/core/src/gradient/gradientUtils.ts:244 _(correctness)_

**getNodeLocalBounds for polygons multiplies by transform.scale and uses the circumscribed-circle box, mismatching the renderer's gradient space, so gradient handles are misplaced and drags write wrong gradient coordinates.**

The gradient shader normalizes over computeBounds(local tessellated vertices) with v_localPos = a_position (ShapeRenderer.ts:104, 133-135, 2871), and renderPolygon tessellates at the UNSCALED node.radius, applying scale only via u_model (ShapeRenderer.ts:1861-1890). getNodeLocalBounds instead returns [-r*sx, -r*sy, r*sx, r*sy]. GradientHandleOverlay (GradientHandleOverlay.tsx:74, 106) feeds these bounds plus the full world matrix (which includes scale) into gradientNormalizedToWorld/worldToGradientNormalized, so scale is applied twice: for a polygon with scale 2 (the Properties panel resizes polygons by setting transform.scale per Sprint 8), a gradient end handle renders at ~4x the offset from center instead of 2x, floating far outside the shape, and dragging a handle onto the visible gradient end writes normalized coords off by the scale factor. Even at scale 1 the box is wrong for non-square polygons (a triangle's actual vertex bounds are y in [-0.5r, r], x in [±0.866r], not [-r, r]). The path case (lines 246-257) has a smaller variant of the same mismatch: it ignores bezier handle extremes and subpaths that the shader's tessellated-vertex bounds include.

_Suggested fix:_ Return the actual local vertex bounds the renderer uses: for polygons compute vertex positions from createPolygonPath/createStarPath without scale; for paths include bezier extrema (bezier.bounds) and subpaths.

### 35. [high] packages/core/src/path/pathUtils.ts:855 _(correctness)_

**Stroke align 'inside'/'outside' is inverted for every shape generated by the app's own shape tools (rectangle, ellipse, polygon, star).**

generateStrokeOutlineVertices assumes 'Left = outward (positive perpendicular)' (comment at lines 853-854), computing perp = (-dy, dx) of the edge tangent. But for a positively-wound polygon the interior is on the LEFT of the travel direction, so perp points INTO the shape. All built-in generators produce positive winding: createRectanglePath returns (x,y)->(x+w,y)->(x+w,y+h)->(x,y+h), whose consecutive edge cross product (w,0)x(0,h)=wh>0; createEllipsePath (top->right->bottom->left) and createPolygonPath/createStarPath are the same. Concretely: rectangle top edge TL(0,0)->TR(w,0) gives perp=(0,1), which is inside the rect (0<y<h). With align='inside' the code sets leftOffset=0, rightOffset=-width, so the stroke band spans y in [-width, 0] — entirely OUTSIDE the rectangle; align='outside' renders entirely inside. PropertiesPanel.tsx line 3093 passes the UI's inside/center/outside buttons straight through, so a user choosing 'Inside' on any rectangle/ellipse/polygon stroke gets an outside stroke and vice versa. The existing tests (pathUtils.test.ts lines 615-644) only cover open paths, where there is no interior, so this is untested. Same inversion propagates to outlineStroke.ts (it forwards stroke.align).

_Suggested fix:_ Compute the signed area of the vertex loop (for closed paths) and flip leftOffset/rightOffset (or negate perp) when winding is positive, so 'inside' always offsets toward the polygon interior.

### 36. [high] packages/core/src/rendering/FramebufferManager.ts:67 _(performance)_

**The framebuffer pool has a global size cap but no eviction of stale-size entries, so after canvas resizes the pool fills with unusable sizes and every effect frame permanently creates and destroys canvas-sized FBOs/textures.**

release() checks getTotalPoolSize() >= MAX_POOL_SIZE (8) across ALL size buckets and destroys the entry if full, but never evicts entries of other (stale) sizes. acquire() only reuses exact size matches (sizeKey). Scenario: a scene has a node with a drop shadow (EffectRenderer peaks at ~3 concurrent FBOs per frame, released each frame). The user drag-resizes the window/panel; ResizeObserver fires with several distinct sizes, each frame pooling ~3 entries of a now-dead size. After 2-3 sizes the pool holds 8 entries none of which match the final drawingBuffer size. From then on, every acquire() falls through to createFramebuffer() (a full canvas-sized RGBA8 texture, e.g. 3840x2160x4 = 33 MB on a 2x display) and every release() destroys it — 3+ GPU texture allocations and frees per frame, forever, causing stutter; plus up to 8 stale-size FBOs (~100-260 MB GPU memory) retained until dispose().

_Suggested fix:_ Evict pooled entries whose size differs from the requested size (or evict LRU/oldest when the cap is hit, or clear the pool on resize).

### 37. [high] packages/core/src/rendering/ShapeRenderer.ts:1184 _(memory-leak)_

**invalidateCache()/clearCache() have zero production callers, so geometryCache and booleanRingCache entries for deleted nodes and for previously opened projects accumulate for the lifetime of the editor.**

The claim's phrasing that the nodeRemoved handler "only bumps a version counter" is slightly imprecise: Canvas.tsx handleNodeRemoved also calls shapeRenderer.disposeTexture(node.src) for image nodes, so on ordinary per-node deletion image textures ARE freed. The textureCache/GPU-texture leak therefore manifests specifically on the fromJSON project/page-switch path (which emits no nodeRemoved events at all), while the geometryCache leak applies to all node types on both ordinary deletion and project switches. Everything else in the finding — zero production callers, atomic node-map swap without events, and persistent ShapeRenderer/geometryCache across switches — is accurate.

_Suggested fix:_ Call shapeRenderer.invalidateCache(nodeId) from the Canvas nodeRemoved subscription, and call clearCache() plus texture disposal on project open / page switch (or emit a bulk 'graphReplaced' event from fromJSON that the Canvas handles).

### 38. [high] packages/core/src/rendering/ShapeRenderer.ts:2062 _(performance)_

**Compound-path rendering re-runs applyCornerRadius + tessellatePathToVertices on every contour every frame, even when the node has no visible strokes.**

Defect confirmed as described, with three refinements. (a) The claim says "only getCachedTessellation creates entries" — actually getCachedMultiContourTessellation (line 2658), renderText (2248), image quads (1957), and boolean groups (2436) also create geometryCache entries, but none under the '\_s'/'\_tc' suffixed ids, so the cache-never-engages conclusion is unchanged. (b) For stroked text, the glyph contour tessellation itself IS cached (cached.contours, line 2158); only stroke outline generation + the wasted earcut rerun per frame, and only when a visible stroke exists — whereas for compound paths the per-contour re-tessellation runs even with no strokes at all. (c) Fix caveat: the shared '\_s' id in renderPath cannot be fixed by simply creating a cache entry for it — strokeKey (line 1152) is `${strokeWidth}:${align}[:wp...]` and does not encode contour identity, so all contours of one node would collide on the same key and every contour would render the first contour's outline. The fix needs per-contour keys (like renderText's '\_tc'+ci scheme) or slicing the already-cached combined vertices via contourVertexCounts, as renderSkinnedStrokes (3294-3305) already does.

_Suggested fix:_ Skip the contour loop when no visible stroke exists, and reuse the cached per-contour tessellation (contourVertexCounts already stored by getCachedMultiContourTessellation) instead of re-tessellating.

### 39. [high] packages/core/src/rendering/ShapeRenderer.ts:3270 _(correctness)_

**renderSkinnedFillsGPU restores the VAO but leaves the skinned shader program bound, so the next non-skinned shape's u_model upload is silently dropped and it renders with a stale model matrix.**

At the end of renderSkinnedFillsGPU (line 3270) only `this.renderer.bindVAO(this.vao)` runs; the current program remains skinnedProgram/skinnedGradientProgram. If the skinned node has an empty strokes array, renderSkinnedNode returns without ever calling useProgram(this.program) (renderSkinnedStrokes, which would restore it, is only called when strokes.length > 0). The next node in the traversal — renderRectangle (line 1768), renderEllipse (1845), renderPolygon (1890), renderPath (2040), renderText (2140), or renderBone (3041) — calls gl.uniformMatrix3fv with a u_model location belonging to this.program while a different program is bound, which is GL_INVALID_OPERATION and leaves this.program's u_model unchanged. renderFill then re-binds this.program (WebGLRenderer.useProgram caches by program object, confirmed at WebGLRenderer.ts:266-271) and draws with the previous node's model matrix, placing the shape at the wrong transform. renderBone is worse: it draws immediately with the skinned program still bound, producing garbage placement.

_Suggested fix:_ Restore the flat program at the end of renderSkinnedFillsGPU (`this.renderer.useProgram(this.program)`), or make every render\* method call useProgram(this.program) before setting uniforms.

### 40. [high] packages/core/src/rendering/ShapeRenderer.ts:3377 _(correctness)_

**Skinned nodes are permanently invisible after project reload because renderSkinnedNode requires a geometry-cache entry that only the non-skinned render path populates.**

Claim is accurate as stated. Additionally, the failure is not limited to project reload: pasting or duplicating a skinned node (pasteClipboard/duplicateSelection deep-clone skinData under a new node id) also yields an invisible mesh within a single session, since the new id has no geometry-cache entry and the skinned dispatch never tessellates. The unbind/rebind workaround is destructive — rebinding recomputes auto weights, discarding manually painted weights.

_Suggested fix:_ In renderSkinnedNode/renderSkinnedImage, when the cache entry is missing (or its geoKey is stale), compute the bind-pose tessellation on the spot via getCachedTessellation/getCachedMultiContourTessellation (or the image-quad caching block from renderImage) instead of returning.

### 41. [high] packages/core/src/rendering/WebGLRenderer.ts:144 _(context-loss-recovery)_

**After a WebGL context restore, the renderer resumes with dead GPU objects because handleContextRestored never invalidates cached programs/buffers and no recreation path exists, leaving the canvas permanently blank.**

handleContextRestored sets contextLost=false, re-inits GL state, and invokes onContextRestored — but setContextRestoredHandler is never called anywhere in the repo (verified by grep), and the `programs`/`buffers` maps plus Grid's VAO/buffers, ShapeRenderer's 6 shader programs, VAOs, vertex buffers, textureCache, and EffectRenderer's FBO pool all still hold objects created on the lost context. Canvas.tsx's render loop (line 525) only skips frames while isContextLost() is true; the moment the context is restored it resumes calling grid.render/shapeRenderer.render, which do gl.useProgram on invalidated programs — every draw fails with INVALID_OPERATION and the editor canvas remains blank until a full page reload. Trigger: any context loss (GPU driver reset, mobile tab backgrounding, or the browser evicting the oldest context when too many are created — which the per-export context creation in exportService makes reachable).

_Suggested fix:_ On restore, clear programs/buffers maps and reset currentProgram/currentVAO; have Canvas register a restore handler that disposes and recreates Grid/ShapeRenderer (or rebuild all tracked resources inside WebGLRenderer).

### 42. [high] packages/core/src/SceneGraph.ts:446 _(crash)_

**fromJSON accepts cyclic children arrays and nodes with missing/non-array children, causing stack-overflow crashes or infinite-loop hangs when the graph is later traversed.**

fromJSON (lines 419-459) validates only that each node has a string id and that node.parent exists; it never checks that node.children is an array, that children references are acyclic, or that parent chains terminate. A .quar file containing nodes A and B with A.children=["B"], B.children=["A"], rootNodeIds=["A"] passes both projectSerializer.validateProjectData (which only checks id/type/transform) and fromJSON, and the very next traverse()/traverseVisible() call (render loop, layer panel) recurses A→B→A→... until RangeError: Maximum call stack size exceeded; removeNode(A) also recurses infinitely because the node is only deleted from the map after its children are processed (line 122). A parent cycle (A.parent="B", B.parent="A") makes getWorldTransform (line 311) recurse infinitely and makes the while-loops in isAncestorOf (line 287) and getEffectiveOpacity (line 335) spin forever, freezing the tab. A node serialized without a children field throws 'node.children is not iterable' in traverse. Note getDescendants has a visited-set (line 261) but traverse, traverseVisible, invalidateWorldTransform, and removeNode do not. addNode/moveNode prevent cycles for in-app edits, so fromJSON is the only unguarded entry point — and it already tries to sanitize bad data (orphan-parent fix at lines 446-450), so this is a validation gap, not a policy choice.

_Suggested fix:_ In fromJSON, coerce node.children to a valid array of existing ids, and run a cycle check (e.g., iterative DFS with a visited set from rootNodeIds, dropping back-edges); alternatively rebuild children arrays purely from validated parent pointers.

### 43. [high] packages/core/src/svg/svgConverter.ts:424 _(correctness)_

**Group transform Y-flip formula shifts all group children by viewBoxHeight: position.y is set to viewBoxHeight - ty instead of -ty.**

Claim is accurate as stated, with one nuance: besides the sole-root case, the uniform importSvg offset also happens to cancel the error between multiple roots that are ALL transformed groups (the +viewBoxHeight offset is common to them and drops out of relative placement). The error is visible whenever a transformed group coexists with untransformed roots (plain shapes or groups without a transform attribute, which skip the flip entirely due to the `if (el.transform)` guard), and always for transformed groups nested inside other groups, which importSvg never offsets. Fix: position.y should be -ty (relative delta), and rotation should be negated to match buildTransform/buildCenteredPathTransform.

_Suggested fix:_ In convertGroup, set position = {x: tx, y: -ty}, negate rotation (and flip skew) to match buildTransform's Y-flip conventions, instead of applying viewBoxHeight.

### 44. [high] packages/core/src/svg/svgConverter.ts:543 _(correctness)_

**buildTransform applies only the translation components of an element's SVG transform to its center, so any transform containing rotation/scale (rotate(a), scale(k), matrix with rotation) places the element at the wrong position.**

The correct center is M \* (cx, cy) — the full matrix applied to the center point — as the code's own comment states ('We need to transform the center point through it'). Instead lines 543-546 compute centerX + decomposed.position.x, i.e. center + translation only. Failure case: <circle cx="50" cy="0" r="10" transform="rotate(90)"/> in SVG renders at (0, 50); import yields position (50, viewBoxHeight-0) with rotation -90 — the circle stays at its untransformed spot. Same for transform="scale(2)" (center should double: (100,100) not (50,50)) and for Illustrator's ubiquitous baked matrix(...) transforms whose linear part is non-identity. buildCenteredPathTransform (line 508) has the identical defect for paths/polygons/lines. Only pure-translate transforms import correctly.

_Suggested fix:_ Compute the transformed center via parseSvgTransformToMatrix and apply the full affine to (centerX, centerY) before the Y-flip, keeping the decomposed rotation/scale/skew for the node transform.

### 45. [high] packages/core/src/svg/svgExporter.ts:396 _(correctness)_

**Text (and image) elements are exported inside the global scale(1,-1) Y-flip group without a counter-flip, so all exported text and images render vertically mirrored (upside-down).**

exportNodesToSvg wraps every element in <g transform="scale(1,-1) translate(...)"> (line 585) to convert Quar Y-up to SVG Y-down. That works for geometry the exporter itself emits in Y-up space (paths, rects), but <text> glyphs and <image> pixel content are rendered by the SVG engine in its own Y-down space; placing them inside a scale(1,-1) group mirrors the glyphs/pixels about the baseline. textToSvg (line 396) and imageToSvg (line 412) emit no compensating scale(1,-1) on the element. Concretely: exporting a scene with a TextNode {content:"Hello"} produces an SVG where "Hello" is displayed flipped vertically in every browser; any ImageNode is likewise displayed mirrored. The existing tests only assert substrings (e.g. '<text', 'scale(1,-1)') so this is untested visually.

_Suggested fix:_ Append a local counter-flip to text/image elements, e.g. transform="translate(x,y) ... scale(1,-1)" so content renders upright inside the flipped root group.

### 46. [high] packages/core/src/svg/svgParser.ts:217 _(correctness)_

**Gradient coordinates given as percentages (x1="0%" x2="100%", the most common authoring form) are parsed with parseFloat, yielding 100 instead of 1.0 — gradients render wrong and round-trip corrupts.**

collectGradients does gradient.x1 = parseFloat(x1) etc. (lines 217-231) with no '%' handling, unlike parseGradientStops which does handle % offsets. Illustrator/Inkscape commonly emit <linearGradient x1="0%" y1="0%" x2="0%" y2="100%">. parseFloat("100%") = 100, so convertGradient produces end {x:0, y:100} where the Quar Gradient convention is normalized 0-1 (svgExporter.ts multiplies start/end by 100 to write percents, lines 117-120). Result: the imported gradient's end point is 100x outside the shape, so the shape renders as an essentially solid first-stop color; re-exporting writes x2="10000%". Additionally gradientUnits="userSpaceOnUse" coordinates (absolute pixels) are passed through un-normalized into the same 0-1 fields, producing equally wrong output silently.

_Suggested fix:_ Detect a trailing '%' and divide by 100; for userSpaceOnUse, normalize coordinates against the referencing shape's bounding box (or at least emit a warning and fall back to defaults).

### 47. [high] packages/core/src/svg/svgPathParser.ts:35 _(correctness)_

**Path tokenizer cannot parse SVG's compact arc-flag syntax (e.g. "a1 1 0 011 1"), producing short arg lists that the parser turns into NaN coordinates.**

The defect and impact are as claimed, but one mechanical detail is off: for an incomplete trailing arc with nonzero radii (the claim's own example 'M0 0a1 1 0 011 1'), NaN does not flow through arcToCubicBeziers into PathPoint positions — dTheta becomes NaN, so segments = Math.max(1, Math.ceil(NaN)) = NaN and the segment loop (0 < NaN is false) never executes, returning an empty array. That arc silently disappears (single-point subpath, then dropped by convertPath's length>=2 filter — shape invisible). NaN does reach PathPoint positions via two other routes, both verified by execution: (a) the arc poisons currentX/currentY, so any subsequent relative command (e.g. 'l5 0') emits NaN-positioned points; (b) when flag mis-tokenization shifts args so rx===0 (e.g. SVGO circle 'M8 0a8 8 0 100 16 8 8 0 100-16z'), the degenerate branch at lines 123-124 directly emits point {x: NaN, y: NaN}. Additionally, when the merged tokens happen to fill all 7 slots, flags are silently read as coordinates (largeArc=100, sweep=16, wrong endpoint), producing finite but wrong geometry — corruption even without NaN.

_Suggested fix:_ Tokenize arc arguments specially: when the current command is A/a and the flag positions (indices 3,4) are being read, consume exactly one digit [01]. Also validate token arg counts before use and skip/NaN-guard incomplete commands.

### 48. [high] packages/core/src/tools/EraserTool.ts:568 _(data-loss)_

**Point-mode eraser deletes points from locked and hidden path nodes, and can remove those nodes entirely.**

erasePoints uses sceneGraph.traverse (line 568), which visits every node regardless of visible/locked (SceneGraph.ts:363-381 has no filtering), and the callback never checks node.locked or node.visible. Stroke mode, by contrast, uses traverseVisible and explicitly skips locked nodes (lines 364, 376). Scenario: a user locks a finished path (or hides a background layer's path), switches the eraser to point mode, and clicks/drags over that area — points are stripped from the protected path, and if fewer than 2 points remain the node is pushed to pathsToRemove and deleted (line 587/604). Hidden paths are modified completely invisibly; the user only discovers the damage when re-showing the layer.

_Suggested fix:_ In the erasePoints traversal, early-return when node.locked or !node.visible (and consider skipping subtrees of hidden parents, matching traverseVisible semantics used by stroke mode).

### 49. [high] packages/core/src/tools/RectangleTool.ts:80 _(correctness)_

**Alt (center-origin) drag toward the left or up silently fails to create a rectangle because BaseTool.getRectFromPoints returns negative width/height in the fromCenter branch.**

BaseTool.getRectFromPoints (packages/core/src/tools/BaseTool.ts:185-192) returns { x: start.x - width, width: width \* 2, ... } for fromCenter and only normalizes negative dimensions in the non-center branch below. Alt-dragging from (100,100) to (50,60) yields width=-100, height=-80. During the drag the preview node gets negative width/height (degenerate render), and on pointer-up the check rect.width >= getMinimumSize() (line 80) fails, so no shape is created for roughly three of four drag directions when Alt is held. ArtboardTool.ts:74 shares the identical failure via the same helper. EllipseTool and PolygonTool are unaffected because they use Math.abs/hypot in their own from-center math — confirming the omission is a bug. RectangleTool.test.ts and BaseTool.test.ts only exercise the down-right alt-drag.

_Suggested fix:_ Normalize the fromCenter result in BaseTool.getRectFromPoints: use absolute width/height, e.g. return { x: start.x - |width|, y: start.y - |height|, width: |width|*2, height: |height|*2 }.

### 50. [high] packages/core/src/tools/SelectionTool.ts:328 _(coordinate-space)_

**Move drag adds the world-space delta directly to a node's local transform.position, so children of scaled/rotated groups move at the wrong speed/direction and snap against the wrong grid.**

Claim is accurate as written. One addition: the arrow-key nudge path (SelectionTool.ts:511-523) has the identical defect — `vec2.add(node.transform.position, delta)` with a world-space nudge delta, plus the same local-vs-world snapNodePosition mismatch — so a fix should cover both the drag-move and nudge paths.

_Suggested fix:_ Convert the world delta into the parent's local frame via the inverse of the parent's world transform (linear part) before adding it to the stored start position, as performResize already does.

### 51. [high] packages/core/src/tools/SelectionTool.ts:347 _(data-corruption)_

**A mere click on a node (no drag) fires onTransformComplete('move'), inserting spurious position keyframes into the animation timeline.**

onPointerDown on a node always sets mode='moving' and fills moveStartPositions; onPointerUp only checks `mode === 'moving' && moveStartPositions.size > 0`, which is true for a zero-movement click, and calls autoReparentAfterMove + onTransformComplete(selectedIds,'move'). In apps/web/src/hooks/useCanvasTools.ts, onTransformComplete adds keyframes when autoKeyframe is ON, or even when OFF if the property already has a track (shouldKf). So simply clicking to select an animated node while the playhead is at frame N inserts transform.position.x/y keyframes at frame N with the currently-evaluated interpolated value, freezing the interpolation there and polluting the user's animation. The tool already tracks moveUndoPushed (set only on first real move) but does not use it to gate completion. The same applies to a click on a resize handle without dragging (mode='resizing' branch fires onTransformComplete('resize'), keyframing width/height/position).

_Suggested fix:_ Gate the 'moving' completion branch on moveUndoPushed (actual movement) and the resizing/rotating branches on an equivalent did-drag flag, mirroring DirectSelectionTool's hasDragged.

### 52. [high] packages/core/src/tools/SelectionTool.ts:488 _(correctness)_

**Ctrl+A selects every node including descendants of groups, so a subsequent drag or arrow-nudge moves nested children twice (parent delta plus own delta).**

The defect is real exactly as claimed for the group+child double-move (drag and arrow-nudge), but the deep-nesting multiplier is linear, not exponential: a node at depth d whose d ancestors are all selected moves (d+1)x the delta (world position is the sum of ancestor local positions, each incremented once per nudge/drag), not 2^depth. Additionally, for children under rotated or scaled groups the duplicate delta is applied in the child's local space, so the visual error is a skewed/scaled displacement rather than a clean 2x offset — arguably more visibly corrupting. Both the core tool's own Ctrl+A handler and the web app's store-level selectAll (editorStore.ts:1686, Canvas.tsx:1495) feed descendant-inclusive selections into the same unfiltered move/nudge loops.

_Suggested fix:_ Either make Ctrl+A select only scope-level (root) nodes, or filter the move/nudge/resize loops to skip any node whose ancestor is also in the selection.

### 53. [high] packages/core/src/tools/SelectionTool.ts:555 _(feature-bypass)_

**Locked nodes are fully selectable, movable, resizable, rotatable, and deletable via the canvas — node.locked is never checked by SelectionTool or DirectSelectionTool.**

hitTest/getNodesInRect traverse with traverseVisible and never consult node.locked; neither do the move/resize/rotate loops nor the Delete key handler (line 395). Concrete scenario: user locks a background layer via the Layer panel or canvas context menu (LayerPanel.tsx line 459 sets locked), then clicks it on canvas -> it is selected and can be dragged, resized, or deleted with the Delete key, defeating the entire purpose of locking. EraserTool.ts line 376 explicitly skips locked nodes ('Skip locked nodes'), confirming locked is meant to protect nodes from canvas edits; the two selection tools simply omit the check. DirectSelectionTool likewise edits vertices of locked paths.

_Suggested fix:_ Skip nodes with node.locked in SelectionTool.hitTest/getNodesInRect and DirectSelectionTool's hitTestNode/getPathNodes/getImageNodes, and filter locked ids out of move/resize/rotate/delete operations.

### 54. [high] packages/core/src/tools/SelectionTool.ts:1102 _(coordinate-space)_

**Resizing a rotated shape applies the raw world-space drag delta to the un-rotated bounds, so handles resize along the wrong axis (or not at all).**

For a single rotated node, getSelectionBoundsForDisplay returns un-rotated bounds plus rotation, and TransformHandles.hitTest correctly inverse-rotates the click point so the user can grab the visually-rotated handle (verified by test 'should preserve initial rotation offset...'). But performResize computes `delta = vec2.subtract(worldPos, this.startPoint)` in world axes and feeds it into calculateNewBounds, which adds delta.x to width / delta.y to height of the un-rotated rect. Concrete scenario: rectangle rotated 90 degrees; the logical 'right' handle appears visually at the top; user drags it upward (outward) -> delta = (0, +d), 'right' case does width += delta.x = 0, nothing happens; dragging the mouse sideways instead stretches the shape perpendicular to the mouse motion. At 180 degrees the resize direction is inverted (dragging outward shrinks the shape).

_Suggested fix:_ Rotate the world delta by -rotation (about bounds.center) into the un-rotated bounds frame before calling calculateNewBounds, and map the resulting position back through the rotation.

### 55. [high] packages/core/src/tools/WeightPaintTool.ts:230 _(correctness)_

**Weight paint brush compares the world-space cursor against node-LOCAL tessellated vertices, so painting lands at the wrong location for any bound node not at the world origin.**

paintAtWorldPosition gets vertices via context.getTessellatedVertices, which returns ShapeRenderer.geometryCache vertices. Those are node-local (ShapeRenderer.renderRectangle builds createRectanglePath(-w\*anchor.x, ...) and the shader applies u_model; bindMeshToBones in apps/web/src/stores/editorStore.ts:988 explicitly transforms these same vertices 'local space to world space' before using them). WeightPaintTool passes them straight into paintAtPositionWithVertices(worldX, worldY, vertexPositions), which computes dx = vx - worldX as if they were world coords. For a 100x100 rectangle bound at position (400,300), its local vertices span roughly ±50 around origin; clicking on the visible shape at world (400,300) finds no vertex within the 30-unit brush radius (distance ~500), so nothing paints — while clicking near empty canvas at world (0,0) paints the mesh. The method's own doc comment ('Uses the node's world transform to convert local tessellation vertices to world space') describes a conversion that is never performed. Tests only call paintAtPositionWithVertices directly with hand-made positions, hiding the mismatch.

_Suggested fix:_ In paintAtWorldPosition, transform each cached local vertex by sceneGraph.getWorldTransform(boundNodeId) before the distance test (or inverse-transform the cursor into local space and scale brushRadius accordingly).

### 56. [high] packages/export/src/lottie/lottieConverter.ts:73 _(correctness)_

**Layers get ip:0/op:duration while the animation uses ip:startFrame/op:endFrame, so any export with startFrame > 0 produces a completely blank Lottie.**

Root cause and mechanism as described are correct (layer op=duration with ip=0/st=0 vs composition ip=startFrame/op=endFrame; keyframes absolute). The exact blank region in the failure scenario is off, though: layer op = endFrame - startFrame, so the composition plays [startFrame, endFrame] but each layer disappears at frame (endFrame - startFrame). The blank tail spans composition frames [endFrame - startFrame, endFrame] — i.e. the final `startFrame` frames of the export are empty. For startFrame=30/endFrame=90 that is frames 60..90 (the last 30 frames), not the "endFrame - 2\*startFrame..endFrame" range the report states. The start of the range renders fine because layer ip=0 <= startFrame. So it is not a "completely blank" export (as the headline claim says) unless startFrame >= endFrame - startFrame; it is a partially-blank export whose blank tail grows with startFrame.

_Suggested fix:_ Set layer ip=startFrame and op=endFrame (keyframe times are already absolute), or shift all keyframe times by -startFrame and use ip:0/op:duration at both levels.

### 57. [high] packages/export/src/lottie/lottieConverter.ts:277 _(correctness)_

**Group children have their parent-local position flipped with canvasH, displacing every group child by the full canvas height.**

groupToLottieShapes emits each child's shape-group transform as p: [x, canvasH - childNode.transform.position.y]. But this position is in the LAYER's local space: the group layer itself is already placed at flipY(group position) by buildLottieTransform (line 473-480). A group created by groupSelection (apps/web/src/stores/editorStore.ts:1698-1742) sits at (0,0) with children keeping their world coordinates, so the group layer lands at comp-Y = canvasH and a child at world y=Y ends up at comp-Y = canvasH + (canvasH - Y) = 2\*canvasH - Y — an entire canvas height below its correct position (typically off-canvas). Correct local Y-up->Y-down conversion for a child offset is y -> -y, not canvasH - y. Tests (lottieConverter.test.ts:578-596) only cover empty groups, never child positioning.

_Suggested fix:_ Use `k: [x, -y]` for child positions inside groups (plus the same local-geometry Y-flip fix).

### 58. [high] packages/export/src/lottie/lottieConverter.ts:318 _(correctness)_

**Local shape geometry is never Y-flipped, so exported paths, polygons, and stars render vertically mirrored about their anchor.**

The claim's headline ('paths, polygons, and stars render vertically mirrored') mis-attributes the breakage: polygons and stars are actually CORRECT — generatePolygonPoints deliberately Y-flips via the -π/2 phase to convert Quar Y-up local geometry into Lottie Y-down, matching the layer transform's positive-scale convention. The broken case is PathNode geometry only (pen/brush primary path at lottieConverter.ts:191 and subpaths at line 202): pathPointsToLottieVertices does NOT apply the required Y-flip, so exported paths render mirrored about the horizontal axis through the node origin. Bezier handle offsets are relative so they invert correctly with the position under a flip, but only if a flip were applied — since none is, both vertex Y and handle Y are wrong. The fix is to negate y for vertices and handle offsets in pathPointsToLottieVertices (matching the polygon convention), not to change the layer transform.

_Suggested fix:_ Negate the y of vertices and handles in pathPointsToLottieVertices (and in generatePolygonPoints output), keeping rotation negation and position flip as-is.

### 59. [high] packages/export/src/lottie/lottieConverter.ts:472 _(correctness)_

**Layer anchor is set to [w*ax, h*ay] while rect/ellipse shapes are emitted centered at local [0,0], displacing every rectangle by half its size and every ellipse by its radius in the exported Lottie.**

In Quar, the anchor is the local origin: ShapeRenderer.renderRectangle builds the rect at (-w*anchor.x, -h*anchor.y, w, h) and renderEllipse uses createEllipsePath(0,0,rx,ry), so transform.position is the pivot and (for anchor 0.5) the shape center. The exporter emits the rc/el shape at local p=[0,0] but sets the layer anchor a=[w*ax, h*ay] (e.g. [50,25] for a 100x50 rect). Lottie renders comp = p + R*S*(local - a), so the rect center lands at position - (w/2, h/2): a rect at Quar (100,200) on a 500-high canvas renders at (50,275) instead of (100,300), and rotation orbits a corner instead of spinning about the center. Ellipses are displaced by (rx, ry). Tests only assert a.k = [50,50], never rendering fidelity.

_Suggested fix:_ Set anchor a=[0,0] and place the shape at its local offset relative to the pivot (rect center at [w*(0.5-ax), -h*(0.5-ay)] after Y-flip; ellipse at [0,0]).

### 60. [high] packages/export/src/lottie/lottieConverter.ts:481 _(correctness)_

**Animated rotation keyframe values are not negated, so keyframed rotation plays in the opposite direction (and static single-keyframe rotation is un-negated too).**

buildLottieTransform passes r: trackToLottieAnimated(rotTrack, -transform.rotation) — the negation is only on the default used when NO track exists. When a rotation track exists, trackToLottieAnimated (lottieKeyframes.ts:77-98) emits raw kf.value through the identity ValueTransform, un-negated. Compare position (flipY transform applied to every keyframe via positionTracksToLottie) and the file's own convention comment at line 434 ('Y-flip negates rotation') and the group-child static case at line 279 (k: -childNode.transform.rotation). Concrete: a node statically rotated 45° exports r=-45, but the same node with two rotation keyframes at 45 exports r animating 45->45 — the exported pose flips sign the moment a keyframe is added, and rotation animations play mirrored relative to the editor.

_Suggested fix:_ Pass a negate transform: trackToLottieAnimated(rotTrack, transform.rotation, (v) => -v).

### 61. [high] packages/export/src/lottie/lottieKeyframes.ts:124 _(correctness)_

**All named easing presets (every option in the Timeline easing menu) export as hold keyframes, turning smooth animation into stepped jumps.**

The literal `h=1` hold applies to the single-value keyframe path (quarKeyframeToLottie): rotation, opacity, stroke width, and corner radius tracks freeze then snap. The multi-value path (positionTracksToLottie, lottieKeyframes.ts:180-184) has a slightly different but equally wrong failure mode: on a null tangent it sets neither `h` nor `i`/`o`, so position/scale keyframes silently drop their intended easing (renderer falls back to default/linear interpolation) rather than producing a literal hold. Either way, no non-linear named easing preset is exported with its actual curve, and the baking fallback that would fix it is never wired into the converter.

_Suggested fix:_ Map named cubic easings to their bezier control-point equivalents (or extend easingToBezierPoints), and wire bakeTrackToLinearKeyframes for genuinely non-bezier easings (bounce/elastic/spring).

### 62. [high] packages/rigging/src/ik.ts:351 _(correctness)_

**positionsToRotations sets the chain-root bone's LOCAL rotation to its solved WORLD angle, ignoring the root bone's parent world rotation, so IK breaks for any rig nested under a rotated/scaled group or symbol instance.**

Accurate as stated, with one nuance: the failure is driven by parent ROTATION (and non-uniform scale/skew), not uniform scale — a uniformly scaled parent does not change angles and would not break the solve. The root cause and the group/symbol-instance scenario are correct, and the same defect additionally affects any IK chain whose root bone has a rotating parent bone (e.g. a chainDepth-limited chain), not only non-bone parents.

_Suggested fix:_ In applyIKResult/positionsToRotations, read the root bone's parent world rotation from the scene graph (as applyChainToBones does) and subtract it: localAngle = normalizeAngle(worldAngle - parentWorldRotation).

### 63. [high] packages/rigging/src/ik.ts:428 _(performance)_

**applyIKResult unconditionally calls updateNode on every bone every RAF frame, causing a permanent 60fps React re-render storm across the whole UI whenever any IK chain exists**

The mechanism and conclusion are correct; one minor technical refinement: applyIKResult calls updateNode once per bone, so multiple 'nodeChanged' emits fire within a single synchronous RAF callback. Under React 18 automatic batching these coalesce into one re-render per subscribing component per frame (not one per bone). This does not weaken the finding — it is still a permanent ~60fps re-render storm of Canvas, Timeline, and LayerPanel (each with full scene-graph traversals) for as long as any enabled IK chain exists and playback is stopped, which is the normal rigging edit state. The fix is a value-equality guard in applyIKResult (skip updateNode when clamped equals the bone's current rotation) and/or a dirty check in SceneGraph.updateNode before emitting.

_Suggested fix:_ In applyIKResult, skip updateNode when |newRotation - bone.transform.rotation| < epsilon. Additionally consider a silent/batched update path for per-frame solver writes that does not emit nodeChanged per bone.

### 64. [high] packages/rigging/src/smartBones.ts:162 _(correctness)_

**When the driver value is below the first morph target, evaluateSmartBoneAction applies that target's offsets at FULL strength instead of scaling them, so a single-target Smart Bone action deforms the mesh permanently regardless of bone rotation.**

Precisely: the defect affects the region where currentDriverVal is below the smallest target's driverValue (the `!lower` branch at line 160-162), not literally 'regardless of bone rotation'. For a single target it spans the entire range below that target's driverValue (e.g. [0,90) for a 90° target), fully deforming the mesh at rest. The past-last-target branch (line 163-165, holds the last target) is a reasonable clamp; the flaw is specifically the missing ramp-from-zero before the first target, which the dead 'scaled by position' comment confirms was intended.

_Suggested fix:_ When currentDriverVal < first target's driverValue, interpolate from zero offsets at rangeMin to the first target: t = (currentDriverVal - rangeMin) / (firstTarget.driverValue - rangeMin), offsets = interpolateMorphOffsets([], upper.offsets[nodeId] ?? [], t).

### 65. [medium] apps/web/src/components/canvas/GradientHandleOverlay.tsx:153 _(data-loss)_

**Dragging gradient handles mutates the node via sceneGraph.updateNode without ever calling pushUndo, so a gradient drag creates no undo entry and Ctrl+Z afterwards jumps back past the previous operation as well.**

The core finding is fully accurate. Two refinements worth noting. (1) The reverted move is recoverable via redo, so the primary damage is broken undo granularity (two logical edits collapse into one undo step and the gradient edit has no entry of its own) rather than unconditional destruction of prior work. (2) A genuine hard data-loss path also exists from the same root cause: because a gradient drag calls markDirty but NOT pushUndo, it does not clear redoStack. So the sequence [move shape -> Ctrl+Z (redoStack now holds post-move snapshot) -> drag gradient handle -> Ctrl+Y] will redo the stale snapshot via sceneGraph.fromJSON and silently overwrite/destroy the gradient edit with no way to recover it. This justifies the data-loss category. Medium severity is appropriate.

_Suggested fix:_ Call `useEditorStore.getState().pushUndo(sceneGraph)` once in handlePointerDown when a handle drag begins, before the first updateNode.

### 66. [medium] apps/web/src/components/canvas/GradientHandleOverlay.tsx:168 _(memory-leak)_

**Document pointermove/pointerup listeners registered on handle drag are not cleaned up on unmount, so pressing Escape mid-drag dismisses the overlay while the invisible drag keeps mutating the gradient until the next pointerup.**

handleDragStart adds document pointermove/pointerup listeners (lines 168-169) that are removed only by the onPointerUp closure (lines 162-166). The same component registers an Escape handler (line 182) that calls clearEditingGradient(), which unmounts the overlay (Canvas.tsx renders it conditionally on editingGradient, line 2296). Concrete scenario: start dragging a gradient handle, press Escape while the button is still down — the overlay disappears, but the orphaned pointermove listener keeps firing, calling sceneGraph.updateNode/markDirty and changing the gradient of the now-uneditable node with every mouse move until the next pointerup anywhere. CanvasRuler (cleanupRef, lines 130-136) and GuideOverlay (guideCleanupRef, lines 67-73) both implement the unmount-cleanup pattern this codebase uses for exactly this situation; GradientHandleOverlay omits it.

_Suggested fix:_ Store a cleanup function in a ref (like GuideOverlay's guideCleanupRef) and invoke it both on unmount and in the Escape handler, resetting draggingRef.

### 67. [medium] apps/web/src/components/canvas/GuideOverlay.tsx:195 _(correctness)_

**Guide deselection via `handleSvgPointerDown` is unreachable: the SVG root has `pointerEvents: 'none'` so empty-area clicks pass through, and guide-line clicks call stopPropagation, so a selected guide can never be deselected by clicking.**

The root `<svg>` (line 191) sets `pointerEvents: 'none'`, so pointer events on empty areas never target the svg and `onPointerDown={handleSvgPointerDown}` (line 195) cannot fire from a direct hit; the only elements receiving events are the hit-area lines (`pointerEvents: 'stroke'`, line 215/242) whose handler `handleGuidePointerDown` calls `e.stopPropagation()` as its first statement (line 135), preventing bubbling to the svg handler. Result: `setSelectedGuideId(null)` at line 180 is dead code; after clicking a guide once it remains selected (thicker 2px stroke) forever, keeping the global Delete listener armed (see the Delete-key finding) with no way to clear it except deleting the guide.

_Suggested fix:_ Deselect on pointerdown of the underlying canvas (e.g., subscribe to canvas pointerdown or a store selection change), or remove stopPropagation and give the svg root a hit surface; alternatively clear `selectedGuideId` whenever the editor selection changes or any non-guide pointerdown occurs on window.

### 68. [medium] apps/web/src/components/canvas/TextEditOverlay.tsx:37 _(correctness)_

**The text-edit textarea is positioned from the node's local transform.position instead of its world transform, so editing a text node inside a moved group or artboard places the textarea at the wrong screen location.**

Lines 36-39 compute `worldTopLeft` from `node.transform.position` and `node.transform.scale` only — no `sceneGraph.getWorldTransform(node.id)` like DirectSelectionOverlay/BoneOverlay use, and rotation is ignored too. SelectionTool supports entering groups by double-click and then entering text edit on a child text node (SelectionTool.ts:206-227), and groups start with identity transform but acquire a translation as soon as the user drags the group. Scenario: create a text node, group it with a shape (Ctrl+G), drag the group 300px to the right, double-click into the group, double-click the text -> the editing textarea appears 300px to the left of the rendered text, over empty canvas.

_Suggested fix:_ Compute the anchor point with the node's world matrix (pass sceneGraph and use getWorldTransform, transforming the local bounds top-left through it) before converting with camera.worldToScreen.

### 69. [medium] apps/web/src/components/canvas/WeightPaintOverlay.tsx:22 _(correctness)_

**The weight-paint brush circle reads `weightPaintBrushSize` from the editor store, which is never synced with the WeightPaintTool's actual brush radius, so after pressing [ or ] the displayed circle no longer matches the painted area.**

WeightPaintTool keeps its own `brushRadius` (packages/core/src/tools/WeightPaintTool.ts:36) adjusted by `[`/`]` keys (lines 197-200, clamped 5-200) and paints in world units against that value (line 264). The store's `weightPaintBrushSize` (editorStore.ts:929) defaults to 30 and its setter `setWeightPaintBrushSize` has zero call sites anywhere in the app, so the overlay circle is permanently 30 world units. Scenario: enter weight-paint mode, press `]` several times to grow the brush to 100 -> the cursor circle still shows radius 30 while painting affects vertices within radius 100; the user paints far outside the visual indicator. PointMagnetOverlay demonstrates the correct pattern by reading `pmTool.getBrushRadius()` from the tool itself.

_Suggested fix:_ Read the radius from the WeightPaintTool instance like PointMagnetOverlay does (pass toolManager and call getBrushRadius on mousemove), or make the tool write radius changes to the store.

### 70. [medium] apps/web/src/components/common/ColorPicker.tsx:71 _(duplication)_

**Color<->hex conversion is independently implemented in at least 7 places and has already drifted: the UI copies break on the fractional/overshoot channel values the animation engine deliberately produces.**

Two description errors that don't invalidate the finding: (1) None of PropertiesPanel/GradientEditor/ColorPicker use `<input type="color">` — a grep for type="color" in all three returns nothing. The malformed hex is fed to `type="text"` inputs and to CSS `backgroundColor` on swatches (browsers silently ignore an invalid CSS color, so the visible symptom is a wrong/absent swatch color plus garbled text, not a crash). (2) In ColorPicker the malformed hex surfaces in the initial `hexInput` state (line 154), not in `currentHex` (line 365): currentHex derives from hsvToRgb which always Math.rounds, so it is well-formed. The bad hexInput self-corrects on the first pointer interaction or on blur (onBlur resets to currentHex). Net user impact: transient/cosmetic malformed hex text on picker open for in-range fractional frames; malformed swatch/text for out-of-range overshoot frames in the round-only converters. The maintainability/drift concern across 7+ copies is the substantive part.

_Suggested fix:_ Add one shared color module in @quar/core (colorToHex with round+clamp, hexToColor, normalized variants) and replace all copies; add a parity test for the Python implementation.

### 71. [medium] apps/web/src/components/common/ExportDialog.tsx:151 _(data-loss)_

**A filename pattern without the {N} placeholder makes every frame get the same zip entry name, so the exported PNG-sequence zip silently contains only the last frame.**

Accurate as described. Note the identical defect also exists in the reusable library function exportPngSequence (packages/export/src/pngSequence.ts:80), not only the ExportDialog UI path, so a fix should live in generateFrameFilenames or add validation in both call sites.

_Suggested fix:_ Validate the pattern before export (require '{N}') or append the frame index when the pattern lacks the placeholder.

### 72. [medium] apps/web/src/components/common/ExportDialog.tsx:190 _(ui-state)_

**Cancelling an export leaves the dialog permanently stuck in the progress view because `exporting` is never reset to false on the cancellation path.**

The defect is exactly as described. One refinement to the impact framing: the header X close button (line 346) is always active during export, so the user does have a working escape hatch to close the dialog and start over. Because there is a workaround and no crash or data loss — only a broken cancel-and-retry flow that requires closing/reopening the dialog — the severity is better characterized as medium than high.

_Suggested fix:_ After the try/finally (or in a dedicated cancellation branch), reset state: `setState(s => ({...s, exporting: false, progress: null, cancelled: false}))` when cancelledRef.current is true.

### 73. [medium] apps/web/src/components/common/ExportDialog.tsx:346 _(correctness)_

**The header X button is not disabled during export; clicking it hides the dialog while the export keeps running invisibly and later triggers an unexpected download.**

The backdrop mousedown handler checks `!state.exporting` (line 331) and the tabs are disabled while exporting, but the header close button (line 346) always calls `close()` without setting cancelledRef. During a long PNG-sequence export, clicking X unmounts the dialog, yet the async loop in handleExport keeps rendering frames (cancelledRef is still false), consuming CPU/GPU with no visible progress or way to cancel, and finally calls downloadBlob + close on the unmounted component — the user gets a surprise zip download after they thought they dismissed the export.

_Suggested fix:_ During export, either disable the X button or make it set `cancelledRef.current = true` before closing.

### 74. [medium] apps/web/src/components/common/ExportDialog.tsx:400 _(validation)_

**Typed width/height and frame-range values are not clamped or cross-validated, producing silently broken exports (oversized canvases, empty zips).**

Accurate overall. One refinement: the oversized-canvas failure mode is browser-dependent — some browsers throw during WebGL/canvas allocation (caught by the try/catch at ExportDialog.tsx:321-324, which only console.errors and resets exporting state — still silent to the user) rather than returning null from toBlob (the line-183 skip path). The frame-range inversion (start>end → getFrameCount 0 → empty 'png-sequence.zip' downloaded as apparent success) is the fully deterministic, provable instance of the defect.

_Suggested fix:_ Clamp width/height to [1, 8192] in the onChange handlers, validate startFrame <= endFrame before enabling Export, and surface an error instead of downloading an empty archive.

### 75. [medium] apps/web/src/components/layout/Canvas.tsx:354 _(stale-state)_

**boneNodes/ikTargetNodes/artboardNodes memos keyed only on sceneGraphVersion go stale after undo/redo, page switches, and symbol-edit transitions because SceneGraph.fromJSON emits no events.**

The stale arrays are keyed only on sceneGraphVersion, which is bumped exclusively by incrementVersion (Canvas.tsx:189) wired to nodeChanged/nodeAdded/nodeRemoved (lines 200-202). SceneGraph.fromJSON (SceneGraph.ts:419-459) atomically swaps this.nodes with no emit call, and every cited store transition uses it without a compensating event: undo (editorStore.ts:2839), redo (2866), switchPage (3088), enterSymbolEdit (3446), exitSymbolEdit (3468), plus addPage (2952) and deletePage (2986). Canvas is rendered with no key (Editor.tsx:96) so it is not remounted. The boneNodes/ikTargetNodes/artboardNodes memos (Canvas.tsx:354/366/379) therefore keep the previous scene's node references and are rendered by BoneOverlay (2331) and ArtboardOverlay (2319). Two corrections to the reported scenario: (1) it does not crash — getWorldTransform returns mat3.identity() for IDs no longer in the graph (SceneGraph.ts:305), so ghosts render at an origin/identity transform (misplaced) rather than at their old positions; (2) it is overlay-only — the WebGL canvas reads the live graph each RAF frame and is correct, and it self-heals on the next scene-graph mutation. Hence a transient overlay glitch, not data corruption or a crash — medium, not high.

_Suggested fix:_ Make fromJSON emit a scene-level 'reset'/'loaded' event (and subscribe to it in Canvas), or have the store bump an explicit scene revision in zustand after every fromJSON call and include it in these memo dependencies.

### 76. [medium] apps/web/src/components/layout/Canvas.tsx:553 _(performance)_

**Onion skinning re-evaluates the entire timeline and allocates fresh Sets/Maps/arrays for every ghost frame on every RAF frame, even when the playhead and scene are unchanged.**

Accurate as described, with one scoping nuance: the unconditional per-tick re-render (grid + full scene) is a broader architectural property of this WebGL editor, not unique to onion skinning. What is specifically wasteful and unmemoized is the onion-skin work: re-running getAnimatedNodes + evaluateNodeAtFrame per node per ghost frame and re-earcutting every ghost shape (ShapeRenderer.ts:1717) on every idle tick, all keyed only on the opt-in enabled flag and never cached against currentFrame/timeline. Only affects users who have onion skinning turned on (default enabled=false).

_Suggested fix:_ Hoist getAnimatedNodes out of the per-ghost-frame callback, and cache ghost-frame evaluation results keyed on (currentFrame, timeline revision, onion-skin settings), invalidating only when one of those changes.

### 77. [medium] apps/web/src/components/layout/Canvas.tsx:1007 _(performance)_

**setMouseWorldPos stores a fresh object on every mousemove with no equality bail-out, re-rendering the entire Canvas subtree at pointer-event rate while merely hovering.**

The claim's core is accurate. One refinement: the ~15 useMemo values in Canvas (lines 301-444) and memoized child values (e.g. CanvasRuler hTicks/vTicks) do NOT recompute, because mouseWorldPos is in none of their dependency arrays — only their cheap reference-equality dependency checks run (the claim correctly says "dependency checks"). The confirmed per-mousemove cost is therefore the full Canvas JSX re-evaluation plus render + reconciliation of every mounted, unmemoized overlay child, purely to update the status-bar coordinate text. Fix would be either an equality bail-out before setState (compare rounded x/y to previous), moving the readout into a small isolated component that subscribes to its own state, or memoizing the overlay children.

_Suggested fix:_ Bail out when the rounded x/y equal the previous state (functional updater returning the previous object), or move the coordinate readout into a tiny isolated component/store slice so the rest of the canvas tree doesn't re-render.

### 78. [medium] apps/web/src/components/layout/Canvas.tsx:1114 _(data-loss)_

**Date.now()-seeded node ID counters collide across rapid SVG pastes/drops, making the second import throw and be silently swallowed after already pushing an undo snapshot.**

The pushed snapshot is not strictly "junk data" — it is a valid capture of the state right before the second import. The accurate defect is that an EXTRA undo step is committed for an operation that fails: if the throw occurs before any node is added, the first post-paste Ctrl+Z restores an identical state (appears to no-op) and only the second Ctrl+Z undoes the original import; if some non-colliding nodes were added before the throw, Ctrl+Z strips that partial garbage rather than undoing the first import. Category is more precisely "silent-failure of a user action plus undo-stack pollution" than destruction of pre-existing scene data (the first import is preserved), though the user's second paste is effectively lost.

_Suggested fix:_ Use a collision-proof ID generator (crypto.randomUUID(), or Date.now() plus a random suffix per node like the image-paste path at line 1152), and surface import errors to the user instead of an empty catch.

### 79. [medium] apps/web/src/components/layout/LayerPanel.tsx:293 _(correctness)_

**Layer rename never works for nested layers: the recursive child renderer hardcodes isRenaming={false}.**

handleDoubleClick and the context-menu Rename item set renamingNodeId for any node, but child rows are rendered through LayerRowById with isRenaming={false} literally hardcoded (line 293), and LayerRowById never reads renamingNodeId from the store. Double-clicking or choosing Rename on any layer inside a group (or artboard) sets renamingNodeId but the InlineRenameInput never mounts — the action silently does nothing. Only root-level layers can be renamed.

_Suggested fix:_ Read renamingNodeId in LayerRowById (or thread it down) and pass isRenaming={renamingNodeId === nodeId}.

### 80. [medium] apps/web/src/components/layout/LayerPanel.tsx:771 _(correctness)_

**Drag state is never cleared when the pointer is released outside the panel (no pointer capture, no global pointerup), leaving a stale active drag.**

The core finding (stale dragState never cleared when the pointer is released outside the panel, due to no pointer capture, no global pointerup, and handlePointerLeave clearing only dropTarget) is correct, along with the phantom drop-indicator glitch on re-hover and the potential unintended reorder. However, the claim's third consequence — that didDragRef staying true swallows the next legitimate click on a layer — is incorrect. handlePointerDown (line 693) resets didDragRef.current=false on every left-button pointerdown on a row, and that pointerdown always precedes the row's onClick, so handleSelect (lines 421-424) sees false and selects normally. The swallowed-click impact should be removed from the description; the real impact is the phantom drop indicators and the possibility of an unintended (undoable) reorder.

_Suggested fix:_ Call setPointerCapture in handlePointerDown, or register a window pointerup/pointercancel listener while dragState is non-null that resets dragState, dropTarget and didDragRef.

### 81. [medium] apps/web/src/components/layout/PropertiesPanel.tsx:763 _(correctness)_

**Removing a fill/stroke/effect leaves behind index-based keyframe tracks, which then animate the wrong element or resurrect a malformed entry at the deleted index during playback**

Accurate as described, with one broadening: the corruption is triggered not only during playback but on any manual frame change / scrubbing, because usePlayback subscribes to currentFrame changes and calls applyAnimations even when paused (usePlayback.ts:96-101).

_Suggested fix:_ On fill/stroke/effect removal, delete tracks for the removed index and shift tracks with higher indices down (or key tracks by stable element ids instead of array position).

### 82. [medium] apps/web/src/components/layout/PropertiesPanel.tsx:1115 _(correctness)_

**Uniform corner-radius edits gate keyframing on the property string 'cornerRadius.undefined', so existing corner-radius keyframes are not updated and the edit is silently reverted**

Confirmed as described, with one timing nuance: the edit is not reverted synchronously. handleCornerRadiusChange does update the node immediately via sceneGraph.updateNode (line 1114/1141); the loss/divergence manifests on the next timeline re-evaluation (scrub or playback), when the stale 'cornerRadius.0' keyframe re-applies to corner 0 only. Scope is limited to the rectangle and image locked/uniform paths (lines 1115, 1142); the polygon uniform path is unaffected because it uses the correct literal 'cornerRadius' property.

_Suggested fix:_ When corner is undefined, gate on 'cornerRadius.0' (or check any of the four per-corner tracks) instead of interpolating undefined into the property string.

### 83. [medium] apps/web/src/components/layout/PropertiesPanel.tsx:1771 _(correctness)_

**Inner Radius keyframe indicator defaults an unset innerRadius to 1 instead of poly.radius, turning a regular polygon into a degenerate 1px-inner star when keyframed**

The display logic (line 1780) treats a missing innerRadius as poly.radius (`irRaw = poly.innerRadius ?? poly.radius`), but the indicator's toggle uses `toggleKeyframe('innerRadius', poly.innerRadius ?? 1)`. ShapeRenderer switches to createStarPath whenever node.innerRadius !== undefined (ShapeRenderer.ts:3991/1868). Scenario: create a regular hexagon (radius 50, innerRadius undefined — the IR field displays 50), click the Inner Radius keyframe diamond -> a keyframe with value 1 is created; on the next frame evaluation the hexagon is redrawn as an extreme spiky star with a 1px inner radius, contradicting both the displayed value and the shape the user keyframed.

_Suggested fix:_ Use the same default as the display: toggleKeyframe('innerRadius', poly.innerRadius ?? poly.radius).

### 84. [medium] apps/web/src/components/layout/PropertiesPanel.tsx:1845 _(data-loss)_

**Bone Length ScrubLabel calls pushUndo on every pointermove, flooding the 50-entry undo stack and destroying all prior undo history in a single scrub gesture**

Accurate except one nuance: the bone Length ScrubLabel is not using pushUndo "instead of" onScrubStart — it passes BOTH onScrubStart={handleScrubStart} (line 1840, which already snapshots once at gesture start) AND the extra pushUndo(sceneGraph) inside onChange (line 1845). So it double-snapshots: one snapshot at pointer-down plus one per pointermove. The bug is the fully redundant per-move pushUndo call; removing line 1845 (and analogously the redundant pushUndo already covered by other mechanisms) leaves the correct single-snapshot-per-gesture behavior. Severity medium is appropriate: it destroys undo history (loss of recoverability) but does not corrupt the actual scene document.

_Suggested fix:_ Remove pushUndo from the onChange/wheel paths; the existing onScrubStart={handleScrubStart} already snapshots once per gesture, matching the pattern used by all other properties.

### 85. [medium] apps/web/src/components/layout/Timeline.tsx:134 _(correctness)_

**Dope sheet only renders keyframes for root nodes, so keyframes on nodes inside groups are invisible and uneditable in the timeline.**

This finding bundles two independent, both-real defects at Timeline.tsx:134. (1) Correctness (the stated claim): because `nodes` is populated solely from getRootNodes(), keyframes on nodes nested inside groups animate at runtime (usePlayback uses getAnimatedNodes which includes children) but are never shown or editable in the dope sheet. (2) Performance (the stated failure scenario): the `nodeChanged` subscription re-runs `setNodes([...getRootNodes()].reverse())` with a new array reference on every updateNode, so during playback (per animated node per frame) and during shape drags (per pointer-move) the whole dope sheet re-renders and the O(nodes×tracks) nodeKeyframes useMemo rebuilds. Medium severity is appropriate for both.

_Suggested fix:_ Include descendant nodes (or roll child-track keyframes up onto the group row) when building the dope sheet layer/track lists.

### 86. [medium] apps/web/src/components/layout/Timeline.tsx:250 _(correctness)_

**After dragging a multi-selected group of keyframes in the dope sheet, the selection collapses to just the dragged keyframe.**

A pointer-captured drag (pointerdown/pointerup on the same keyframe div) still causes the browser to fire a click event on that element after pointerup. handleKeyframeClick then runs with shiftKey false and calls selectKeyframe(kfId), replacing the multi-selection with a single id. So: shift-select 3 keyframes, drag them together (works), release — selection silently collapses to 1; the next drag, delete, or easing change affects only that one keyframe instead of the intended three.

_Suggested fix:_ Set a didDrag flag in dragRef when any nonzero delta was applied and have handleKeyframeClick ignore the click that follows a real drag.

### 87. [medium] apps/web/src/components/layout/Timeline.tsx:357 _(correctness)_

**Dragging the work-area body past either timeline edge permanently shrinks the work area instead of preserving its width.**

For a 'body' drag, handleWorkAreaPointerMove calls setWorkAreaRange(initialStart+delta, initialEnd+delta); the store (editorStore.ts:1851-1857) clamps start to >=0 and end to <=duration-1 independently. With work area [50,100], dragging the body 70 frames left sets start=max(0,-20)=0 and end=min(299,30)=30 — the 51-frame region shrinks to 31 frames. Releasing the pointer there makes the shrink permanent, and the same compression happens against the right edge.

_Suggested fix:_ Clamp the delta before applying so both bounds shift together: delta = clamp(delta, -initialStart, (duration-1)-initialEnd).

### 88. [medium] apps/web/src/components/timeline/GraphEditor.tsx:504 _(shortcut-conflict)_

**GraphEditor's window-level Delete/arrow-key handler fires regardless of focus, so keypresses aimed at the canvas also delete or nudge keyframes.**

The keydown listener (lines 503-589) only checks timelineViewMode === 'graph' and selectedKeyframeIds.size > 0, not where focus is. Keyframe selection is not cleared when the user clicks the canvas. Scenario: graph editor open with keyframes selected, user clicks a shape on the canvas (canvas is focusable, tabIndex=0) and presses Delete to delete the shape — Canvas.tsx:1502 deletes the node AND this handler simultaneously deletes the selected keyframes (possibly belonging to other nodes). Likewise ArrowLeft/Right pressed to nudge a canvas shape also retimes the selected keyframes by 1 (or 10 with Shift) per press.

_Suggested fix:_ Scope the handler to the graph editor container (attach keydown to the focusable graph area element, or check that document.activeElement/event target is within the graph editor).

### 89. [medium] apps/web/src/components/timeline/GraphEditorPropertyList.tsx:43 _(ui-consistency)_

**Curve colors and property-list legend colors diverge whenever node selection filters tracks, because the two components count globalIndex differently.**

The claim is accurate as stated. Worth noting the divergence is actually broader than just the selection filter: GraphEditor also increments globalIndex for tracks hidden by the graphVisibleTracks visibility filter (lines 106-109), while GraphEditorPropertyList never filters by visibility at all. So toggling a track's eye-off can also shift remaining curve colors relative to the legend, even with no node selection. The selection-filter path described in the finding is the primary and most common trigger. Severity medium is appropriate — purely cosmetic (no data corruption) but actively misleads which curve maps to which property during editing.

_Suggested fix:_ Compute globalIndex identically in both places (extract a shared helper that returns tracks with stable indices) or key colors on trackId instead of a positional index.

### 90. [medium] apps/web/src/hooks/useCanvasTools.ts:733 _(type-safety)_

**deleteDirectSelectionPoints is returned from useCanvasTools and destructured in Canvas.tsx but is missing from the UseCanvasToolsReturn interface, producing TypeScript strict-mode errors that break `pnpm typecheck`.**

The hook is annotated `useCanvasTools(...): UseCanvasToolsReturn` (line 126), and the returned object literal at line 715-735 includes `deleteDirectSelectionPoints` (defined at line 705), but the interface (lines 44-86) declares only up through `marqueeRect` — no `deleteDirectSelectionPoints` member. Under strict TS this yields an excess-property error (TS2353) on the return literal, and Canvas.tsx line 175 destructuring `deleteDirectSelectionPoints` from the hook result yields TS2339 ('does not exist on type UseCanvasToolsReturn'). Runtime behavior is unaffected (JS ignores the types), but the project's `pnpm typecheck` gate fails on these two sites.

_Suggested fix:_ Add `deleteDirectSelectionPoints: () => void;` to the UseCanvasToolsReturn interface.

### 91. [medium] apps/web/src/hooks/usePlayback.ts:91 _(state-desync)_

**Store isPlaying is never reset when non-looping playback reaches the end, leaving the UI stuck in 'playing' state and blocking frame-step shortcuts.**

Core claim (store isPlaying never reset on non-looping end, blocking the four frame-step shortcuts and mislabeling the play button) is accurate. Minor correction to the failure scenario: Space is not the only escape. The transport "go to start" button calls the hook's stop() (usePlayback.ts:133-136) which sets isPlaying=false and recovers; Home/End still move the playhead since they do not guard on isPlaying. The state is therefore self-healing on the next transport interaction, not a permanent lock — hence medium rather than high severity (no data risk, recoverable), though it does break the documented keyboard-first scrubbing workflow after every non-looping play-to-end.

_Suggested fix:_ Add an onPlayStateChange/onComplete callback to PlaybackController (or poll ctrl.isPlaying in onFrameChange) and call setIsPlaying(false) from usePlayback when the controller self-pauses at the end.

### 92. [medium] apps/web/src/hooks/useProjectActions.ts:117 _(state-leak)_

**newProject does not reset guides, vitruvianControllers, dynamicChains, globalWind, ikChains, or smartBoneActions, so the old project's rigging state and guides bleed into (and get saved with) the new project.**

Two inaccuracies in the claim: (1) vitruvianControllers and dynamicChains ARE reset — clearHistory() at useProjectActions.ts:137 sets both to [] (editorStore.ts:2888-2889), so they do not leak on newProject and are not serialized. (2) ikChains and smartBoneActions are NOT part of getEditorSnapshot/serializeProject, so they are never written to the saved file; they only leak at runtime. The fields that actually persist across newProject are guides, globalWind (both serialized into the saved 'new' project) and ikChains, smartBoneActions (runtime-only). guides carry {id, axis, position} and do not reference node IDs. Stale ikChains evaluated each frame no-op safely because evaluateIKChains guards missing nodes (ikEvaluator.ts:23,40), so there is no crash or node corruption. openProject genuinely leaks ikChains and smartBoneActions (deserializeProject applyEditorState at projectSerializer.ts:422-436 omits both), and there is genuinely no isDirty confirmation or beforeunload guard on File>New / Ctrl+N.

_Suggested fix:_ Reset all rigging/guide state in newProject (and ikChains/smartBoneActions in deserializeProject/openProject), and add an isDirty confirmation before wiping the scene.

### 93. [medium] apps/web/src/hooks/useToolShortcuts.ts:57 _(correctness)_

**Tool shortcuts do not ignore focused <select> elements, so type-ahead in any native dropdown switches tools and preventDefault blocks the dropdown's own keyboard navigation.**

Accurate as described. Slight precision: the mechanism blocked is the native select's type-ahead letter search specifically (arrow-key navigation is unaffected since arrows are not tool shortcuts). The unexpected tool switch happens regardless. Reproducible for keys v/r/o/p/t/j/f whenever any native <select> has focus (blend mode, and the other 7 native selects in PropertiesPanel, plus any @quar/ui Select usage).

_Suggested fix:_ Add `tagName === 'select'` to the ignore condition, matching useProjectShortcuts.

### 94. [medium] apps/web/src/pages/Editor.tsx:31 _(data-loss)_

**Dirty-tracking subscribes to nodeAdded/nodeChanged/nodeRemoved but not nodeMoved, so layer drag-reorder never marks the project dirty and is silently lost.**

Accurate as written, with one refinement: there is no beforeunload guard at all in the web app, so the "close without warning" is not merely because isDirty is false but because no unsaved-changes prompt exists. Data loss is bounded to the case where a LayerPanel drag-reorder is the only change since the last save; any later edit that sets isDirty would persist the reorder on the next (auto or manual) save.

_Suggested fix:_ Add sceneGraph.on('nodeMoved', markDirty) to the subscription list.

### 95. [medium] apps/web/src/pages/Projects.tsx:127 _(correctness)_

**Project rename on the landing page silently fails for every project saved by the editor, because it JSON.parses binary ArrayBuffer data.**

The editor saves projects as binary: serializeProjectToBinary returns an ArrayBuffer (projectSerializer.ts:189-197) passed to dbSave. handleRenameCommit does JSON.parse(stored.data) (Projects.tsx:127) where stored.data is 'string | ArrayBuffer' (projectStorage.ts StoredProject). For binary projects JSON.parse coerces the ArrayBuffer to "[object ArrayBuffer]" and throws SyntaxError, which the catch block swallows with the comment 'Silently fail rename' (line 132-134). Result: double-click rename on any project card saved by the current editor version appears to work (input closes) but the name never changes, with no error shown.

_Suggested fix:_ Use parseQuarFile/writeQuarFile (which already handle both formats) for the rename round-trip, or store the display name only in the metadata record instead of rewriting the payload.

### 96. [medium] apps/web/src/services/exportService.ts:138 _(resource-leak)_

**Every PNG export creates a new WebGL2 context that is never explicitly released, so repeated exports exhaust the browser's WebGL context limit and force-evict the main editor canvas context.**

The finding is accurate except for one coupling error: the artboard-fill corruption cannot be triggered by canvasToBlob throwing. canvasToBlob runs at line 189, AFTER fills are restored at lines 184-186, and preloadTextures swallows its own image-load errors (img.onerror -> resolve, ShapeRenderer.ts:1072). So the fills-corruption window is only a throw from render() (line 181). The dispose-skip (context leak) does apply to a throw from any of preloadTextures/render/canvasToBlob, as stated.

_Suggested fix:_ After the blob is produced, call `renderer.context.getExtension('WEBGL_lose_context')?.loseContext()` (or add this to WebGLRenderer.dispose) and drop the canvas reference.

### 97. [medium] apps/web/src/services/exportService.ts:170 _(correctness)_

**PNG export mutates the live artboard (fills cleared) across await points with no try/finally, so an exception mid-export permanently strips the artboard background, and the mutation spuriously marks a clean project dirty.**

For artboard export with includeBackground=false, line 170 does `sceneGraph.updateNode(artboard.id, { fills: [] })`, then awaits preloadTextures (line 176) and calls shapeRenderer.render (line 181) before restoring fills at line 184. If render or preload throws (context loss, tessellation error on malformed path data), savedFills is never restored — the user's artboard background is silently deleted from the document, and a later save persists the loss; shapeRenderer.dispose()/renderer.dispose() (lines 195-196) are also skipped, leaking the GL program/buffers/context. Even on success, the two updateNode calls fire nodeChanged events that Editor.tsx (lines 28-36) turns into markDirty, so merely exporting a PNG flags a clean project as having unsaved changes and triggers an unnecessary autosave; the editor canvas can also visibly render the artboard without its background during the awaited preload.

_Suggested fix:_ Wrap the mutate/render/restore sequence and disposal in try/finally, or render the artboard background suppression via a renderer flag instead of mutating the scene graph.

### 98. [medium] apps/web/src/services/projectSerializer.ts:403 _(data-corruption)_

**deserializeProject replaces the live scene graph before timeline migration, which can throw on data that passes validateProjectData, leaving a half-imported state that autosave then persists over the old project.**

The claim's autosave trigger is inaccurate: SceneGraph.fromJSON does NOT emit nodeAdded/nodeChanged/nodeRemoved events (it bypasses the event system with a direct atomic swap at SceneGraph.ts lines 456-457; emit is only called by addNode/removeNode/moveNode/updateNode at lines 92/124/178/204). Editor.tsx (28-36) subscribes only to those three events, so the failed import does NOT automatically set isDirty, and autosave does not fire '30s later' on its own. The corruption-via-autosave requires either pre-existing unsaved edits (isDirty already true) or any subsequent user interaction that emits a node event, which then marks dirty. The guaranteed, immediate symptom is the inconsistent half-imported state (canvas shows imported nodes; store still identifies the old project with old pages/timeline/projectId); the overwrite of the old IndexedDB record is a plausible follow-on rather than the fully-automatic sequence described.

_Suggested fix:_ Validate timeline/tracks structure in validateProjectData, and/or run all migrations on a clone before touching the scene graph so deserializeProject is all-or-nothing.

### 99. [medium] apps/web/src/services/projectStorage.ts:123 _(performance)_

**listProjects uses getAll() on the projects store, deserializing every project's full binary payload just to build an id/name/updatedAt list.**

Each StoredProject.data can be up to a 50MB ArrayBuffer (upload limit in projectSerializer.ts line 471) plus large autosaved projects. `tx.objectStore(PROJECTS_STORE).getAll()` (line 123) materializes all records — including every project's full binary blob — into memory only for the map at lines 125-129 to keep three small strings. With, say, ten 30-50MB projects, opening the File > Open dialog (MenuBar handleOpen -> listProjects) or the Ctrl+O prompt allocates hundreds of MB and can noticeably jank or OOM a tab on low-memory devices.

_Suggested fix:_ Iterate with openCursor reading only key/metadata, or store metadata in a separate small store/index and query that for listings.

### 100. [medium] apps/web/src/stores/editorStore.ts:1641 _(data-loss)_

**pasteClipboard never sets isDirty, so paste/duplicate as the last edit is skipped by auto-save.**

Every other mutating action sets isDirty: true, but pasteClipboard's final set() only updates selectedNodeIds. duplicateSelection delegates to pasteClipboard so it is affected too. Auto-save is gated on isDirty (useProjectActions.ts:444: `if (isDirty && projectId ...)`), as is the unsaved-changes indicator. Scenario: open a saved project, Ctrl+V or Ctrl+D some artwork, do nothing else; auto-save never fires and closing the tab silently loses the pasted content.

_Suggested fix:_ Include isDirty: true in pasteClipboard's final set().

### 101. [medium] apps/web/src/stores/editorStore.ts:1660 _(correctness)_

**deleteSelection only cleans up IK chains when the ik-target node itself is deleted; deleting a bone that belongs to a chain leaves the stale chain and its orphaned target node in the scene.**

Core defect confirmed: deleteSelection (apps/web/src/stores/editorStore.ts ~1656-1672) removes an IKChain only when a deleted node has type 'ik-target'. Deleting a bone that is a chain's rootBoneId/endEffectorBoneId/middle bone leaves the IKChain in store state, and — because the IK target node is created as a root node (parent: null, line 1076-1097) rather than a descendant of the bone — removeNode never cascade-deletes it, so it stays orphaned/selectable on the canvas and is serialized into the .quar file. Likewise dynamicChains are filtered only by rootBoneId (line 1672), so deleting a non-root boneId leaves a stale chain. No test covers bone deletion for either chain type (editorStore.test.ts only tests deleting the ik-target node, line 2024, and deleting a rectangle, line 2040), so this is an unhandled gap, not intended behavior. Two corrections to the claim's failure narrative: (1) the phantom chain does NOT cause a crash or meaningful per-frame cost — evaluateIKChains no-ops because extractIKJoints returns [] for missing bones (ik.ts line 392-394 -> `if (joints.length === 0) continue`), and dynamic chains silently die because initializeChainState returns null on a missing bone (dynamicChain.ts line 105-108). The real harm is the orphaned target node plus stale persisted/serialized chain state, which fits medium severity rather than a crash. (2) 'poleTargetNodeId node is never considered' is misattributed to dynamicChains — DynamicChain has no poleTargetNodeId field (types/index.ts line 502-516); only IKChain does (line 384), and its pole target would indeed be orphaned as part of the IK-chain bug.

_Suggested fix:_ When deleting bones, remove (or repair) any IKChain whose bone path includes a deleted bone, delete its target/pole target nodes, and filter dynamicChains by membership in boneIds, not just rootBoneId.

### 102. [medium] apps/web/src/stores/editorStore.ts:1934 _(correctness)_

**updateKeyframeTimeAndValue can produce two keyframes at the same time on one track, violating the one-keyframe-per-frame invariant maintained everywhere else.**

The animation package's addKeyframe/moveKeyframe replace an existing keyframe when times collide (Timeline.ts:121-141), but this graph-editor path just rewrites time and re-sorts with no collision handling. Scenario: track has keyframes at frames 10 and 20; in the graph editor drag the frame-20 key onto frame 10 -> both keyframes now have time 10. All subsequent time-based lookups (updateKeyframeValue, setKeyframeTangents, getKeyframeAt, removeKeyframeAtFrame) use findIndex(kf => kf.time === time) and only ever hit the first one, so the second key becomes an un-editable, un-deletable ghost that corrupts interpolation.

_Suggested fix:_ When roundedTime collides with another keyframe on the track, either drop the displaced keyframe (replace semantics like Timeline.addKeyframe) or clamp the drag to the nearest free frame.

### 103. [medium] apps/web/src/stores/editorStore.ts:2879 _(state-coherence)_

**clearHistory resets vitruvianControllers and dynamicChains but not ikChains and smartBoneActions, so rigging state leaks across projects.**

Accurate as written, with one clarifying nuance worth noting: ikChains and smartBoneActions are never serialized to the .quar file (getEditorSnapshot/serializeProject omit them and the deserializer never restores them). This means (a) the leak is session-scoped — a full page reload re-runs the initial store literal and clears it, so it only manifests when switching projects within a single live session; and (b) there is a separate latent bug that IK chains and Smart Bone actions are not persisted across save/load at all. The state-coherence leak itself is confirmed and medium severity is appropriate.

_Suggested fix:_ Add ikChains: [] and smartBoneActions: [] to the clearHistory reset (matching the existing vitruvianControllers/dynamicChains handling).

### 104. [medium] apps/web/src/stores/editorStore.ts:3093 _(state-coherence)_

**switchPage/addPage/deletePage swap the timeline object but never sync the separate timelineDuration/frameRate store scalars, desynchronizing ruler, playback, and export from the page's actual timeline.**

Accurate except for one detail about ExportDialog: only endFrame is taken from the stale scalar (ExportDialog.tsx:76 uses timelineDuration), while the export frameRate is read from the fresh timeline.frameRate object (line 137). So export is partially desynced — wrong frame count/length from the stale duration, but correct frame rate — rather than fully desynced. The Timeline-ruler and PlaybackController desyncs are as described. Impact is a wrong ruler/playback range/export length after the user changes a per-page duration and switches pages; no crash and no data loss (the per-page timeline object itself stays correct, keyframes preserved), so medium severity stands.</parameter>
</invoke>

_Suggested fix:_ In addPage/switchPage/deletePage, also set timelineDuration: loadedTimeline.duration and frameRate: loadedTimeline.frameRate.

### 105. [medium] packages/animation/src/Easing.ts:137 _(memory-leak)_

**cubicBezierCache is an unbounded module-level Map that grows by one entry per unique cubic-bezier control-point tuple and is never evicted.**

getCachedCubicBezier caches by string key `${x1},${y1},${x2},${y2}` with no size limit. In the Sprint-23 graph editor, dragging a tangent handle produces a new float-valued cubic bezier on every pointermove (GraphEditor.tsx lines 394/419 -> tangentsToEasing -> createCubicBezier), and each re-render calls buildTrackCurvePath -> sampleCurveSegment -> applyEasing (GraphEditorUtils.ts line 516), inserting a fresh closure+key into the cache per mousemove. A few seconds of dragging adds hundreds of permanently retained entries; over an editing session the cache grows without bound (keys are unique float tuples, so hits are essentially never re-used after the drag).

_Suggested fix:_ Bound the cache (e.g. simple LRU with a few hundred entries, or clear it when it exceeds a threshold), or round control points to a fixed precision for the cache key.

### 106. [medium] packages/animation/src/GraphEditorUtils.ts:362 _(correctness)_

**fitKeyframesToView clamps scaleX/scaleY to a minimum of 1 px-per-unit, so 'fit to view' fails whenever the frame or value range exceeds the usable pixel size — common for position tracks.**

`scaleX = Math.max(1, usableWidth / timeRange)` and `scaleY = Math.max(1, usableHeight / valueRange)` (lines 362-363). Scenario: a Position Y track animating from 100 to 800 (valueRange 700) in a graph panel ~250 px tall (usableHeight ~170): the true fit scale is 0.24 but it is clamped to 1, so the rendered curve is 700 px tall in a 250 px view — after pressing fit, most of the curve is off-screen (centered on midVal, ~half the range is clipped above and below). Same for timelines longer than the panel width in pixels. GraphEditor.tsx calls this with the real panel rect (lines 133, 602). Tests only assert scale > 0, so this is unexercised.

_Suggested fix:_ Clamp to a small positive epsilon (e.g. Math.max(0.0001, ...)) instead of 1, and guard usableWidth/usableHeight against being <= 0 when the view is smaller than 2\*padding.

### 107. [medium] packages/animation/src/PropertyBinding.ts:60 _(data-corruption)_

**setProperty creates a plain object `{}` for missing intermediate segments of numeric-index paths, corrupting array-typed node fields (fills, strokes, effects, vertexOffsets) into non-iterable objects.**

setProperty does create a plain `{}` for a missing numeric-index intermediate segment (line 60), corrupting undefined array fields (fills/strokes/effects/vertexOffsets) into non-array objects; this is confirmed. The primary observable for the cited regular-group example is data-model and .quar serialization corruption (regular groups are not rendered via `for...of node.fills`, so the render-loop TypeError does not fire for that node). The render-loop TypeError is still reachable from the same defect on a RENDERED shape: shapes always init fills as arrays, so the crash arises not from an undefined field but from an out-of-range index (e.g. pasting fills.3.color onto a 1-fill shape) which produces a sparse array whose holes `for...of` yields as undefined → `undefined.visible` throws. vertexOffsets is accessed by index with optional chaining and thus corrupts silently (wrong distortion) rather than crashing.

_Suggested fix:_ When an intermediate segment is missing, create an array if the next path segment is a numeric index (`/^\d+$/.test(parts[i+1])`), and consider skipping application entirely when the container for an indexed path does not exist.

### 108. [medium] packages/animation/src/PropertyBinding.ts:588 _(performance)_

**evaluateNodeAtFrame scans ALL timeline tracks for each node, making per-frame playback evaluation O(animatedNodes x totalTracks) — quadratic in scene size**

Complexity analysis is correct (O(animatedNodes x totalTracks) per frame, quadratic in scene size). One minor overstatement: detectInterpolationType (lines 478-558) is predominantly cheap string-equality comparisons with only ~10 interleaved regex tests, not a "~30-branch regex chain" — but the load-bearing point that it re-runs uncached per track per frame is accurate. Severity adjusted high->medium: this is purely a scalability/performance concern with no correctness impact; at the codebase's current (small) scene scale each wasted track visit is a cheap short-circuiting string compare, so it is not an urgent defect today. It remains a legitimate finding because it directly undermines the project's documented "60fps with 200+ mesh-deforming characters" target and the fix (build a nodeId->tracks index once) is straightforward.

_Suggested fix:_ Group tracks by nodeId once (Map<nodeId, PropertyTrack[]>, rebuilt only when timeline.tracks changes) and have evaluateNodeAtFrame consume the per-node list; cache detectInterpolationType/getInterpolator per track.

### 109. [medium] packages/animation/src/Timeline.ts:275 _(correctness)_

**The rotation interpolator forces shortest-path wrapping to [-180, 180], making it impossible to animate rotations of more than 180 degrees between two keyframes; a 0-to-360 keyframe pair produces no motion at all.**

The claim is accurate as written. One nuance for the fix: the behavior is intentional-by-comment (Timeline.ts:273 says "Shortest-path interpolation"), so this is a design-vs-domain mismatch rather than a coding slip — but it is not defended by any test, and the editor/Lottie-export divergence (editor shows no motion, exported Lottie shows a full spin for 0→360) makes it a genuine correctness/WYSIWYG bug regardless of intent.

_Suggested fix:_ Interpolate rotation numerically by default (plain lerp), or expose shortest-path as an opt-in interpolation mode per track/keyframe.

### 110. [medium] packages/core/src/boolean/booleanOps.ts:176 _(correctness)_

**performBoolean spreads polyB's polygons as separate clipping geometries, which breaks 'intersect' when polyB is a multi-part MultiPolygon: intersection(A, B1, B2) computes A∩B1∩B2 instead of A∩(B1∪B2).**

The intersect bug is real and confirmed. One refinement to the description: union and subtract are genuinely (mathematically) correct with the spread, not merely "algebraic accident" — A − B1 − B2 ≡ A − (B1∪B2), and polygon-clipping's difference(subjectGeom, ...clipGeoms) signature is designed to subtract multiple clips. Only intersect is broken. Also, the bug is order-dependent: it only manifests when the multi-part MultiPolygon is the SECOND-or-later operand (polyB). If it is the first operand it is correctly treated as a single MultiPolygon geom (B1∪B2). The claim already reflects this by specifying the rectangle is "ordered first". Scope is confined to ShapeRenderer.renderBooleanGroup (line 2335) fed by computeNestedBooleanPolygon (lines 2506-2538); the pure booleanOperation/computeBooleanGroupResult paths never produce a multi-part polyB (nodeToPolygon always returns one polygon; computeNestedBooleanGroup returns null), so they are unaffected.

_Suggested fix:_ Pass polyB as a single geometry: polygonClipping.intersection(polyA, polyB) (and likewise for the other ops), removing the `...(polyB as Polygon[])` spread.

### 111. [medium] packages/core/src/font/glyphConverter.ts:62 _(correctness)_

**Every anchor adjacent to a curve segment is unconditionally marked type 'smooth', so sharp glyph corners become symmetry-enforced points that distort when edited.**

Minor wording nuance: the prev-point marking in the 'C'/'Q' cases is conditional (only if it was already a 'corner'); a point that is already 'smooth' from a preceding curve stays 'smooth', so a curve-meets-curve cusp is also mislabeled even though that line never executes for it. The net effect described in the claim — curve-adjacent sharp anchors end up 'smooth' regardless of handle collinearity, and symmetry-on-drag distorts the outline — is accurate.

_Suggested fix:_ Only set type 'smooth' when both handles exist and are collinear (dot product of normalized handles ≈ -1); otherwise keep 'corner'. A corner point may legitimately carry handles.

### 112. [medium] packages/core/src/path/bezier.ts:134 _(crash)_

**bezier.cubicLength recurses without a depth cap, so any non-finite control point causes infinite recursion and a RangeError stack-overflow crash.**

The defect and NaN/Infinity infinite-recursion mechanism are confirmed exactly as described. One correction to a reachability example: the 'upstream normalize of a zero vector' source cannot trigger it, because vec2.normalize (math.ts:60-64) is guarded and returns {x:0,y:0} for near-zero-length vectors rather than NaN. The other cited source (a malformed/NaN .quar import) remains unguarded, and the function-level defect stands regardless of that one example. Severity medium is appropriate: it is a genuine hard crash on the render/playback path, but requires non-finite input (which does not arise from normal finite user-drawn/keyframed coordinates), making it a robustness/defense-in-depth bug rather than a normal-usage crash.

_Suggested fix:_ Add a depth parameter with a hard cap (like tessellate's depth > 10 check) and/or bail out early when any input coordinate is non-finite, returning the chord length.

### 113. [medium] packages/core/src/path/brushOutline.ts:236 _(correctness)_

**generateRoundCap sweeps the semicircular cap backward into the stroke body instead of extending beyond the endpoint, producing a self-intersecting outline and no visible round cap.**

For the end cap with tangent (1,0) at endpoint (xe,0) and half-width hw: perp=(0,1), leftPt=(xe,hw), rightPt=(xe,-hw). isStart=false picks fromPt=leftPt, so startAngle=atan2(hw,0)=+PI/2, and the arc sweeps startAngle + t\*PI through PI, i.e. its apex is (xe-hw, 0) — inside the stroke body (x<xe) rather than beyond the end (xe+hw, 0). The start cap is equally wrong: fromPt=rightPt gives startAngle=-PI/2 and an apex at (x0+hw,0), forward into the stroke instead of behind the start. Since cap points are spliced between the left side and reversed right side of the outline (generateBrushOutline lines 156-186), the resulting closed polygon self-intersects; when filled, tapered pressure-stroke ends (caps are added when end width < 30% of max, lines 148-180) show a notch/flat end with overlap artifacts instead of a round cap. The comment at lines 143-145 ('the semicircular cap can curve inward') documents the symptom of this sign error rather than fixing it.

_Suggested fix:_ Sweep the arc in the opposite direction (angle = startAngle - t\*PI) or swap the from-point per end so the apex lies along the outward tangent (beyond the endpoint for end caps, behind it for start caps).

### 114. [medium] packages/core/src/path/outlineStroke.ts:185 _(correctness)_

**outlineStroke places the result at the wrong world position for rotated nodes because the local centering offset is not rotated (or skewed).**

The rotation-omission is the genuine defect: the centering offset should be R(rotation)·S(scale)·center but the code uses only S·center (lines 185-186). The skew portion of the claim, however, is a non-issue: mat3.compose does not take or apply transform.skew at all (math.ts line 249; the renderer and SceneGraph both call compose without skew), so skew affects neither the source nor the result placement — copying it on line 208 is inert. The minor anchor mismatch (source anchor often {0,0} vs result {0.5,0.5}) is sub-pixel and negligible. Severity medium is fair: it only manifests for rotated nodes whose local geometry center is off-origin (chiefly edited/free-form PathNodes), while the common origin-centered shapes are unaffected.

_Suggested fix:_ Rotate (and skew) the center offset by the node's rotation before adding it: world = position + R(rotation)*(centerX*sx, centerY\*sy).

### 115. [medium] packages/core/src/path/pathUtils.ts:972 _(correctness)_

**Stroke widthProfile is interpolated by tessellation vertex index instead of arc length, distorting the taper on paths with mixed straight and curved segments.**

generateStrokeOutlineVertices maps the profile with t = i / (numVertices - 1), where i is the tessellated vertex index. Adaptive tessellation (bezier.tessellate) emits only 2 vertices for a straight segment but dozens for a tight curve, so vertex index is not proportional to distance along the path. Failure scenario: a path that is a long straight line followed by a curl, with a stroke widthProfile of [1, 0] (taper) applied via the brush-profile UI (editorStore.ts line 705 sets stroke.widthProfile). The straight half of the path occupies indices 0..1 out of ~50, so it consumes almost none of the profile — the stroke stays near full width along the entire straight section and the whole taper is squeezed into the curled part, instead of tapering uniformly along the length. Contrast with generateBrushOutline (brushOutline.ts lines 34-92), which correctly resamples by cumulative arc length before applying the same profile.

_Suggested fix:_ Precompute cumulative arc length of the tessellated vertices and use t = cumDist[i] / totalLength when sampling widthProfile, mirroring generateBrushOutline's resampling approach.

### 116. [medium] packages/core/src/rendering/EffectRenderer.ts:164 _(performance)_

**compositeWithBlendMode performs a synchronous full-canvas gl.readPixels plus texSubImage2D upload per blended node per frame, stalling the GPU pipeline and breaking the 60fps target.**

Every node with a non-normal blendMode goes through compositeWithBlendMode each frame, which calls gl.readPixels(0,0,canvasWidth,canvasHeight,...) on the default framebuffer — a synchronous GPU→CPU readback that forces a full pipeline flush — then re-uploads the same pixels via texSubImage2D. On a 1920x1080 canvas at devicePixelRatio 2 that is ~33 MB down and ~33 MB up per blended node per frame; with 3 blended layers during timeline playback the frame time is dominated by stalls and playback drops far below the project's 60fps/200-character target. The comment explains blitFramebuffer fails from a multisampled default FB, but the standard fix (render the scene into a non-multisampled offscreen FBO and blit/sample from it) avoids any CPU round-trip.

_Suggested fix:_ Render the scene to an intermediate non-multisampled FBO so the destination can be sampled directly (or blitted FBO-to-FBO), eliminating the per-node readPixels round-trip.

### 117. [medium] packages/core/src/rendering/ShapeRenderer.ts:335 _(cpu-gpu-skinning-parity)_

**GPU skinning shader's zero-weight fallback uses the raw bind-pose LOCAL position (`skinned = pos`) while CPU deformVertices transforms zero-weight vertices through skinData.meshBindMatrix, so unweighted vertices render in the wrong place on the GPU path whenever the mesh's bind transform is non-identity.**

The core claim (GPU zero-weight fallback uses raw local pos while CPU applies meshBindMatrix, diverging whenever meshBind is non-identity) is correct. One sub-scenario in the failure description is wrong: the ">32 bones / bones beyond MAX_BONES_GPU=32" case does NOT trigger the GPU divergence, because renderSkinnedNode (ShapeRenderer.ts:3391-3396) only takes the GPU path when boneCount <= MAX_BONES_GPU and falls back entirely to CPU otherwise; and when boneCount <= 32 every bone fits in boneIdToIndex, so no influence is dropped as out-of-range. The two genuinely reachable GPU-path scenarios are (a) overflow vertices when tessellation produces more vertices than skinData.vertices.length, and (b) vertices whose influences were painted/normalized to empty (including the transient state right after createSkinBinding, before auto-weights, where ALL vertices have empty influences). Severity medium is appropriate: it is a real correctness/parity defect but only affects unweighted vertices, so a fully-weighted mesh with stable geometry never hits it.

_Suggested fix:_ Pass meshBindMatrix as an additional mat3 uniform to the skinned programs and use `skinned = u_meshBind * pos` as the zero-weight fallback, matching deformVertices.

### 118. [medium] packages/core/src/rendering/ShapeRenderer.ts:2084 _(performance)_

**renderPath clones every path point (applyCornerRadius) and builds an O(points) geometry-key string on every frame for every path node, even on tessellation-cache hits**

Accurate as written, with one nuance: the applyCornerRadius clone is purely wasted on cache hits (removable by moving it after the cache check), whereas buildGeometryKey's O(points) string is required by the current cache design to validate the entry and would need a dirty-flag/version-counter refactor to eliminate. Both allocate immediately-discarded garbage every frame, so the finding stands.

_Suggested fix:_ Skip applyCornerRadius when no point has cornerRadius set (cheap pre-scan or a flag on the node), and replace the per-frame string key for paths with a monotonically bumped version/dirty flag invalidated from nodeChanged, or a cheap numeric hash.

### 119. [medium] packages/core/src/rendering/ShapeRenderer.ts:2146 _(cache-invalidation)_

**Text tessellated with a fallback font is cached under a geoKey that omits the actually-used font, so the text keeps rendering in the wrong font after the requested font finishes loading.**

renderText calls fm.getFontOrFallback(node.fontFamily, node.fontWeight) (line 2114), which returns any loaded font when the requested family/weight isn't ready yet (FontManager.ts:152-160). The resulting glyph tessellation is cached under buildGeometryKey's 'T:content:fontFamily:...' key (line 445), which encodes the requested family, not the font actually used. When the real font (e.g. a Google font still downloading on project open) finishes loading, the cached entry still matches at line 2146 (`cached.geoKey === geoKey`) and the stale fallback-font glyphs render forever — nothing calls clearCache/invalidateCache anywhere in the app. The user sees the wrong typeface until they edit the text content or size.

_Suggested fix:_ Include an identifier of the font actually returned (e.g. its family/weight or a load-generation counter from FontManager) in the text geoKey, or skip caching when a fallback font was used.

### 120. [medium] packages/core/src/rendering/ShapeRenderer.ts:2439 _(memory-leak)_

**Boolean-group tessellation cache grows without bound while children move: the cache key embeds child world transforms, and old entries are never evicted.**

Boolean-group tessellation cache (geometryCache + booleanRingCache) uses transform-embedding keys with no eviction, and invalidateCache/clearCache are never called from the app, so entries accumulate for the life of the renderer. Correction to the scenario: looping playback does NOT grow per loop — frames are integer-quantized and deterministic, so each loop reuses the same ~N keys (bounded at ~one entry per unique animation frame, e.g. ~600 for a 10s/60fps loop). The unbounded growth modes are (1) interactively dragging/resizing children of a boolean group (each pointermove mints a new key, translation quantized only to 0.01px), and (2) deleted nodes of any type leaking their per-nodeId cache entries because Canvas's nodeRemoved handler never calls invalidateCache. All leaked memory is CPU-side JS heap (tessellated vertex/index arrays and stroke outlines), not GPU buffers, and is only reclaimed on renderer disposal (and booleanRingCache not even then, since dispose() clears only geometryCache).

_Suggested fix:_ Key boolean-group cache entries by group node id (storing the transform-key inside the entry for staleness comparison) so each group holds at most one entry, or evict the previous key when a group's key changes.

### 121. [medium] packages/core/src/rendering/ShapeRenderer.ts:2690 _(correctness)_

**All draw paths upload into fixed 10,000-vertex GPU buffers with no size check, so complex geometry silently renders as garbage or disappears.**

The claim is accurate; one minor refinement to the observable symptom. WebGL performs mandatory bounds checking on draw calls, so the most likely user-visible outcome when the upload exceeds the buffer is that the shape simply disappears (the draw is dropped as INVALID_OPERATION because the vertex count/indices reference data beyond the 80KB buffer), rather than rendering "garbage triangles from stale contents." The "garbage" outcome is possible only in narrower cases; the "vanishes silently" outcome is the dominant one. The reviewer listed both, so the finding stands as written.

_Suggested fix:_ Check incoming array sizes against the allocated buffer capacity and grow the buffers (gl.bufferData with the larger size) when exceeded, or split draws into chunks.

### 122. [medium] packages/core/src/rendering/ShapeRenderer.ts:4178 _(correctness)_

**Ghost (onion-skin) rendering of text earcuts the concatenated multi-contour glyph array without hole indices, filling letter counters and bridging glyphs.**

renderTextWithOverride concatenates all glyph contours into one flat array (lines 4168-4176) and passes it to renderNodeGhost → renderFillsAndStrokesGhost, which runs `earcut(tessellated.subarray(...))` with no hole indices (line 1717). Contrast with renderText, which groups contours by containment and passes hole offsets to earcut (lines 2215-2245). With onion skinning enabled on a text node, ghost frames render letters like 'o', 'e', 'a' with their holes filled and spurious bridge triangles connecting separate glyphs. Ghost strokes are also wrong: renderStrokeWithColor generates a single outline around the concatenated array, drawing bridge stroke segments between glyph contours.

_Suggested fix:_ Reuse the containment-grouping + per-group earcut logic (as renderPathWithOverride already does for compound paths) in renderTextWithOverride, and render ghost strokes per contour.

### 123. [medium] packages/core/src/SceneGraph.ts:77 _(correctness)_

**addNode registers the node in the map before validating parentId, so a failed add leaves an orphaned zombie node that blocks re-adding under the same id.**

Line 77 does this.nodes.set(node.id, node) and only afterwards resolves the parent (lines 79-83). If parentId doesn't exist, the throw at line 82 leaves the node in this.nodes but in neither rootNodeIds nor any parent's children. A caller that catches the error and retries addNode(node) without a parent gets 'Node with id ... already exists' (line 74) — the add can never succeed for that id in this session. The zombie is also included in toJSON()'s nodes array (nodes.values(), line 414) while being unreachable from any root, so it is persisted into saved .quar files as invisible junk.

_Suggested fix:_ Resolve and validate the parent before mutating this.nodes; only insert the node into the map once the whole operation is guaranteed to succeed.

### 124. [medium] packages/core/src/SceneGraph.ts:160 _(data-loss)_

**moveNode detaches the node from its old parent before validating the new parent, so a failed move leaves the node (and its whole subtree) unreachable.**

Two accurate corrections/clarifications to the claim's framing, neither of which weakens it: (1) The corruption occurs in BOTH the root-node case (a was a root: removed from rootNodeIds, parent stays null) and the parented case (a had parent p: removed from p.children, parent stays p) — the claim's example uses a parented node but the root case is equally affected. (2) The MCP exploitability hook is unproven in this repo: grepping the MCP package found no move/reparent tool that forwards external ids to moveNode, so that specific attack vector is speculative. The internal callers (editorStore bringForward/sendBackward/etc., LayerPanel drag-drop) all derive parentId from existing nodes or null, so they do not currently trigger the not-found path — making real-world triggerability narrow (a stale/invalid id from a future caller, a drag-drop racing a delete, or a new MCP tool). The code defect itself is unconditionally real. Medium severity is fair: low current triggerability but silent, permanent subtree data loss that survives save/reload.

_Suggested fix:_ Look up and validate the new parent (throw if missing) before performing the removal from the old parent, so a failed move leaves the graph untouched.

### 125. [medium] packages/core/src/selection/SelectionManager.ts:233 _(correctness)_

**Selection bounds for a group ignore symbol-instance descendants, producing undersized bounds or no selection overlay at all.**

collectNodeBounds handles a directly-selected symbol-instance via getSymbolBounds (lines 213-227), but the 'group' branch (lines 228-237) iterates sceneGraph.getDescendants() and calls getLocalBounds(desc) for each; getLocalBounds returns null for 'symbol-instance' (lines 373-374 'bounds computed from resolved children' — but those children are virtual and never in the scene graph), so instances contribute nothing. Concrete scenario: user selects a symbol instance and groups it (editorStore groupSelection moves any selected node into the group), then clicks the group — getGroupBounds collects zero rects, getSelectionBoundsForDisplay (line 145-147) returns null, and no selection box/transform handles appear for the group; if the group mixes shapes and instances, the box excludes every instance so resize/rotate handles sit at wrong positions.

_Suggested fix:_ In the group branch, when a descendant is a symbol-instance, compute its bounds the same way as the top-level symbol-instance case (getSymbolBounds + the descendant's world transform).

### 126. [medium] packages/core/src/svg/svgConverter.ts:345 _(correctness)_

**Fill is silently discarded for open subpaths, but SVG fills open paths (implicitly closing them for the fill operation) — imported artwork loses visible filled areas.**

The core claim (open paths at line 345 and polylines at line 293 lose their fill, contradicting SVG's implicit-closure fill rule and causing visible content loss / total invisibility when black default fill was the only paint) is confirmed. However, the reviewer's inclusion of convertLine (line 226) as a defect is incorrect: a line has only 2 points, so its implicitly-closed fill has zero area and renders nothing in browsers either — discarding it loses no visible content. The genuine defects are convertPath open subpaths (line 345) and convertPolyline (line 293).

_Suggested fix:_ Keep the fill for open subpaths (renderer can fill as-if-closed), or at minimum close the path when a fill is present and no stroke-only intent is detectable, and emit an import warning.

### 127. [medium] packages/core/src/svg/svgExporter.ts:390 _(xss-injection)_

**SVG exporter interpolates untrusted node string properties into attribute values without XML-escaping (only node.content and fontFamily are escaped), enabling markup/script injection into the exported .svg.**

The claim also lists font-weight (line 389) as a vector, but node.fontWeight is typed `number` (index.ts:286), and interpolating a number can never produce markup, so it is not a real injection vector. The genuine unescaped string vectors are node.fontStyle (line 390), stroke.cap (line 186), and stroke.join (line 190). This imprecision does not affect the finding. Severity medium is appropriate: exploitation requires importing an attacker-supplied .quar and then opening the exported .svg as active content (direct navigation or as an embedded document); the exported file is a blob download and is not rendered inline within the app.

_Suggested fix:_ Route every string interpolated into an attribute value through escapeXml() (fontStyle, fontWeight, stroke.cap, stroke.join, letterSpacing, etc.), or whitelist enum values before emitting.

### 128. [medium] packages/core/src/svg/svgImporter.ts:97 _(correctness)_

**importSvg's scale option breaks layout: group children's relative positions are never scaled, and an explicit target position is multiplied by scale.**

Two defects in the transform pass (lines 94-105): (1) only root-level nodes get their position adjusted, and scaleNodeDimensions scales widths/radii/path points but NOT the transform.position of non-root children — so importing <g><rect x="0"/><rect x="100"/></g> with scale=2 doubles each rect's size while the 100px gap between them stays 100px, collapsing the layout; (2) the position is computed as (pos + offset) \* scale where offset = targetX - centerX, so importSvg(..., {position:{x:500,y:300}, scale:0.5}) centers content at (250,150) instead of (500,300) — the caller's target coordinate is halved. The app currently calls importSvg with defaults, so this hits the public API/options path.

_Suggested fix:_ Scale child transform.position for all non-root nodes, and apply scaling about the center before adding the target offset: pos' = (pos - center) \* scale + target.

### 129. [medium] packages/core/src/svg/svgImporter.ts:205 _(correctness)_

**computeNodesBounds treats group nodes as zero-size points, so centerAtOrigin fails to center any SVG whose content is wrapped in a <g> (the common case).**

The mechanism described is accurate. One correction to the caller claim: the app does NOT "always" pass centerAtOrigin:true. The file-menu path (useProjectActions.ts:285) passes centerAtOrigin:true, but the paste/drag-drop path (Canvas.tsx:1118-1121) passes centerAtOrigin:false with an explicit position. Both are affected because line 81 (`centerAtOrigin || position || scale !== 1`) and line 91 (`centerAtOrigin || position`) route the position path through the same degenerate bounds, so a grouped SVG is offset by (125,75) from the intended drop point there too. This broadens the impact rather than narrowing it.

_Suggested fix:_ Recurse into group children (accumulating parent transforms) when computing import bounds, or compute bounds from all leaf nodes' world positions.

### 130. [medium] packages/core/src/svg/svgParser.ts:143 _(correctness)_

**Percentage width/height on the root <svg> ('width="100%"') parses to 1 instead of falling back to viewBox, and without a viewBox it corrupts all Y-flipped geometry.**

Both mechanics in the claim are correct. Refinement of impact: for the most common width="100%"+viewBox emit, parsed.width/height do become 1, but this is currently inert — the Y-flip uses parsed.viewBox.height (correct) and centering recomputes from node bounds, and no other code reads ParsedSvg.width/height. The geometry actually gets corrupted only when the SVG has percentage dimensions AND no viewBox: then viewBoxHeight = parsed.height = 1 and every Y becomes 1 - y. The fix is to ignore percentage (or unresolvable relative) root dimensions so line 143-144 falls through to viewBox, e.g. only accept a positive absolute length before OR-ing to viewBox.

_Suggested fix:_ Treat percentage root dimensions as 'unresolvable' and fall back to viewBox dimensions (pass the viewBox size as the reference, or skip % values in this context).

### 131. [medium] packages/core/src/svg/svgParser.ts:295 _(correctness)_

**Gradient href inheritance resolves only one level in document order, so chained gradient references (a→b→c) can end with zero stops depending on element order.**

The mechanism and failure (empty stops depending on element order) are exactly right. One refinement to the justification: the trigger is not simply "many gradients share one base" (that produces flat 2-level, base-first references which resolve correctly in one pass). The precise trigger is a 3+ level chain where an intermediate gradient inherits its stops via href AND appears before its parent in document order (a forward reference). If gradients are ordered base-first (parent before child), the single pass resolves the whole chain correctly because each parent already has its stops by the time the child is processed.

_Suggested fix:_ Resolve hrefs recursively with memoization and a real cycle guard (follow the chain to the root before copying stops/coords).

### 132. [medium] packages/core/src/symbols/symbolResolver.ts:86 _(correctness)_

**resolveSymbolInstance does not expand nested symbol-instance nodes, and no downstream consumer does either, so symbols nested inside symbols silently render nothing on canvas and are dropped from SVG export.**

Resolution is a flat structuredClone + shallow overrides; a symbol-instance node inside definition.sceneGraphJSON.nodes stays an unexpanded instance with empty children. ShapeRenderer.renderResolvedNode's type switch (ShapeRenderer.ts:1640-1665) has no 'symbol-instance' case and recurses only via node.children (empty for instances), and svgExporter.renderResolvedNodeToSvg (svgExporter.ts:503-540) returns '' for it via the default case. Nesting is reachable in the UI: editorStore's createSymbol collects the selection with no type filter (editorStore.ts:3183-3187), so selecting an existing instance plus other shapes and creating a symbol embeds an instance in the definition. Failure scenario: create symbol A, place an instance, select it together with a rectangle and create symbol B — every instance of B renders only the rectangle; A's content is invisible on canvas and missing from SVG export, with no error. Also note there is no cycle guard anywhere for definitions referencing themselves if recursion is later added.

_Suggested fix:_ Recursively resolve nested symbol-instance nodes in resolveSymbolInstance (with a definition lookup callback and a visited-set cycle guard), or add explicit symbol-instance handling to renderResolvedNode/renderResolvedNodeToSvg.

### 133. [medium] packages/core/src/symbols/symbolResolver.ts:150 _(correctness)_

**getSymbolBounds returns 0x0 extent for path/text/group nodes and mixes parent-local child positions with root coordinates, producing missing or misplaced selection bounds for symbol instances.**

The default case assigns w=h=0 for paths, text, and groups, and the loop treats every node's transform.position as definition-root coordinates even though children of groups store parent-relative positions. Two concrete failures: (1) create a symbol from brush/pen-drawn paths only — every node contributes a zero-size rect, so getSymbolBounds returns a degenerate rect and SelectionManager (SelectionManager.ts:218-220) skips it via its `width > 0 && height > 0` guard: the selected instance shows no selection box and PropertiesPanel (PropertiesPanel.tsx:202) reports wrong W/H. (2) A definition containing a group whose transform.position is non-zero unions the group's children at their group-local coordinates with sibling roots at root coordinates, producing a bounds rect offset/inflated relative to what is actually rendered, so the instance's selection rectangle does not surround the artwork.

_Suggested fix:_ Compute bounds recursively through the hierarchy (compose child transforms), and give paths real extents from their point positions (they are available on the node) instead of 0.

### 134. [medium] packages/core/src/tools/BoneTool.ts:108 _(correctness)_

**Minimum bone length is documented as screen pixels but compared in world units, so bone creation silently fails when zoomed in and accidental click-bones appear when zoomed out.**

MIN_BONE_LENGTH = 5 (line 10, comment: 'Minimum drag distance (pixels)') is compared against `length`, which is computed from worldPosition deltas (lines 104-106) with no zoom compensation. At camera.zoom = 8 (typical for detail rigging of small parts like fingers), a 30-screen-pixel drag is only 3.75 world units, so onPointerUp does nothing — the preview bone vanishes with no feedback and the user cannot create short bones at all. Conversely at zoom 0.1, 5 world units is half a screen pixel, so an accidental jittery click creates a stray bone. The neighboring SNAP_DISTANCE check does this correctly by converting to screen space via camera.worldToScreen (lines 247-252), confirming the intended convention.

_Suggested fix:_ Compare against MIN_BONE_LENGTH / this.context.camera.zoom (like PenTool's closeThreshold), or compute the drag length in screen space.

### 135. [medium] packages/core/src/tools/BrushTool.ts:247 _(performance)_

**Brush preview re-runs a full Schneider curve fit over ALL captured points on every pointer move (O(n^2) per stroke), while the incremental commit pipeline that should prevent this is dead code.**

updatePreviewNode calls schneiderFitCurve(positions, ...) on this.allPoints on every onPointerMove (line 247), plus generateBrushOutline over the whole fitted spine (tessellation + resampling) in createPathNode. schneiderFitCurve is recursive with iterative reparameterization (schneider.ts fitCubic/reparameterize), so each move costs at least O(n) and the whole stroke O(n^2). The committedCurves/committedWidths incremental pipeline (lines 73-74, commitFloatingPoints at 219-236) is written to but never read anywhere — finalizeStroke refits all points from scratch — so commitFloatingPoints only adds extra wasted Schneider fits every 12 points. A slow, long freehand stroke (thousands of filtered samples over several seconds) makes each pointermove progressively more expensive, causing visible lag exactly while the user is drawing.

_Suggested fix:_ Build the preview from committedCurves + a fit of only the floatingPoints overlap window (the pipeline that already exists), or throttle the full refit and cap preview fitting to the last N points.

### 136. [medium] packages/core/src/tools/DirectSelectionTool.ts:494 _(correctness)_

**Escape during a vertex/handle drag does not cancel the drag: points stay displaced, and clearing the selection mid-drag makes onPointerUp report an empty node set, skipping vertex keyframing.**

onKeyDown Escape unconditionally runs clearPointSelection() when points are selected, even while dragMode==='dragging-point'. Concrete scenario: user drags a vertex, presses Escape expecting the move to cancel (as SelectionTool does per Sprint X1) -> vertices remain at the dragged position, selectedPoints is emptied so the remaining pointer-move iterations do nothing, and on pointer-up `nodeIds = new Set(this.selectedPoints.map(...))` is empty, so onTransformComplete('vertex-move') fires with no nodes. With auto-keyframe on, the moved vertices get no keyframes; if the path already has vertex tracks, the un-keyframed drag is silently discarded on the next timeline evaluation (vertices snap back), losing the user's edit.

_Suggested fix:_ When Escape is pressed while dragging, restore positions from initialPointPositions (and the original handle for handle drags), reset drag state, and only then fall through to the selection-clearing behavior when idle.

### 137. [medium] packages/core/src/tools/EraserTool.ts:514 _(correctness)_

**Stroke-erase of a shape inside a rotated or scaled group produces a wrongly-transformed result: only the position is converted to parent-local, not the world-baked geometry orientation.**

Accurate as described. The fix is to convert the world-space result contours into the parent's local space before building the node (e.g., transform every contour point by invParent, not just the bbox-center position), so the parent's rotation/scale is applied exactly once. Note a separate pre-existing minor artifact unrelated to this claim: createBooleanResultNode uses anchor {0.5,0.5} in absolute units, adding a fixed ~0.5px offset even in the root case.

_Suggested fix:_ Either add the result node as a root (world space) instead of re-parenting, or transform every contour point by the inverse parent world matrix (not just the position) before adding it under the original parent.

### 138. [medium] packages/core/src/tools/SelectionTool.ts:252 _(correctness)_

**Shift/Ctrl-clicking an already-selected node to deselect it still enters move mode, so any slight pre-release mouse motion drags the remaining selection.**

In the additive branch, when isAlreadySelected the node is removed from selection, but execution falls through to 'Start move mode' (lines 263-276), capturing moveStartPositions for the remaining selected nodes anchored at this click. Concrete scenario: nodes A, B, C selected; user shift-clicks B to deselect it and moves the mouse 5px before releasing -> A and C are displaced by 5px (and with auto-keyframe on, get position keyframes). DirectSelectionTool handles the same case correctly by returning early after deselection ('Don't start dragging if we just deselected', line 236).

_Suggested fix:_ Return early after removing a node from the selection in the additive branch, mirroring DirectSelectionTool.

### 139. [medium] packages/core/src/tools/SelectionTool.ts:1147 _(correctness)_

**Resizing a selected symbol instance silently does nothing: handles are shown and 'resizing' mode engages, but performResize has no symbol-instance branch.**

getSelectionBoundsForDisplay computes bounds for symbol-instance nodes (SelectionManager lines 144-148), so resize handles render and hitTest returns a handle; onPointerDown enters mode='resizing'. But captureNodeStates (lines 1027-1048) stores no size/scale for symbol-instance, and performResize's type chain (rectangle/ellipse/polygon/path/text/image/group/artboard) matches nothing, so no updateNode call is made at all — not even position. Concrete scenario: user selects a Figma-style symbol instance (Sprint 22 feature), grabs a corner handle, drags: the resize cursor shows but the instance never changes, and on release onTransformComplete('resize') still fires. In a multi-selection resize, symbol instances stay frozen while siblings scale, corrupting the relative layout.

_Suggested fix:_ Add a symbol-instance branch that scales transform.scale (like the group branch) and captures initial scale in captureNodeStates, or exclude symbol instances from handle display.

### 140. [medium] packages/core/src/tools/ToolManager.ts:277 _(correctness)_

**The global 'f' tool shortcut (artboard) intercepts PointMagnetTool's documented F-key falloff cycling and yanks the user out of Smart Bone sculpting.**

Accurate as stated for the plain lowercase 'f' key (the shortcut the unit test and tool handler treat as canonical). Two refinements: (1) The interception affects only plain 'f'; Shift+F ('F') actually reaches PointMagnetTool.onKeyDown and cycles falloff, because both the ToolManager shortcut check (guarded by !event.shiftKey) and useToolShortcuts bail when Shift is held. So the tool's 'F' branch is reachable but its 'f' branch is not. (2) There are two independent interceptors, not just ToolManager: the window-level useToolShortcuts hook (Canvas.tsx:220) also maps f -> 'artboard' with no recording guard. (3) onDeactivate does NOT clear workingOffsets, so already-sculpted offsets are not lost on the tool switch; the harm is that the active sculpting tool and its brush overlay disappear mid-recording and the falloff never changes.

_Suggested fix:_ Route the key to the active tool first and only treat it as a tool shortcut if unhandled, or skip the shortcut table while the active tool declares it consumes that key.

### 141. [medium] packages/core/src/tools/WeightPaintTool.ts:235 _(data-loss)_

**When the tessellation cache misses, a single click paints EVERY vertex of the mesh at full brush strength, ignoring radius and falloff, silently flattening the weight map.**

Accurate on the core defect. Two nuances: (1) the 'fresh session before first render' trigger is only realistically reachable for a HIDDEN bound node — a visible node repopulates its geometry cache within one animation frame, faster than any human click, so the practical trigger is a bound node that is hidden (visible=false) and thus never rendered/cached since the renderer was created (fresh load or post-context-loss recreation). (2) The stroke pushes an undo checkpoint at start (onTransformStart, line 167), so the weight-map flattening is recoverable via undo rather than permanently lost; the real harm is that the brush silently ignores its radius/falloff and destructively renormalizes the entire mesh with no visual indication.

_Suggested fix:_ Remove the fallback (no-op with a console.warn when vertex positions are unavailable), or at minimum restrict it to explicit 'flood fill' user actions rather than normal brush strokes.

### 142. [medium] packages/core/src/tweening/shapeTween.ts:278 _(correctness)_

**addPointsToPath drops the corrected handleIn produced by segment subdivision, so the point following any subdivided curved segment keeps its original full-length handleIn and the normalized path is geometrically wrong.**

subdivideSegmentPoints correctly shortens the endpoint's handleIn from the de Casteljau split (lines 113-119), but addPointsToPath pushes 'all but the last' sub-point (line 278) and the next loop iteration pushes a fresh clonePathPoint of the original point (line 273, or line 286 for open-path ends, or the seg-0 push for closed-path wraparound) with the ORIGINAL handleIn — which spans the whole pre-split segment instead of just the last sub-segment. Failure scenario: shape-tween a 2-point arc (handles length ~40 over a 100-unit segment) into a 3-point path. normalizePointCount subdivides the arc once; the correct end handleIn should shrink to ~20, but stays 40, so interpolateShapeTween(t=0) returns a path whose last sub-segment bulges visibly compared to the actual source shape — the animation 'pops' on its first frame (and symmetrically at t=1 when the target is the subdivided side). Existing tests (shapeTween.test.ts:153-160) only assert the interior point is smooth, never the endpoint handle length.

_Suggested fix:_ After subdividing segment `seg`, write the last sub-point's corrected handleIn onto the next point that gets pushed (the following segment's start clone, the final open-path push, and result[0] for the closed-path wraparound segment).

### 143. [medium] packages/export/src/lottie/lottieKeyframes.ts:178 _(correctness)_

**positionTracksToLottie takes easing only from the X track, so easing on Y-only (or Y-differing) position/scale animation is silently dropped to linear.**

`const nextKfX = trackX?.keyframes.find(...); const easing = nextKfX?.easing ?? 'linear'`. If a user animates only transform.position.y with a cubicBezier easing (X static — a plain vertical drop with ease-out), trackX is undefined, easing falls back to 'linear', and the exported Lottie loses the easing entirely. Additionally, when the chosen easing is a named non-bezier one, no h:1 hold is emitted (unlike quarKeyframeToLottie), so the same easing exports as hold on rotation but linear on position — inconsistent output for the same keyframe.

_Suggested fix:_ Prefer the X track's keyframe easing but fall back to the Y track's keyframe at nextT before defaulting to linear, and handle the null-tangent case consistently.

### 144. [medium] packages/export/src/spriteSheet.ts:131 _(correctness)_

**exportSpriteSheet with multiplier > 1 draws oversized frame canvases into cells laid out at unscaled size, making frames overlap and corrupting the atlas.**

Accurate as written. One clarification: the in-app ExportDialog does not call exportSpriteSheet at all — it reimplements the sprite-sheet compositing inline and hardcodes multiplier:1, so exportSpriteSheet is only reachable through the public @quar/export package API. The bug therefore affects external consumers passing multiplier>1, not the shipped app UI. This limits real-world impact but does not refute the correctness defect.

_Suggested fix:_ Scale the pack layout and atlas by multiplier (and metadata frame sizes), or drawImage with explicit dWidth/dHeight = frameWidth/frameHeight.

### 145. [medium] packages/export/src/spriteSheetMetadata.ts:58 _(correctness)_

**Metadata includes frames that failed to pack (x/y = -1 sentinel), so consumers read garbage regions for frames that are not in the atlas.**

packMaxRects marks frames that don't fit in the 4096x4096 bin with x:-1, y:-1 (binPacking.ts:146-153, locked by tests), and exportSpriteSheet skips blitting them (spriteSheet.ts:112 `if (!rect || rect.x < 0) continue`). But generateSpriteSheetMetadata iterates all packResult.rects unfiltered, emitting `frame: { x: -1, y: -1, ... }` entries. Any engine consuming the TexturePacker JSON (PixiJS, Phaser) will sample out-of-bounds/wrapped texture coordinates for those frames instead of failing loudly. Reachable via 'packed' layout whenever frames overflow the 4096 bin (e.g. 500x500 frames, 70 frames).

_Suggested fix:_ Skip rects with x < 0 in metadata generation (or fail the export with a clear error when frames don't fit).

### 146. [medium] packages/rigging/src/dynamicChain.ts:171 _(correctness)_

**stepDynamicChain silently returns for dt > 0.1s, so bakeDynamicChainToKeyframes (dt = 1/frameRate) produces a completely frozen chain — constant keyframes — for any project frame rate of 9 fps or lower, with no error.**

Accurate except two nuances: the baked root-bone rotation is not strictly "constant at frame-0 pose" — applyChainToBones subtracts the live parent world transform each frame, so it can vary when the chain root's parent is FK-animated; the invariant that actually breaks is that no physics/secondary motion (gravity, wind, inertia) is ever integrated. Also, bakeDynamicChainToKeyframes currently has no UI/app caller (only exported from the rigging package barrel), so the "baked result replaces live simulation and corrupts the animation" consequence is latent rather than presently user-reachable.

_Suggested fix:_ In bakeDynamicChainToKeyframes, substep when 1/frameRate exceeds the solver's dt limit (e.g., run ceil(dt/0.05) substeps of dt/n), or have stepDynamicChain clamp instead of silently skipping, or return null/error from the bake for unsupported frame rates.

### 147. [medium] packages/rigging/src/ik.ts:193 _(correctness)_

**Pole targets are silently ignored for 2-bone chains (the primary elbow/knee use case) because applyPoleTarget is gated on joints.length >= 3, making applyPoleTarget's dedicated 'one middle joint' branch unreachable dead code.**

solveFABRIK line 193: `if (poleTarget && joints.length >= 3)`. A 2-bone chain (joints.length === 2) produces positions.length === 3, which is exactly the case applyPoleTarget's `positions.length <= 3` branch (lines 219-255, 'Only one middle joint — project it toward the pole target') was written to handle — but that branch can never execute because the gate requires joints.length >= 3 (positions.length >= 4). Concrete scenario: an IKChain with poleTargetNodeId set on a 2-bone arm (pole targets are modeled in @quar/types, evaluated in ikEvaluator.ts, and rendered in BoneOverlay with targetType 'pole'): the pole target has zero effect, and the elbow bends up or down arbitrarily based on FABRIK's incidental state. The existing test 'applies pole target to influence bend direction' uses 2 joints but only asserts rotations.size === 2, so it passes despite the pole doing nothing.

_Suggested fix:_ Change the gate to `joints.length >= 2` so the positions.length <= 3 branch of applyPoleTarget handles the 2-bone case.

### 148. [medium] packages/rigging/src/ik.ts:283 _(correctness)_

**applyPoleTarget's long-chain branch re-enforces bone lengths for all segments EXCEPT the last one, so with a pole target the solver can report converged=true while the reconstructed chain's end effector misses the target.**

The re-enforcement loop `for (let i = 0; i < positions.length - 2; i++)` stops after fixing positions[length-2]; the final segment from positions[length-2] to positions[length-1] (the end effector, still sitting at/near the target) is never re-normalized to boneLengths[length-1... last]. After the pole pass moves positions[length-2], the distance from it to the end effector no longer equals the last bone's length. The next iteration's convergence check (line 175-176) measures dist(positions[end], target), which stays within tolerance, so the loop breaks with a length-violating chain. positionsToRotations then derives angles only, and applyIKResult produces a chain with true bone lengths — placing the real tip at positions[end-1] + lastLen \* dir, off the target by |dist(positions[end-1], end) - lastLen|. Concrete scenario: 3-bone chain (joints 80/60/40 as in the existing test) with a pole target that pulls the second-to-last joint off axis: solver returns converged=true / endEffectorError≈0 but the rendered end effector visibly misses the IK target. The test only asserts rotations.size === 3, never end-effector placement.

_Suggested fix:_ Extend the re-enforcement loop to `i < positions.length - 1` so the last segment is also length-corrected (accepting the end effector moves off target, which the next FABRIK iteration then corrects).

### 149. [medium] packages/rigging/src/ik.ts:307 _(correctness)_

**applyConstraints clamps each bone's WORLD-space segment angle against angleMin/angleMax, but everywhere else (fk.ts clampBoneRotation, applyIKResult) those limits are defined on LOCAL rotation, so constrained IK chains are clamped in the wrong frame for every non-root bone.**

In applyConstraints, `angle` is the absolute world direction of segment i (atan2 of positions[i+1]-positions[i]) and is clamped to joint.angleMin/angleMax. But BoneNode.angleMin/angleMax are local-rotation limits: fk.ts clampBoneRotation clamps bone.transform.rotation (local), and applyIKResult (ik.ts lines 421-426) clamps the LOCAL rotation against the same fields. For non-root bones, world angle = parent's accumulated world rotation + local rotation, so the two interpretations diverge whenever the parent segment isn't at 0°. Concrete scenario: 2-bone chain, child bone with local limits [-90, 90]; solver finds root at 120° and child local at +30° (child world 150°) — a pose that satisfies the local constraint — but applyConstraints sees 150 > 90 and forcibly bends the child segment to world 90°, distorting the solve and preventing convergence to a valid pose. Conversely a child at world 80° with local -170° (violating local limits) passes the solver's world-space check unclamped, then gets snapped by applyIKResult's local clamp, so the applied pose no longer matches the solved positions.

_Suggested fix:_ In applyConstraints, compute each bone's local angle (segment world angle minus previous segment's world angle; root minus the chain-root parent rotation) and clamp that, then rebuild downstream positions from the clamped local angle.

### 150. [medium] packages/ui/src/components/Checkbox.tsx:106 _(controlled-uncontrolled)_

**Uncontrolled Checkbox never renders the check mark: visuals are driven solely by the `checked` prop, not the input's actual DOM state.**

The visible box renders `<Check/>` only when `checked` prop is truthy (line 106 `const isChecked = checked || indeterminate;` and lines 153-157). When used uncontrolled — `<Checkbox label="Loop" />` or `<Checkbox defaultChecked />` — `checked` is undefined, so React leaves the hidden input uncontrolled: clicking it toggles the real DOM checked state and fires onChange, but the visible box stays permanently empty (and `defaultChecked` renders an unchecked-looking box over a checked input). Checkbox.test.tsx only asserts onChange call counts ('handles click to toggle', line 27) so this is untested. The component silently displays the wrong state in a basic usage mode.

_Suggested fix:_ Mirror native state: track internal checked state for uncontrolled usage (initialize from defaultChecked, update in onChange) and use `checked !== undefined ? checked : internalChecked` to drive the visual box.

### 151. [medium] packages/ui/src/components/Checkbox.tsx:141 _(accessibility)_

**The `indeterminate` prop is visual-only: the native input's `indeterminate` DOM property is never set, so ARIA/AT state contradicts what sighted users see.**

`indeterminate` (line 94) only switches the rendered icon to a Minus (lines 153-154) and colors the box. The forwarded ref goes straight to the `<input>` (line 141-151) and no effect ever sets `inputEl.indeterminate = true` — the only way to set this state, since it is not an HTML attribute. Result: a screen reader announces the checkbox as plain 'not checked' while the screen shows a mixed-state indicator, `:indeterminate` CSS and `aria-checked="mixed"` semantics never apply, and clicking cycles checked state without the tri-state behavior the visual implies.

_Suggested fix:_ Merge the forwarded ref with an internal ref and add `useEffect(() => { if (inputRef.current) inputRef.current.indeterminate = indeterminate; }, [indeterminate])`.

### 152. [medium] packages/ui/src/components/Input.tsx:149 _(accessibility)_

**Input's `<label>` is not associated with the input — no htmlFor/id and it does not wrap the input — so clicking the label does nothing and AT does not announce the field name.**

At line 149 the label is rendered as a sibling (`{label && <label style={labelStyles}>{label}</label>}`) outside the input wrapper div, with no `htmlFor` and no generated `id` on the `<input>` (lines 156-163). Concretely: `render(<Input label="Email" />)` produces an input with no accessible name — `getByLabelText('Email')` fails, screen readers announce an unnamed edit field, and clicking the 'Email' text does not focus the input. Helper/error text (lines 170-171) is likewise not linked via `aria-describedby`, and `error` sets no `aria-invalid`. Input.test.tsx only checks the label text exists via getByText.

_Suggested fix:_ Generate an id with React.useId(), set it on the input and `htmlFor` on the label; link helper/error text with `aria-describedby` and set `aria-invalid` when error is true.

### 153. [medium] packages/ui/src/components/Panel.tsx:114 _(accessibility)_

**Collapsible panel header is a plain div with onClick — no keyboard access, no role, no aria-expanded — so keyboard and screen-reader users cannot expand/collapse panels at all.**

The code-level claim is fully accurate. However, the severity framing is slightly off: this `@quar/ui` Panel is a design-system library component (with Storybook stories) that is NOT currently used anywhere in the app — the editor's actual panels (PropertiesPanel, LayerPanel, TimelinePanel, etc.) are separate custom components, and no file imports/renders this `Panel`. So the 'core layout primitive' characterization and the appeal to the app's 'Keyboard-First' shortcut principle overstate the current blast radius. The accessibility gap is nonetheless a real defect in a reusable published component and worth fixing (add role=button, tabIndex, key handler, and aria-expanded/aria-controls). Medium severity is defensible for a shipped design-system component.

_Suggested fix:_ Render the toggle as a real `<button>` (or add tabIndex={0}, role="button", Enter/Space key handling) with `aria-expanded={isExpanded}` and `aria-controls` pointing at the content region.

### 154. [medium] packages/ui/src/components/Select.tsx:153 _(accessibility)_

**Select has the same unassociated `<label>` defect as Input: no htmlFor/id association, so the combobox has no accessible name and label clicks are dead.**

Line 153 renders `{label && <label style={labelStyles}>{label}</label>}` as a sibling of the wrapper div containing the `<select>` (lines 155-173); no `htmlFor` or `id` exists. `render(<Select options={...} label="Frame Rate" />)` yields a combobox with no accessible name (getByLabelText fails), screen readers announce an unnamed combobox, and clicking the label text does not focus/open the select. helperText/errorMessage (lines 176-177) are also not linked via aria-describedby.

_Suggested fix:_ Use React.useId() to associate label and select via htmlFor/id, and wire helper/error text through aria-describedby with aria-invalid on error.

### 155. [low] apps/web/src/components/canvas/GuideOverlay.tsx:161 _(correctness)_

**Drag-guide-back-onto-ruler removal checks `screen.x <= 0` / `screen.y <= 0`, but the rulers occupy canvas-local 0..RULER_SIZE, so dropping a guide on the visible ruler strip does not remove it.**

The canvas fills its container from (0,0) and the 20px rulers overlay it (CanvasRuler.module.css: hRuler at top:0, vRuler at left:0; Canvas.module.css: .canvas flex:1). Canvas-local coords over the ruler strip are in [0, 20], never <= 0, so the removal branch at lines 161-167 only triggers when the pointer leaves the canvas container entirely (over the toolbar panel). `RULER_SIZE` is imported on line 14 but never used, indicating the intended threshold. Scenario: drag a vertical guide and release it on the left ruler (the documented 'Figma behavior' per the file header comment, lines 8) -> the guide is not removed; it stays parked under the ruler.

_Suggested fix:_ Compare against RULER_SIZE (`screen.x <= RULER_SIZE` for x-guides, `screen.y <= RULER_SIZE` for y-guides), matching the ruler strip geometry.

### 156. [low] apps/web/src/components/common/ColorPicker.tsx:179 _(correctness)_

**emitColor (parent onChange + setHexInput) is called inside setHsv updater functions, a side effect in a state updater that double-fires onChange under StrictMode and risks setState-during-render when updaters are replayed.**

The core claim (side effect in a state updater that double-fires onChange under StrictMode) is confirmed. However the failure scenario's "Cannot update a component while rendering a different component" React error is overstated for the actual callers: in PropertiesPanel (handleFillPickerChange, line 724) onChange writes to sceneGraph.updateNode and the Zustand store (addKeyframeAtFrame), not a React setState of an ancestor component, so that specific render-phase warning does not fire from this path. The double-fired effects are also largely idempotent (same hex string, same node fill value, same keyframe at the same frame/value), so practical harm is minimal and dev-only. The concurrent-mode update-rebasing risk is theoretical for this app. Severity remains low; the genuine, demonstrable issue is the impure updater and the StrictMode dev double-emit, not production duplicate undo/keyframe corruption.

_Suggested fix:_ Compute the next HSV value outside the updater (`const next = {...hsv, s, v}; setHsv(next); emitColor(...)`) as updateAlpha already does at lines 234-236.

### 157. [low] apps/web/src/components/common/ExportDialog.tsx:333 _(correctness)_

**The Escape key handler is effectively dead: it is attached to a non-focusable backdrop div and the dialog never takes focus, so Escape neither closes the dialog when freshly opened nor cancels a running export.**

The claim is accurate for the fresh-open and during-export flows. Minor precision: the handler is not dead in absolutely every state — if the user manually clicks/tabs into a dialog input (e.g. the width field) or a tab button, focus moves into the backdrop's React subtree and Escape would then work. Severity adjusted to low because multiple working, tested dismissal paths exist (X button, Cancel button, backdrop mouseDown) plus an on-screen Cancel button during export, and there is no data loss or incorrect output; the only loss is the Escape keyboard affordance (still a genuine accessibility/dead-code defect, but lower impact than medium).

_Suggested fix:_ Register a document-level keydown listener in a useEffect (as ColorPicker does at line 353-359), or add tabIndex={-1} to the dialog and focus it on mount.

### 158. [low] apps/web/src/components/common/ImageAdjustments.tsx:145 _(correctness)_

**Negative values cannot be typed into the adjustment value fields even though half of every bipolar range is negative.**

Real defect only in ImageAdjustments.tsx, where the controlled type="text" value field (value={displayValue}, line 207) plus the !isNaN guard (line 145) causes React to erase a leading "-" (parseFloat("-")===NaN drops the keystroke, controlled-input restoration reverts the DOM). Effect: you cannot type a negative number left-to-right into the text field. It is NOT strictly impossible to reach negatives — the slider covers the full negative range, arrow keys clamp down to def.min, and typing digits then prepending "-" works — so the impact is a data-entry papercut, not lost functionality (hence low severity). The cross-referenced DynamicChainPanel.tsx (line 237) and WindPanel.tsx (line 129) inputs are type="number", not type="text"; number inputs preserve the intermediate "-" at the browser level, so they likely do NOT exhibit the same erasure and should not be lumped in as the "identical pattern."

_Suggested fix:_ Keep a local string state for the field while focused (commit on blur/Enter), or allow intermediate values like '-' and '-.' without resetting the input.

### 159. [low] apps/web/src/components/common/PromptDialog.tsx:174 _(correctness)_

**A second promptDialog() call while one is pending orphans the first promise, leaving its awaiting caller hung forever.**

promptDialog creates a Promise whose resolve is stored on the request object and pushed to the single PromptDialogHost via hostListeners (line 174). PromptDialogHost keeps only one request (`setRequest(req)`, line 185); if promptDialog is invoked again before the first dialog is confirmed/cancelled, the first request object is replaced without its `resolve` ever being called, so the first `await promptDialog(...)` never settles — any follow-up logic in that caller silently never runs. The same replace-without-notify pattern exists in ExportDialogHost, though it holds no promise.

_Suggested fix:_ When the host receives a new request while one is active, resolve the previous request with null before replacing it (or queue requests).

### 160. [low] apps/web/src/components/layout/Canvas.tsx:634 _(performance)_

**Smart Bones evaluation allocates fresh morph-offset Float32Arrays every RAF frame, permanently defeating the GPU skinning cache — packSkinnedVertices and a full VBO re-upload run per morphed node per frame even when the pose is static**

Confirmed: the fresh Float32Array reference from evaluateSmartBones makes ensureSkinnedCacheData's reference-identity check (`morphOffsets !== cached.lastMorphOffsets`) always fail, so buildBoneIdToIndex + packSkinnedVertices (a numVertices\*10 Float32Array alloc+fill) rerun every RAF frame for each morphed node even when the pose is static. Correction: the bufferSubData VBO re-upload (ShapeRenderer.ts:3223-3224) is NOT caused by this bug — it runs unconditionally every frame for every skinned node due to the shared skinnedVertexBuffer, so fixing the morph cache would only remove the CPU repack and the per-frame Float32Array allocations, not the GPU upload. The real fix is to make Smart Bones morph output stable-by-reference (reuse/mutate persistent Float32Arrays when the driver value is unchanged) so the skinned cache stays valid.

_Suggested fix:_ Make evaluateSmartBones results content-comparable (e.g., return the previous Map/arrays when driver bone rotations are unchanged, or compare a driver-rotation hash) and cache nodeVertexCounts, invalidating only on scene structure changes.

### 161. [low] apps/web/src/components/layout/Canvas.tsx:697 _(performance)_

**getDeformedBounds runs a second full CPU skinning pass (deformVertices over all mesh vertices) for every selected skinned node on every RAF frame, even when idle**

The render loop's deformed-bounds block (Canvas.tsx:687-753) calls shapeRenderer.getDeformedBounds per selected skinned node (and per skinned child for selected groups) every frame. getDeformedBounds (ShapeRenderer.ts:3597) re-collects bone world transforms and runs deformVertices — a full linear-blend-skinning pass allocating a new Float32Array over the whole mesh — solely to compute an AABB for the selection overlay. This duplicates the deformation the renderer already performs (CPU stroke path) or bypasses the GPU fill path entirely, and it runs even when no bone has moved. Selecting a 5,000-vertex skinned character doubles its skinning cost at 60fps while it sits still.

_Suggested fix:_ Reuse the deformed vertices computed during rendering (cache the last CPU-deformed array per node in the render pass), or skip recomputation when no bone transform changed since the previous frame (bone-transform version stamp).

### 162. [low] apps/web/src/components/layout/MenuBar.tsx:209 _(performance)_

**MenuBar subscribes to currentFrame and traverses the entire scene graph on every render, so it re-renders and does an O(n) traversal every frame during playback.**

Two minor precisions that do not change the verdict: (a) The dropdown menu bodies are conditionally rendered (`openMenu === 'file' && (...)` etc., MenuBar.tsx:410,433,669,763,854,1007,1042), so when no menu is open only the top-level menu buttons reconcile — the "whole 1200-line tree re-renders" is slightly overstated; the concrete waste is the full component-function execution (all ~13 useMemo dependency checks plus the unconditional traverse), not a reconcile of every dropdown subtree. (b) The traversal short-circuits at the first bone node encountered, so it is a full O(n) traversal only when the project contains zero bones; when bones exist it is a partial DFS. Either way it runs on every playback frame. currentFrame is only consumed inside Animation-menu onClick handlers (lines 780, 789-790, 799, 808), confirming the subscription contributes nothing to the rendered output yet still forces the per-frame re-render.

_Suggested fix:_ Read currentFrame lazily inside the click handlers via useEditorStore.getState(), and compute hasBoneNodes only when the Rigging menu is open (or cache it on nodeAdded/nodeRemoved events).

### 163. [low] apps/web/src/components/layout/PropertiesPanel.tsx:361 _(performance)_

**PropertiesPanel subscribes directly to currentFrame, so the entire 4,200-line panel re-renders on every frame during playback just to refresh keyframe indicator diamonds**

const currentFrame = useEditorStore((state) => state.currentFrame) makes the whole PropertiesPanel a per-frame subscriber: during playback, setCurrentFrame fires 30-60x/sec (usePlayback.ts:62), re-rendering the full panel — all sections, inputs, ScrubLabels, effect editors — even though only the small KeyframeIndicator components need the frame to compute their active/inactive state. It also subscribes to `timeline` (line 364), which is replaced wholesale on every keyframe operation and every graph-editor drag move. With a node selected and playback running, this adds a large recurring React reconciliation on top of Canvas/Timeline per-frame work.

_Suggested fix:_ Move currentFrame/timeline subscriptions down into KeyframeIndicator (each indicator subscribing to just the keyframe state it renders), or select a derived per-property keyframe-state value with an equality function.

### 164. [low] apps/web/src/components/layout/PropertiesPanel.tsx:2294 _(correctness)_

**Line Height scrub passes sensitivity 0.01 for a fractional property, but ScrubLabel rounds every output to an integer, so scrubbing snaps lineHeight to whole numbers**

ScrubLabel.tsx:51 computes `Math.round(Math.min(max, Math.max(min, startValue + delta)))` unconditionally, so the min=0.5/max=5/sensitivity=0.01 configuration here can only ever emit 1, 2, 3, 4, or 5. Scenario: text node with lineHeight 1.2; the user drags the LH scrub label one pixel -> Math.round(1.2 + 0.01) = 1, so lineHeight instantly snaps from 1.2 to 1.0, and no fractional value (the entire intended 0.01-step range) is reachable by scrubbing; the 30px of drag between integer steps produces no change at all.

_Suggested fix:_ Add a step/precision prop to ScrubLabel (round to the sensitivity's decimal precision instead of whole integers) or quantize in the caller before rounding.

### 165. [low] apps/web/src/components/layout/Timeline.tsx:180 _(correctness)_

**Releasing a work-area handle/body drag fires a click that bubbles to the ruler, jumping the playhead to the release position and clearing keyframe selection.**

The bug fires whenever the release click lands within the ruler subtree, which is the normal case (horizontal handle/bar drags stay over the ruler) and also plain clicks on a handle with no drag. It is not strictly 'every' interaction: if the user releases the pointer entirely outside the ruler's bounds and the browser uses geometric-target (rather than capture-target) click semantics, the common ancestor is above the ruler and handleRulerClick would not fire. In practice this escape is rare, so the impact is effectively every work-area handle/bar interaction: setCurrentFrame(releaseX) + clearKeyframeSelection().

_Suggested fix:_ Track that a work-area drag just ended (flag in workAreaDragRef cleared on the next tick) and ignore the ruler click, or call stopPropagation on the handles' onClick.

### 166. [low] apps/web/src/components/timeline/GraphEditor.tsx:337 _(correctness)_

**Shift-constrained keyframe drag never locks its axis: the second setDragMode in the same handler overwrites the first, so the constraint axis can flip mid-drag.**

In handleMouseMove's keyframe branch, setDragMode({...dragMode, axis}) at line 338 is immediately clobbered by setDragMode({...dragMode, startTime, startValue}) at line 353, which spreads the same stale dragMode where axis is still null. dragMode.axis therefore never persists, and each mousemove re-derives axis from dx>dy of the total displacement. A shift-drag that starts mostly horizontal (time-constrained) flips to vertical constraint the moment cumulative dy exceeds dx, making the keyframe's value jump abruptly to the full mouse offset.

_Suggested fix:_ Merge both updates into a single setDragMode call that includes the resolved axis along with the new startTime/startValue.

### 167. [low] apps/web/src/hooks/useProjectActions.ts:164 _(performance)_

**saveProject serializes the entire project twice per save (serializeProject, then serializeProjectToBinary which calls serializeProject again), doubling deep-clone cost on every 30s autosave.**

Line 152 calls serializeProject (structuredClone of every page's scene graph, timeline, symbols, rigging), and line 164 calls serializeProjectToBinary which internally calls serializeProject again (projectSerializer.ts line 195) on the same state — the `data` result is used only for its createdAt. For a large multi-page project this doubles a potentially very expensive main-thread deep clone every autosave tick, causing periodic UI jank. It also causes a minor inconsistency: the second call receives the stale `state.projectCreatedAt` captured before setState at line 159, so on a first save the binary written to disk gets a slightly different createdAt than the one kept in the store. saveProjectAs (lines 189-196) has the same double serialization.

_Suggested fix:_ Serialize once and pass the result to writeQuarFile directly (e.g., `writeQuarFile(data)`), reusing data.createdAt.

### 168. [low] apps/web/src/hooks/useProjectActions.ts:171 _(race-condition)_

**An in-flight autosave of the previous project can overwrite lastProjectId after openProject sets it, so the next app launch reopens the wrong project.**

Autosave calls saveProject asynchronously (line 446); saveProject captures projectId/state synchronously, then awaits dbSave before `await setLastProjectId(projectId)` at line 171. If the user opens project B while project A's autosave dbSave is still in flight, openProject's `setLastProjectId(B)` (line 222) and the autosave's `setLastProjectId(A)` race; if A's write lands last, lastProjectId points at A while the user is working in B, and the next session's loadOnMount (line 408) auto-loads project A instead of B. There is no generation/epoch check tying the save back to the currently open project.

_Suggested fix:_ Skip setLastProjectId in autosave when the store's current projectId no longer matches the id being saved, or only update lastProjectId on explicit user actions.

### 169. [low] apps/web/src/services/projectSerializer.ts:331 _(duplication)_

**The v1->v2 .quar migration is maintained in three places (core TS, web TS, Python MCP) and the copies have already drifted; the web copy is dead code that silently drops symbols.**

The duplication and drift are real, but the "silently drops symbols" impact is overstated. (a) The web migrateV1ToV2 is not literally dead — projectSerializer.test.ts:257 and :309 call deserializeProject with v1 data directly, exercising the branch; but none of those fixtures carry a `symbols` field, so the drift is untested. (b) ProjectDataV1 (projectSerializer.ts:27-49) has no `symbols` field in its type, and symbols were introduced in Sprint 22 (v2 era) — after v1 (pre-Sprint 21) was superseded — so a genuine v1 `.quar` file cannot contain symbols. The only way to trigger symbol loss is to hand-construct/cast a v1 object with a symbols field and route it directly to deserializeProject, bypassing parseQuarFile — which no production path and no test does. The substantive issue is therefore the triplication of a serialization-format migration across three languages that have already diverged (a future-drift hazard), not an active runtime data-loss bug; hence severity is better characterized as low.

_Suggested fix:_ Delete the web copy and re-export/reuse @quar/core's migrateV1ToV2; add shared .quar fixture files exercised by both the TS and Python test suites to lock the formats together.

### 170. [low] apps/web/src/services/projectSerializer.ts:463 _(correctness)_

**uploadProjectFile's promise never settles when the user cancels the file picker, leaving importProject permanently pending.**

The promise (lines 458-496) resolves/rejects only inside input.onchange, but when the user dismisses the OS file dialog without choosing a file, no change event fires, so the promise stays pending forever. importProject (useProjectActions.ts line 243) awaits it, so its try/catch and any UI state tied to the import flow never complete; each canceled attempt strands another pending promise and detached input element. Not user-visible beyond that, but any future code that awaits importProject to re-enable a button or show a spinner will hang on cancel.

_Suggested fix:_ Listen for the window 'focus' or the input's 'cancel' event (supported in modern browsers) to reject with a distinguishable 'cancelled' error that importProject can ignore silently.

### 171. [low] apps/web/src/stores/editorStore.ts:1664 _(correctness)_

**deleteSelection removes keyframe tracks only for the selected node ids, leaving orphaned tracks for all descendants of deleted groups.**

The claim that orphaned tracks are "evaluated every frame" and produce accumulating runtime effect is overstated. usePlayback.applyAnimations (usePlayback.ts:37-38) guards each animated node with `const node = sg.getNode(nodeId); if (!node) continue;`, so orphaned tracks for deleted nodes are iterated over (a minor per-frame cost in getAnimatedNodes) but skipped before any value is applied — no wrong animation and no crash. The actual harm is data-hygiene/leakage: dead tracks bloat in-memory timeline state and are serialized into saved .quar files unbounded. Because the guard contains all functional impact, low severity is more accurate than medium.

_Suggested fix:_ Before removeNode, collect sceneGraph.getDescendants(id) and call removeAllKeyframesForNode for each descendant as well.

### 172. [low] apps/web/src/stores/editorStore.ts:3251 _(correctness)_

**createSymbol on a node nested inside a transformed group places the new instance at the node's parent-relative coordinates at scene root, making the artwork jump.**

centerX/centerY are computed from node.transform.position (parent-relative), the originals are removed, and the instance is added with parent: null at that position (line 3265 addNode with no parentId). Scenario: rect at local (10,10) inside a group positioned at (200,200) (world (210,210)); select the rect and Create Symbol -> the instance node lands at root (10,10), so the shape visibly jumps 200px and leaves its group. The world transform of the original parent chain is never applied.

_Suggested fix:_ Either add the instance under the original parent at the same child index, or convert the roots' positions to world space via sceneGraph.getWorldTransform before computing the instance position.

### 173. [low] packages/animation/src/KeyframeManager.ts:200 _(data-loss)_

**copyKeyframes discards the source nodeId, so copying keyframes selected across multiple nodes and pasting merges them all onto one node, with same-property collisions silently overwriting each other.**

copyKeyframes accepts {nodeId, property, keyframeId} but entries only store property/time/value/easing (lines 200-205); pasteKeyframes writes every entry into tracks of the single target nodeId (line 227). Scenario: user shift-selects the 'transform.position.x' keyframes of node A (frame 0) and node B (frame 0) in the dope sheet, copies (editorStore.copySelectedKeyframes passes mixed nodeIds), then pastes at frame 20: both entries land on the same track at relative time 0, and Timeline.addKeyframe's same-time replace (line 132-134) keeps only the last one — node A's value is silently lost and node B never receives its keyframes.

_Suggested fix:_ Store nodeId in clipboard entries and paste per-source-node (offsetting to the target node only for single-node copies), or restrict copy to one node and surface that in the UI.

### 174. [low] packages/animation/src/PlaybackController.ts:229 _(race-condition)_

**If pause() (or dispose()) is called from within the onFrameChange callback, the tick's catch-up loop keeps advancing frames after the pause and \_scheduleFrame() still queues another rAF.**

Two refinements to the reviewer's description. First, it is currently LATENT: the only caller (apps/web/src/hooks/usePlayback.ts) does not pause/dispose from within onFrameChange — its store subscriber's pause condition `!curr.isPlaying && prev.isPlaying && ctrl.isPlaying` (line 91) never fires during normal playback because `curr.isPlaying` stays true. The defect is a real missing guard in a component explicitly documented as a reusable "Framework-agnostic rAF-based playback engine," and marker infra (addMarker/removeMarker) already exists, making a stop-at-marker caller plausible; "low" severity correctly reflects the latency. Second, the "stray rAF" is largely self-clearing: `_tick` re-checks `if (!this._playing || this._disposed) return;` at line 208, so the extra scheduled rAF fires once and returns harmlessly. The genuine observable harm is the overshoot (extra onFrameChange emissions past the paused frame). The stray rAF only becomes damaging if play() is called before it fires — play()'s `_scheduleFrame()` orphans the stray id, producing two concurrent tick loops (double-speed playback).

_Suggested fix:_ Add `if (!this._playing || this._disposed) return;` as the first statement after each \_setFrame inside the loop (or as a loop condition), and guard the trailing \_scheduleFrame() with the same check.

### 175. [low] packages/animation/src/PropertyBinding.ts:17 _(boundary-violation)_

**@quar/animation deep-imports core source via a relative path ('../../core/src/tweening/shapeTween') instead of the @quar/core package entry, duplicating the module into animation's build output.**

The import bypasses the declared workspace dependency (@quar/core is in packages/animation/package.json dependencies). tsup builds animation from src with this relative path, so shapeTween gets compiled/bundled INTO @quar/animation's dist while @quar/core ships its own copy — any consumer of the built packages loads two copies of the tweening code, and the animation bundle can go stale against core changes until animation is rebuilt. It also breaks dependency-graph tooling and dts rollup boundaries (core src files pulled into animation's rootDir).

_Suggested fix:_ Export prepareShapeTween/interpolateShapeTween/ShapeTweenData from @quar/core's index and import them via the package specifier.

### 176. [low] packages/core/src/Camera.ts:163 _(correctness)_

**pan() rotates the pan delta even though getViewMatrix composes translation before rotation (T(-pos)·R(-θ)), so panning moves the view in the wrong direction whenever camera rotation is non-zero.**

getViewMatrix builds m = translate(identity, -pos) then rotate(m, -θ), and mat3.multiply/translate/rotate compose right-to-left, so view(w) = R(-θ)·w - pos: position is applied AFTER rotation, meaning screen-space pan compensation must be Δpos = (-dx/zoom, +dy/zoom) with NO rotation term (Δn = -P·Δpos is rotation-independent). pan() instead applies R(+θ) to worldDelta when \_rotation !== 0 (lines 163-171). Scenario: camera.rotation = 90; user drags right by dx → rotated delta = (0, -dx/zoom) → content moves vertically instead of horizontally; at 45° it moves diagonally at the wrong angle. Related: fitBounds sets \_position to the world-space bounds center, which is also wrong under this view composition since position lives in rotated coordinates. Rotation is currently unset by the app UI, so this is a latent public-API defect (Camera.test.ts only tests the getter/setter).

_Suggested fix:_ Either compose the view matrix as R(-θ)·T(-pos) (rotate about the camera position) to match pan()/fitBounds semantics, or drop the rotation branch in pan().

### 177. [low] packages/core/src/Camera.ts:314 _(correctness)_

**getVisibleBounds computes the world AABB from only two viewport corners, which is wrong when camera rotation is non-zero.**

getVisibleBounds unprojects only (0,0) and (viewportWidth, viewportHeight). With \_rotation != 0 the visible world region is a rotated rectangle; its axis-aligned bounds require all four corners. Using only the diagonal underestimates the extent (e.g. at 45° rotation the two unprojected points can even have nearly equal x, yielding a near-zero-width rect). Consequence: Grid.render receives truncated visibleBounds and grid lines vanish from large parts of the viewport, and any bounds-based culling would incorrectly hide shapes. Latent until rotation is used, same caveat as the pan() finding.

_Suggested fix:_ Unproject all four viewport corners and take min/max over all of them.

### 178. [low] packages/core/src/font/FontManager.ts:57 _(correctness)_

**loadFontFromBuffer inserts into loadingPromises after the delete has already run, so the entry is never removed and isLoading() reports true forever for buffer-loaded fonts.**

The synchronous IIFE (lines 49-55) parses the font, caches it, and calls this.loadingPromises.delete(key) — a no-op because nothing has been set yet. Then line 57 executes `this.loadingPromises.set(key, Promise.resolve(promise))`, and that entry is never deleted. Concrete scenario: after `await fm.loadFontFromBuffer(buf, 'MyFont')` succeeds, `fm.isLoading('MyFont')` returns true for the rest of the session (until removeFont/dispose), so any UI keyed on isLoading (e.g. a spinner for local font uploads) would spin forever. Also a small bounded retention of the resolved promise per loaded font.

_Suggested fix:_ Set the loadingPromises entry before doing the work, or simply don't register a loading promise at all for the synchronous buffer path (parse, cache, return).

### 179. [low] packages/core/src/font/FontManager.ts:227 _(race-condition)_

**removeFont does not cancel in-flight loads: a pending loadFontFromUrl/loadGoogleFont for the removed family re-populates fontCache and availableFonts after removal.**

The code-level mechanism the reviewer describes is accurate, but the concrete "user removes the font" scenario is currently not reachable: removeFont() and FontManager.dispose() have no callers anywhere in packages/ or apps/ (removeFont appears only at its definition; the singleton is never disposed). This is therefore a latent correctness bug in a public API — real, but with effectively zero current runtime impact — which is consistent with the claimed low severity. A subtle addition: in the pending-load case removeFont doesn't even delete the loadingPromises entry, because it only iterates keys already present in fontCache (the in-flight key isn't there yet), so the stale load also survives isLoading()/loadingPromises cleanup.

_Suggested fix:_ Have the in-flight promise check whether its key is still present in loadingPromises (or check a generation counter) before writing to fontCache/availableFonts.

### 180. [low] packages/core/src/font/glyphConverter.ts:246 _(correctness)_

**textToSubpaths pairs glyphs with characters by index, but opentype.js stringToGlyphs applies GSUB ligature substitution by default, so glyph/char indices desynchronize.**

The core claim (char/glyph index desync mislabeling the per-glyph `char`, which becomes the PathNode layer name in convertTextToPathGroup) is correct and confirmed. However, the claim's secondary assertion that the mismatch also affects advanceWidth/kerning measurement is inaccurate: the measurement (lines 201-214) and layout advance (lines 271-278) read advanceWidth and getKerningValue from the glyph objects themselves, not from chars[i], so glyph spacing/positioning is correct. Only the chars[i] label pairing is wrong, so the impact is purely cosmetic (wrong layer/PathNode names after a ligature), which supports the 'low' severity.

_Suggested fix:_ Call stringToGlyphs with ligature features disabled (options.features), or map glyphs back to source characters via font.charToGlyphIndex per code point instead of assuming 1:1 index alignment.

### 181. [low] packages/core/src/font/textMetrics.ts:25 _(correctness)_

**getTextBounds ignores font weight, measuring bold text with the regular-weight font, so bounds and the renderer's anchor centering are computed from the wrong glyph widths.**

getTextBounds has no weight parameter and calls fm.getFont(fontFamily) (defaults to weight 400) at line 25, while rendering geometry uses getFontOrFallback(family, node.fontWeight). App.tsx loads both Inter 400 and Inter 700 at startup, so this divergence occurs in the default setup: for a text node with fontWeight 700, ShapeRenderer.renderText computes its anchor-centering offset from getTextBounds (ShapeRenderer.ts:2124) using Inter-400 advance widths, while the drawn glyphs use the wider Inter-700 metrics — bold text renders slightly off-center relative to transform.position, and any selection/hit-test bounds derived from getTextBounds are narrower than the actual bold glyphs (misses at the right edge, growing with text length).

_Suggested fix:_ Add a fontWeight parameter to getTextBounds/getTextBoundsFromFont and resolve the font via the same getFontOrFallback(family, weight) lookup the renderer uses.

### 182. [low] packages/core/src/rendering/ShapeRenderer.ts:981 _(memory-leak)_

**An image load that resolves after dispose() re-creates and caches a WebGL texture that is never deleted.**

dispose() deletes all cached textures and clears textureCache/pendingImages (lines 4377-4381), but an in-flight promise created by getTexture still runs its .then callback afterwards: it calls gl.createTexture(), uploads the image, and does this.textureCache.set(src, texture) (lines 966-981) on the already-disposed renderer. Since dispose has already run, nothing will ever delete that texture — one GPU texture leaks per image still loading when the canvas unmounts or the project switches. The same race applies to disposeTexture(src) called while that src is pending: the texture is re-added right after being 'disposed'.

_Suggested fix:_ Set a disposed flag in dispose() and check it (plus pendingImages membership) in the promise callback before creating/caching the texture.

### 183. [low] packages/core/src/rendering/ShapeRenderer.ts:984 _(performance)_

**A failing image src is retried on every render frame forever, spamming network requests and image decodes.**

getTexture's error handler (lines 983-985) only deletes the pendingImages entry and records nothing about the failure. On the next frame, renderImage calls getTexture again, which finds neither a cached texture nor a pending entry and starts a brand-new Image() load (lines 954-963). For an image node whose src is an unreachable URL or corrupt data URI, this issues a new request/decode attempt every animation frame (~60/s) indefinitely, flooding the network tab and console with errors.

_Suggested fix:_ Track failed srcs in a Set (optionally with a retry backoff) and have getTexture return null immediately for known-failed sources.

### 184. [low] packages/core/src/rendering/ShapeRenderer.ts:2702 _(performance)_

**renderFill converts the cached number[] fillIndices to a new Uint32Array on every draw call, allocating per fill per node per frame in the hottest render path**

Despite tessellation and earcut indices being cached, renderFill does `const indicesArray = new Uint32Array(fillIndices)` (line 2702) on every invocation — once per visible fill per node per RAF frame. The same pattern repeats in renderFillGradient (line 2880) and twice in renderSkinnedFillsGPU (lines 3246, 3261). A scene with 300 filled shapes allocates and copies 300+ typed arrays (each potentially thousands of indices) 60x/sec, plus setGradientUniforms allocates ~6 small Float32Arrays per gradient draw (lines 2921-2961). This is pure GC churn: the data is immutable once cached.

_Suggested fix:_ Store fillIndices as a Uint32Array in TessellationCacheEntry (earcut already returns an array that can be converted once at cache time) and upload it directly; reuse scratch Float32Arrays for gradient uniforms.

### 185. [low] packages/core/src/rendering/WebGLRenderer.ts:200 _(resource-leak)_

**createShaderProgram leaks GL objects on its error paths: the vertex shader is never deleted if the fragment shader fails to compile, and the program plus both shaders leak on link failure.**

compileShader() deletes only the shader it is compiling before throwing. If the fragment source fails to compile (line 200 throws), the already-compiled vertex shader from line 199 is never deleted. If gl.linkProgram fails (lines 212-215), the code throws without calling gl.deleteProgram(program) or gl.deleteShader on either shader. Scenario: a driver/ANGLE-specific shader compile or link failure (e.g. the 16-branch blend fragment shader in PostProcessShaders on a constrained mobile GPU) leaks a shader/program object per attempt; if the app retries creation, objects accumulate on the context until page reload.

_Suggested fix:_ Wrap compile/link in try/finally (or explicit cleanup) that deletes the vertex/fragment shaders and the program on every failure path.

### 186. [low] packages/core/src/SceneGraph.ts:345 _(correctness)_

**computeLocalMatrix passes the normalized anchor (0-1 fraction) to mat3.compose, which subtracts it as absolute local units, offsetting every world transform by a scale-dependent sub-pixel-to-multi-pixel amount.**

transform.anchor is a normalized fraction ({x:0.5,y:0.5} = center, see createDefaultTransform line 38, and getLocalBounds/ShapeRenderer which multiply anchor by width/height). mat3.compose (math.ts lines 249-273) instead translates by -anchor.x/-anchor.y directly, so computeLocalMatrix bakes a spurious rotate·scale·(-0.5,-0.5) offset into every world transform. At transform.scale 1 this is a 0.5px error, but polygons are resized by adjusting transform.scale (Sprint 8), so a polygon scaled 10x inside a group is offset 5px from where SelectionManager places it: getNodeBounds (line 107) composes WITHOUT anchor for root nodes while ShapeRenderer composes WITH the raw anchor (ShapeRenderer.ts lines 1579-1584), making the selection overlay visibly misaligned from the rendered shape for scaled root nodes.

_Suggested fix:_ Pass the anchor in local units (anchor multiplied by node dimensions) or drop the anchor argument from computeLocalMatrix/ShapeRenderer to match SelectionManager's convention, picking one consistent semantic.

### 187. [low] packages/core/src/SceneGraph.ts:448 _(data-loss)_

**fromJSON's orphan repair nulls the bad parent reference but never adds the node to rootNodeIds, so the node silently disappears yet keeps getting re-saved.**

Lines 446-450: if node.parent points to a missing node, fromJSON sets node.parent = null but does not append the id to the root list (validRootIds is filtered solely from data.rootNodeIds, line 453). The 'repaired' node is therefore unreachable from traverse()/getRootNodes() — it never renders and never appears in the layer panel — while remaining in the nodes map, so toJSON() re-serializes it into every subsequent save. From the user's perspective the content is lost with no way to recover it in the UI, and the file grows with invisible nodes; either rooting the orphan or dropping it (with its subtree) would be consistent, but the current half-repair is neither.

_Suggested fix:_ When fixing an orphan, either push node.id into the root list (making the content visible/recoverable) or delete the node and its subtree from newNodes.

### 188. [low] packages/core/src/svg/svgExporter.ts:210 _(round-trip-fidelity)_

**transformToSvgAttr silently drops the skew component of a node transform, so skewed nodes (including ones just imported from SVGs with skewX/matrix shear) export unskewed.**

Accurate as described. Minor refinement: because decomposeMatrix folds part of the shear into scaleY (scaleY=sqrt(c^2+d^2)), the export is not a clean "unskew to identity" — it emits a nonzero scale.y that stretches the shape, so the exported result is wrong in both the missing shear and the residual over-scale. Net effect is still a visibly different, non-round-tripping shape, consistent with the claim.

_Suggested fix:_ Emit skewX/skewY components (or compose the full matrix() attribute when skew is nonzero).

### 189. [low] packages/core/src/tools/EraserTool.ts:182 _(correctness)_

**Eraser stroke preview fill uses 0-1 color components against the project's 0-255 Color convention, rendering near-black instead of red.**

getPreviewNode sets fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, ... }]. The Color type is documented as 0-255 per channel (packages/types/src/index.ts:42-45) and ShapeRenderer divides by 255 when uploading uniforms (ShapeRenderer.ts:2923, 4341), so the preview renders at rgb(0.004, 0, 0) — an almost-black 30%-opacity blob rather than the intended red eraser indicator. Contrast ArtboardTool.ts:143 which correctly uses r/g/b = 255.

_Suggested fix:_ Use { r: 255, g: 0, b: 0, a: 1 } for the preview fill.

### 190. [low] packages/core/src/tools/EraserTool.ts:527 _(correctness)_

**Sibling indices captured before mutation cause z-order shuffling when one eraser stroke removes some shapes and replaces others under the same parent.**

Candidate indices are recorded during traversal (lines 384-394) before any removals. Replacement is removeNode + addNode (appends last) + moveNode(resultNode.id, parentId, index) with the stale index (line 527). Scenario: siblings [A, B, C]; one stroke fully erases A (removed) and bites into B. After A's removal children are [C], B' is appended -> [C, B'], then moveNode to stale index 1 keeps [C, B'] — B now renders above/after C instead of below it. Any multi-shape erase where an earlier sibling is fully deleted reorders the survivors' stacking.

_Suggested fix:_ Recompute the sibling index at replacement time (position of the node being replaced just before removeNode) instead of using the index captured during traversal.

### 191. [low] packages/core/src/tools/PenTool.ts:288 _(correctness)_

**Degenerate-path check only inspects anchor positions and ignores bezier handles, discarding valid loop-shaped paths whose anchors coincide.**

finalizePath cancels when the anchor-point bounding box is under 0.1x0.1 world units (lines 278-291), without accounting for handleIn/handleOut extents. Scenario: with the pen tool, click at a point and drag out large handles (smooth point), then click again at (nearly) the same position and press Enter — the two anchors span < 0.1 units but the handles form a visible loop with real area; finalizePath cancels and the user's drawn curve is silently discarded.

_Suggested fix:_ Include handle offsets (position + handleIn/handleOut) in the bounding-box computation, or use bezier.bounds() over the segments before declaring the path degenerate.

### 192. [low] packages/export/src/exportUtils.ts:33 _(data-loss)_

**A filename pattern without the {N} placeholder generates identical filenames for every frame, so JSZip silently overwrites and the exported ZIP contains only the last frame.**

generateFrameFilenames does `pattern.replace('{N}', paddedFrame)`; if {N} is absent the pattern is returned unchanged for all frames. The ExportDialog Pattern field is free text (apps/web/src/components/common/ExportDialog.tsx:471-478) — a user typing 'frame' gets 60 identical names, zip.file() replaces prior entries, and the 'successful' export delivers a ZIP with a single PNG while 59 rendered frames are silently discarded.

_Suggested fix:_ Append the frame number when {N} is missing (or validate the pattern in the dialog).

### 193. [low] packages/export/src/lottie/lottieExporter.ts:102 _(correctness)_

**buildNodeResolver claims to walk children recursively but only maps the passed array, so exportToLottieJson without an explicit resolver silently drops every group.**

The doc comment says 'walks children recursively' but addNode never recurses (children are id strings and only top-level nodes are mapped). When the public API exportToLottieJson/exportLottieBlob is called with root nodes and no nodeResolver (the parameter is optional), groupToLottieShapes (lottieConverter.ts:257-263) resolves child ids to undefined, produces zero shapes, and nodeToLottieLayer returns null — all group layers vanish from the export. The in-app caller happens to pass sceneGraph.getNode (ExportDialog.tsx:140), so this only bites programmatic/library users, but the default behavior of the exported API contradicts its contract.

_Suggested fix:_ Require a resolver, or accept the full flat node list separately from the root list so the fallback map actually contains descendants.

### 194. [low] packages/export/src/lottie/lottieExporter.ts:104 _(correctness)_

**buildNodeResolver claims to walk children recursively but only maps the top-level array, so groups silently export empty whenever no explicit nodeResolver is passed.**

Accurate as described, with one clarification about the implied fix: buildNodeResolver cannot actually "walk children recursively" as its docstring claims, because children are stored as string IDs, not Node objects — from a root-nodes array there are no child Node objects to recurse into. The fallback is therefore only ever correct if the caller passes a pre-flattened array containing every node object, which in turn triggers the duplicate-top-level-layer problem. So the fallback resolver is effectively unusable for any scene containing groups regardless of how the caller shapes the input; a correct fix requires the caller to supply a real scene-graph resolver (as ExportDialog does) rather than fixing buildNodeResolver alone.

_Suggested fix:_ Require a resolver (or accept a SceneGraph), or document that groups need the resolver and emit a warning/count when children cannot be resolved.

### 195. [low] packages/export/src/lottie/lottieKeyframes.ts:302 _(correctness)_

**bakeTrackToLinearKeyframes samples with plain linear interpolation, ignoring keyframe easing, so 'baking' produces output identical to linear and cannot preserve bounce/elastic as documented.**

Accurate as stated. One clarification worth noting: the production consequence is not that real exports become linear — bakeTrackToLinearKeyframes is never invoked in the pipeline (only in tests). The live single-value path (quarKeyframeToLottie) instead emits a hold (h:1) for non-bezier easings. So the defect is a broken/misleading exported API with a false docstring and no live impact today, rather than a bug corrupting current .lottie output.

_Suggested fix:_ Sample using the animation package's interpolateValue/applyEasing (the 'after' keyframe's easing per Timeline.ts:230-232) instead of raw lerp.

### 196. [low] packages/rigging/src/ik.ts:145 _(correctness)_

**solveFABRIK initializes the end-effector tip along the direction from the second-to-last joint to the last joint (the parent bone's segment direction) instead of along the last bone's own world rotation, so the initial tip is wrong whenever the last bone is bent.**

The claim's flagship "popping to a wrong pose" example is imprecise: dragging the target to (200,0) and getting a straight arm is the CORRECT IK solution (a fully extended 200-unit chain reaching (200,0) must be straight), and in every unconstrained early-exit the fabricated tip equals the straightened pose's actual tip, so the tip still lands on the target — no incorrect final pose. The accurate, observable symptoms are: (1) a bent last bone never triggers early convergence — even when its true tip already coincides with the target the solver reports a large initial error and runs full iterations every frame; (2) early-exit discards the artist's bent last-bone orientation (loss of pose continuity); and (3) a truly wrong result arises only when the last bone has angle constraints excluding the straight orientation, in which case applyIKResult (lines 421-426) clamps it off-target after converged=true was already reported. The underlying code defect — initial tip built along the parent segment direction instead of the last bone's own (available) world rotation — is real.

_Suggested fix:_ extractIKJoints already has access to the scene graph — compute the true tip from the last bone's world transform (wt.a _ length + tx, wt.b _ length + ty, as boneHelpers.getBoneWorldTip does) and pass it into the solver, or extend IKJoint with a world rotation.

### 197. [low] packages/ui/src/components/Button.tsx:149 _(ui-state)_

**Loading buttons keep enabled styling and hover state, and `isHovered` sticks true when the button becomes disabled while hovered because disabled elements do not dispatch mouseleave.**

All three effects are real, but with one precision: the "active hover coloring" on a loading button is not unconditional — it requires `isHovered` to already be true (the button was hovered before becoming loading/disabled, or the stuck-hover state from a prior cycle). A freshly-mounted `<Button loading>` that was never hovered shows `cursor:pointer` and full opacity (both unconditional and clearly wrong), but not hover coloring, since it cannot receive a mouseenter while DOM-disabled. The finding's "worse" scenario correctly describes the hover-coloring precondition, so the overall description is accurate.

_Suggested fix:_ Treat `disabled || loading` as the effective disabled flag for both style branches, and reset isHovered when the effective disabled flag becomes true (e.g. in an effect).

### 198. [low] packages/ui/src/components/Button.tsx:168 _(accessibility)_

**iconOnly buttons drop `children` from the DOM with no accessible-name fallback, producing nameless buttons for screen readers.**

Line 168 `{!iconOnly && children}` removes the only text content when iconOnly is true, and the component neither requires nor derives an aria-label — `<Button iconOnly iconLeft={<TrashIcon/>}>Delete</Button>` renders a button announced as just 'button'. The sibling IconButton component has the same trap when its optional `tooltip` prop (used as `title`) is omitted. Additionally, when `loading` is true the button gives no `aria-busy`/live indication that it is busy — AT users only observe that the label vanished.

_Suggested fix:_ When iconOnly, apply children (if string) as aria-label or require an aria-label prop; add aria-busy={loading}.

### 199. [low] packages/ui/src/components/Tooltip.tsx:76 _(race-condition)_

**showTooltip never clears an already-pending timer, so the mouseenter+focus double-arm leaves an orphaned timeout that makes the tooltip appear and stick after the pointer has left.**

The wrapper div arms showTooltip on both onMouseEnter and onFocus (lines 147-149), and `timeoutRef.current = window.setTimeout(...)` (line 76) overwrites the ref without clearing the previous timer. Scenario with delay=300: hover a button at t=0 (timer A stored), click it at t=100 (focusin bubbles, timer B overwrites the ref, timer A is orphaned), move the mouse away at t=200 (hideTooltip clears only timer B and hides). Timer A still fires at t=300, calling setIsVisible(true) — the tooltip appears with the pointer elsewhere and stays visible until the button loses focus, since no further mouseleave will occur. Hover-then-click on toolbar buttons is a very common interaction.

_Suggested fix:_ At the top of showTooltip, clear any pending timeout (`if (timeoutRef.current) clearTimeout(timeoutRef.current)`) before setting a new one.

### 200. [low] packages/ui/src/components/Tooltip.tsx:99 _(tooltip-positioning)_

**Tooltip has no viewport clamping or flipping, so tooltips on elements near screen edges render fully or partially off-screen.**

The positioning defect (no viewport clamping/flipping, off-screen render for edge-adjacent triggers, nowrap preventing wrap, and one-shot positioning that never repositions on scroll) is genuine in the packages/ui Tooltip component. But the failure narrative's concrete example is inaccurate: toolbar/menu buttons do not use this component — apps/web renders tooltips via the native `title` attribute (Toolbar.module.css:137 comment), and a repo-wide search finds no consumer of `@quar/ui`'s Tooltip anywhere in apps/web. The bug is a latent flaw in an exported-but-unused library component, so there is no current user-facing off-screen tooltip; hence severity is low rather than medium.

_Suggested fix:_ After the initial placement, measure the tooltip's own rect and clamp/flip against window.innerWidth/innerHeight (flip top<->bottom, left<->right when overflowing), and reposition or hide on scroll.

### 201. [low] packages/ui/src/components/Tooltip.tsx:155 _(accessibility)_

**Tooltip content is not exposed to assistive technology: no role="tooltip", no aria-describedby link, and the shortcut text is invisible to screen readers.**

The finding is correct that the generic Tooltip component exposes nothing to assistive tech. One nuance: IconButton (IconButton.tsx line 138) does set a native `title={tooltip}` when given a `tooltip` prop, so an icon-only IconButton that receives a tooltip prop still gets a native accessible name via that title. However, the Tooltip wrapper component itself provides no such guarantee, and the `shortcut` hint exists only inside the Tooltip div and nowhere else, so it remains unreachable non-visually. The core defect — Tooltip has no role="tooltip", no aria-describedby wiring, and no id — is real regardless.

_Suggested fix:_ Give the tooltip div role="tooltip" and a stable id (React.useId()), set aria-describedby={id} on the wrapper, and hide on Escape per the ARIA tooltip pattern.

### 202. [low] packages/ui/src/theme.ts:39 _(theme-consistency)_

**theme.ts (and the Storybook preview that mirrors it) still carries the pre-Sprint-3.5 token set — blue #3B82F6 accent, Inter/JetBrains fonts, z-tooltip 500 — diverging from every value the app actually uses.**

Two refinements to the failure scenario. (1) No UI component or the web app imports the theme/colors object directly — the app is styled purely by globals.css — so the divergence produces no wrong rendering in the shipped product; the only concrete, current impact is Storybook (components visually reviewed against blue/Inter theme), while generateCSSVariables is a latent landmine with zero callers. (2) The exact "tooltips underneath modals" example is imprecise: if generateCSSVariables() ran it would emit --z-modal:300 and --z-tooltip:500, leaving tooltip ABOVE modal; the real inversion is tooltip 500 falling below the app's un-emitted --z-overlay:1000 / --z-color-picker:1040. The z-index staleness/inversion risk is real; the specific pairing in the writeup is wrong.

_Suggested fix:_ Make globals.css generated from theme.ts (or vice versa) so there is one token source; update theme.ts/Storybook to the Sprint 3.5 values, or delete generateCSSVariables if globals.css is authoritative.
