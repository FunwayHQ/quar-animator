# The Menu Bar

## Every Command in One Place

A toolbar gives the user a tool. A properties panel edits a selection. A layer panel navigates a tree. But a menu bar does everything — it is the command palette of the application, organized into cascading dropdowns. File operations, clipboard actions, z-order manipulation, boolean operations, view settings, animation controls, rigging tools, export formats, and help resources all live behind seven words at the top of the screen.

The challenge of a menu bar is not rendering — it is architecture. The component must know about nearly every action in the editor without coupling to every subsystem. It must show the right keyboard shortcut for each item. It must disable items that do not apply to the current selection. And it must close itself cleanly after each action, returning focus to the canvas.

## The Open Menu State

A menu bar has exactly one dropdown open at a time, or none. This is modeled with a single piece of state:

```typescript
type MenuId = 'file' | 'edit' | 'view' | 'animation' | 'rigging' | 'export' | 'help' | null;

const [openMenu, setOpenMenu] = useState<MenuId>(null);
```

`null` means all menus are closed. Any other value means that specific dropdown is visible. This design makes it impossible for two menus to be open simultaneously — a constraint that would be harder to enforce with per-menu boolean flags.

Two helpers manage transitions between menus:

```typescript
const toggleMenu = useCallback(
  (id: MenuId) => {
    setOpenMenu(openMenu === id ? null : id);
  },
  [openMenu]
);

const hoverMenu = useCallback(
  (id: MenuId) => {
    if (openMenu !== null && openMenu !== id) {
      setOpenMenu(id);
    }
  },
  [openMenu]
);
```

`toggleMenu` opens a menu on first click and closes it on second click — the standard toggle behavior. `hoverMenu` does something subtler: if any menu is already open, hovering over a different menu label switches to that menu immediately. This creates the familiar "sticky menu" behavior where you click to open, then slide across the menu labels to browse different menus without clicking again.

The two behaviors work together through `onClick` and `onMouseEnter`:

```tsx
const menuButton = (id: MenuId, label: string, testId?: string) => (
  <button
    className={`${styles.menuItem} ${openMenu === id ? styles.active : ''}`}
    onClick={() => toggleMenu(id)}
    onMouseEnter={() => hoverMenu(id)}
    data-testid={testId}
  >
    {label}
  </button>
);
```

## Closing the Menu

A menu must close when the user clicks outside it, presses Escape, or selects an item. The first two are handled by a `useEffect` that binds document-level listeners whenever a menu is open:

```typescript
useEffect(() => {
  if (!openMenu) return;

  const handleClick = (e: MouseEvent) => {
    if (menuBarRef.current && !menuBarRef.current.contains(e.target as HTMLElement)) {
      setOpenMenu(null);
    }
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpenMenu(null);
  };

  document.addEventListener('mousedown', handleClick);
  document.addEventListener('keydown', handleEscape);
  return () => {
    document.removeEventListener('mousedown', handleClick);
    document.removeEventListener('keydown', handleEscape);
  };
}, [openMenu]);
```

When `openMenu` is `null`, the effect returns early and adds no listeners — no wasted event handling when all menus are closed. When a menu opens, the effect binds. When the menu closes (or switches), the cleanup runs and the effect re-fires. The `menuBarRef.current.contains()` check ensures that clicks on other menu labels (which switch menus) do not also close the menu bar.

The third case — closing after selecting an item — is handled by every action handler calling `closeMenu()` as its first line:

```typescript
const closeMenu = useCallback(() => setOpenMenu(null), []);

const handleNew = useCallback(() => {
  closeMenu();
  if (!projectActions) return;
  projectActions.newProject();
}, [projectActions, closeMenu]);
```

This pattern repeats for every menu item action. Close first, act second. If the action fails, the menu is already closed — which is the right behavior. Keeping the menu open on error would look broken.

## The MenuItem Component

Every item in every dropdown is rendered by the same helper component:

```tsx
function MenuItem({
  label,
  shortcut,
  onClick,
  disabled,
  checked,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  checked?: boolean;
}) {
  return (
    <button
      className={`${styles.dropdownItem} ${disabled ? styles.dropdownItemDisabled : ''}`}
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.dropdownCheck}>
        {checked != null ? (checked ? '\u2713' : '') : ''}
      </span>
      <span className={styles.dropdownLabel}>{label}</span>
      {shortcut && <span className={styles.dropdownShortcut}>{shortcut}</span>}
    </button>
  );
}
```

The layout has three columns: a checkmark area, a label, and a shortcut hint. The checkmark column is always 16 pixels wide even when empty — this keeps labels aligned regardless of whether items are checkable. The Unicode checkmark `\u2713` appears only when `checked` is explicitly `true`. When `checked` is `undefined` (non-toggle items), the column renders empty.

Two companion components handle visual structure:

```tsx
function Separator() {
  return <div className={styles.dropdownSeparator} role="separator" />;
}

function SectionHeader({ label }: { label: string }) {
  return <div className={styles.dropdownSectionHeader}>{label}</div>;
}
```

`Separator` is a 1-pixel horizontal line. `SectionHeader` renders a tiny uppercase label (10px, disabled color, letter-spaced) — used to group related items within a long menu. The Edit menu uses section headers for "Arrange", "Boolean", "Convert", and "Symbols" to organize its 20+ items into scannable groups.

## The Store Connection

The MenuBar subscribes to a large number of store selectors. Every boolean setting that needs a checkmark, every condition that gates a `disabled` state, and every action that an item triggers must be connected:

```typescript
const canUndo = useEditorStore((state) => state.canUndo);
const canRedo = useEditorStore((state) => state.canRedo);
const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
const clipboard = useEditorStore((state) => state.clipboard);
const showRulers = useEditorStore((state) => state.showRulers);
const snapToGrid = useEditorStore((state) => state.snapToGrid);
const isPlaying = useEditorStore((state) => state.isPlaying);
const isLooping = useEditorStore((state) => state.isLooping);
const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
// ... ~40 more selectors and actions
```

This is the most store-connected component in the editor. The Properties Panel is larger, but it reads from the scene graph. The MenuBar reads from the store directly — every menu item's `disabled` and `checked` state derives from a selector.

All hooks sit at the top of the component, before any early returns. This follows the React rules of hooks and is especially important here because the component also has a `useSceneGraph()` call and several `useMemo` computations that depend on earlier hooks.

## Computed Flags

Several menu items depend on what type of nodes are selected. Rather than checking types inline in every `disabled` prop, the component computes flags upfront:

```typescript
const hasSelection = selectedNodeIds.size > 0;
const hasMultipleSelected = selectedNodeIds.size >= 2;

const hasTextSelected = useMemo(() => {
  return Array.from(selectedNodeIds).some((id) => {
    const n = sceneGraph.getNode(id);
    return n && n.type === 'text';
  });
}, [selectedNodeIds, sceneGraph]);

const hasGroupSelected = useMemo(() => {
  return Array.from(selectedNodeIds).some((id) => {
    const n = sceneGraph.getNode(id);
    return n && n.type === 'group';
  });
}, [selectedNodeIds, sceneGraph]);

const hasBooleanGroupSelected = useMemo(() => {
  return Array.from(selectedNodeIds).some((id) => {
    const n = sceneGraph.getNode(id);
    return n && n.type === 'group' && (n as { booleanOp?: string }).booleanOp;
  });
}, [selectedNodeIds, sceneGraph]);
```

These flags feed directly into menu item `disabled` props:

- "Convert to Path" is disabled unless `hasTextSelected`.
- "Ungroup" is disabled unless `hasGroupSelected`.
- "Flatten Boolean" is disabled unless `hasBooleanGroupSelected`.
- "Union", "Subtract", "Intersect", "Exclude" are disabled unless `hasMultipleSelected`.

One flag uses a different pattern. The "Bind Selection to Bones" item needs to know whether any bones exist in the scene graph, not just in the selection. Since the scene graph object is a stable ref (it does not change identity between renders), `useMemo([sceneGraph])` would never recompute:

```typescript
let hasBoneNodes = false;
sceneGraph.traverse((node: { type: string }) => {
  if (node.type === 'bone') {
    hasBoneNodes = true;
    return false; // stop early
  }
  return true;
});
```

This runs on every render, but the traversal short-circuits on the first bone found. For typical scenes with a few hundred nodes, this is fast enough. The alternative — subscribing to scene graph changes through an event — would add complexity for negligible performance gain.

## The Seven Menus

### File

The File menu handles project lifecycle: New, Open, Save, Save As, Download, Import. Each item delegates to a `projectActions` object passed as a prop — the MenuBar does not know about IndexedDB, file pickers, or download mechanics. It only knows the interface:

```typescript
export interface ProjectActions {
  newProject: () => void;
  saveProject: () => Promise<void>;
  saveProjectAs: (name: string) => Promise<void>;
  openProject: (id: string) => Promise<void>;
  downloadProject: () => void;
  importProject: () => Promise<void>;
  importSvg: () => void;
  importImage: () => void;
  // ...
}
```

"Save As" triggers an inline dialog — a small modal with a text input and Save/Cancel buttons — rather than using the browser's native file dialog. This keeps the experience consistent across platforms and avoids the need for filesystem access APIs.

### Edit

The Edit menu is the longest — over 20 items organized into six sections:

**Clipboard**: Undo, Redo, Cut, Copy, Paste, Duplicate, Delete, Select All. Each calls the corresponding store action and passes the `sceneGraph` reference where needed. Undo and Redo are disabled based on `canUndo` / `canRedo` flags. Cut, Copy, Duplicate, and Delete are disabled when nothing is selected. Paste is disabled when the clipboard is empty.

**Arrange**: Group (`Ctrl+G`), Ungroup (`Ctrl+Shift+G`). Group requires two or more selected nodes. Ungroup requires at least one selected group.

**Z-Order**: Bring Forward (`Ctrl+]`), Bring to Front (`Ctrl+Shift+]`), Send Backward (`Ctrl+[`), Send to Back (`Ctrl+Shift+[`). All require a selection.

**Boolean**: Union, Subtract, Intersect, Exclude — each requiring multiple selected shapes. Flatten Boolean and Release Boolean — each requiring a boolean group to be selected.

**Convert**: Convert to Path (`Ctrl+Shift+P`) for text nodes, Outline Stroke (`Ctrl+Shift+O`) for nodes with visible strokes.

**Symbols**: Create Symbol (`Ctrl+Shift+K`) and Detach Instance.

Every item displays its keyboard shortcut in the right column. The shortcut label is purely informational — the actual shortcut handling happens in separate hooks (`useToolShortcuts`, `useProjectShortcuts`, Canvas `onKeyDown`). The menu item and the keyboard shortcut both dispatch the same store action, but they are wired independently.

### View

The View menu controls what the user sees on the canvas. It is the first menu to use checkmark toggles:

```tsx
<MenuItem
  label="Show Rulers"
  shortcut="Shift+R"
  checked={showRulers}
  onClick={() => { closeMenu(); toggleShowRulersAction(); }}
/>
<MenuItem
  label="Snap to Grid"
  checked={snapToGrid}
  onClick={() => { closeMenu(); toggleSnapToGridAction(); }}
/>
```

When `checked={true}`, the Unicode checkmark appears in the left column. When `checked={false}`, the column is blank. This visual toggle tells the user the current state before they click.

The zoom commands — Zoom In, Zoom Out, Zoom to 100%, Fit to Window — pose an architectural problem. The camera lives on the Canvas component, not in the store. The MenuBar cannot call camera methods directly because it has no reference to the camera. The solution is custom events:

```typescript
export const VIEW_EVENTS = {
  ZOOM_IN: 'menubar:zoom-in',
  ZOOM_OUT: 'menubar:zoom-out',
  ZOOM_100: 'menubar:zoom-100',
  FIT_TO_WINDOW: 'menubar:fit-to-window',
} as const;

function dispatchViewEvent(event: string) {
  window.dispatchEvent(new CustomEvent(event));
}
```

The MenuBar dispatches a named event on `window`. The Canvas component subscribes to these events and calls the appropriate camera methods. This decouples the menu from the canvas without introducing a shared camera reference in the store.

Custom events are not the only way to solve this. You could lift camera state into the store, or use a React context, or pass callback props. Custom events were chosen because the camera is fundamentally imperative (zoom is a continuous transform, not a discrete state) and because the event pattern already exists for rigging commands (`menubar:bind-to-bones`, `menubar:create-ik-chain`).

### Animation

The Animation menu mirrors the timeline transport controls:

```tsx
<MenuItem
  label={isPlaying ? 'Pause' : 'Play'}
  shortcut="Space"
  onClick={() => {
    closeMenu();
    setIsPlayingAction(!isPlaying);
  }}
/>
```

The label itself is dynamic — "Play" when stopped, "Pause" when playing. Frame navigation items (Previous Frame, Next Frame, Jump Backward 10, Jump Forward 10, Go to Start, Go to End) are disabled during playback to prevent conflicting input.

Loop Playback and Auto-Keyframe use checkmark toggles. These are the same boolean settings available through keyboard shortcuts (L and K), presented here for discoverability.

### Rigging

The Rigging menu provides access to the bone and deformation tools that are too specialized for the main toolbar. It includes tool activation (Bone Tool, Weight Paint Tool), mesh binding (Bind Selection to Bones, Unbind Mesh), IK chain management, Smart Bone actions, Vitruvian controllers, and dynamic chains.

Many of these items use custom events to communicate with the Canvas:

```typescript
<MenuItem
  label="Bind Selection to Bones"
  disabled={!hasShapeSelected || !hasBoneNodes}
  onClick={() => {
    closeMenu();
    window.dispatchEvent(new CustomEvent('menubar:bind-to-bones'));
  }}
/>
```

The `disabled` condition checks two independent facts: that a shape is selected AND that bones exist in the scene. Both must be true for binding to make sense. This double-guard prevents confusing error states where the user tries to bind without having created a skeleton.

### Export

The Export menu lists output formats. Active formats invoke the export dialog:

```typescript
<MenuItem
  label="Export as PNG Sequence..."
  onClick={() => { closeMenu(); showExportDialog('png-sequence'); }}
/>
<MenuItem
  label="Export as Lottie JSON..."
  onClick={() => { closeMenu(); showExportDialog('lottie'); }}
/>
<MenuItem
  label="Export as Sprite Sheet..."
  onClick={() => { closeMenu(); showExportDialog('sprite-sheet'); }}
/>
```

Formats not yet implemented (GIF, MP4, WebM, SVG) are present but disabled. They serve as a roadmap visible to the user — a promise of what is coming — while the `disabled` state prevents confusion.

### Help

The Help menu opens modal dialogs for keyboard shortcuts and about information, and links to the bug tracker. The keyboard shortcuts dialog renders a two-column grid of `ShortcutRow` components:

```tsx
function ShortcutRow({ keys, label }: { keys: string; label: string }) {
  return (
    <div className={styles.shortcutRow}>
      <span className={styles.shortcutLabel}>{label}</span>
      <kbd className={styles.shortcutKbd}>{keys}</kbd>
    </div>
  );
}
```

The `<kbd>` element is semantically correct for keyboard input and receives special styling — monospace font, a subtle border, and background color that makes it look like a physical key cap.

## The Project Name Display

The right side of the menu bar shows the current project name with a dirty indicator:

```tsx
<span className={styles.projectNameDisplay} data-testid="project-name">
  {isDirty && <span className={styles.dirtyDot} data-testid="dirty-indicator" />}
  {projectName}
</span>
```

The dirty dot is a 6-pixel circle in the accent color. It appears the instant the user makes any change after saving, and disappears when they save again. This is the same convention used by VS Code, Figma, and most modern editors — a small visual cue that avoids the disruptive "unsaved changes" dialog.

## The Dropdown CSS

The dropdown panel uses absolute positioning, anchored to the top-left of its `.menuContainer` parent:

```css
.dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  min-width: 220px;
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-default);
  border-radius: 8px;
  box-shadow: var(--shadow-xl);
  padding: 4px 0;
  z-index: 100;
  animation: dropdownIn 0.12s var(--easing-default) both;
}

@keyframes dropdownIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

The 120ms entrance animation slides the dropdown 4 pixels downward while fading in. This is fast enough to feel instant but slow enough to register as intentional motion. The `both` fill mode ensures the animation starts from the `from` state and stays at the `to` state.

Disabled items receive reduced opacity and `pointer-events: none`:

```css
.dropdownItemDisabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}
```

`pointer-events: none` is stronger than `disabled` alone — it prevents hover styles from activating, which avoids the misleading appearance of an interactive element.

## Testing the Menu Bar

The MenuBar test wraps the component in a `SceneGraphProvider` because the component calls `useSceneGraph()`:

```typescript
function render(ui: ReactElement) {
  return baseRender(<SceneGraphProvider>{ui}</SceneGraphProvider>);
}
```

This is a pattern worth noting. Components that depend on context providers must have those providers present in tests. The alternative — mocking the context — would bypass the actual integration and miss bugs where the provider shape changes.

Project actions are mocked with a factory function:

```typescript
function createMockProjectActions(): ProjectActions {
  return {
    newProject: vi.fn(),
    saveProject: vi.fn().mockResolvedValue(undefined),
    saveProjectAs: vi.fn().mockResolvedValue(undefined),
    openProject: vi.fn().mockResolvedValue(undefined),
    downloadProject: vi.fn(),
    importProject: vi.fn().mockResolvedValue(undefined),
    // ...
  };
}
```

Async actions return `mockResolvedValue(undefined)` — they resolve immediately without performing any I/O. Synchronous actions are plain `vi.fn()`. This distinction matters because the component awaits some actions (`handleOpen`, `handleSaveAsConfirm`) and calling them without a resolved value would produce unhandled promise rejections in the test.

The tests verify the interaction cycle: click a menu label to open the dropdown, verify items are present, click an item, verify the action was called and the dropdown closed:

```typescript
it('calls newProject when New Project clicked', () => {
  const actions = createMockProjectActions();
  render(<MenuBar projectActions={actions} />);
  fireEvent.click(screen.getByTestId('menu-file'));
  fireEvent.click(screen.getByText('New Project'));
  expect(actions.newProject).toHaveBeenCalledOnce();
});

it('closes dropdown after clicking a menu item', () => {
  render(<MenuBar projectActions={createMockProjectActions()} />);
  fireEvent.click(screen.getByTestId('menu-file'));
  expect(screen.getByTestId('file-menu-dropdown')).toBeInTheDocument();
  fireEvent.click(screen.getByText('New Project'));
  expect(screen.queryByTestId('file-menu-dropdown')).not.toBeInTheDocument();
});
```

## Lessons

**One state variable beats seven booleans.** The `MenuId | null` type makes mutual exclusion a compile-time guarantee. With separate `fileOpen`, `editOpen`, `viewOpen` booleans, you would need runtime logic to close one when opening another — and could still end up with two open simultaneously if a handler forgets.

**Close first, act second.** Every menu item handler calls `closeMenu()` before executing the action. This ensures the dropdown disappears immediately, even if the action takes time (async save) or throws an error. The user sees the menu close and trusts that their click registered.

**Custom events bridge disconnected components.** The camera lives on the Canvas. The menu bar is a sibling component with no shared ref. Custom events on `window` let the menu bar send commands without importing Canvas internals. The same pattern works for rigging commands, where the Canvas component subscribes to `menubar:bind-to-bones` and `menubar:create-ik-chain` events.

**Disabled items are a roadmap.** The Export menu shows GIF, MP4, and WebM as disabled items. They tell the user what the application aspires to export. Without them, the user might assume the feature was never planned and look elsewhere. With them, the user sees intent — and knows to check back later.

**Shortcut labels are documentation, not implementation.** The shortcut text in each menu item (e.g., "Ctrl+Z" next to "Undo") is a string literal. It does not bind the shortcut. The actual keyboard handling happens elsewhere. This separation means changing a shortcut requires updating two places — the handler and the label — but it also means the menu bar never needs to listen for keyboard events itself, keeping its responsibility focused on visual display and click interaction.

## What We Built

This chapter covered the Menu Bar — the command hub of the editor, organized into seven dropdown menus:

- **A single `openMenu` state** of type `MenuId | null` ensures exactly one dropdown is open at a time. `toggleMenu` handles click-to-open, `hoverMenu` handles slide-to-switch, and a `useEffect` binds Escape and outside-click listeners only when a menu is open.
- **Three helper components** — `MenuItem`, `Separator`, and `SectionHeader` — build every dropdown from the same building blocks. `MenuItem` renders a three-column layout: checkmark, label, and shortcut hint.
- **Checkmark toggles** for boolean settings (Show Rulers, Snap to Grid, Loop Playback, Auto-Keyframe, Onion Skinning) use the Unicode `\u2713` in a fixed-width column. The column stays allocated even when empty, keeping labels aligned.
- **Computed flags** like `hasTextSelected`, `hasGroupSelected`, `hasBooleanGroupSelected`, and `hasShapeSelected` gate `disabled` states using `useMemo` over `selectedNodeIds` and the scene graph.
- **Custom events** (`VIEW_EVENTS`, `menubar:bind-to-bones`, `menubar:create-ik-chain`) bridge the gap between the menu bar and the Canvas component, which owns the camera and rigging logic. The menu dispatches; the canvas subscribes.
- **The Edit menu** — the longest — organizes 20+ items into six sections (Clipboard, Arrange, Z-Order, Boolean, Convert, Symbols) using `SectionHeader` labels and `Separator` dividers.
- **The project name display** with a dirty-dot indicator gives the user a persistent, non-intrusive signal of unsaved changes.
- **Dropdown CSS** uses absolute positioning, a 120ms slide-in animation, and `pointer-events: none` on disabled items to prevent misleading hover feedback.

The next chapter crosses from the UI shell into the typography engine — the Text Tool and font pipeline that turns TTF files into GPU-renderable triangles.
