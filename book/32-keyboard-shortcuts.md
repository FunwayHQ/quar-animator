# Keyboard Shortcuts

## Making It Feel Like a Real Tool

You can tell the difference between a demo and a real application in the first ten seconds. Open a demo graphic editor and try pressing V to switch to the selection tool. Nothing happens. Try Ctrl+Z to undo. Nothing. Try Space to pan the canvas. Nothing. The mouse works, but the keyboard is dead. A real editor — Figma, Illustrator, Photoshop — responds to dozens of keyboard shortcuts without the user ever touching a menu. Professionals don't reach for menu items. They press V, draw a shape, press Ctrl+D to duplicate it, press Ctrl+G to group, press Ctrl+Z when they make a mistake. The keyboard is the primary interface. The mouse is secondary.

This chapter builds the keyboard shortcut system that makes the editor feel professional. It covers four separate hooks that divide shortcuts by concern: tool switching, timeline playback, project operations, and canvas-level editing commands. Along the way, we'll tackle three problems that trip up every web application that tries to own the keyboard: focus management (don't intercept typing in text fields), modifier key conflicts (when Ctrl+Shift+D exists, Ctrl+D must check `!e.shiftKey`), and the Space bar (it needs to both toggle playback and enable pan mode, depending on context).

## The Architecture: Four Hooks, One Canvas

The keyboard system is distributed across four React hooks, each responsible for a different category of shortcuts. All four attach `keydown` listeners to `window` or the canvas element, creating a layered dispatch:

```
Canvas.tsx (document-level)
├─ Boolean ops (Ctrl+Shift+U/D/I/X/P/O/K)
├─ Paste (Ctrl+V, dual strategy)
├─ Zoom/view (Ctrl+0/1/+/-)
├─ Edit (undo, redo, cut, copy, delete)
├─ Z-order (Ctrl+]/[, Ctrl+Shift+]/[)
├─ Group (Ctrl+G, Ctrl+Shift+G)
└─ Space for pan mode

useToolShortcuts
└─ Tools (V, R, O, P, T, J, F)

useTimelineShortcuts
└─ Playback (Space, Home/End, ,/., L, K, G)
    └─ Shift (Shift+O/R/G/,/.)

useProjectShortcuts
└─ File (Ctrl+S, Ctrl+Shift+S, Ctrl+N/O/I)
```

This separation has a practical benefit: each hook can be tested independently, and each hook has a clear contract about which keys it owns. Tool shortcuts are single unmodified letters. Project shortcuts are always Ctrl+letter. Timeline shortcuts are a mix of unmodified and Shift-modified keys. The canvas handler owns the compound Ctrl+Shift combinations and the editing commands that need access to the scene graph.

## Tool Shortcuts: Single Key, Instant Switch

The simplest shortcut hook maps single letters to tool types:

```typescript
const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'selection',
  r: 'rectangle',
  o: 'ellipse',
  p: 'pen',
  t: 'text',
  j: 'bone',
  f: 'artboard',
};
```

The hook listens for `keydown` events and dispatches to the store:

```typescript
export function useToolShortcuts() {
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore when modifier keys are pressed
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
        return;
      }

      // Ignore when input or textarea is focused
      const target = event.target as HTMLElement | null;
      if (target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        const isEditable =
          target.isContentEditable || target.getAttribute?.('contenteditable') === 'true';
        if (tagName === 'input' || tagName === 'textarea' || isEditable) {
          return;
        }
      }

      // Check for tool shortcut (case-insensitive)
      const key = event.key.toLowerCase();
      const tool = TOOL_SHORTCUTS[key];

      if (tool) {
        event.preventDefault();
        setActiveTool(tool);
      }
    },
    [setActiveTool]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
```

Three guards protect the shortcut from misfiring:

1. **Modifier guard**: If Ctrl, Alt, Meta, or Shift is held, the event is ignored. This prevents Ctrl+V from switching to the selection tool — the `v` key matches `TOOL_SHORTCUTS` but the intent is paste, not tool switch.

2. **Focus guard**: If the user is typing in a text input, textarea, or contenteditable element, the event is ignored. Without this, typing a layer name containing "v" would switch to the selection tool mid-keystroke.

3. **Case normalization**: `event.key.toLowerCase()` handles both `v` and `V` (Caps Lock on). The shortcut map only contains lowercase keys, so the lookup is always consistent.

The hook also exports a reverse lookup for tooltip display:

```typescript
export function getToolShortcut(tool: ToolType): string | null {
  for (const [key, value] of Object.entries(TOOL_SHORTCUTS)) {
    if (value === tool) {
      return key.toUpperCase();
    }
  }
  return null;
}
```

This is used by the Toolbar component to show "Selection Tool (V)" in tooltips. The shortcut hint is derived from the same map that drives the behavior, so they can never go out of sync.

## Timeline Shortcuts: Playback and Navigation

The timeline hook is more complex because it handles both plain keys and Shift-modified keys. The interface takes callbacks for the core playback actions:

```typescript
interface TimelineShortcutCallbacks {
  togglePlay: () => void;
  goToStart: () => void;
  goToEnd: () => void;
  nextFrame: () => void;
  prevFrame: () => void;
}

export function useTimelineShortcuts(callbacks: TimelineShortcutCallbacks) {
```

The callbacks are injected rather than importing the playback controller directly. This keeps the hook testable — tests pass mock functions instead of creating real animation loops.

### The Shift Branch

Shift-modified shortcuts are handled first, in their own block:

```typescript
// Shift-modified shortcuts
if (event.shiftKey) {
  if (event.key === '<' || event.key === ',') {
    // Shift+, : jump 10 frames backward
    if (!state.isPlaying) {
      event.preventDefault();
      state.setCurrentFrame(state.currentFrame - 10);
    }
    return;
  }
  if (event.key === '>' || event.key === '.') {
    // Shift+. : jump 10 frames forward
    if (!state.isPlaying) {
      event.preventDefault();
      state.setCurrentFrame(state.currentFrame + 10);
    }
    return;
  }
  if (event.key === 'O' || event.key === 'o') {
    // Shift+O : toggle onion skinning
    event.preventDefault();
    useEditorStore.getState().toggleOnionSkin();
    return;
  }
  if (event.key === 'R' || event.key === 'r') {
    // Shift+R : toggle rulers
    event.preventDefault();
    useEditorStore.getState().toggleShowRulers();
    return;
  }
  if (event.key === 'G' || event.key === 'g') {
    // Shift+G : toggle guides
    event.preventDefault();
    useEditorStore.getState().toggleShowGuides();
    return;
  }
  // Don't process other keys when Shift is held
  return;
}
```

The early return at the end of the Shift block is critical. Without it, pressing Shift+K would fall through to the `switch` statement below and toggle auto-keyframe — a confusing side effect when the user was just pressing Shift as part of a different shortcut. The `return` after the block says "if Shift is held and we didn't match a Shift shortcut, do nothing."

The comma/period keys produce `<` and `>` when Shift is held on most keyboard layouts. The handler checks both forms — `event.key === '<' || event.key === ','` — because browser key event behavior varies. Some browsers report the shifted character, others report the physical key. Checking both eliminates keyboard-layout bugs.

### Unmodified Keys

The unmodified shortcuts use a `switch` statement:

```typescript
switch (event.key) {
  case ' ':
    // Space: toggle play/pause (tap only, not hold)
    if (!event.repeat) {
      event.preventDefault();
      callbacks.togglePlay();
    }
    break;

  case 'g':
  case 'G':
    // G: toggle graph editor
    event.preventDefault();
    useEditorStore.getState().toggleTimelineViewMode();
    break;

  case 'Home':
    event.preventDefault();
    callbacks.goToStart();
    break;

  case 'End':
    event.preventDefault();
    callbacks.goToEnd();
    break;

  case ',':
    // Previous frame (only when not playing)
    if (!state.isPlaying) {
      event.preventDefault();
      callbacks.prevFrame();
    }
    break;

  case '.':
    // Next frame (only when not playing)
    if (!state.isPlaying) {
      event.preventDefault();
      callbacks.nextFrame();
    }
    break;

  case 'l':
  case 'L':
    // Toggle loop
    event.preventDefault();
    useEditorStore.getState().setIsLooping(!state.isLooping);
    break;

  case 'k':
  case 'K':
    // Toggle auto-keyframe
    event.preventDefault();
    useEditorStore.getState().toggleAutoKeyframe();
    break;
}
```

The Space key has a special guard: `!event.repeat`. Holding Space fires `keydown` events repeatedly (browser key repeat). Without the guard, holding Space would toggle play/pause dozens of times per second. The `!event.repeat` check means only the initial press toggles playback. But Space is also used for pan mode in the canvas handler — the timeline hook handles the _tap_ case (toggle play), while the canvas handler handles the _hold_ case (pan mode). We'll see how those two interact in the next section.

Frame stepping with comma and period only works when playback is stopped (`!state.isPlaying`). During playback, the animation engine controls the frame counter. Allowing manual frame stepping during playback would fight the animation loop, producing erratic behavior.

## Project Shortcuts: File Operations

The project shortcut hook handles save, open, new, and import — all Ctrl-modified:

```typescript
export function useProjectShortcuts(callbacks: ProjectShortcutCallbacks) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle Ctrl/Cmd shortcuts
      if (!event.ctrlKey && !event.metaKey) return;

      // Ignore when input, textarea, or select is focused
      const target = event.target as HTMLElement | null;
      if (target && target.tagName) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
          return;
        }
      }

      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          if (event.shiftKey) {
            callbacks.onSaveAs();
          } else {
            callbacks.onSave();
          }
          break;

        case 'n':
          if (!event.shiftKey) {
            event.preventDefault();
            callbacks.onNew();
          }
          break;

        case 'o':
          if (!event.shiftKey) {
            event.preventDefault();
            callbacks.onOpen();
          }
          break;

        case 'i':
          if (!event.shiftKey && callbacks.onImportSvg) {
            event.preventDefault();
            callbacks.onImportSvg();
          }
          break;
      }
    },
    [callbacks]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
```

Notice the `!event.shiftKey` guards on Ctrl+N, Ctrl+O, and Ctrl+I. These exist because of the Ctrl+Shift conflict pattern: the boolean operations handler owns Ctrl+Shift+I (intersect). If the project hook didn't check `!event.shiftKey`, pressing Ctrl+Shift+I would both open a file and intersect shapes. The `!event.shiftKey` guard ensures only the intended handler fires.

Ctrl+S distinguishes Save from Save As using the same `shiftKey` check, but inverted — Ctrl+S saves, Ctrl+Shift+S saves as. Both are handled in the same `case` branch because they're the same key with a modifier difference.

The `preventDefault()` calls are essential for file operations. Without them, Ctrl+S triggers the browser's "Save Page" dialog, Ctrl+O opens the browser's file picker, and Ctrl+N opens a new browser window — none of which is what the user wants in a graphic editor.

## The Canvas Handler: Editing Commands

The canvas component handles the editing shortcuts that need direct access to the scene graph: undo/redo, clipboard operations, z-order changes, and group/ungroup. These are implemented as a `handleKeyDown` callback on the canvas element:

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    const camera = cameraRef.current;
    const canvas = canvasRef.current;
    if (!camera || !canvas) return;

    const tag = (document.activeElement as HTMLElement)?.tagName;
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Space for pan mode
    if (e.code === 'Space' && !isSpaceHeldRef.current) {
      e.preventDefault();
      isSpaceHeldRef.current = true;
      if (!isPanningRef.current) {
        canvas.style.cursor = 'grab';
      }
      return;
    }
```

### Space: Pan Mode vs. Play/Pause

Space does double duty. In the timeline hook, tapping Space toggles play/pause. In the canvas handler, holding Space enables pan mode — the cursor changes to a grab hand, and dragging pans the camera instead of interacting with shapes.

These don't conflict because of how browser events work. The canvas handler fires first (it's a React event on the focused canvas element), catches the Space press, and sets `isSpaceHeldRef.current = true`. The timeline hook also fires (it's a window-level listener), but only toggles playback when `!event.repeat` — meaning the initial press. On key up, the canvas handler resets the pan cursor. The result: tapping Space briefly toggles playback; holding Space activates pan mode. Both behaviors coexist on the same key.

### Zoom Shortcuts

Zoom uses `e.code` instead of `e.key` for reliability:

```typescript
// Ctrl+0: Fit to window (reset zoom and position)
if (e.code === 'Digit0' && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  camera.reset();
  return;
}

// Ctrl+1: Zoom to 100%
if (e.code === 'Digit1' && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  camera.zoomTo(1);
  return;
}

// Ctrl+Plus: Zoom in
if ((e.code === 'Equal' || e.code === 'NumpadAdd') && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  camera.zoomTo(camera.zoom * 1.25);
  return;
}

// Ctrl+Minus: Zoom out
if ((e.code === 'Minus' || e.code === 'NumpadSubtract') && (e.ctrlKey || e.metaKey)) {
  e.preventDefault();
  camera.zoomTo(camera.zoom * 0.8);
  return;
}
```

`e.code` represents the physical key position, not the character it produces. `'Equal'` is the `=`/`+` key on US keyboards. Using `e.code` instead of `e.key` avoids a problem: with Ctrl held, `e.key` for the `+` key reports `=` on some browsers and `+` on others, depending on whether the browser applies the Shift interpretation before or after the Ctrl modifier. `e.code === 'Equal'` is always consistent regardless of keyboard layout or modifier state.

The asymmetric zoom factors — 1.25 for zoom in, 0.8 for zoom out — are reciprocals. Pressing Ctrl+Plus then Ctrl+Minus returns to the original zoom level: `1.0 × 1.25 × 0.8 = 1.0`. Symmetric factors like 1.2 and 0.8 would not cancel out (1.2 × 0.8 = 0.96).

### The Ctrl+Shift Conflict

The boolean operations handler is a separate `useEffect` that listens at the `window` level:

```typescript
useEffect(() => {
  const handleBooleanKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;

    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const key = e.key.toLowerCase();
    switch (key) {
      case 'u':
        e.preventDefault();
        booleanUnion(sceneGraph);
        break;
      case 'd':
        e.preventDefault();
        booleanSubtract(sceneGraph);
        break;
      case 'i':
        e.preventDefault();
        booleanIntersect(sceneGraph);
        break;
      case 'x':
        e.preventDefault();
        booleanExclude(sceneGraph);
        break;
      case 'p':
        e.preventDefault();
        convertTextToPath(sceneGraph);
        break;
      case 'o':
        e.preventDefault();
        outlineStroke(sceneGraph);
        break;
      case 'k':
        e.preventDefault();
        useEditorStore.getState().createSymbol(sceneGraph);
        break;
    }
  };

  window.addEventListener('keydown', handleBooleanKeyDown);
  return () => window.removeEventListener('keydown', handleBooleanKeyDown);
}, [
  sceneGraph,
  booleanUnion,
  booleanSubtract,
  booleanIntersect,
  booleanExclude,
  convertTextToPath,
  outlineStroke,
]);
```

This handler requires both Ctrl and Shift. The first line — `if (!(e.ctrlKey || e.metaKey) || !e.shiftKey) return;` — is the guard that makes the Ctrl/Ctrl+Shift split work. Every Ctrl+Shift+letter event also triggers any Ctrl+letter handler unless that handler checks `!e.shiftKey`. Here's the conflict pattern:

- User presses **Ctrl+Shift+D** (boolean subtract)
- `e.ctrlKey` is `true`, `e.shiftKey` is `true`, `e.key` is `'d'` (lowercase even with Shift)
- The boolean handler matches: Ctrl+Shift → key `'d'` → `booleanSubtract`
- The canvas handler also sees it: Ctrl → key `'d'` → **duplicate**

Both handlers fire. The shape gets boolean-subtracted _and_ duplicated. The fix is in the canvas handler:

```typescript
if (e.key === 'd' && !e.shiftKey) {
  e.preventDefault();
  duplicateSelection(sceneGraph);
  return;
}
```

The `!e.shiftKey` guard ensures Ctrl+D duplicates, but Ctrl+Shift+D doesn't. This pattern applies to every key that has both a Ctrl and a Ctrl+Shift binding: D (duplicate vs. boolean subtract), I (import SVG vs. boolean intersect), O (open file vs. outline stroke), and others.

In Playwright end-to-end tests, pressing Ctrl+Shift+D sends `e.key === 'd'` (lowercase). In real browsers, the key might be uppercase `'D'`. The `!e.shiftKey` guard works correctly regardless of what `e.key` reports, because it checks the modifier flag directly instead of relying on the character case.

### Undo, Redo, and Cut

The undo/redo/cut shortcuts are straightforward but illustrate the modifier pattern:

```typescript
// Undo/Redo shortcuts
if (!isInput && (e.ctrlKey || e.metaKey)) {
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo(sceneGraph);
    return;
  }
  if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault();
    redo(sceneGraph);
    return;
  }
  if (e.key === 'x' && !e.shiftKey) {
    e.preventDefault();
    cutSelection(sceneGraph);
    return;
  }
}
```

Redo has two bindings: Ctrl+Shift+Z (standard on Mac and modern apps) and Ctrl+Y (traditional Windows convention). Both are checked in the same condition with `||`. Undo checks `!e.shiftKey` to avoid conflicting with Redo — without this, Ctrl+Shift+Z would trigger _both_ undo and redo.

### Delete and Direct Selection

Delete and Backspace need special handling when the Direct Selection Tool is active:

```typescript
// Delete/Backspace: delete selection (skip if input)
if (!isInput && (e.key === 'Delete' || e.key === 'Backspace')) {
  if (isDirectSelectionActive && directSelectionPoints.length > 0) {
    // Let tool system handle point deletion
    toolKeyDown(e);
    return;
  }
  deleteSelection(sceneGraph);
  return;
}
```

When the user is editing path points with the Direct Selection Tool and has points selected, Delete should remove the selected _points_, not the entire selected _node_. The handler checks whether the Direct Selection Tool has active point selections and, if so, forwards the event to the tool system via `toolKeyDown`. Otherwise, it deletes the node-level selection.

This is a scope-sensitive shortcut: the same key does different things depending on the editing context. The pattern — check the tool state before dispatching — repeats throughout editors with nested selection models.

### The Fallthrough to Tools

Any key that isn't consumed by the canvas shortcuts falls through to the tool system:

```typescript
// Pass to tool system
toolKeyDown(e);
```

This is how individual tools handle their own shortcuts. The PenTool responds to Escape (cancel current path). The SelectionTool responds to arrow keys (nudge selected shapes). The canvas handler doesn't need to know about these — it passes unhandled events downstream.

## The Paste Dual Strategy

Paste deserves its own section because it's the most complex shortcut in the system. The challenge: the editor needs to handle both internal paste (nodes from the editor's clipboard) and external paste (SVG from Figma, raster images from the system clipboard). The browser's `ClipboardEvent` provides access to all MIME types, but it only fires if the native paste event isn't suppressed.

The solution is a dual strategy:

```typescript
useEffect(() => {
  const pasteHandledRef = { current: false };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.key !== 'v') return;

    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // Don't preventDefault — let the browser fire the native paste event
    pasteHandledRef.current = false;

    // Fallback: if no paste event fires within 300ms, use Clipboard API
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

Here's the sequence:

1. User presses Ctrl+V. The `keydown` handler fires but does _not_ call `preventDefault()`. It sets a "not handled yet" flag and starts a 300ms timer.

2. Because `preventDefault()` wasn't called, the browser fires its native `paste` event. The `paste` handler sets "handled = true" and processes the clipboard data — checking for SVG in `text/html` (from Figma or Illustrator), raw SVG in `text/plain`, and raster images in `image/*` MIME types.

3. If the paste event fires (step 2 completes), the 300ms timeout finds `pasteHandledRef.current === true` and exits.

4. If no paste event fires — because no focusable element captured it, or the browser doesn't support it in the current context — the timeout falls back to the Clipboard API (`navigator.clipboard.readText()`), and if that fails too, falls back to the internal clipboard (`pasteClipboard`).

The 300ms delay is a pragmatic choice. The native paste event fires synchronously after `keydown`, so 300ms is more than enough to detect it. The delay is invisible to the user — paste feels instant — but it provides a safety net for environments where the native paste event doesn't fire.

## Focus Management: The isInput Guard

Every shortcut handler includes some version of this check:

```typescript
const target = event.target as HTMLElement | null;
if (target && target.tagName) {
  const tagName = target.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return;
  }
}
```

This guard prevents shortcuts from intercepting normal typing. When the user is renaming a layer in the Layer Panel (an `<input>` element), pressing V should type the letter "v", not switch to the selection tool. When editing a text node's content (a `<textarea>` overlay), pressing Delete should delete a character, not delete the selected shape.

The tool shortcut hook also checks `isContentEditable`:

```typescript
const isEditable = target.isContentEditable || target.getAttribute?.('contenteditable') === 'true';
if (tagName === 'input' || tagName === 'textarea' || isEditable) {
  return;
}
```

This catches rich text editors and other editable elements that don't use standard form controls.

The check uses `document.activeElement` in the canvas handler and `event.target` in the hooks. Both work, but `document.activeElement` is more reliable for the canvas case because React synthetic events sometimes have a different `target` than the actually focused element.

## Key Up: Releasing Pan Mode

The `keyup` handler is simpler than `keydown` — it only needs to handle Space release:

```typescript
const handleKeyUp = useCallback(
  (e: React.KeyboardEvent) => {
    if (e.code === 'Space') {
      isSpaceHeldRef.current = false;
      const canvas = canvasRef.current;
      if (canvas && !isPanningRef.current) {
        canvas.style.cursor = toolCursor;
      }
      return;
    }

    // Pass to tool system
    toolKeyUp(e);
  },
  [toolKeyUp, toolCursor]
);
```

When Space is released, the pan cursor (`grab`) reverts to the active tool's cursor. The `isPanningRef` check prevents cursor flicker — if the user is still mid-pan (mouse button held), the cursor stays as `grabbing` until the mouse button is released.

All other key-up events pass through to the tool system. Most tools don't respond to key-up, but the pattern ensures that any tool that needs it (a hypothetical brush size modifier, for example) can receive the event.

## Wiring It All Together

The hooks are activated in the Canvas component and the App component:

```typescript
function Canvas() {
  // Tool shortcuts
  useToolShortcuts();

  // Timeline shortcuts
  useTimelineShortcuts({
    togglePlay: () => { /* ... */ },
    goToStart: () => { /* ... */ },
    goToEnd: () => { /* ... */ },
    nextFrame: () => { /* ... */ },
    prevFrame: () => { /* ... */ },
  });

  // Project shortcuts
  useProjectShortcuts({
    onSave: () => actions.saveProject(),
    onSaveAs: () => actions.saveProjectAs(),
    onNew: () => actions.newProject(),
    onOpen: () => actions.openProject(),
    onImportSvg: () => actions.importSvg(),
  });

  // Canvas-level keyboard handlers
  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
```

The `tabIndex={0}` on the canvas container is what makes the canvas focusable. Without it, the `onKeyDown` React handler would never fire — the browser wouldn't know the canvas can receive keyboard events. When the user clicks the canvas, focus moves to this container, and keyboard events start flowing.

## Displaying Shortcut Hints

Shortcuts are only useful if the user can discover them. The `getToolShortcut` function (from the tool shortcuts hook) provides shortcut keys for tooltip display:

```typescript
export function getToolShortcut(tool: ToolType): string | null {
  for (const [key, value] of Object.entries(TOOL_SHORTCUTS)) {
    if (value === tool) {
      return key.toUpperCase();
    }
  }
  return null;
}
```

The Toolbar uses this to render tooltips like "Rectangle Tool (R)". The Menu Bar embeds shortcut hints directly in menu items — "Undo Ctrl+Z", "Group Ctrl+G", "Boolean Union Ctrl+Shift+U". Context menus show shortcuts too: right-clicking the canvas shows "Delete" next to "Del".

All shortcut labels are derived from the same handler logic. If a shortcut key changes, the tooltip changes automatically. This "single source of truth" pattern prevents the common bug where a menu says Ctrl+D but the actual shortcut is Ctrl+Shift+D.

## Testing Shortcuts

Shortcut tests use `fireEvent.keyDown` from React Testing Library or raw `KeyboardEvent` dispatch for window-level listeners:

```typescript
describe('useToolShortcuts', () => {
  it('switches to selection tool on V press', () => {
    renderHook(() => useToolShortcuts());

    fireEvent.keyDown(window, { key: 'v' });
    expect(useEditorStore.getState().activeTool).toBe('selection');
  });

  it('switches to rectangle tool on R press', () => {
    renderHook(() => useToolShortcuts());

    fireEvent.keyDown(window, { key: 'r' });
    expect(useEditorStore.getState().activeTool).toBe('rectangle');
  });

  it('ignores shortcuts when input is focused', () => {
    renderHook(() => useToolShortcuts());

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    fireEvent.keyDown(window, { key: 'v', target: input });
    expect(useEditorStore.getState().activeTool).not.toBe('selection');

    document.body.removeChild(input);
  });

  it('ignores shortcuts when Ctrl is held', () => {
    renderHook(() => useToolShortcuts());

    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    // Should NOT switch to selection tool — Ctrl+V is paste
    expect(useEditorStore.getState().activeTool).not.toBe('selection');
  });
});
```

Timeline shortcut tests pass mock callbacks and verify they're called:

```typescript
describe('useTimelineShortcuts', () => {
  it('toggles play on Space press', () => {
    const togglePlay = vi.fn();
    renderHook(() =>
      useTimelineShortcuts({
        togglePlay,
        goToStart: vi.fn(),
        goToEnd: vi.fn(),
        nextFrame: vi.fn(),
        prevFrame: vi.fn(),
      })
    );

    fireEvent.keyDown(window, { key: ' ' });
    expect(togglePlay).toHaveBeenCalledOnce();
  });

  it('ignores Space repeat events', () => {
    const togglePlay = vi.fn();
    renderHook(() => useTimelineShortcuts({ togglePlay /* ... */ }));

    fireEvent.keyDown(window, { key: ' ', repeat: true });
    expect(togglePlay).not.toHaveBeenCalled();
  });

  it('jumps 10 frames on Shift+comma', () => {
    useEditorStore.setState({ currentFrame: 30, isPlaying: false });
    renderHook(() =>
      useTimelineShortcuts({
        /* ... */
      })
    );

    fireEvent.keyDown(window, { key: ',', shiftKey: true });
    expect(useEditorStore.getState().currentFrame).toBe(20);
  });
});
```

The tests focus on the contract: which keys trigger which actions, and which guards prevent misfires. They don't test the downstream effects (does undo actually restore the scene graph?) — those are covered by the undo tests themselves.

## Lessons

**Split shortcuts by concern, not by implementation.** Four hooks — tools, timeline, project, canvas — each own a clear category of shortcuts. This prevents a single 500-line handler and makes it easy to find where a shortcut is defined. When a user reports "Ctrl+I imports SVG instead of boolean intersect," you know to check `useProjectShortcuts` for the former and the boolean handler for the latter.

**Always check `!event.shiftKey` when Ctrl+letter and Ctrl+Shift+letter coexist.** This is the most common keyboard shortcut bug in web applications. Ctrl+Shift+D fires a `keydown` with `ctrlKey: true`, `shiftKey: true`, and `key: 'd'`. Without the `!e.shiftKey` guard on the Ctrl+D handler, both handlers fire. The fix is one boolean check, but missing it produces baffling double-action bugs.

**Don't `preventDefault()` on Ctrl+V.** Suppressing the native `keydown` event for paste prevents the `ClipboardEvent` from firing, which means you lose access to MIME-typed clipboard data. The dual strategy — let the native paste fire, fall back to Clipboard API after a timeout — gives you external clipboard support (SVG from Figma, raster images) while still handling internal paste as a fallback.

**Use `e.code` for physical keys, `e.key` for logical keys.** Tool shortcuts use `e.key` because "v" should activate the selection tool regardless of keyboard layout. Zoom shortcuts use `e.code` because `Digit0`, `Equal`, and `Minus` represent physical key positions that don't change with Ctrl held. Mixing them up produces shortcuts that work on US keyboards but break on French or German layouts.

**Focus guards are not optional — they're the first line of defense.** Every shortcut handler checks whether the active element is an input, textarea, or select. Without this, typing in any text field triggers shortcut side effects. The check is three lines per handler, but skipping it makes the editor unusable the moment the user tries to rename a layer or type a filename.

**The `!event.repeat` guard distinguishes tap from hold.** Space needs to toggle playback on tap but activate pan mode on hold. The browser's key repeat mechanism fires `keydown` events continuously while a key is held. Checking `!event.repeat` ensures the toggle only fires once, on the initial press.

## What We Built

This chapter covered the keyboard shortcuts system — the layer of interaction that turns a mouse-driven application into a keyboard-first professional tool:

- **`useToolShortcuts`** maps single letters (V, R, O, P, T, J, F) to tool types, with modifier guards that prevent Ctrl+V from switching tools, and focus guards that prevent typing in inputs from triggering shortcuts.
- **`useTimelineShortcuts`** handles playback (Space toggle, Home/End, comma/period for frame stepping) and Shift-modified variants (Shift+O for onion skinning, Shift+R for rulers, Shift+G for guides), with an early-return Shift block that prevents Shift-held keys from falling through to unmodified handlers.
- **`useProjectShortcuts`** owns Ctrl+S/N/O/I for save, new, open, and import, with `!event.shiftKey` guards that prevent conflicts with Ctrl+Shift boolean operations.
- **The canvas handler** implements editing commands (undo, redo, cut, copy, duplicate, delete, group, z-order), zoom shortcuts using `e.code` for physical-key reliability, and the Space hold-to-pan mode with cursor management.
- **Boolean and path operations** (Ctrl+Shift+U/D/I/X/P/O/K) use a separate window-level listener that requires both Ctrl and Shift, preventing conflicts with simpler Ctrl+letter shortcuts.
- **The paste dual strategy** lets the native paste event fire for MIME-typed clipboard access (SVG from Figma, raster images), with a 300ms Clipboard API fallback for environments where the native event doesn't fire.
- **`getToolShortcut`** provides reverse lookup for tooltip display, deriving shortcut labels from the same map that drives behavior to keep hints and actions in sync.

The next chapter adds precision alignment tools — canvas rulers that display coordinates at the current zoom level, and draggable guides that snap shapes to exact positions. Drag from the ruler to create a guide, drag it back to delete it, and watch the selection tool snap to cyan lines with pixel-perfect accuracy.
