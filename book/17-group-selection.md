# Group Selection

## The Depth Problem

Every chapter so far has treated the scene graph as a flat surface. Click a shape, get a shape. But the scene graph is a tree — groups contain children, groups contain groups, artboards contain shapes. When the user clicks a rectangle that lives inside a group that lives inside an artboard, which thing should be selected?

Every graphic editor answers this question the same way: you start at the top. A click selects the outermost container. Double-click to go deeper. Escape to come back out. This is the "enter group / exit group" pattern, and it's so universal that users of Figma, Illustrator, Sketch, and Affinity Designer expect it without thinking.

The implementation is surprisingly compact — one piece of state, one function, and a handful of integration points. But the consequences ripple through the entire tool system. Every hit test, every marquee selection, every keyboard shortcut, and every destructive operation must respect the current scope. Getting any one of them wrong means the user can accidentally select, move, or delete nodes they can't even see.

## One Piece of State

The entire system pivots on a single nullable string in the editor store:

```typescript
enteredGroupId: string | null;
enterGroup: (groupId: string) => void;
exitGroup: () => void;
```

When `enteredGroupId` is `null`, the user is at the root level of the document. Clicks resolve to top-level nodes. When it's set to a group's ID, the user has "entered" that group, and clicks resolve to the group's immediate children instead.

The store actions are minimal:

```typescript
enteredGroupId: null,
enterGroup: (groupId: string) =>
  set({ enteredGroupId: groupId, selectedNodeIds: new Set<string>() }),
exitGroup: () => set({ enteredGroupId: null }),
```

Two things happen when entering a group: the `enteredGroupId` is set, and the selection is cleared. Clearing the selection is important — when you double-click a group to enter it, the group itself should no longer be selected. You're now operating _inside_ it, not _on_ it.

There's no `enteredGroupStack` or `enteredGroupHistory`. You don't maintain a breadcrumb trail of entered groups. You have one pointer: you're either inside a specific group, or you're at the root. This simplicity is deliberate. A stack would add complexity for a feature (going "back" through nested groups) that users rarely need — they almost always press Escape to go all the way out, or double-click directly into the group they want.

## The Scope Resolution Function

The most important function in the group selection system is `resolveHitToScope`. Every time the user clicks or marquee-selects, the raw hit test returns the deepest node under the cursor — the actual leaf-level shape. But the user doesn't want the leaf if they haven't entered its parent group. They want the ancestor at their current scope level.

`resolveHitToScope` walks the ancestor chain from the hit node up to the appropriate level:

```typescript
private resolveHitToScope(hitNode: Node): Node | null {
  const enteredGroupId = this.context.getEnteredGroupId?.() ?? null;

  if (enteredGroupId === null) {
    // Walk up to root-level ancestor
    let current = hitNode;
    while (current.parent !== null) {
      const parent = this.context.sceneGraph.getNode(current.parent);
      if (!parent) break;
      if (parent.type === 'bone') break;
      current = parent;
    }
    return current;
  }

  // Walk up to immediate child of the entered group
  let current = hitNode;

  // The entered group itself shouldn't be selectable from inside
  if (current.id === enteredGroupId) return null;

  // Walk up until we find a node whose parent is the entered group
  while (current.parent !== enteredGroupId) {
    if (current.parent === null) {
      // Reached root without finding entered group — node is outside
      return null;
    }
    const parent = this.context.sceneGraph.getNode(current.parent);
    if (!parent) return null;
    current = parent;
  }
  return current;
}
```

There are two distinct paths through this function, and understanding both is essential.

### Root-Level Resolution

When `enteredGroupId` is `null`, the function walks up the ancestor chain until it finds a node with no parent — a root-level node. If the user clicks a rectangle inside Group A inside Group B, the function walks: rectangle → Group A → Group B. Group B has `parent === null`, so it's the result. The user clicks on the rectangle but selects Group B.

The `bone` type check is a special case. Bones have parent-child relationships for the FK chain (Chapter 13), but they're not spatial containers like groups. Walking through a bone parent would incorrectly resolve a shape to its parent bone instead of its parent group. The walk stops at bones and treats them as scope boundaries.

### Entered-Group Resolution

When `enteredGroupId` points to a specific group, the function has three possible outcomes:

**The hit node is inside the entered group.** The walk finds a node whose parent is the entered group — an immediate child. This is the normal case: user is inside Group B, clicks a shape that's a direct child of Group B, gets that shape.

**The hit node is deeply nested inside the entered group.** The walk finds a nested group that's a child of the entered group. If the user clicks a shape inside a sub-group, they get the sub-group, not the shape. They'd need to double-click the sub-group to go deeper.

**The hit node is outside the entered group.** The walk reaches the root without encountering the entered group in the ancestor chain. The function returns `null` — signaling that this hit is out of scope. The caller must handle this case specially (typically by exiting the group).

**The hit node is the entered group itself.** The function returns `null`. You can't select the group you're inside from the inside — that would be like selecting the room you're standing in.

## Entering and Exiting

The selection tool handles group entry on double-click:

```typescript
// Double-click on a group, artboard, or symbol instance to enter it
if (
  event.clickCount === 2 &&
  hitNode &&
  (hitNode.type === 'group' || hitNode.type === 'artboard' || hitNode.type === 'symbol-instance')
) {
  this.context.setEnteredGroupId?.(hitNode.id);
  return;
}
```

Three container types support entering: groups, artboards, and symbol instances. Artboards are conceptually the same as groups for selection purposes — they contain children, and you double-click to access those children. Symbol instances resolve their children from a shared definition, but the scoping behavior is identical.

The `return` after setting the group ID is important. Double-clicking a group should _only_ enter it — it shouldn't also start a move operation or trigger any other click behavior. The early return prevents the rest of `onPointerDown` from executing.

Exit happens through three triggers:

### Escape Key

The Escape handler in the selection tool has a priority chain. It first checks if the user is mid-operation (moving, resizing, rotating, marquee selecting) and cancels that operation. Only if nothing is in progress does it check for group exit:

```typescript
case 'Escape':
  if (this.mode === 'moving' && this.state.isDragging) {
    // Revert move...
  } else if (this.mode === 'resizing' && this.resizeState) {
    // Revert resize...
  } else if (this.mode === 'rotating' && this.rotationState) {
    // Revert rotation...
  } else if (this.mode === 'marquee') {
    // Cancel marquee...
  } else {
    // If inside a group, exit the group and select it
    const groupId = this.context.getEnteredGroupId?.() ?? null;
    if (groupId) {
      this.context.setEnteredGroupId?.(null);
      this.context.setSelectedIds([groupId]);
    } else {
      this.context.clearSelection();
    }
  }
  break;
```

When Escape exits a group, it selects the group itself. This is the expected UX — you're done working inside the group, so the group becomes selected, ready for you to move or resize it as a unit. If there's no group to exit, Escape simply clears the selection.

### Clicking Outside the Group

When the user clicks a shape that resolves to `null` (outside the entered group), the tool exits the group and selects the root ancestor of whatever was clicked:

```typescript
if (rawHit && !hitNode && enteredGroupId) {
  this.context.setEnteredGroupId?.(null);
  // Re-resolve at root scope and select
  let rootNode = rawHit;
  while (rootNode.parent) {
    const p = this.context.sceneGraph.getNode(rootNode.parent);
    if (!p) break;
    rootNode = p;
  }
  this.context.setSelectedIds([rootNode.id]);
  return;
}
```

This handles the case where the user clicks on a shape that belongs to a different group, or a root-level shape, while inside a group. The `rawHit` is the actual shape they clicked, `hitNode` is the scope-resolved result (null because it's outside the group), and `enteredGroupId` confirms they're currently inside a group. The response: exit, walk to root, select.

### Clicking Empty Space

When the user clicks on nothing while inside a group, the tool exits the group and clears the selection:

```typescript
if (!this.isAdditive(event) && !event.shiftKey) {
  if (enteredGroupId) {
    this.context.setEnteredGroupId?.(null);
  }
  this.context.clearSelection();
}
```

This is the "click on the void" case. The user is done working inside the group and clicks empty canvas. The group is exited, nothing is selected.

## Marquee Selection Respects Scope

Marquee selection (drag-to-select a rectangular region) must also respect the entered group. Without scope awareness, a marquee drag would select every node whose bounds intersect the rectangle — including children of groups the user hasn't entered, parents above the current scope, and shapes in completely different groups.

The `getNodesInRect` method solves this by routing every candidate through `resolveHitToScope`:

```typescript
private getNodesInRect(selectionRect: Rect): Node[] {
  const scopedIds = new Set<string>();
  const scopedNodes: Node[] = [];

  this.context.sceneGraph.traverseVisible((node) => {
    const bounds = this.getNodeBounds(node);
    if (!bounds) return;

    if (rect.intersects(selectionRect, bounds)) {
      const scoped = this.resolveHitToScope(node);
      if (scoped && !scopedIds.has(scoped.id)) {
        scopedIds.add(scoped.id);
        scopedNodes.push(scoped);
      }
    }
  });

  return scopedNodes;
}
```

The traversal checks every visible node's bounds against the rectangle. But instead of adding the hit node directly, it resolves through `resolveHitToScope`. If the user is inside Group A and the marquee covers a shape inside Group A and another shape inside Group B, only the Group A shape is selected — Group B's shape resolves to Group B (a root node), which resolves to `null` because the user isn't at root scope. The `scopedIds` Set deduplicates: if a marquee covers three shapes inside a sub-group, they all resolve to the sub-group itself, and it appears in the result only once.

## Recursive Group Nesting

The system handles groups within groups without any special case code. Consider this hierarchy:

```
Root
  └─ Artboard
       ├─ Group A
       │    ├─ Rectangle
       │    └─ Group B
       │         ├─ Circle
       │         └─ Star
       └─ Path
```

At root scope (`enteredGroupId === null`):

- Click Rectangle → resolves to Artboard
- Click Circle → resolves to Artboard
- Double-click Artboard → enters Artboard

Inside Artboard (`enteredGroupId === artboard.id`):

- Click Rectangle → resolves to Group A (immediate child of Artboard)
- Click Circle → resolves to Group A (not Group B — Group A is the scope boundary)
- Click Path → resolves to Path (direct child of Artboard)
- Double-click Group A → enters Group A

Inside Group A (`enteredGroupId === groupA.id`):

- Click Rectangle → resolves to Rectangle (direct child of Group A)
- Click Circle → resolves to Group B (immediate child of Group A)
- Click Path → resolves to null (outside Group A) → exits to root, selects Artboard
- Double-click Group B → enters Group B
- Escape → exits to root, selects Group A

Notice the jump on Escape: when you exit Group A, you go all the way to root scope, not back to Artboard scope. This is the consequence of having a single `enteredGroupId` instead of a stack. If the user entered Artboard → Group A → Group B, pressing Escape from Group B exits to root, selecting Group B. Pressing Escape again clears the selection. There's no "back to Artboard" step.

This matches Figma's behavior. Most users find it intuitive — Escape means "I'm done editing inside this thing." If they want to go back into Artboard, they double-click it again. The mental model is simpler than maintaining a breadcrumb trail.

## The Direct Selection Tool's Variant

The direct selection tool (Chapter 16) has its own group entry mechanism, slightly different from the selection tool's. Instead of double-clicking to enter, the direct selection tool enters a group on a _second click_ — click once to select, click again to enter:

```typescript
// Click on a group that's already selected → enter it
if (hitNode && hitNode.type === 'group') {
  const selectedIds = this.context.getSelectedIds();
  if (selectedIds.has(hitNode.id)) {
    // Already selected → enter the group
    this.context.setEnteredGroupId?.(hitNode.id);
    this.clearPointSelection();
    this.context.clearSelection();
  } else {
    // Not selected → select the group
    this.clearPointSelection();
    if (event.shiftKey) {
      this.context.addToSelection(hitNode.id);
    } else {
      this.context.setSelectedIds([hitNode.id]);
    }
  }
  return;
}
```

First click on a group: selects it. Second click on the same group: enters it and clears both node and point selection. This two-step pattern avoids the double-click ambiguity — in the direct selection tool, double-click is already overloaded (it adds a point to a path segment). Using single-click-to-enter for already-selected groups gives a clean interaction that doesn't conflict.

The exit mechanisms are identical: Escape exits and selects the group, clicking outside exits and resolves to root, clicking empty space exits and clears.

Both tools share the same `resolveHitToScope` algorithm. The direct selection tool has its own copy — not shared through inheritance, but structurally identical. This duplication is deliberate: the two tools are separate classes with different event handling, and extracting a shared base just for one function would add coupling that isn't worth it. The function is 20 lines. If the scope resolution logic ever needs to change, searching for `resolveHitToScope` finds both copies immediately.

## Tool Switching Clears the Group

When the user switches from the selection tool to any other tool, the entered group is cleared:

```typescript
onDeactivate(): void {
  this.mode = 'idle';
  this.startPoint = null;
  this.marqueeRect = null;
  this.moveStartPositions.clear();
  this.resizeState = null;
  this.rotationState = null;
  this.currentCursor = 'default';
  // Exit group when switching away from selection tool
  this.context.setEnteredGroupId?.(null);
}
```

This prevents a confusing state: imagine the user enters Group A, switches to the pen tool to draw a new path, then switches back to the selection tool. Should they still be inside Group A? The answer is no — the pen tool creates paths at the root level, and the user's mental model has shifted away from "editing Group A's contents." Clearing on deactivate keeps the scope predictable.

The direct selection tool does the same:

```typescript
onDeactivate(): void {
  // ...clear point selection state...
  this.context.setEnteredGroupId?.(null);
}
```

## Safety Clears

The entered group state must be cleared in several store operations that would otherwise leave the user in an inconsistent state. Here's the full list:

**Undo and Redo.** When undoing, the scene graph is restored from a snapshot. The group the user was inside might no longer exist in the restored state (it might have been created after the undo point). Both `undo` and `redo` unconditionally clear `enteredGroupId`:

```typescript
undo: (sceneGraph) => {
  // ...restore snapshot...
  set({
    // ...restore selection, stacks...
    enteredGroupId: null,
  });
},
```

**Delete Selection.** If the user deletes the group they're inside, the entered group ID would point to a non-existent node. The delete action checks and clears conditionally:

```typescript
deleteSelection: (sceneGraph) => {
  // ...remove nodes...
  const clearGroup = enteredGroupId && !sceneGraph.getNode(enteredGroupId);
  set({
    // ...clear selection...
    ...(clearGroup ? { enteredGroupId: null } : {}),
  });
},
```

The conditional check (`clearGroup ? ...`) is important — deleting a shape _inside_ the group shouldn't exit the group. Only deleting the group itself (or an ancestor that causes the group to be removed) triggers the clear.

**Ungroup Selection.** Ungrouping dissolves the group — its children move up to the parent level. If the user is inside the group being ungrouped, the entered group no longer makes sense:

```typescript
ungroupSelection: (sceneGraph) => {
  for (const id of selectedNodeIds) {
    const node = sceneGraph.getNode(id);
    if (!node || node.type !== 'group') continue;

    if (id === enteredGroupId) clearGroup = true;

    // Move children out, delete group...
  }
  set({
    ...(clearGroup ? { enteredGroupId: null } : {}),
  });
},
```

**New Project.** Starting a new project resets everything, including the entered group:

```typescript
newProject: (sceneGraph) => {
  // ...create fresh page...
  set({
    // ...reset all state...
    enteredGroupId: null,
  });
},
```

**Page Switching.** Each page has its own scene graph and selection state. Switching pages clears the entered group because the group belongs to the previous page:

```typescript
switchPage: (pageId, sceneGraph) => {
  // ...save current page, load target page...
  set({
    // ...restore page state...
    enteredGroupId: null,
    clipboard: null,
    currentFrame: 0,
    isPlaying: false,
  });
},
```

The pattern is consistent: any operation that replaces or fundamentally restructures the scene graph clears the entered group. Operations that modify individual nodes within the scene graph only clear it if the entered group itself was affected.

## The ToolContext Bridge

The entered group state lives in the Zustand store (React land), but the tools live in class instances (vanilla TypeScript). The bridge is the `ToolContext` interface:

```typescript
interface ToolContext {
  // ...20+ other fields...
  getEnteredGroupId?: () => string | null;
  setEnteredGroupId?: (id: string | null) => void;
}
```

Both callbacks are optional (`?`) because the tool system was designed before group selection existed, and not every tool needs them. The selection tool and direct selection tool use `?.()` optional chaining on every call, which means they gracefully degrade to "always at root scope" if the callbacks aren't provided — useful for testing tools in isolation without wiring up the full store.

The `ToolManager` passes these through from its options:

```typescript
interface ToolManagerOptions {
  // ...
  getEnteredGroupId?: () => string | null;
  setEnteredGroupId?: (id: string | null) => void;
}

createToolContext(): ToolContext {
  return {
    // ...
    getEnteredGroupId: options.getEnteredGroupId,
    setEnteredGroupId: options.setEnteredGroupId,
  };
}
```

And the React canvas component wires the store to the options:

```typescript
getEnteredGroupId: () => useEditorStore.getState().enteredGroupId,
setEnteredGroupId: (id) => {
  if (id) {
    useEditorStore.getState().enterGroup(id);
  } else {
    useEditorStore.getState().exitGroup();
  }
},
```

The `setEnteredGroupId` wrapper converts between the tool's simple `string | null` interface and the store's `enterGroup` / `exitGroup` actions. `enterGroup` clears the selection (entering a group deselects its parent); `exitGroup` just sets the ID to null (the caller handles reselection separately — different exit triggers select different things).

## Lessons

**One piece of state can have a large integration surface.** The entire group selection system is a single nullable string, yet it touches hit testing, marquee selection, keyboard handling, tool switching, undo, delete, ungroup, page switching, and two separate tool implementations. The complexity of a feature is not measured by how much state it introduces but by how many existing systems must respect that state.

**A single pointer beats a stack for scope navigation.** A breadcrumb trail of entered groups would let the user step back through nested groups, but users almost never need this — they press Escape to exit completely or double-click directly into the group they want. The simpler model (one pointer, not a stack) eliminates an entire class of bugs around stale stack entries and back-navigation edge cases.

**Scope resolution is an ancestor walk, not a lookup.** The `resolveHitToScope` function walks from the deepest hit node up the parent chain to find the appropriate scope level. This walk naturally handles arbitrary nesting depth without special-case code for each level. The three outcomes (inside the entered group, outside it, or the group itself) emerge from the same loop.

**Every state-replacing operation must clear scope references.** Undo, redo, delete, ungroup, new project, and page switch all clear or conditionally clear `enteredGroupId`. The pattern is consistent: if an operation replaces or restructures the scene graph, it must ensure the entered group pointer does not dangle. Missing any one integration point creates a bug where the user is trapped in a non-existent scope.

**Tool deactivation is a scope boundary.** Clearing `enteredGroupId` when switching tools prevents a confusing state where the user enters a group, switches to the pen tool to draw something new, switches back, and finds themselves still scoped inside a group they have forgotten about. The mental model resets with the tool.

## What We Built

This chapter covered the Figma-style group selection system — a small amount of code with broad consequences:

- **One piece of state**: `enteredGroupId: string | null` in the editor store. No stack, no history, no breadcrumbs. Enter sets it, exit nulls it.
- **`resolveHitToScope`**: The core algorithm. Walks a hit node up the ancestor chain to the appropriate scope level. Returns root ancestors at root scope, immediate children at group scope, and `null` for out-of-scope nodes.
- **Double-click to enter**: Groups, artboards, and symbol instances. Clears selection on entry.
- **Three exit triggers**: Escape (selects the group), click outside (selects the clicked root ancestor), click empty space (clears selection). All reset `enteredGroupId` to null.
- **Marquee scope filtering**: Every marquee candidate passes through `resolveHitToScope` with Set deduplication. Sub-groups resolve to their container.
- **Direct selection variant**: Second click on already-selected group enters it (avoids double-click conflict with point insertion).
- **Tool switch clears**: `onDeactivate` resets `enteredGroupId` to prevent stale scope across tool changes.
- **Safety clears**: Undo, redo, delete, ungroup, new project, and page switch all clear or conditionally clear the entered group to prevent dangling references.
- **ToolContext bridge**: Optional callbacks (`getEnteredGroupId`, `setEnteredGroupId`) connect the store to the tool system with graceful degradation for isolated testing.

The group selection system is a textbook example of a feature where the state is trivial but the integration surface is large. One nullable string, but it touches hit testing, selection, marquee, keyboard handling, tool switching, undo, delete, ungroup, page switching, and two separate tool implementations. Missing any one of those integration points creates a bug where the user ends up in a scope they shouldn't be in — or can't get out of one they should.

The next chapter builds the undo/redo system — the history mechanism that makes every destructive operation reversible, using scene graph snapshots and a pair of bounded stacks.
