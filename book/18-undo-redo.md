# Undo & Redo

## The Simplest Correct Approach

Undo is the most important feature in any creative application. It's the safety net that makes experimentation possible. Move a shape to the wrong place — undo. Delete a group by accident — undo. Apply an ugly gradient — undo. Without undo, every action is irreversible, and users become cautious, tentative, afraid to try things. With undo, they become fearless.

There are two major approaches to implementing undo. The command pattern records each mutation as a reversible command object: "move node X from position A to position B" has an undo that moves it back from B to A. Every operation needs a forward and backward implementation. This is elegant, efficient in memory (you store deltas, not full state), and nightmarishly complex to get right. Every new feature requires a new command type. Compound operations (group + move + resize) require transaction support. Commands that affect multiple subsystems (deleting a node removes it from the scene graph, its keyframes from the timeline, and its skin data from the rigging system) require coordinated undo across all those subsystems.

The snapshot approach is simpler. Before each mutation, capture the entire document state. To undo, restore the captured state. No per-operation reverse logic, no command types, no transaction management. The cost is memory — each snapshot is a full copy of the document — but for a 2D vector editor, documents are small. A scene graph with 200 nodes serializes to maybe 50KB of JSON. Fifty undo snapshots is 2.5MB. Users won't notice.

We chose snapshots. The entire undo/redo system is about 80 lines of store code, and it has never produced a bug where undoing one operation corrupted a different operation's state — because there are no per-operation undo handlers to get wrong.

## The Snapshot

A snapshot captures two things: the scene graph's serialized state, and the current selection:

```typescript
const MAX_UNDO_STACK_SIZE = 50;

interface HistorySnapshot {
  sceneData: { nodes: Node[]; rootNodeIds: string[] };
  selectedNodeIds: string[];
}
```

The `sceneData` comes from `sceneGraph.toJSON()`, which returns every node and the root node ordering. The `selectedNodeIds` is a flat array of IDs. Together, these two pieces are enough to restore the editor to its exact visual state before the mutation.

Why include the selection? Because the selection is part of what the user sees. If they select three shapes, delete them, and undo, they expect to see those three shapes selected again — not just restored but deselected. The selection is part of the user's mental model of "what things looked like before."

Why not include the timeline, guides, or other state? Because the undo system only covers document structure mutations. Moving a shape undoes. Creating a keyframe undoes (the keyframe lives in the timeline, which is separate — but keyframe mutations also call `pushUndo`). Changing the active tool doesn't undo. Zooming the camera doesn't undo. The principle: undo reverses things that change the document, not things that change the view.

## The Two Stacks

The undo/redo state is two bounded stacks:

```typescript
undoStack: [] as HistorySnapshot[],
redoStack: [] as HistorySnapshot[],
canUndo: false,
canRedo: false,
```

The `canUndo` and `canRedo` booleans are derived state — they're `true` when the respective stack is non-empty. They exist as separate fields so that UI components (the Edit menu, the toolbar buttons) can subscribe to them via Zustand selectors without subscribing to the entire stack array.

### Push

Every mutation starts by pushing the current state onto the undo stack:

```typescript
pushUndo: (sceneGraph: SceneGraphLike) => {
  const { undoStack, selectedNodeIds } = get();
  const snapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  const newStack = [...undoStack, snapshot];
  if (newStack.length > MAX_UNDO_STACK_SIZE) {
    newStack.shift();
  }
  set({
    undoStack: newStack,
    redoStack: [],
    canUndo: true,
    canRedo: false,
  });
},
```

Three critical details:

**`structuredClone`.** The scene graph data must be deep-cloned at the moment of capture. Without cloning, the snapshot would hold references to the same node objects that the scene graph is about to mutate. By the time undo reads the snapshot, the node objects would already reflect the post-mutation state — the snapshot would be useless. `structuredClone` creates a complete independent copy with no shared references.

**Stack size cap.** The stack is capped at 50 entries. When it exceeds the limit, the oldest entry (`shift()`) is discarded. This prevents memory from growing unboundedly during long editing sessions. Fifty undos is generous — most users rarely go back more than five or ten steps.

**Redo stack cleared.** Pushing a new undo entry clears the entire redo stack. This implements the standard undo/redo branching model: if you undo three times and then make a new edit, those three "future" states are gone. You've forked the timeline. This is universal across all editors and matches user expectations.

### Undo

Undoing pops the last snapshot from the undo stack, saves the current state to the redo stack, and restores:

```typescript
undo: (sceneGraph: SceneGraphLike) => {
  const { undoStack, redoStack, selectedNodeIds } = get();
  if (undoStack.length === 0) return;

  // Save current state to redo stack
  const currentSnapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  const newRedoStack = [...redoStack, currentSnapshot];

  // Pop and restore from undo stack
  const newUndoStack = [...undoStack];
  const snapshot = newUndoStack.pop()!;
  sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

  set({
    undoStack: newUndoStack,
    redoStack: newRedoStack,
    canUndo: newUndoStack.length > 0,
    canRedo: true,
    selectedNodeIds: new Set(snapshot.selectedNodeIds),
    enteredGroupId: null,
    isDirty: true,
  });
},
```

The restore calls `sceneGraph.fromJSON()`, which performs an atomic swap — it parses the snapshot data into a temporary map, validates all parent references, and only then replaces the scene graph's internal state. If the snapshot is somehow corrupted (missing nodes, invalid parent links), the parse step fixes what it can before swapping. The scene graph is never in a half-restored state.

The `structuredClone` on restore (`structuredClone(snapshot.sceneData)`) is also important. Without it, the scene graph would hold direct references to the snapshot's node objects. The next mutation would modify those objects in place, corrupting the snapshot on the redo stack. Clone on save, clone on restore — never share references between live state and stored state.

The `enteredGroupId: null` clear was covered in Chapter 17. After undo, the group the user was inside might not exist anymore.

### Redo

Redo is the mirror image — pop from the redo stack, push current state to undo, restore:

```typescript
redo: (sceneGraph: SceneGraphLike) => {
  const { undoStack, redoStack, selectedNodeIds } = get();
  if (redoStack.length === 0) return;

  const currentSnapshot: HistorySnapshot = {
    sceneData: structuredClone(sceneGraph.toJSON()),
    selectedNodeIds: Array.from(selectedNodeIds),
  };
  const newUndoStack = [...undoStack, currentSnapshot];

  const newRedoStack = [...redoStack];
  const snapshot = newRedoStack.pop()!;
  sceneGraph.fromJSON(structuredClone(snapshot.sceneData));

  set({
    undoStack: newUndoStack,
    redoStack: newRedoStack,
    canUndo: true,
    canRedo: newRedoStack.length > 0,
    selectedNodeIds: new Set(snapshot.selectedNodeIds),
    enteredGroupId: null,
    isDirty: true,
  });
},
```

The symmetry is exact. Undo moves a snapshot from the undo stack to the redo stack. Redo moves a snapshot from the redo stack to the undo stack. The current state is always saved to the opposite stack before restoring, so you can bounce back and forth: undo, redo, undo, redo — each step preserving the ability to go the other direction.

## When to Push

The hardest design question in an undo system isn't how to undo — it's when to capture. Push too often, and the user has to press Ctrl+Z twenty times to undo a single drag (one snapshot per frame of mouse movement). Push too rarely, and the user can't undo individual operations.

The rule is: **push once at the start of each discrete user action.** A discrete action is something the user perceives as one operation: delete a node, paste from clipboard, apply a boolean operation, group selected nodes.

### Discrete Mutations in Store Actions

Every store action that modifies the document calls `pushUndo` as its first line:

```typescript
deleteSelection: (sceneGraph) => {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size === 0) return;
  get().pushUndo(sceneGraph);
  // ...remove nodes...
},

groupSelection: (sceneGraph) => {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size < 2) return;
  get().pushUndo(sceneGraph);
  // ...create group, reparent children...
},

pasteClipboard: (sceneGraph) => {
  const { clipboard } = get();
  if (!clipboard || clipboard.length === 0) return;
  get().pushUndo(sceneGraph);
  // ...create new nodes from clipboard...
},
```

The pattern is consistent: validate preconditions first (return early if nothing to do), then push, then mutate. The push captures the state _before_ the mutation. The early return is important — without it, a no-op delete (no selection) would push an empty undo entry, wasting a stack slot and confusing the user when Ctrl+Z "undoes" something invisible.

### Continuous Operations: The Transform Start Callback

Dragging a shape is not fifty discrete operations — it's one. The user grabs a handle, moves it, and releases. The entire drag is one undoable action, regardless of how many `pointerMove` events fire during the drag.

The solution is the `onTransformStart` callback in the `ToolContext`:

```typescript
interface ToolContext {
  onTransformStart?: () => void;
  // ...
}
```

The selection tool calls `onTransformStart` once, at the beginning of a drag — when the mode transitions to `'moving'`, `'resizing'`, or `'rotating'`:

```typescript
// In SelectionTool.onPointerDown:
this.context.onTransformStart?.();
this.mode = 'moving';
this.state.isDragging = true;
```

The React hook wires this to `pushUndo`:

```typescript
const onTransformStart = useCallback(() => {
  useEditorStore.getState().pushUndo(sceneGraphRef.current);
}, []);
```

One call at the start of the drag. No calls during `pointerMove`. No call at `pointerUp`. The entire move/resize/rotate is captured by the single snapshot taken when the drag started. Undo restores to the position before the drag began.

This design means the tool system doesn't know or care about undo. The tools call `onTransformStart` when a continuous operation begins — the consumer decides what to do with that signal. In our case, the consumer pushes an undo snapshot. In a different editor, it might start a network sync or begin a telemetry event.

### Scrub Gestures in the Properties Panel

The Properties Panel has a similar problem. The `ScrubLabel` component lets the user click-and-drag on a label (like "X" or "Width") to scrub the value continuously. Each pixel of mouse movement triggers an `onChange` callback that updates the property. Without undo integration, this would push a snapshot on every pixel — dozens of snapshots for one scrub gesture.

The `ScrubLabel` component has an `onScrubStart` callback:

```typescript
interface ScrubLabelProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onScrubStart?: () => void;
  // ...
}
```

Called once when the user starts dragging. The Properties Panel wires it to `pushUndo`:

```typescript
const handleScrubStart = useCallback(() => {
  pushUndo(sceneGraph);
}, [pushUndo, sceneGraph]);
```

And passes it to every `ScrubLabel`:

```tsx
<ScrubLabel
  label="X"
  value={posX}
  onChange={handlePositionXChange}
  onScrubStart={handleScrubStart}
/>
```

One snapshot when the scrub begins. All the intermediate value changes during the drag are part of one undoable operation. Undo restores to the value before the scrub started.

## The Double-Push Pitfall

One action in the store had a subtle bug potential: `cutSelection`. Cut is copy + delete. Both `pasteClipboard` and `deleteSelection` call `pushUndo` internally. If `cutSelection` simply called `copySelection` then `deleteSelection`, it would push two undo snapshots for one user action — and undoing would only undo the delete, leaving the clipboard populated but the nodes still gone.

The fix: `cutSelection` does its own `pushUndo` and then inlines the deletion logic instead of calling `deleteSelection`:

```typescript
cutSelection: (sceneGraph) => {
  const { selectedNodeIds, copySelection, timeline } = get();
  if (selectedNodeIds.size === 0) return;

  // Push undo snapshot before cut
  get().pushUndo(sceneGraph);

  // Copy to clipboard
  copySelection(sceneGraph);

  // Delete selection (inline to avoid double pushUndo)
  const mgr = new KeyframeManager(timeline);
  for (const id of selectedNodeIds) {
    mgr.removeAllKeyframesForNode(id);
    sceneGraph.removeNode(id);
  }
  set({
    selectedNodeIds: new Set<string>(),
    editingGradient: null,
    timeline: { ...timeline },
    isDirty: true,
  });
},
```

The comment `// Delete selection (inline to avoid double pushUndo)` is important documentation. Without it, a future developer might "clean up" by calling `deleteSelection` directly — reintroducing the double-push bug.

A similar pattern exists with `duplicateSelection`. Duplicate is copy + paste, and `pasteClipboard` already calls `pushUndo`. So `duplicateSelection` does _not_ push separately:

```typescript
duplicateSelection: (sceneGraph) => {
  const { copySelection } = get();
  // pushUndo is called inside pasteClipboard, so no extra push needed here
  copySelection(sceneGraph);
  get().pasteClipboard(sceneGraph);
},
```

The asymmetry is worth noting: `cutSelection` pushes and inlines the delete. `duplicateSelection` delegates to `pasteClipboard` which pushes. Both produce exactly one undo entry per user action, but they achieve it through different patterns. The comments explain why each pattern is what it is.

## Per-Page Undo Stacks

Chapter 21 introduces multi-page projects. Each page has its own scene graph, timeline, and selection — and its own undo/redo history. When the user switches pages, the current page's undo and redo stacks are saved alongside the page data:

```typescript
interface PageData {
  id: string;
  name: string;
  sceneGraphJSON: { nodes: Node[]; rootNodeIds: string[] };
  timeline: Timeline;
  selectedNodeIds: string[];
  undoStack: HistorySnapshot[];
  redoStack: HistorySnapshot[];
}
```

On page switch, the current page's stacks are persisted and the target page's stacks are restored:

```typescript
switchPage: (pageId, sceneGraph) => {
  const state = get();

  // Save current page state
  const updatedPages = state.pages.map((p) => {
    if (p.id !== state.activePageId) return p;
    return {
      ...p,
      sceneGraphJSON: structuredClone(sceneGraph.toJSON()),
      timeline: structuredClone(state.timeline),
      selectedNodeIds: Array.from(state.selectedNodeIds),
      undoStack: state.undoStack,
      redoStack: state.redoStack,
    };
  });

  // Restore target page
  const targetPage = updatedPages.find((p) => p.id === pageId)!;
  sceneGraph.fromJSON(structuredClone(targetPage.sceneGraphJSON));

  set({
    pages: updatedPages,
    activePageId: targetPage.id,
    undoStack: targetPage.undoStack,
    redoStack: targetPage.redoStack,
    canUndo: targetPage.undoStack.length > 0,
    canRedo: targetPage.redoStack.length > 0,
    // ...restore other page state...
  });
},
```

This means undoing on Page 2 only undoes Page 2's changes. Page 1's history is untouched. The user can switch to Page 1, undo there, switch back to Page 2, and undo independently. Each page is a self-contained editing context.

The `structuredClone` calls during page switching serve the same purpose as during undo/redo: preventing shared references between live state and stored state. Without cloning, the saved page data and the active store would share node object references, leading to corruption when one is mutated.

## Clearing History

Several operations invalidate the undo history because they replace the entire document state:

```typescript
clearHistory: () => {
  set({
    undoStack: [],
    redoStack: [],
    canUndo: false,
    canRedo: false,
  });
},
```

This is called by:

- **New project**: The document is empty. There's nothing to undo to.
- **Open project**: The document is loaded from disk. The undo history belongs to the previous document, not this one.
- **Import**: Similar to open — the imported state replaces the current state.

The decision to clear on open (rather than preserving cross-document undo) is pragmatic. An undo entry from Document A applied to Document B would produce nonsensical results — the node IDs wouldn't match, the scene graph structure would be wrong, and the restore would silently corrupt the document. Clearing is the safe choice.

## The SceneGraph Contract

The undo system depends on two methods from the `SceneGraph` class:

```typescript
interface SceneGraphLike {
  toJSON(): { nodes: Node[]; rootNodeIds: string[] };
  fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void;
  // ...other methods...
}
```

`toJSON` serializes the entire scene graph into a plain object. Every node, every property, every parent-child relationship, every subpath — all captured in a single serializable structure.

`fromJSON` replaces the scene graph's contents with deserialized data. The implementation is careful:

```typescript
fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void {
  // Validate inputs
  if (!Array.isArray(data.nodes)) {
    data.nodes = [];
  }
  if (!Array.isArray(data.rootNodeIds)) {
    data.rootNodeIds = [];
  }

  // Parse into temp map — validate before destroying current state
  const newNodes = new Map<string, Node>();
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string' || node.id.length === 0) {
      continue; // Skip invalid nodes
    }
    this.migrateNodeFillsStrokes(node);
    newNodes.set(node.id, node);
  }

  // Validate parent references — fix orphans
  for (const [, node] of newNodes) {
    if (node.parent && !newNodes.has(node.parent)) {
      node.parent = null;
    }
  }

  // Filter rootNodeIds to only valid IDs
  const validRootIds = data.rootNodeIds.filter((id) => newNodes.has(id));

  // Atomic swap — only after successful parsing
  this.nodes = newNodes;
  this.rootNodeIds = validRootIds;
  this.worldTransformCache.clear();
}
```

The key principle is **parse, validate, then swap**. The method builds the new state in temporary variables (`newNodes`, `validRootIds`). Only after everything is validated does it replace the scene graph's internal state. If the data is malformed — missing nodes, broken parent references, invalid IDs — the temporary state absorbs the damage. The swap is atomic: the scene graph transitions from one consistent state to another in two assignments.

The `migrateNodeFillsStrokes` call handles a specific migration: older snapshots might use a singular `fill` field instead of the current `fills` array. Since undo snapshots are created by the running editor (not loaded from disk), this migration is mostly a safety net for the case where the data format evolved between the snapshot capture and the restore.

The `worldTransformCache.clear()` after the swap is essential. The world transform cache stores computed matrices keyed by node ID. After `fromJSON`, the node objects are different — their positions, rotations, and parent chains may have changed. Stale cache entries would produce incorrect transforms for every operation until the next cache invalidation.

## What Undo Doesn't Cover

Not every state change is undoable, and this is by design:

**Camera position and zoom.** Panning and zooming are view operations, not document mutations. The user doesn't expect Ctrl+Z to un-zoom.

**Active tool.** Switching from the pen tool to the selection tool isn't undoable. Tools are transient interaction modes.

**Timeline playback state.** Play/pause, current frame position, and loop mode are ephemeral. Undoing doesn't rewind the playhead.

**Entered group.** The "inside a group" state is cleared on undo (Chapter 17), but it's not restored to its pre-undo value. This is a simplification — tracking group entry in the undo stack would add complexity for minimal user benefit.

**Brush and eraser settings.** Brush size, smoothing, eraser mode — these are tool preferences, not document state.

The boundary is: if it affects what gets saved to disk, it's undoable. If it only affects the current editing session's view or tool configuration, it's not.

## Testing Undo

Testing undo is straightforward because the implementation is pure state manipulation:

```typescript
it('pushUndo captures state and clears redo', () => {
  const sg = new SceneGraph();
  sg.addNode(createRectangle({ id: 'r1' }));

  store.getState().pushUndo(sg);
  expect(store.getState().canUndo).toBe(true);
  expect(store.getState().canRedo).toBe(false);
  expect(store.getState().undoStack).toHaveLength(1);
});

it('undo restores previous scene graph state', () => {
  const sg = new SceneGraph();
  sg.addNode(createRectangle({ id: 'r1', x: 0, y: 0 }));

  store.getState().pushUndo(sg);

  // Mutate
  sg.updateNode('r1', { transform: { ...defaults, position: { x: 100, y: 0 } } });

  store.getState().undo(sg);

  // Scene graph is restored
  const node = sg.getNode('r1')!;
  expect(node.transform.position.x).toBe(0);
  expect(store.getState().canRedo).toBe(true);
});

it('undo/redo round-trip preserves selection', () => {
  const sg = new SceneGraph();
  sg.addNode(createRectangle({ id: 'r1' }));
  store.setState({ selectedNodeIds: new Set(['r1']) });

  store.getState().pushUndo(sg);
  store.setState({ selectedNodeIds: new Set() });

  store.getState().undo(sg);
  expect(store.getState().selectedNodeIds).toContain('r1');
});

it('caps undo stack at MAX_UNDO_STACK_SIZE', () => {
  const sg = new SceneGraph();
  for (let i = 0; i < 60; i++) {
    store.getState().pushUndo(sg);
  }
  expect(store.getState().undoStack.length).toBeLessThanOrEqual(50);
});
```

The tests create a real `SceneGraph`, push undo, mutate, then undo and verify the state is restored. No mocking of the undo system itself — it's tested through its actual behavior.

The `structuredClone` isolation can also be tested: push undo, mutate a node in the scene graph, verify the snapshot still holds the original value. This confirms that the clone is a deep copy, not a reference.

## Lessons

**Snapshots trade memory for correctness.** A command-pattern undo system uses less memory but requires a custom forward/backward handler for every operation — each one a potential bug. The snapshot approach (clone the entire document before each mutation) eliminates per-operation undo logic entirely. At 50KB per snapshot and 50 entries, the 2.5MB memory cost is negligible compared to the engineering cost of hundreds of command classes.

**The hardest undo question is when to capture, not how to restore.** Push too often and the user must press Ctrl+Z twenty times to undo a single drag. Push too rarely and individual operations become irreversible. The rule is one snapshot per discrete user action, enforced through two mechanisms: `pushUndo` at the start of store mutations and `onTransformStart` at the beginning of continuous drag operations.

**Never share references between live state and stored state.** `structuredClone` on save prevents mutations from corrupting the snapshot. `structuredClone` on restore prevents future mutations from corrupting the redo stack. Omitting either clone creates a time bomb: the snapshot looks correct at capture time but silently degrades as the live state evolves.

**Atomic swap protects against malformed restores.** The `fromJSON` method parses snapshot data into temporary variables, validates parent references, filters invalid root IDs, and only then replaces the scene graph's internal state. If the snapshot is corrupted, the damage is absorbed by the temporaries. The scene graph transitions from one consistent state to another in two assignments, never existing in a half-restored state.

**Compound actions must produce exactly one undo entry.** Cut (copy + delete) and duplicate (copy + paste) are compound operations where the sub-operations each call `pushUndo` internally. Without careful coordination — inlining the delete logic in cut, delegating to paste in duplicate — these produce two undo entries for one user action. Comments documenting the asymmetry are essential because the double-push bug is invisible at the point of introduction.

## What We Built

This chapter covered the undo/redo system — about 80 lines of store code that make the entire editor reversible:

- **Snapshot-based approach**: `structuredClone(sceneGraph.toJSON())` captures the full document state. No per-operation command objects, no reverse logic, no transaction management.
- **Two bounded stacks**: Undo and redo stacks capped at 50 entries. Push clears redo (timeline fork). Undo moves to redo. Redo moves to undo. Symmetric operations.
- **`pushUndo` at mutation start**: Every store action that modifies the document pushes once before mutating. Early returns prevent no-op snapshots.
- **`onTransformStart` for continuous operations**: Canvas drag operations (move, resize, rotate) push a single snapshot when the drag begins. Dozens of `pointerMove` frames produce one undo entry.
- **`onScrubStart` for Properties Panel scrubs**: Same pattern — push once when the scrub gesture starts, not on every pixel of mouse movement.
- **Double-push prevention**: `cutSelection` inlines its delete to avoid `deleteSelection`'s internal push. `duplicateSelection` delegates to `pasteClipboard` which pushes. Comments document the asymmetry.
- **Per-page stacks**: Each page saves and restores its own undo/redo history on page switch. Undoing on one page doesn't affect another.
- **`fromJSON` atomic swap**: Parse into temporaries, validate parent references, filter root IDs, then swap. The scene graph is never in a half-restored state.
- **`structuredClone` discipline**: Clone on save (prevent mutation from corrupting the snapshot), clone on restore (prevent future mutations from corrupting the redo stack). Never share references between live state and stored state.
- **Clear on new/open/import**: History is invalidated when the entire document changes. Cross-document undo would produce corruption.

The snapshot approach trades memory for correctness. A command-based system would use less memory but require hundreds of per-operation undo handlers — each one a potential bug. At 50KB per snapshot and 50 entries, the memory cost is negligible. The correctness benefit is absolute: if `toJSON` and `fromJSON` work correctly, every operation is undoable, automatically, without any undo-specific code in the operation itself.

The next chapter shifts from interaction to presentation — the Properties Panel that displays and edits every attribute of every node type, bridging the store, the scene graph, and the user's intention to change a value.
