# The Toolbar

## A Strip of Buttons

The Toolbar is the simplest panel in the editor — and deliberately so. It is a horizontal row of icon buttons, each representing a tool. One button is active at any time. Click a button and the editor switches tools. Press a keyboard shortcut and the same thing happens. There is no tree structure to recurse, no drag-and-drop to negotiate, no context menu to position. The Toolbar exists to answer one question: which tool is the user holding?

That simplicity makes it a good place to study how a data-driven UI component connects to a shared store. The entire component is under 250 lines, yet it demonstrates the pattern that every panel in the editor follows: read state from the store, render based on that state, and dispatch actions back to the store when the user interacts.

## The ToolType Union

Every tool in the editor is identified by a string literal. The `ToolType` union in the shared `@quar/types` package enumerates them all:

```typescript
export type ToolType =
  | 'selection'
  | 'direct-selection'
  | 'hand'
  | 'rectangle'
  | 'ellipse'
  | 'polygon'
  | 'star'
  | 'pen'
  | 'brush'
  | 'eraser'
  | 'text'
  | 'bone'
  | 'weight-paint'
  | 'point-magnet'
  | 'camera'
  | 'artboard';
```

Not all of these appear in the Toolbar. `weight-paint` and `point-magnet` are activated programmatically by the rigging system, not by user click. `camera` is internal. The Toolbar shows the 13 tools that the user can directly select.

## The Tools Array

Rather than scattering tool metadata across the component, the Toolbar defines a single `tools` array — a data structure that drives the entire UI:

```typescript
const tools: Array<{
  type: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
}> = [
  { type: 'selection', icon: icons.selection, label: 'Selection', shortcut: 'V' },
  {
    type: 'direct-selection',
    icon: icons['direct-selection'],
    label: 'Direct Selection',
    shortcut: 'A',
  },
  { type: 'hand', icon: icons.hand, label: 'Hand', shortcut: 'H' },
  { type: 'rectangle', icon: icons.rectangle, label: 'Rectangle', shortcut: 'R' },
  { type: 'ellipse', icon: icons.ellipse, label: 'Ellipse', shortcut: 'O' },
  { type: 'polygon', icon: icons.polygon, label: 'Polygon', shortcut: 'U' },
  { type: 'star', icon: icons.star, label: 'Star', shortcut: 'S' },
  { type: 'pen', icon: icons.pen, label: 'Pen', shortcut: 'P' },
  { type: 'brush', icon: icons.brush, label: 'Brush', shortcut: 'B' },
  { type: 'eraser', icon: icons.eraser, label: 'Eraser', shortcut: 'E' },
  { type: 'text', icon: icons.text, label: 'Text', shortcut: 'T' },
  { type: 'artboard', icon: icons.artboard, label: 'Artboard', shortcut: 'F' },
  { type: 'bone', icon: icons.bone, label: 'Bone', shortcut: 'J' },
];
```

This is a pattern worth adopting early. When the UI is driven by data rather than hardcoded JSX, adding a new tool means adding one object to the array. The rendering logic, event handlers, and accessibility attributes all derive from the same source of truth.

## Inline SVG Icons

Each tool needs a visual icon. The Toolbar uses inline SVG elements defined in a local `icons` object:

```tsx
const icons = {
  selection: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    </svg>
  ),
  rectangle: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  // ... 11 more icons
};
```

Why inline SVG instead of an icon library? Three reasons:

1. **No external dependency.** The icons are part of the component. No import resolution, no tree-shaking surprises, no version conflicts.
2. **`currentColor` inheritance.** The `stroke="currentColor"` attribute means each icon inherits its color from CSS. When a button becomes active, the CSS changes the text color and the icon follows automatically.
3. **Pixel-perfect sizing.** The `viewBox="0 0 24 24"` with `width="20"` gives precise control. The CSS further constrains the SVG to 18x18 pixels and adjusts `stroke-width` for active buttons.

The trade-off is verbosity — each icon is 5-10 lines of JSX. For 13 icons this is manageable. A larger application might extract them into a shared icon module or use an icon font, but for a toolbar this size, inline SVG keeps everything in one file with zero indirection.

## The ToolButton Component

Each button in the toolbar is rendered by a small presentational component:

```tsx
interface ToolButtonProps {
  tool: ToolType;
  icon: React.ReactNode;
  label: string;
  shortcut: string;
  active: boolean;
  onClick: () => void;
}

function ToolButton({ tool, icon, label, shortcut, active, onClick }: ToolButtonProps) {
  return (
    <button
      className={`${styles.toolButton} ${active ? styles.active : ''}`}
      onClick={onClick}
      title={`${label} (${shortcut})`}
      aria-pressed={active}
      data-tool={tool}
    >
      {icon}
    </button>
  );
}
```

Several details matter here:

**`aria-pressed`** communicates the toggle state to screen readers. A toolbar button is not a checkbox — it is a toggle in a mutually exclusive group. `aria-pressed="true"` tells assistive technology that this button is the currently active one.

**`title`** provides the native browser tooltip: "Selection (V)", "Rectangle (R)", and so on. The shortcut letter in parentheses teaches the user keyboard shortcuts through discovery. Every time they hover over a tool, they see the key.

**`data-tool`** is a testing hook. The test suite queries `[data-tool="rectangle"]` rather than relying on icon structure or tooltip text, which makes tests resilient to visual changes.

**`className` concatenation** is the simplest possible active-state styling. No CSS-in-JS library, no `classnames` utility — just a ternary that appends the `.active` class when the tool matches.

## Store Connection

The Toolbar component itself is minimal:

```tsx
export function Toolbar() {
  const activeTool = useActiveTool();
  const setActiveTool = useSetActiveTool();

  return (
    <aside className={styles.toolbar}>
      <div className={styles.toolGroup}>
        {tools.map((tool) => (
          <ToolButton
            key={tool.type}
            tool={tool.type}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.type}
            onClick={() => setActiveTool(tool.type)}
          />
        ))}
      </div>
    </aside>
  );
}
```

Two selector hooks handle the entire store interaction:

```typescript
export const useActiveTool = (): ToolType => useEditorStore((state) => state.activeTool);

export const useSetActiveTool = (): ((tool: ToolType) => void) =>
  useEditorStore((state) => state.setActiveTool);
```

When any tool button is clicked, `setActiveTool` updates the store. Zustand notifies all subscribers. The Toolbar re-renders because `useActiveTool` returns a new value. The `active` prop changes on two buttons — the previously active one loses its highlight, and the newly active one gains it. React's reconciliation updates only the two affected button elements.

This is the same reactive loop that drives the Layer Panel, the Properties Panel, and every other panel in the editor. The store is the single source of truth. The UI is a projection of that truth.

## The Active State CSS

The visual distinction between active and inactive buttons carries more weight than you might expect. A user glances at the toolbar to confirm which tool they are holding before they click the canvas. The active state must be instantly recognizable.

The inactive state uses muted tertiary text color:

```css
.toolButton {
  width: 32px;
  height: 32px;
  color: var(--color-text-tertiary);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--easing-default);
}
```

The active state switches to a gradient background using the application's accent color (violet), inverts the icon to dark, and adds a glow shadow:

```css
.toolButton.active {
  background: linear-gradient(
    135deg,
    var(--color-accent-primary) 0%,
    var(--color-accent-primary-active) 100%
  );
  color: var(--color-bg-primary);
  box-shadow:
    0 2px 8px var(--color-accent-primary-glow),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}
```

A small dot indicator at the bottom of the active button provides a secondary visual cue:

```css
.toolButton.active::after {
  content: '';
  position: absolute;
  bottom: 3px;
  left: 50%;
  transform: translateX(-50%);
  width: 4px;
  height: 4px;
  background: var(--color-bg-primary);
  border-radius: var(--radius-full);
  opacity: 0.6;
}
```

The hover state lifts the button by 1 pixel and adds a subtle glass gradient overlay. The press state (`button:active`) scales down to 95%. These micro-interactions give the toolbar a tactile feel — buttons respond to the cursor even before the click completes.

## Keyboard Shortcuts

The Toolbar shows shortcut hints in tooltips, but the actual keyboard handling lives in a separate hook — `useToolShortcuts`:

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

export function useToolShortcuts() {
  const setActiveTool = useEditorStore((state) => state.setActiveTool);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (target?.tagName) {
        const tagName = target.tagName.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || target.isContentEditable) return;
      }

      const tool = TOOL_SHORTCUTS[event.key.toLowerCase()];
      if (tool) {
        event.preventDefault();
        setActiveTool(tool);
      }
    },
    [setActiveTool]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
```

The hook binds to `window` so shortcuts work regardless of which element has focus — as long as the focus is not inside a text input. Three guard clauses protect against conflicts:

1. **Modifier keys.** Any Ctrl, Alt, Meta, or Shift combination is ignored. This prevents `Ctrl+V` (paste) from switching to the Selection tool or `Shift+R` (rulers toggle) from activating the Rectangle tool.
2. **Text inputs.** When the user is typing in a rename field, a numeric input, or a text editor, single-key shortcuts are suppressed.
3. **Content-editable elements.** Rich text areas also get the exemption.

Notice that the shortcut map does not include every tool. Brush (B), Eraser (E), Hand (H), Polygon (U), Star (S), and Direct Selection (A) are shown as hints in the Toolbar tooltips but are not in the `TOOL_SHORTCUTS` object. These tools can still be activated by clicking their buttons. The shortcut map was built incrementally as tools were added, and not every tool received a keyboard binding in the hook. The Toolbar tooltips advertise the intended shortcuts — a reminder that the map could be extended to cover the full set.

## Separators and Tool Groups

The CSS supports visual separators between tool groups:

```css
.toolGroup + .toolGroup {
  border-left: 1px solid var(--color-border-subtle);
  margin-left: var(--space-xs);
  padding-left: var(--space-sm);
}

.separator {
  width: 1px;
  height: 20px;
  background: linear-gradient(180deg, transparent, var(--color-border-default), transparent);
  margin: 0 var(--space-sm);
}
```

The adjacent-sibling combinator `+` automatically adds a left border when two `.toolGroup` divs sit side by side. This means you can split the tools into logical groups — selection tools, shape tools, drawing tools, utility tools — by wrapping them in separate `<div className={styles.toolGroup}>` containers. The separator appears automatically without any explicit separator element.

The current implementation uses a single `toolGroup` for all tools. If you wanted to visually separate selection tools from drawing tools from shape tools, you would split the `tools.map()` into multiple groups. The CSS is already prepared for it.

## The ToolManager Connection

The Toolbar dispatches `setActiveTool` to the store, but the store alone does not make tools work. The actual tool behavior lives in the `ToolManager` class in `packages/core`, which creates concrete tool instances:

```typescript
constructor(context: ToolContext) {
  this.tools.set('selection', new SelectionTool(context));
  this.tools.set('direct-selection', new DirectSelectionTool(context));
  this.tools.set('rectangle', new RectangleTool(context));
  this.tools.set('ellipse', new EllipseTool(context));
  this.tools.set('polygon', new PolygonTool(context));

  const starTool = new PolygonTool(context);
  starTool.setStarMode(true);
  this.tools.set('star', starTool);

  this.tools.set('hand', new HandTool(context));
  this.tools.set('pen', new PenTool(context));
  this.tools.set('brush', new BrushTool(context));
  this.tools.set('eraser', new EraserTool(context));
  this.tools.set('text', new TextTool(context));
  this.tools.set('bone', new BoneTool(context));
  this.tools.set('artboard', new ArtboardTool(context));
}
```

The `useCanvasTools` hook in the web layer subscribes to `activeTool` changes in the store and calls `toolManager.setActiveTool()` to switch the active tool class. This creates a clean separation: the Toolbar knows about tool names and icons. The ToolManager knows about tool behavior. The store sits between them as the shared state.

Notice how the star tool is a PolygonTool with star mode enabled rather than a separate class. The Toolbar treats it as a distinct tool with its own button and shortcut, but the implementation reuses the polygon drawing logic. This is a common pattern — the UI can present more granular options than the underlying implementation needs to support.

## Testing the Toolbar

The test file for the Toolbar is concise because the component is simple:

```typescript
it('renders all tool buttons', () => {
  render(<Toolbar />);
  const toolLabels = [
    'Selection (V)', 'Direct Selection (A)', 'Rectangle (R)',
    'Ellipse (O)', 'Pen (P)', 'Brush (B)', 'Eraser (E)',
    'Text (T)', 'Bone (J)', 'Artboard (F)',
  ];
  toolLabels.forEach((label) => {
    expect(screen.getByTitle(label)).toBeInTheDocument();
  });
});

it('has selection tool active by default', () => {
  render(<Toolbar />);
  const selectionButton = screen.getByTitle('Selection (V)');
  expect(selectionButton).toHaveAttribute('aria-pressed', 'true');
});

it('changes active tool when clicked', async () => {
  const user = userEvent.setup();
  render(<Toolbar />);

  const rectangleButton = screen.getByTitle('Rectangle (R)');
  await user.click(rectangleButton);

  expect(screen.getByTitle('Selection (V)')).toHaveAttribute('aria-pressed', 'false');
  expect(rectangleButton).toHaveAttribute('aria-pressed', 'true');
});
```

The tests verify three things: all buttons render, the default tool is selection, and clicking changes the active state. They query by `title` attribute — the same attribute that provides tooltips to users. This means if a tooltip is wrong, the test fails, which catches accessibility regressions alongside functional ones.

The `data-tool` attribute test verifies the testing hook:

```typescript
it('has correct data-tool attributes', () => {
  render(<Toolbar />);
  const tools = ['selection', 'direct-selection', 'rectangle', 'ellipse', ...];
  tools.forEach((tool) => {
    expect(document.querySelector(`[data-tool="${tool}"]`)).toBeInTheDocument();
  });
});
```

This attribute is useful for integration tests that need to interact with specific tools without relying on visual text or icon structure.

## Lessons

**Data-driven rendering scales.** The `tools` array makes adding new tools a one-line change. The JSX, event handlers, accessibility attributes, and styling all derive from the same array. When the Bone tool was added in Sprint 13 and the Artboard tool in Sprint 15, each required only a new SVG icon and a new entry in the array.

**Separate intent from behavior.** The Toolbar dispatches tool names to the store. The ToolManager maps tool names to class instances. Neither knows about the other. This separation means you can test the Toolbar without instantiating WebGL contexts and test the ToolManager without rendering React components.

**Tooltip shortcuts teach by proximity.** Showing "Rectangle (R)" in the tooltip means the user learns the shortcut the first time they hover. This is cheaper and more discoverable than a keyboard shortcuts dialog. Both should exist, but the tooltip is the one users actually see.

**`aria-pressed` over `aria-selected`.** Toolbar buttons in a mutually exclusive group should use `aria-pressed` to communicate toggle state. `aria-selected` is for items in a listbox or grid. The distinction matters for screen reader announcements — "pressed" versus "selected" carries different semantic meaning.

**Inline SVG with `currentColor` is low-cost theming.** The icon color follows the button's text color through CSS inheritance. Active buttons become dark-on-violet. Inactive buttons become muted gray. No prop drilling, no theme context, no conditional color logic. The cascade does the work.

## What We Built

This chapter covered the Toolbar — the simplest panel in the editor, and a template for the data-driven component pattern:

- **A `tools` array** defines every button's type, icon, label, and shortcut in one place. The rendering loop iterates this array, producing one `ToolButton` per entry.
- **Inline SVG icons** use `stroke="currentColor"` to inherit their color from CSS. Active buttons flip from muted gray to dark-on-accent without any icon-specific color logic.
- **Two selector hooks** — `useActiveTool` and `useSetActiveTool` — connect the Toolbar to the Zustand store. Clicking a button dispatches `setActiveTool`. The store notifies subscribers. The Toolbar re-renders with the new active state.
- **`aria-pressed` and `title` attributes** provide accessibility and discoverability. The tooltip text doubles as the query selector for tests.
- **CSS active state** uses a violet gradient, glow shadow, and dot indicator to make the current tool instantly recognizable. Hover lifts by 1 pixel; press scales to 95%.
- **`useToolShortcuts`** handles global keyboard shortcuts with guard clauses for modifier keys, text inputs, and content-editable elements.
- **The ToolManager** on the core side maps tool type strings to class instances, keeping the UI layer ignorant of tool implementation details. The star tool reuses the PolygonTool class with star mode enabled.

The next chapter builds the Menu Bar — the horizontal strip of dropdown menus that gives the user access to every command in the editor, from file operations to boolean operations, organized into cascading menus with keyboard shortcut labels and checkmark toggles.
