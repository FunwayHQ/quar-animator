# The Layer Panel

## A Mirror of the Tree

Every editor has a tension between what the user sees on the canvas and what the code sees in the scene graph. On the canvas, shapes overlap, hide behind each other, and nest inside groups with no visual indication of hierarchy. The Layer Panel resolves this tension by rendering the scene graph as a scrollable tree — a flat list of rows, indented by depth, where every node has a name, an icon, a visibility toggle, and a lock toggle. It is the user's only complete view of the document's structure.

This chapter builds a recursive layer tree with click-to-select, Shift-click range selection, double-click inline rename, drag-to-reorder, expand/collapse for groups, and a right-click context menu — all in under 900 lines of code.

## The Reversed Root

The scene graph stores nodes in creation order. The first shape drawn is at index 0. But visual stacking works the opposite way — the last shape drawn appears on top. Photoshop, Figma, and every layer-based editor shows the topmost layer first in the panel. The Layer Panel reverses the root node list:

```tsx
const rootNodes = [...sceneGraph.getRootNodes()].reverse();
```

This single `.reverse()` call aligns the panel with the user's mental model: the top of the layer list is the front of the canvas. When the user drags a layer upward in the panel, the corresponding shape moves forward in z-order.

## The LayerRow Component

Each row in the tree is a `LayerRow` component that renders a single node with its visual controls. The component receives the node, its depth in the tree, and a set of callbacks for interaction:

```tsx
function LayerRow({
  node,
  depth,
  selected,
  isRenaming,
  isDragging,
  isEnteredGroup,
  dropTarget,
  onSelect,
  onDoubleClick,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  onRenameCommit,
  onPointerDown,
}: LayerRowProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  // ...
}
```

The `depth` parameter controls indentation. Each level adds 16 pixels of left padding:

```tsx
<div
  className={`${styles.layerRow} ${selected ? styles.selected : ''} ...`}
  style={{ paddingLeft: `${12 + depth * 16}px` }}
>
```

This creates the visual tree structure without any actual nested DOM. Every row is a flat sibling in the scrollable container — only the padding changes. This is important for drag-and-drop hit testing, which relies on simple top-to-bottom document order rather than nested bounding boxes.

## Recursion via Children

When a node has children (groups, artboards, boolean groups), the row renders a collapsible expand/collapse chevron and recursively renders its children using a `LayerRowById` wrapper:

```tsx
{
  expanded &&
    hasChildren &&
    node.children.map((childId: string) => (
      <LayerRowById
        key={childId}
        nodeId={childId}
        depth={depth + 1}
        onSelect={onSelect}
        // ... all the same callbacks
      />
    ));
}
```

The `LayerRowById` wrapper resolves a node ID to a `Node` object using the scene graph, then renders a `LayerRow`. This indirection exists because the scene graph stores children as an array of ID strings, not node references. The wrapper also subscribes to the Zustand store for selection and entered-group state, keeping each row reactive:

```tsx
function LayerRowById({ nodeId, depth, ...callbacks }) {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const enteredGroupId = useEditorStore((state) => state.enteredGroupId);
  const node = sceneGraph.getNode(nodeId);
  if (!node) return null;

  return (
    <LayerRow
      node={node}
      depth={depth}
      selected={selectedNodeIds.has(node.id)}
      isEnteredGroup={enteredGroupId === node.id}
      // ...
    />
  );
}
```

The expand/collapse state lives locally in each `LayerRow` via `useState(true)` — groups start expanded. Clicking the chevron toggles the boolean, and the children simply don't render when collapsed. There is no "expanded groups" state in the store. This is the right default — expand/collapse is ephemeral UI state, not document state.

## Node Type Icons

Each node type maps to a Unicode character displayed in a small fixed-width area beside the name:

```tsx
function nodeTypeIcon(type: string, node?: Node): string {
  switch (type) {
    case 'group': {
      const booleanOp = (node as GroupNode).booleanOp;
      if (booleanOp) {
        switch (booleanOp) {
          case 'union':
            return '\u222A'; // ∪
          case 'subtract':
            return '\u2216'; // ∖
          case 'intersect':
            return '\u2229'; // ∩
          case 'exclude':
            return '\u2295'; // ⊕
        }
      }
      return '\u{1F4C1}'; // 📁
    }
    case 'rectangle':
    case 'ellipse':
    case 'polygon':
      return '\u25FC'; // ◼
    case 'path':
      return '\u2669'; // ♩
    case 'bone':
      return '\u22A5'; // ⊥
    case 'ik-target':
      return '\u2295'; // ⊕
    case 'artboard':
      return '\u2B1C'; // ⬜
    case 'symbol-instance':
      return '\u25C7'; // ◇
    default:
      return '\u25FC';
  }
}
```

Boolean groups get special treatment — a regular group shows a folder icon, but a group with `booleanOp` shows the mathematical set operator symbol (∪ for union, ∩ for intersect). This gives the user immediate visual feedback about whether a group is structural or geometric.

## Selection: Click, Ctrl+Click, Shift+Click

The `handleSelect` callback dispatches to three different store actions depending on modifier keys:

```tsx
const handleSelect = useCallback(
  (id: string, e: React.MouseEvent) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      toggleSelection(id);
    } else if (e.shiftKey) {
      selectRange(id, sceneGraph);
    } else {
      setSelection([id]);
    }
  },
  [setSelection, toggleSelection, selectRange, sceneGraph]
);
```

Plain click replaces the selection. Ctrl+Click (or Cmd+Click on Mac) toggles a single node in or out of the selection. Shift+Click selects a contiguous range.

Range selection needs a start point and an end point. The store tracks `lastSelectedNodeId` — the most recently clicked node. When the user Shift+clicks, `selectRange` flattens the scene graph into depth-first order using `sceneGraph.traverse()`, finds the indices of the anchor and target nodes, and selects everything between them:

```tsx
selectRange: (toId, sceneGraph) => {
  const { lastSelectedNodeId } = get();
  if (!lastSelectedNodeId) {
    set({ selectedNodeIds: new Set([toId]), lastSelectedNodeId: toId });
    return;
  }
  const flatOrder: string[] = [];
  sceneGraph.traverse((node) => { flatOrder.push(node.id); });
  const fromIndex = flatOrder.indexOf(lastSelectedNodeId);
  const toIndex = flatOrder.indexOf(toId);
  // Select all nodes between from and to (inclusive)
  const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
  const rangeIds = flatOrder.slice(start, end + 1);
  set({ selectedNodeIds: new Set(rangeIds) });
},
```

The `didDragRef` guard at the top of `handleSelect` prevents clicks from firing after a drag. When the user drags a layer and releases, the `pointerUp` event also triggers a `click`. The ref is set to `true` when a drag begins and checked on click — if a drag happened, the click is swallowed.

## Visibility and Lock Toggles

Each row has two small icon buttons on the right side: an eye for visibility and a padlock for lock. These are hidden by default and appear on hover via CSS:

```css
.layerActions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--easing-default);
}

.layerRow:hover .layerActions {
  opacity: 1;
}
```

The handlers are simple — read the current state, toggle it, write it back:

```tsx
const handleToggleVisibility = useCallback(
  (id: string) => {
    const node = sceneGraph.getNode(id);
    if (node) {
      pushUndo(sceneGraph);
      sceneGraph.updateNode(id, { visible: !node.visible });
    }
  },
  [sceneGraph, pushUndo]
);
```

Both handlers push an undo snapshot before the change. Hiding a layer is a document mutation that the user should be able to reverse.

When a layer is hidden, the eye icon gets a dimmed style via the `.inactive` class. When a layer is locked, the lock icon gets an amber highlight via the `.active` class — a visual warning that the node is protected from editing.

## Inline Rename

Double-clicking any layer row enters rename mode. The `renamingNodeId` state tracks which node is being renamed, and a dedicated `InlineRenameInput` component replaces the name label:

```tsx
function InlineRenameInput({ initialName, onCommit }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialName);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = useCallback(() => {
    const trimmed = value.trim();
    onCommit(trimmed || initialName);
  }, [value, initialName, onCommit]);

  return (
    <input
      ref={inputRef}
      className={styles.renameInput}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          onCommit(initialName);
        }
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
```

Three details make this work smoothly:

1. **Auto-focus and select**: The `useEffect` focuses the input and selects all text on mount. The user can immediately start typing a new name.

2. **Escape cancels**: Pressing Escape calls `onCommit` with the original name, reverting the change. Enter and blur both commit the current value.

3. **Event isolation**: Both `onKeyDown` and `onClick` call `stopPropagation()`. Without this, typing a letter like "R" would trigger the RectangleTool shortcut. Clicking the input would trigger the layer row's selection handler. The input must be an isolated event bubble.

The `onCommit` callback in the parent component pushes undo, writes the new name to the scene graph, and clears `renamingNodeId`:

```tsx
const handleRenameCommit = useCallback(
  (id: string, name: string) => {
    pushUndo(sceneGraph);
    sceneGraph.updateNode(id, { name });
    setRenamingNodeId(null);
  },
  [sceneGraph, pushUndo]
);
```

If the user clears the name and presses Enter, the commit function falls back to the initial name — empty names are never stored.

## Drag-to-Reorder

Drag-and-drop is the most complex interaction in the panel. It allows the user to reorder layers, move nodes between groups, and reparent nodes to the root level. The implementation uses three pieces of state: whether a drag is in progress, which nodes are being dragged, and where the drop target is.

### Starting a Drag

The drag starts on `pointerDown`. If the clicked node is already selected, all selected nodes are dragged together. If it's not selected, only that node moves:

```tsx
const handlePointerDown = useCallback(
  (id: string, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    didDragRef.current = false;

    let draggedIds: Set<string>;
    if (selectedNodeIds.has(id)) {
      draggedIds = new Set(selectedNodeIds);
    } else {
      draggedIds = new Set([id]);
    }

    setDragState({
      active: false,
      draggedIds,
      startX: e.clientX,
      startY: e.clientY,
    });
  },
  [selectedNodeIds]
);
```

The drag state starts with `active: false`. The drag doesn't actually begin until the pointer moves past a threshold — 5 pixels. This prevents accidental drags when the user clicks slightly imprecisely:

```tsx
const handlePointerMove = useCallback(
  (e: React.PointerEvent) => {
    if (!dragState) return;
    if (!dragState.active) {
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
      setDragState({ ...dragState, active: true });
      didDragRef.current = true;
      return;
    }
    // ... hit test for drop target
  },
  [dragState, hitTestDropTarget]
);
```

### Drop Target Hit Testing

Once the drag is active, every pointer move hit-tests the layer rows to find the drop target. The hit test queries all DOM elements with a `data-layer-id` attribute and checks where the pointer falls within each row:

```tsx
const hitTestDropTarget = useCallback(
  (clientY: number): DropTarget | null => {
    const container = contentRef.current;
    if (!container) return null;

    const rows = container.querySelectorAll<HTMLElement>('[data-layer-id]');
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top || clientY > rect.bottom) continue;

      const nodeId = row.getAttribute('data-layer-id')!;
      const fraction = (clientY - rect.top) / rect.height;
      const isGroup = sceneGraph.getNode(nodeId)?.type === 'group';

      if (fraction < 0.25) return { nodeId, position: 'before' };
      else if (fraction > 0.75) return { nodeId, position: 'after' };
      else if (isGroup) return { nodeId, position: 'inside' };
      else return { nodeId, position: 'after' };
    }
    return null;
  },
  [sceneGraph]
);
```

The row is divided into three zones. The top 25% means "insert before this node." The bottom 25% means "insert after." The middle 50% means "drop inside this node" — but only if it's a group. For non-group nodes, the middle defaults to "after."

The drop position is stored as a `DropTarget` type:

```tsx
type DropPosition = 'before' | 'after' | 'inside';

interface DropTarget {
  nodeId: string;
  position: DropPosition;
}
```

CSS classes provide visual feedback. A "before" drop shows a line above the row. An "after" drop shows a line below. An "inside" drop highlights the entire row with a purple tint:

```css
.layerRow.dropBefore {
  box-shadow: 0 -2px 0 0 var(--color-accent-primary);
}
.layerRow.dropAfter {
  box-shadow: 0 2px 0 0 var(--color-accent-primary);
}
.layerRow.dropInside {
  background: rgba(168, 85, 247, 0.2);
  outline: 1px solid var(--color-accent-primary);
}
```

### Executing the Drop

On pointer up, the panel translates the `DropTarget` into a `sceneGraph.moveNode` call:

```tsx
const handlePointerUp = useCallback(
  (_e) => {
    if (!dragState || !dragState.active || !dropTarget) {
      setDragState(null);
      setDropTarget(null);
      return;
    }

    const topIds = getTopLevelDragIds([...dragState.draggedIds], (id) => sceneGraph.getNode(id));
    const targetNode = sceneGraph.getNode(dropTarget.nodeId);
    if (!targetNode) {
      /* cleanup and return */
    }

    let parentId: string | null;
    let insertIndex: number;

    if (dropTarget.position === 'inside') {
      parentId = dropTarget.nodeId;
      insertIndex = 0;
    } else {
      parentId = targetNode.parent;
      const parentNode = parentId ? sceneGraph.getNode(parentId) : null;
      const siblings = parentNode
        ? parentNode.children
        : sceneGraph.getRootNodes().map((n) => n.id);
      const targetIndex = siblings.indexOf(dropTarget.nodeId);
      insertIndex = dropTarget.position === 'before' ? targetIndex : targetIndex + 1;
    }

    for (const id of topIds) {
      try {
        sceneGraph.moveNode(id, parentId, insertIndex);
        insertIndex++;
      } catch {
        /* circular reference — skip */
      }
    }

    setDragState(null);
    setDropTarget(null);
  },
  [dragState, dropTarget, sceneGraph]
);
```

The `getTopLevelDragIds` helper deduplicates: if both a group and its child are in the drag set, only the group moves. Without this, the child would be moved independently and then moved again when the group moves — potentially ending up in the wrong position or causing a circular reference.

The `sceneGraph.moveNode` method handles the actual reparenting. It removes the node from its old parent's children array, adds it to the new parent at the specified index, and updates the `node.parent` pointer. If the move would create a circular reference (moving a group into its own descendant), `moveNode` throws an error, which the `catch` block silently ignores — the node stays where it is.

## Context Menu

Right-clicking a layer opens a context menu with actions appropriate to the selection state. The menu items differ for single selection versus multi-selection:

**Single selection**: Rename, Duplicate, Delete, Group (disabled for one node), Ungroup (enabled only for groups), z-order operations (Bring Forward, Send Backward, Bring to Front, Send to Back), Show/Hide, Lock/Unlock.

**Multi-selection**: Rename is disabled. Duplicate/Delete show the count ("Delete 3 Layers"). Group creates a new group from the selection. Ungroup is enabled if any selected node is a group. Show/Hide and Lock/Unlock check majority state — if all selected are visible, the option reads "Hide 3 Layers."

A critical detail: right-clicking a node that isn't in the current selection auto-selects it before showing the menu:

```tsx
const handleContextMenu = useCallback(
  (nodeId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedNodeIds.has(nodeId)) {
      setSelection([nodeId]);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId });
  },
  [selectedNodeIds, setSelection]
);
```

Without this, the user would right-click one node but see a menu that operates on a completely different selection — a confusing mismatch between intent and effect.

## The Entered Group Indicator

When the user double-clicks a group on the canvas to enter it (the Figma-style group scope from Chapter 17), the Layer Panel highlights the entered group with a wider accent border and a subtle background gradient:

```css
.layerRow.enteredGroup {
  background: linear-gradient(90deg, rgba(168, 85, 247, 0.08) 0%, transparent 100%);
}

.layerRow.enteredGroup::before {
  background: var(--color-accent-primary);
  width: 3px;
}
```

The `isEnteredGroup` prop compares the node's ID against `enteredGroupId` from the store. This is read-only — the Layer Panel displays the entered state but doesn't control it. Group entry and exit happen through canvas interactions.

## Scene Graph Synchronization

Like the Properties Panel, the Layer Panel subscribes to scene graph events to trigger re-renders:

```tsx
const [, setVersion] = useState(0);
useEffect(() => {
  const increment = () => setVersion((v) => v + 1);
  const unsub1 = sceneGraph.on('nodeAdded', increment);
  const unsub2 = sceneGraph.on('nodeRemoved', increment);
  const unsub3 = sceneGraph.on('nodeChanged', increment);
  const unsub4 = sceneGraph.on('nodeMoved', increment);
  return () => {
    unsub1();
    unsub2();
    unsub3();
    unsub4();
  };
}, [sceneGraph]);
```

The panel listens to `nodeMoved` in addition to the standard three events — drag-and-drop reorder fires `nodeMoved`, and the panel must reflect the new order immediately.

## Lessons

**Flat DOM with visual indentation is simpler than nested containers.** Every layer row is a sibling in the scrollable container; only left padding changes with depth. This makes drag-and-drop hit testing a linear scan of `data-layer-id` elements rather than a recursive traversal of nested bounding boxes. The visual tree exists in the user's perception, not in the DOM structure.

**Expand/collapse is ephemeral UI state, not document state.** Group expansion lives in local `useState` within each `LayerRow`, not in the Zustand store. This is the correct default because collapse state has no effect on the document and should not survive undo, redo, or page switches. Storing it in the store would pollute the document model with view concerns.

**Drag thresholds prevent accidental reorder on imprecise clicks.** A 5-pixel movement threshold separates intentional drags from sloppy clicks. Without it, every click on a layer row could trigger a reorder if the pointer moves even one pixel between down and up events. The `didDragRef` guard then prevents the subsequent click event from firing a selection change after a drag completes.

**Three-zone hit testing makes drop intent unambiguous.** Dividing each row into 25% before, 50% inside (groups only), and 25% after maps pointer position to exactly one of three drop operations: insert before, insert after, or reparent into a group. Non-group nodes collapse the middle zone into "after," preventing impossible reparenting attempts.

**Right-click must auto-select its target before showing a context menu.** Without auto-selection, the user right-clicks one node but sees a menu that operates on a completely different selection — a confusing mismatch between visual intent and actual effect. The single-line guard (`if (!selectedNodeIds.has(nodeId)) setSelection([nodeId])`) eliminates this entire class of UX bugs.

**Inline rename requires total event isolation.** The rename input must call `stopPropagation` on both keyboard and click events. Without it, typing "R" triggers the rectangle tool shortcut, typing "V" switches to the selection tool, and clicking the input triggers the layer row's selection handler. The input is a foreign element in a keyboard-shortcut-heavy environment and must be hermetically sealed from the surrounding event system.

## What We Built

This chapter covered the Layer Panel — a recursive tree view that gives the user structural visibility into the scene graph:

- **Reversed root list** aligns the layer order with visual stacking: the top of the panel is the front of the canvas.
- **Flat DOM with padding-based indentation** creates a visual tree without nested containers. Each `depth` level adds 16 pixels. This simplifies drag-and-drop hit testing to a linear scan.
- **Recursive child rendering** via `LayerRowById` wrappers that resolve node IDs to `Node` objects and subscribe to store state. Groups start expanded; expand/collapse is local component state.
- **Node type icons** using Unicode characters — folders for groups, set operators (∪∩∖⊕) for boolean groups, diamonds for symbol instances, and distinct glyphs for bones, IK targets, and artboards.
- **Three selection modes**: plain click replaces, Ctrl+Click toggles, Shift+Click selects a contiguous depth-first range using `lastSelectedNodeId` as the anchor.
- **Hover-revealed visibility and lock toggles** that push undo before toggling. Hidden layers dim; locked layers glow amber.
- **Inline rename** on double-click with auto-focus, auto-select, Enter to commit, Escape to cancel, and `stopPropagation` to prevent keyboard shortcut conflicts.
- **Drag-to-reorder** with a 5-pixel threshold, three-zone hit testing (25% before / 50% inside for groups / 25% after), CSS drop indicators, multi-node drag with ancestor deduplication, and `sceneGraph.moveNode` with circular reference protection.
- **Context menu** with single-selection and multi-selection variants — z-order operations, group/ungroup, rename, duplicate, delete, visibility, and lock. Right-click auto-selects the target node.
- **Entered group highlighting** that mirrors the canvas group-entry state with a wider accent border and gradient background.

The next chapter builds the Toolbar — the horizontal strip of tool buttons that maps keyboard shortcuts to visual icons and syncs with the editor store's active tool state.
