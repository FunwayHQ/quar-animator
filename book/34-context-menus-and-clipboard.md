# Context Menus & Clipboard

## Right-Click Everywhere, Copy-Paste Everything

Right-click the canvas and a menu appears: Copy, Duplicate, Group, Boolean Union, Delete. Right-click a layer and the menu changes: Rename, Show/Hide, Lock/Unlock. Right-click a keyframe and it changes again: easing presets, copy, delete. Every surface in the editor responds to a right-click with a menu tailored to the current context. And behind every Copy and Paste operation is a clipboard system that handles two fundamentally different scenarios: internal duplication (deep-cloning scene graph nodes with new IDs and offset positions) and external import (parsing SVG from Figma's clipboard or raster images from the system).

This chapter builds both systems. The context menu is a single reusable component that renders via a portal, flips when it hits viewport edges, and supports full keyboard navigation. The clipboard operations use `structuredClone` for deep copying, generate unique IDs for pasted nodes, and integrate a dual paste strategy that lets the browser's native `ClipboardEvent` fire before falling back to the Clipboard API. The result is a right-click experience that feels native — fast, discoverable, and context-aware.

## The ContextMenu Component

The context menu is a reusable component that renders at a given screen position with a list of items. It handles its own positioning, keyboard navigation, and dismissal:

```typescript
export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

export interface ContextMenuSeparator {
  type: 'separator';
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

export interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}
```

The entry type is a discriminated union: items have an `id` and `onClick`, separators have `type: 'separator'`. A type guard distinguishes them:

```typescript
function isSeparator(entry: ContextMenuEntry): entry is ContextMenuSeparator {
  return 'type' in entry && entry.type === 'separator';
}
```

### Portal Rendering

The menu renders via `createPortal` to `document.body`, escaping any CSS `overflow: hidden` or `z-index` stacking contexts on parent elements:

```typescript
return createPortal(
  <>
    <div
      className={styles.overlay}
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
      data-testid="context-menu-overlay"
    />
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ left: x, top: y }}
      data-testid="context-menu"
    >
      {items.map((entry, index) => {
        if (isSeparator(entry)) {
          return <div key={`sep-${index}`} className={styles.separator} role="separator" />;
        }
        return (
          <button
            key={entry.id}
            className={`${styles.menuItem} ${entry.disabled ? styles.disabled : ''} ${entry.danger ? styles.danger : ''}`}
            role="menuitem"
            aria-disabled={entry.disabled}
            onClick={() => handleItemClick(entry)}
            tabIndex={-1}
          >
            {entry.icon && <span className={styles.menuItemIcon}>{entry.icon}</span>}
            <span className={styles.menuItemLabel}>{entry.label}</span>
            {entry.shortcut && <span className={styles.menuItemShortcut}>{entry.shortcut}</span>}
          </button>
        );
      })}
    </div>
  </>,
  document.body
);
```

The portal approach is essential. Without it, a context menu inside the Layer Panel — which has `overflow-y: auto` for scrolling — would clip the menu at the panel boundary. Portal rendering places the menu outside all clipping contexts, directly on the document body.

The overlay is a full-viewport `div` with `position: fixed; inset: 0`. Clicking anywhere outside the menu hits the overlay and calls `onClose`. Right-clicking the overlay also closes the menu (preventing nested right-click menus). The overlay is invisible — no background color — but it captures pointer events across the entire screen.

### Viewport Edge Flipping

When the menu opens near the bottom or right edge of the viewport, it would overflow offscreen. The component repositions itself after mounting:

```typescript
const getPosition = useCallback(() => {
  const menu = menuRef.current;
  if (!menu) return { left: x, top: y };

  const rect = menu.getBoundingClientRect();
  let left = x;
  let top = y;

  if (x + rect.width > window.innerWidth) {
    left = x - rect.width;
  }
  if (y + rect.height > window.innerHeight) {
    top = y - rect.height;
  }
  if (left < 0) left = 0;
  if (top < 0) top = 0;

  return { left, top };
}, [x, y]);

useEffect(() => {
  const menu = menuRef.current;
  if (!menu) return;

  const { left, top } = getPosition();
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.focus();
}, [getPosition]);
```

The logic is simple: if the menu's right edge exceeds the viewport width, flip it to the left of the cursor. If the bottom edge exceeds the viewport height, flip it above the cursor. The `useEffect` runs after mount because `getBoundingClientRect()` needs the menu to be in the DOM to measure its actual size. The initial render places the menu at `(x, y)`, and the effect immediately repositions it if needed — the browser paints only the corrected position.

The `menu.focus()` call is critical. It gives the menu keyboard focus so that arrow keys and Escape work immediately, without the user needing to click inside the menu first.

### Keyboard Navigation

The menu supports full keyboard navigation following the WAI-ARIA menu pattern:

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    const navigable = getNavigableIndices();
    if (navigable.length === 0) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const currentPos = navigable.indexOf(focusIndexRef.current);
      const nextPos = currentPos < navigable.length - 1 ? currentPos + 1 : 0;
      focusItem(navigable[nextPos] ?? 0);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const currentPos = navigable.indexOf(focusIndexRef.current);
      const prevPos = currentPos > 0 ? currentPos - 1 : navigable.length - 1;
      focusItem(navigable[prevPos] ?? 0);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[focusIndexRef.current];
      if (item && !isSeparator(item) && !item.disabled) {
        item.onClick();
        onClose();
      }
      return;
    }
  },
  [items, onClose, getNavigableIndices, focusItem]
);
```

`getNavigableIndices()` filters out separators and disabled items, returning only the indices that the user can focus. ArrowDown and ArrowUp cycle through these indices with wrapping — pressing ArrowDown on the last item moves to the first, and pressing ArrowUp on the first moves to the last. Enter activates the focused item and closes the menu.

The `focusItem` function finds the correct `<button>` element by mapping the items array index to the button index (separators don't produce buttons with `role="menuitem"`):

```typescript
const focusItem = useCallback(
  (index: number) => {
    const menu = menuRef.current;
    if (!menu) return;
    const buttons = menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    let buttonIndex = 0;
    for (let i = 0; i < items.length; i++) {
      if (i === index) break;
      if (!isSeparator(items[i]!)) buttonIndex++;
    }
    buttons[buttonIndex]?.focus();
    focusIndexRef.current = index;
  },
  [items]
);
```

This index mapping is necessary because the items array contains separators at various positions, but the DOM only contains `<button>` elements for actual menu items. Without the mapping, ArrowDown after a separator would focus the wrong item.

### Styling and Animation

The CSS creates a dark elevated panel with a subtle entrance animation:

```css
.menu {
  position: fixed;
  z-index: var(--z-context-menu);
  min-width: 180px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  box-shadow: var(--shadow-xl);
  padding: 4px 0;
  animation: menuIn 0.12s var(--easing-default) both;
}

@keyframes menuIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```

The 0.12-second scale+opacity animation gives the menu a quick "pop in" feel without delaying interaction. The `animation-fill-mode: both` ensures the menu starts invisible and ends fully visible.

Menu items display as flex rows with label, optional icon, and optional shortcut hint:

```css
.menuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 12px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  outline: none;
  border: none;
  background: none;
  width: 100%;
  text-align: left;
}

.menuItem:hover,
.menuItem:focus-visible {
  background: var(--color-bg-hover);
  color: var(--color-text-primary);
}

.menuItemShortcut {
  font-size: 11px;
  color: var(--color-text-disabled);
  margin-left: 16px;
}
```

Shortcut hints are right-aligned and dimmed — present for discoverability but not competing with the label for attention. Danger items use the error accent color and a tinted background on hover.

## The useContextMenu Hook

A small hook encapsulates the open/close state:

```typescript
export function useContextMenu(): {
  menuState: ContextMenuState;
  openMenu: (e: React.MouseEvent) => void;
  closeMenu: () => void;
} {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
  });

  const openMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenuState({ isOpen: true, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState({ isOpen: false, x: 0, y: 0 });
  }, []);

  return { menuState, openMenu, closeMenu };
}
```

The `e.preventDefault()` suppresses the browser's native context menu. The `e.stopPropagation()` prevents the event from bubbling to parent handlers — without it, right-clicking a layer inside the Layer Panel would also trigger the panel-level context menu.

The hook returns `openMenu` as the `onContextMenu` handler and `closeMenu` as the `onClose` callback. Components wire them directly:

```typescript
<div onContextMenu={openMenu}>
  {menuState.isOpen && (
    <ContextMenu
      x={menuState.x}
      y={menuState.y}
      items={items}
      onClose={closeMenu}
    />
  )}
</div>
```

## Canvas Context Menu: Selection-Aware Items

The canvas builds different menu items depending on the current selection state. Three branches cover the cases:

### With Direct Selection Points

When the Direct Selection Tool has path points selected, the menu shows a single item:

```typescript
if (isDirectSelectionActive && directSelectionPoints.length > 0) {
  const pointCount = directSelectionPoints.length;
  return [
    {
      id: 'delete-point',
      label: pointCount === 1 ? 'Delete Point' : `Delete ${pointCount} Points`,
      shortcut: 'Del',
      danger: true,
      onClick: () => deleteDirectSelectionPoints(),
    },
  ];
}
```

The label adapts: "Delete Point" for one, "Delete 3 Points" for three. This small detail communicates how many points the action will affect, preventing accidental bulk deletion.

### With Node Selection

When shapes are selected, the menu is comprehensive — copy, duplicate, group, z-order, boolean operations, and delete:

```typescript
const hasSelection = selectedNodeIds.size > 0;

if (hasSelection) {
  return [
    { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: () => copySelection(sceneGraph) },
    {
      id: 'duplicate',
      label: 'Duplicate',
      shortcut: 'Ctrl+D',
      onClick: () => duplicateSelection(sceneGraph),
    },
    { type: 'separator' },
    {
      id: 'group',
      label: 'Group',
      shortcut: 'Ctrl+G',
      disabled: selectedNodeIds.size < 2,
      onClick: () => groupSelection(sceneGraph),
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      shortcut: 'Ctrl+Shift+G',
      disabled: !hasGroup,
      onClick: () => ungroupSelection(sceneGraph),
    },
    { type: 'separator' },
    {
      id: 'bring-to-front',
      label: 'Bring to Front',
      shortcut: 'Ctrl+Shift+]',
      onClick: () => bringToFront(sceneGraph),
    },
    {
      id: 'bring-forward',
      label: 'Bring Forward',
      shortcut: 'Ctrl+]',
      onClick: () => bringForward(sceneGraph),
    },
    {
      id: 'send-backward',
      label: 'Send Backward',
      shortcut: 'Ctrl+[',
      onClick: () => sendBackward(sceneGraph),
    },
    {
      id: 'send-to-back',
      label: 'Send to Back',
      shortcut: 'Ctrl+Shift+[',
      onClick: () => sendToBack(sceneGraph),
    },
    { type: 'separator' },
    {
      id: 'boolean-union',
      label: 'Union',
      shortcut: 'Ctrl+Shift+U',
      disabled: !canBoolean,
      onClick: () => booleanUnion(sceneGraph),
    },
    // ... intersect, subtract, exclude ...
    { type: 'separator' },
    {
      id: 'delete',
      label: 'Delete',
      shortcut: 'Del',
      danger: true,
      onClick: () => deleteSelection(sceneGraph),
    },
  ];
}
```

Boolean operations are disabled unless at least two shape nodes are selected (`canBoolean`). The "Group" item is disabled with fewer than two nodes. The "Ungroup" item is disabled unless the selection includes a group. Each item is dimmed but still visible, teaching the user what's available even when the preconditions aren't met.

When the selection includes a boolean group, additional items appear dynamically: "Change to Union/Subtract/Intersect/Exclude", "Release Boolean Group", and "Flatten to Path". These are appended via spread syntax:

```typescript
...(hasBooleanGroup ? [
  { type: 'separator' as const },
  { id: 'change-op-union', label: 'Change to Union',
    onClick: () => changeBooleanOp(sceneGraph, 'union') },
  // ... other change operations ...
  { type: 'separator' as const },
  { id: 'release-boolean', label: 'Release Boolean Group',
    onClick: () => releaseBooleanGroup(sceneGraph) },
  { id: 'flatten-boolean', label: 'Flatten to Path',
    onClick: () => flattenBooleanGroup(sceneGraph) },
] : []),
```

The `as const` annotation is necessary for the separator's `type: 'separator'` — without it, TypeScript infers `type: string`, which doesn't satisfy the discriminated union.

### Without Selection

Right-clicking empty canvas space shows paste and select all:

```typescript
return [
  {
    id: 'paste',
    label: 'Paste',
    shortcut: 'Ctrl+V',
    onClick: () => {
      void pasteFromSystemClipboard().then((handled) => {
        if (!handled) pasteClipboard(sceneGraph);
      });
    },
  },
  { type: 'separator' },
  {
    id: 'select-all',
    label: 'Select All',
    shortcut: 'Ctrl+A',
    onClick: () => selectAll(sceneGraph),
  },
];
```

The paste action uses the same dual strategy as the keyboard shortcut: try the system clipboard first (which might contain SVG from another application), then fall back to the internal clipboard.

## Layer Panel Context Menu

The Layer Panel's context menu adds a twist: right-clicking an unselected layer should select it first, so the menu actions apply to the right node:

```typescript
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

If the right-clicked node is already in the selection (perhaps as part of a multi-selection), the selection is preserved. If it's not selected, the selection is replaced with just that node. This matches Figma's behavior: right-clicking always targets the specific layer, but doesn't break an existing multi-selection that includes it.

### Multi-Selection Labels

When multiple nodes are selected, the menu adapts its labels:

```typescript
if (selectedNodeIds.size > 1) {
  const count = selectedNodeIds.size;
  return [
    {
      id: 'duplicate',
      label: `Duplicate ${count} Layers`,
      onClick: () => duplicateSelection(sceneGraph),
    },
    {
      id: 'delete',
      label: `Delete ${count} Layers`,
      danger: true,
      onClick: () => deleteSelection(sceneGraph),
    },
    { type: 'separator' },
    {
      id: 'group',
      label: `Group ${count} Layers`,
      shortcut: 'Ctrl+G',
      onClick: () => groupSelection(sceneGraph),
    },
    { type: 'separator' },
    {
      id: 'toggle-visibility',
      label: anyHidden ? `Show ${count} Layers` : `Hide ${count} Layers`,
      onClick: () => toggleBatchVisibility(),
    },
    {
      id: 'toggle-lock',
      label: anyLocked ? `Unlock ${count} Layers` : `Lock ${count} Layers`,
      onClick: () => toggleBatchLock(),
    },
  ];
}
```

The visibility label checks whether any selected layer is currently hidden. If so, the label says "Show 2 Layers" (restoring visibility). If all are visible, it says "Hide 2 Layers". This adaptive labeling communicates the action's effect before the user clicks.

### Single-Selection Items

For a single selected node, the menu includes Rename with an inline text input:

```typescript
return [
  { id: 'rename', label: 'Rename', onClick: () => setEditingLayerId(contextMenu.nodeId) },
  { id: 'duplicate', label: 'Duplicate', onClick: () => duplicateSelection(sceneGraph) },
  {
    id: 'delete',
    label: 'Delete',
    shortcut: 'Del',
    danger: true,
    onClick: () => deleteSelection(sceneGraph),
  },
  { type: 'separator' },
  // ... group, z-order, visibility, lock ...
];
```

The Rename action sets `editingLayerId`, which causes the Layer Panel to render an `<input>` element in place of the layer name label. The input auto-focuses, and pressing Enter or blurring commits the new name. Rename is disabled in multi-selection — renaming multiple layers at once doesn't have an obvious semantic.

## Timeline Context Menu: Easing Presets

The timeline has two context menu variants: one for keyframes and one for the ruler.

### Keyframe Context Menu

Right-clicking a keyframe shows easing presets with checkmarks on the currently active easing:

```typescript
if (contextMenu.keyframeId && contextMenu.nodeId && contextMenu.property) {
  const items: ContextMenuEntry[] = [];

  // Find the easing of the first selected keyframe
  let currentKfEasing: EasingFunction = 'linear';
  for (const track of timeline.tracks) {
    for (const kf of track.keyframes) {
      if (selectedKeyframeIds.has(kf.id)) {
        currentKfEasing = kf.easing;
        break;
      }
    }
    if (currentKfEasing !== 'linear') break;
  }

  let anyPresetMatch = false;
  for (const preset of EASING_PRESETS) {
    const isActive = easingsMatch(currentKfEasing, preset.value);
    if (isActive) anyPresetMatch = true;
    items.push({
      id: `easing-${typeof preset.value === 'string' ? preset.value : 'custom'}`,
      label: isActive ? `\u2713 ${preset.label}` : `\u2003${preset.label}`,
      onClick: () => {
        for (const kfId of selectedKeyframeIds) {
          const info = keyframeMap.get(kfId);
          if (info) {
            setKeyframeEasing(info.nodeId, info.property, kfId, preset.value);
          }
        }
      },
    });
  }
```

The checkmark (`\u2713`) appears before the active easing. Non-active presets use an em-space (`\u2003`) as a prefix to maintain alignment — without it, the label text would shift left when no checkmark is present.

The "Custom Easing..." item opens the visual easing editor. Its checkmark appears when the current easing doesn't match any preset:

```typescript
const customPrefix = !anyPresetMatch && currentKfEasing !== 'linear' ? '\u2713 ' : '';
items.push({
  id: 'custom-easing',
  label: `${customPrefix}Custom Easing\u2026`,
  onClick: () => {
    setEasingEditor({ x: contextMenu.x, y: contextMenu.y, easing: currentKfEasing });
  },
});
```

The ellipsis character (`\u2026`) signals that clicking opens a sub-dialog, not an immediate action.

### Ruler Context Menu

Right-clicking the timeline ruler shows navigation commands:

```typescript
return [
  {
    id: 'go-to-frame',
    label: `Go To Frame ${contextMenu.frame}`,
    onClick: () => setCurrentFrame(contextMenu.frame),
  },
  { type: 'separator' },
  {
    id: 'go-to-start',
    label: 'Go To Start',
    shortcut: 'Home',
    onClick: () => {
      setCurrentFrame(0);
      setIsPlaying(false);
    },
  },
  {
    id: 'go-to-end',
    label: 'Go To End',
    shortcut: 'End',
    onClick: () => {
      setCurrentFrame(duration - 1);
      setIsPlaying(false);
    },
  },
  { type: 'separator' },
  {
    id: 'set-work-area-start',
    label: `Set Work Area Start (${contextMenu.frame})`,
    onClick: () => {
      setWorkAreaStart(contextMenu.frame);
      useEditorStore.getState().setWorkAreaEnabled(true);
    },
  },
  // ... work area end, clear work area, paste keyframes ...
];
```

The "Go To Frame N" label includes the frame number where the user right-clicked. This gives immediate context — the user can see which frame they're targeting before clicking. The frame number is derived from the cursor position at the time of the right-click:

```typescript
const handleTimelineContextMenu = useCallback(
  (e: React.MouseEvent) => {
    e.preventDefault();
    const ruler = rulerRef.current;
    if (!ruler) return;
    const rect = ruler.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const frame = Math.max(0, Math.min(duration - 1, Math.round((x / rect.width) * duration)));
    setContextMenu({ x: e.clientX, y: e.clientY, frame });
  },
  [duration]
);
```

The cursor position is converted from screen pixels to a frame number using the ruler's width and the timeline's duration. Clamping to `[0, duration - 1]` prevents out-of-bounds frames.

## Clipboard Operations in the Store

The clipboard lives in the Zustand store as a simple array of cloned nodes. Five operations manipulate it: copy, paste, duplicate, cut, and delete.

### Copy: Deep-Clone with structuredClone

```typescript
clipboard: null,

copySelection: (sceneGraph) => {
  const { selectedNodeIds } = get();
  if (selectedNodeIds.size === 0) return;
  const clones: Node[] = [];
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (node) clones.push(structuredClone(node));
  }
  if (clones.length > 0) set({ clipboard: clones });
},
```

`structuredClone` creates a true deep copy of each node — all nested objects (transforms, fills, strokes, points) are cloned into new objects. Without deep cloning, the clipboard would hold references to the original nodes, and modifying the original after copying would silently modify the clipboard contents.

The `structuredClone` API handles all JSON-safe types (objects, arrays, numbers, strings, booleans, null) and many others (Date, Map, Set, ArrayBuffer). For scene graph nodes that contain only JSON-safe data, it's both faster and more reliable than `JSON.parse(JSON.stringify(...))`, which loses `undefined` values and can't handle circular references.

### Paste: New IDs and Offset Position

```typescript
pasteClipboard: (sceneGraph) => {
  const { clipboard } = get();
  if (!clipboard || clipboard.length === 0) return;
  get().pushUndo(sceneGraph);
  const newIds: string[] = [];
  for (const original of clipboard) {
    const newNode = structuredClone(original);
    newNode.id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    newNode.parent = null;
    newNode.children = [];
    newNode.transform = {
      ...newNode.transform,
      position: {
        x: newNode.transform.position.x + 20,
        y: newNode.transform.position.y - 20,
      },
    };
    sceneGraph.addNode(newNode);
    newIds.push(newNode.id);
  }
  set({ selectedNodeIds: new Set(newIds) });
},
```

Three things happen to each pasted node:

1. **New ID**: The node gets a fresh ID (`node_${Date.now()}_...`). Without this, two nodes with the same ID would exist in the scene graph, corrupting lookups, selection, and animation bindings.

2. **Root-level placement**: `parent: null` and `children: []` place the node at the root of the scene graph, regardless of where the original was nested. This avoids complications with pasting into groups that may have been deleted since the copy.

3. **Position offset**: The position shifts by `(+20, -20)` — 20 pixels right and 20 pixels up in the Y-up coordinate system. This makes the pasted node visually offset from the original so the user can see that the paste happened. Without the offset, the pasted node would land exactly on top of the original, and the user might not realize the paste succeeded.

The pasted nodes are automatically selected, replacing the previous selection. This matches the convention in Figma and Illustrator — after pasting, the pasted objects are selected and ready for repositioning.

### Duplicate: Copy Then Paste

```typescript
duplicateSelection: (sceneGraph) => {
  const { copySelection } = get();
  copySelection(sceneGraph);
  get().pasteClipboard(sceneGraph);
},
```

Duplicate is copy followed by paste in a single action. It reuses both functions, avoiding code duplication. The `pushUndo` call inside `pasteClipboard` creates a single undo snapshot for the entire operation.

Note that `duplicateSelection` doesn't call `pushUndo` itself. If it did, there would be two undo entries for one user action: one from `duplicateSelection` and one from `pasteClipboard`. The user would need to press Ctrl+Z twice to undo a single Ctrl+D — confusing and wrong.

### Cut: Own pushUndo, Inline Delete

```typescript
cutSelection: (sceneGraph) => {
  const { selectedNodeIds, copySelection, timeline } = get();
  if (selectedNodeIds.size === 0) return;

  get().pushUndo(sceneGraph);
  copySelection(sceneGraph);

  // Inline delete — don't call deleteSelection to avoid double pushUndo
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

Cut copies and then deletes. But it can't call `deleteSelection` because `deleteSelection` has its own `pushUndo` call — that would create two undo entries for one cut operation. Instead, `cutSelection` does its own `pushUndo`, copies to the clipboard, and then performs the deletion inline.

This is a common pattern in editor development: when composing operations that each have their own undo snapshots, you need to either (a) extract a version of the operation that doesn't push undo, or (b) inline the operation. We chose (b) because the deletion logic is straightforward and the inline version is clear about what it does.

### Delete: Clean Up Everything

```typescript
deleteSelection: (sceneGraph) => {
  const { selectedNodeIds, timeline, enteredGroupId,
    ikChains, smartBoneActions, dynamicChains } = get();
  if (selectedNodeIds.size === 0) return;
  get().pushUndo(sceneGraph);
  const mgr = new KeyframeManager(timeline);
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (node && node.type === 'ik-target') {
      const chainId = node.ikChainId;
      newIkChains = newIkChains.filter((c) => c.id !== chainId);
    }
    mgr.removeAllKeyframesForNode(id);
    sceneGraph.removeNode(id);
  }
  const clearGroup = enteredGroupId && !sceneGraph.getNode(enteredGroupId);
  set({
    selectedNodeIds: new Set<string>(),
    editingGradient: null,
    timeline: { ...timeline },
    isDirty: true,
    ikChains: newIkChains,
    smartBoneActions: newSmartBoneActions,
    dynamicChains: newDynamicChains,
    ...(clearGroup ? { enteredGroupId: null } : {}),
  });
},
```

Deletion is more than removing nodes from the scene graph. It also removes animation keyframes for the deleted nodes (via `KeyframeManager`), cleans up IK chains that reference deleted IK targets, removes Smart Bone actions driven by deleted bones, and removes dynamic chains rooted at deleted bones. If the deleted node was the currently entered group, the `enteredGroupId` is cleared to avoid dangling references.

### Select All

```typescript
selectAll: (sceneGraph) => {
  const allIds: string[] = [];
  const rootNodes = sceneGraph.getRootNodes();
  for (const node of rootNodes) {
    allIds.push(node.id);
    const descendants = sceneGraph.getDescendants(node.id);
    for (const desc of descendants) {
      allIds.push(desc.id);
    }
  }
  set({ selectedNodeIds: new Set(allIds) });
},
```

Select All collects every node ID — roots and all descendants. This differs from some editors that only select root nodes. Selecting descendants too means that Ctrl+A followed by Delete removes everything, and Ctrl+A followed by a fill change applies to all shapes at every nesting level.

## External Clipboard: The Dual Paste Strategy

The most complex clipboard operation is paste, because it needs to handle content from outside the editor — SVG from Figma, raster images from a screenshot tool, or SVG copied from a browser tab. The browser provides two APIs for clipboard access, each with different capabilities and restrictions.

### The Native Paste Event

The `ClipboardEvent` fires when the browser processes a paste action. It provides `clipboardData.items` with full MIME type information:

```typescript
const handlePaste = useCallback(
  (e: ClipboardEvent) => {
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    e.preventDefault();

    const sg = sceneGraphRef.current;
    if (!sg) return;

    const items = e.clipboardData?.items;
    if (!items || items.length === 0) {
      pasteClipboard(sg);
      return;
    }

    let imageItem: DataTransferItem | null = null;
    let htmlItem: DataTransferItem | null = null;
    let plainTextItem: DataTransferItem | null = null;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/') && !imageItem) imageItem = item;
      if (item.type === 'text/html' && !htmlItem) htmlItem = item;
      if (item.type === 'text/plain' && !plainTextItem) plainTextItem = item;
    }
```

The handler scans clipboard items for three content types, in priority order: `text/html` (where Figma and Illustrator place SVG), `text/plain` (raw SVG text), and `image/*` (raster images). The first matching type wins.

### SVG Detection

When text content is found, the handler searches for an SVG element:

```typescript
const textItem = htmlItem || plainTextItem;
if (textItem) {
  textItem.getAsString((text: string) => {
    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      importSvgString(svgMatch[0]);
      return;
    }
```

The regex `/<svg[\s\S]*?<\/svg>/i` extracts the first `<svg>...</svg>` element from the clipboard text. The `[\s\S]*?` pattern matches any character including newlines (`.` doesn't match newlines by default), and the `?` makes it non-greedy so it finds the first complete SVG element rather than spanning from the first `<svg>` to the last `</svg>`.

### Figma Proprietary Format Detection

Figma's normal copy operation doesn't put SVG on the clipboard — it uses a proprietary binary format:

```typescript
if (text.includes('figmeta') || text.includes('data-buffer')) {
  toast.info(
    'Figma uses a proprietary format. In Figma, right-click → Copy/Paste as → Copy as SVG, then paste here.',
    8000
  );
  return;
}
```

When the handler detects Figma's markers (`figmeta` or `data-buffer`), it shows an informative toast instead of silently failing. The 8-second duration gives the user time to read the instruction. This is better than ignoring the paste entirely — the user knows why it didn't work and what to do instead.

### The Clipboard API Fallback

The native paste event doesn't fire in all contexts. The dual strategy handles this:

```typescript
useEffect(() => {
  const pasteHandledRef = { current: false };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return;
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    pasteHandledRef.current = false;

    setTimeout(() => {
      if (pasteHandledRef.current) return;
      const sg = sceneGraphRef.current;
      if (!sg) return;
      void pasteFromSystemClipboard()
        .then((handled) => {
          if (!handled) pasteClipboard(sg);
        })
        .catch(() => {
          pasteClipboard(sg);
        });
    }, 300);
  };

  const handleGlobalPaste = (e: ClipboardEvent) => {
    pasteHandledRef.current = true;
    handlePaste(e);
  };

  document.addEventListener('keydown', handleGlobalKeyDown);
  document.addEventListener('paste', handleGlobalPaste);
  return () => {
    document.removeEventListener('keydown', handleGlobalKeyDown);
    document.removeEventListener('paste', handleGlobalPaste);
  };
}, [handlePaste, pasteFromSystemClipboard, pasteClipboard]);
```

The keydown handler for Ctrl+V does _not_ call `preventDefault()`. This is deliberate — suppressing the native keydown prevents the browser from firing the `ClipboardEvent`. By letting the event propagate, the browser processes the paste natively and fires the `paste` event, which the `handleGlobalPaste` handler catches.

The 300ms timeout is the fallback. If the native paste event fires (which happens synchronously after keydown), it sets `pasteHandledRef.current = true`, and the timeout exits early. If it doesn't fire — because no focusable element captured it, or the browser doesn't support it — the timeout tries the Clipboard API. If that also fails (user denied permission, API unavailable), it falls back to the internal clipboard.

The `pasteFromSystemClipboard` function uses `navigator.clipboard.readText()` first (which auto-grants in user gesture context without a permission prompt), then `navigator.clipboard.read()` for richer content types (which may show a permission prompt). A 2-second race timeout prevents the permission dialog from blocking indefinitely:

```typescript
const pasteFromSystemClipboard = useCallback(async (): Promise<boolean> => {
  if (!navigator.clipboard) return false;

  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
      if (svgMatch) {
        importSvgString(svgMatch[0]);
        return true;
      }
    }
  } catch {
    /* readText denied */
  }

  try {
    if (typeof navigator.clipboard.read === 'function') {
      const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000));
      const itemsOrNull = await Promise.race([navigator.clipboard.read(), timeoutPromise]);
      if (itemsOrNull) {
        for (const item of itemsOrNull) {
          if (item.types.includes('text/html')) {
            const htmlBlob = await item.getType('text/html');
            const html = await htmlBlob.text();
            const svgMatch = html.match(/<svg[\s\S]*?<\/svg>/i);
            if (svgMatch) {
              importSvgString(svgMatch[0]);
              return true;
            }
          }
        }
        for (const item of itemsOrNull) {
          for (const type of item.types) {
            if (type.startsWith('image/')) {
              const imageBlob = await item.getType(type);
              importImageBlob(imageBlob);
              return true;
            }
          }
        }
      }
    }
  } catch {
    /* clipboard.read denied */
  }

  return false;
}, [importSvgString, importImageBlob]);
```

The function returns `true` if it successfully imported external content, `false` otherwise. The caller uses this to decide whether to fall back to the internal clipboard.

## Testing Context Menus

Context menu tests verify rendering, interaction, and keyboard navigation:

```typescript
describe('ContextMenu', () => {
  it('renders items with labels and shortcuts', () => {
    const items = [
      { id: 'copy', label: 'Copy', shortcut: 'Ctrl+C', onClick: vi.fn() },
      { id: 'delete', label: 'Delete', shortcut: 'Del',
        danger: true, onClick: vi.fn() },
    ];
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);

    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Ctrl+C')).toBeTruthy();
    expect(screen.getByText('Delete')).toBeTruthy();
  });

  it('calls onClick on item click', () => {
    const onClick = vi.fn();
    const items = [{ id: 'copy', label: 'Copy', onClick }];
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={100} items={items} onClose={onClose} />);

    fireEvent.click(screen.getByText('Copy'));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on overlay click', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={100} y={100} items={[]} onClose={onClose} />);

    fireEvent.click(screen.getByTestId('context-menu-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <ContextMenu x={100} y={100}
        items={[{ id: 'a', label: 'A', onClick: vi.fn() }]}
        onClose={onClose} />
    );

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('disabled items do not fire onClick', () => {
    const onClick = vi.fn();
    render(
      <ContextMenu x={100} y={100}
        items={[{ id: 'a', label: 'A', disabled: true, onClick }]}
        onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByText('A'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

Clipboard tests in the editor store verify the deep clone, ID generation, and offset:

```typescript
describe('clipboard operations', () => {
  it('copySelection stores clones of selected nodes', () => {
    const sg = createMockSceneGraph();
    useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

    useEditorStore.getState().copySelection(sg);
    const { clipboard } = useEditorStore.getState();
    expect(clipboard).toHaveLength(1);
    expect(clipboard![0].id).toBe('rect1');
  });

  it('pasteClipboard creates nodes with new IDs and offset', () => {
    const sg = createMockSceneGraph();
    // After copy...
    useEditorStore.getState().pasteClipboard(sg);

    expect(sg.addNode).toHaveBeenCalledOnce();
    const pasted = (sg.addNode as Mock).mock.calls[0][0];
    expect(pasted.id).not.toBe('rect1');
    expect(pasted.transform.position.x).toBe(70); // 50 + 20
    expect(pasted.transform.position.y).toBe(30); // 50 - 20
  });

  it('cutSelection snapshots before cutting', () => {
    const sg = createMockSceneGraph();
    useEditorStore.setState({ selectedNodeIds: new Set(['rect1']) });

    useEditorStore.getState().cutSelection(sg);

    expect(sg.removeNode).toHaveBeenCalledWith('rect1');
    const { clipboard, selectedNodeIds } = useEditorStore.getState();
    expect(clipboard).toHaveLength(1);
    expect(selectedNodeIds.size).toBe(0);
  });
});
```

The Layer Panel tests verify that right-clicking an unselected node replaces the selection:

```typescript
it('right-click on unselected node replaces selection', () => {
  fireEvent.contextMenu(screen.getByTestId('layer-row-rect2'));
  expect(useEditorStore.getState().selectedNodeIds.has('rect2')).toBe(true);
});

it('shows batch labels in multi-select context menu', () => {
  // Select both nodes, then right-click
  expect(screen.getByText('Duplicate 2 Layers')).toBeTruthy();
  expect(screen.getByText('Delete 2 Layers')).toBeTruthy();
});
```

## Lessons

**Build one context menu component, use it everywhere.** The `ContextMenu` component is a pure display component — it takes `x`, `y`, `items`, and `onClose`, and handles positioning, keyboard navigation, and dismissal. The canvas, layer panel, and timeline each build their own `items` array, but they all render the same component. This means keyboard navigation, viewport flipping, and the overlay pattern are implemented once and tested once.

**Adapt menu contents to the current context, not the current tool.** The canvas context menu changes based on what's selected (nothing, shapes, path points, boolean groups), not which tool is active. A user right-clicking two rectangles expects "Group" whether they're using the Selection Tool or the Pen Tool. Context menus should reflect the state of the content, not the state of the tool.

**Use `structuredClone` for clipboard deep copies.** `structuredClone` handles nested objects, arrays, and special types without the limitations of `JSON.parse(JSON.stringify(...))`. It's a single function call that produces a true deep copy — no shared references between the clipboard and the scene graph. This eliminates an entire class of mutation bugs where modifying the original shape after copying silently changes the clipboard.

**Paste offset prevents invisible duplication.** Without the `(+20, -20)` position offset, pasted nodes land exactly on top of their originals. The user clicks Paste, sees no visible change, and doesn't realize the paste worked. The offset is small enough that the pasted shape stays near the original but large enough to be visible. The specific values are a convention — Figma uses `(10, 10)`, Sketch uses `(10, 10)`, we use `(20, -20)` to account for Y-up coordinates.

**The cut operation must inline its delete to avoid double undo snapshots.** Both `cutSelection` and `deleteSelection` call `pushUndo`. If `cutSelection` delegated to `deleteSelection`, the user would need to press Ctrl+Z twice to undo a single cut. The solution is to push undo once in `cutSelection` and perform the deletion inline. Any time you compose operations that each push undo, you need to either extract a no-undo variant or inline the logic.

**Don't suppress Ctrl+V's native event — you need the ClipboardEvent.** Calling `preventDefault()` on the Ctrl+V keydown event prevents the browser from firing its native paste event, which is the only way to access MIME-typed clipboard data. The dual strategy — let the native event fire, fall back to the Clipboard API after 300ms — gives you external clipboard support (SVG from Figma, raster images from screenshots) while still handling internal paste reliably.

## What We Built

This chapter covered context menus and clipboard operations — the right-click menus that expose editing commands across every surface, and the copy-paste system that handles both internal node duplication and external content import:

- **`ContextMenu`** is a reusable component that renders via `createPortal`, flips position when it hits viewport edges, supports full keyboard navigation (ArrowUp/Down, Enter, Escape), and uses a transparent overlay for click-to-dismiss. A 0.12-second scale animation gives the menu a polished entrance.
- **Canvas context menu** adapts its items based on selection state: path point deletion when the Direct Selection Tool has points selected, comprehensive editing commands (copy, group, z-order, booleans, delete) when shapes are selected, and paste/select-all when nothing is selected. Boolean operations are disabled unless two or more shape nodes are selected.
- **Layer Panel context menu** auto-selects the right-clicked layer if it wasn't already selected, adapts labels for multi-selection ("Delete 2 Layers", "Hide 3 Layers"), and includes Rename for single-selection mode.
- **Timeline context menu** shows easing presets with checkmarks on the active easing for keyframes, navigation commands (Go To Frame N, Start, End) for the ruler, and work area controls. A "Custom Easing..." item opens the visual curve editor.
- **Clipboard operations** use `structuredClone` for deep copying, generate unique IDs for pasted nodes, offset positions by `(+20, -20)` for visibility, and handle the `cutSelection` double-undo problem by inlining the deletion.
- **External clipboard paste** uses a dual strategy: the native `ClipboardEvent` fires first (providing MIME-typed data for SVG and raster images), with a 300ms Clipboard API fallback for environments where the native event doesn't fire. Figma's proprietary format is detected and explained via an informative toast.
- **`useContextMenu`** hook encapsulates open/close state with `preventDefault` and `stopPropagation`, providing a clean interface for any component that needs a right-click menu.

The next chapter covers drag-and-drop import — detecting SVG, PNG, and JPG files dropped onto the canvas, routing SVG files through the full vector import pipeline, creating ImageNodes for raster images, and supporting undo for imported content.
