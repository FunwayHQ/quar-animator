# Design System & Editor Shell

## Building the Chrome Before the Canvas

Here's a counterintuitive decision we made on the second day of development: before writing a single line of rendering code, before touching WebGL, before even thinking about how shapes would appear on a canvas, we built the entire editor UI shell. Menu bar, toolbar, panels — all of them, empty but structurally complete.

Why? Because the shell defines the data contract. When you lay out a Properties Panel, you have to decide what properties exist. When you build a Layer Panel, you define what a "layer" means in your system. When you wire up a Toolbar, you commit to a tool-switching protocol. These decisions — made visible through UI components — force architectural clarity before complexity arrives.

This chapter covers the design token system, the core UI components, and the editor layout architecture. By the end, you'll have a dark-themed editor shell that looks professional and is ready to host a canvas.

## Design Tokens: CSS Custom Properties

Every creative application needs a consistent visual language. Colors, spacing, typography, shadows, animation timing — these values appear hundreds of times across your codebase. If each component invents its own shade of dark gray, you'll spend weeks chasing visual inconsistencies instead of building features.

We use CSS custom properties (also called CSS variables) as our design token system. They're defined once in a `:root` block and referenced everywhere else. No build step, no JavaScript runtime, no CSS-in-JS library.

### The Color System

A dark-mode-first editor needs a carefully layered background palette. We use warm charcoal blacks — not pure `#000000`, which feels sterile, but tinted near-blacks that give the interface depth:

```css
:root {
  /* Background layers (warm charcoal blacks) */
  --color-bg-primary: #0a0a0b;
  --color-bg-secondary: #111113;
  --color-bg-tertiary: #18181b;
  --color-bg-elevated: #1f1f23;
  --color-bg-hover: rgba(255, 255, 255, 0.04);
  --color-bg-active: rgba(255, 255, 255, 0.08);
  --color-bg-canvas: #09090a;
}
```

Each layer is slightly lighter than the previous one. `--color-bg-primary` is the outermost background (the body). `--color-bg-secondary` is for panel backgrounds. `--color-bg-tertiary` is for input fields and panel headers. `--color-bg-elevated` is for elements that float above the surface — tooltips, dropdown menus. The canvas itself gets the darkest shade, `--color-bg-canvas`, creating a natural inset effect.

The hover and active states use semi-transparent white overlays (`rgba(255, 255, 255, 0.04)` and `0.08`) instead of specific hex colors. This means they work on top of any background — a hover effect on a secondary panel looks correct without a separate `--color-bg-secondary-hover` token.

Text follows a similar hierarchy:

```css
:root {
  /* Text (warmer whites) */
  --color-text-primary: #fafaf9;
  --color-text-secondary: #a1a1aa;
  --color-text-tertiary: #71717a;
  --color-text-disabled: #3f3f46;
}
```

Primary text is warm off-white for labels and values. Secondary text is for less prominent elements — panel titles, helper text. Tertiary is for subtle UI elements like chevron icons. Disabled text is barely visible against the background, communicating non-interactivity.

Borders are semi-transparent rather than opaque:

```css
:root {
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.12);
  --color-border-focus: #e89b47;
}
```

Transparent borders adapt to whatever background they're placed on. `--color-border-subtle` for panel dividers, `--color-border-default` for input outlines, `--color-border-strong` for active states. The focus border is a warm amber — distinct enough to spot at a glance without clashing with the accent color.

The accent palette gives the editor its identity:

```css
:root {
  /* Accent (violet / bordeaux creative energy) */
  --color-accent-primary: #a855f7;
  --color-accent-primary-hover: #c084fc;
  --color-accent-primary-active: #9333ea;
  --color-accent-primary-glow: rgba(168, 85, 247, 0.3);
  --color-accent-secondary: #9f1239;
}
```

Violet for primary actions, selection highlights, and active tool states. Bordeaux as a secondary accent. The glow variant is used for subtle ambient effects — selected elements, focused inputs.

### Spacing, Typography, and Radius

Spacing uses a linear scale rather than a geometric one. In dense editor UIs, you need fine-grained control — the difference between 4px and 8px matters more than the difference between 32px and 48px:

```css
:root {
  --space-xs: 4px; /* Inside tight elements */
  --space-sm: 8px; /* Between related items */
  --space-md: 12px; /* Standard padding */
  --space-lg: 16px; /* Section spacing */
  --space-xl: 24px; /* Major sections */
  --space-2xl: 32px;
  --space-3xl: 48px;
}
```

Typography uses two font families. DM Sans for UI text — it's geometric and clean, designed for screens. IBM Plex Mono for numerical values in the properties panel, where fixed-width digits prevent layout shifts as values change:

```css
:root {
  --font-family-ui: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-family-mono: 'IBM Plex Mono', 'SF Mono', 'Consolas', monospace;
}
```

Font sizes in creative tools run smaller than typical web applications. Screen space is precious — a 13px base size lets you pack more information into panels without feeling cramped:

```css
:root {
  --font-size-2xs: 9px; /* Ruler tick labels */
  --font-size-xs: 10px; /* Shortcut badges */
  --font-size-sm: 11px; /* Panel headers, labels */
  --font-size-md: 13px; /* Body text, input values */
  --font-size-lg: 15px; /* Dialog titles */
  --font-size-xl: 18px;
  --font-size-2xl: 24px;
}
```

Border radii are deliberately sharp. This is a professional tool, not a consumer app:

```css
:root {
  --radius-xs: 3px;
  --radius-sm: 5px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-full: 9999px; /* Pills, circular buttons */
}
```

### Animation Tokens

CSS transitions in an editor need to feel instant but not jarring:

```css
:root {
  --duration-instant: 50ms;
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --duration-slow: 350ms;
  --easing-default: cubic-bezier(0.2, 0, 0, 1);
  --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

`--duration-fast` with `--easing-default` is the workhorse combination — fast enough to feel responsive, smooth enough to not flicker. Hover states, focus rings, panel collapses all use this pair.

### Z-Index Scale

Overlapping UI elements are inevitable in an editor. A defined z-index scale prevents the common problem of escalating `z-index: 9999` wars:

```css
:root {
  --z-overlay: 1000;
  --z-context-menu: 1010;
  --z-popover: 1020;
  --z-modal: 1030;
  --z-color-picker: 1040;
  --z-tooltip: 1050;
}
```

Each layer is 10 apart, leaving room for intermediate values. The ordering is deliberate: tooltips appear above everything (you need to read them), modals appear above popovers, and context menus appear above selection overlays.

### Glass Effect and Noise Texture

Two visual treatments give the interface a polished feel. The glass effect uses `backdrop-filter` to blur content behind semi-transparent panels:

```css
.glass-panel {
  background: var(--color-glass); /* rgba(17, 17, 19, 0.85) */
  backdrop-filter: blur(12px) saturate(150%);
  border: 1px solid var(--color-glass-border);
  box-shadow: var(--shadow-inset);
}
```

A noise texture overlay adds subtle grain across the entire interface, breaking up flat color fields. It's implemented as a fixed SVG pattern on `body::before` at extremely low opacity:

```css
body::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 10000;
  opacity: 0.015; /* Barely visible */
  background-image: url('data:image/svg+xml,...');
}
```

These are polish details. They don't affect functionality, but they make the difference between "student project" and "professional tool."

## Core UI Components

With tokens defined, we build the component library. These are generic, reusable components that live in the `@quar/ui` package — they know nothing about the editor or scene graphs. They just know how to render buttons, inputs, and panels.

### Why Inline CSSProperties Instead of CSS Modules?

We made a deliberate choice to use React's inline `CSSProperties` objects for our UI components rather than CSS modules or a CSS-in-JS library. This deserves explanation, because it's not what most React tutorials recommend.

In an editor component library, styles are tightly coupled to component logic. A button's hover state depends on its variant, its disabled state, and whether it's actively pressed. These are combinatorial — a danger variant with loading state and an icon needs different styles than a ghost variant without an icon. CSS class composition (`className={cx(styles.button, styles.danger, styles.loading, styles.withIcon)}`) gets unwieldy fast.

Inline styles express this naturally:

```typescript
const computedStyles: React.CSSProperties = {
  ...baseStyles,
  ...variantStyles[variant],
  ...(iconOnly ? iconOnlySizeStyles[size] : sizeStyles[size]),
  ...(fullWidth && { width: '100%' }),
  ...(disabled && disabledStyles),
  ...(isHovered && !disabled && getHoverStyles(variant)),
  ...style, // Allow consumer overrides
};
```

Each spread is conditional. The object merge is readable and debuggable. The `style` prop at the end lets consumers override anything without fighting specificity.

The tradeoff: no pseudo-elements (`:before`, `:after`), no media queries, and no hover selectors in inline styles. We handle hover with `useState`:

```typescript
const [isHovered, setIsHovered] = React.useState(false);

<button
  onMouseEnter={() => setIsHovered(true)}
  onMouseLeave={() => setIsHovered(false)}
  style={computedStyles}
>
```

This works well for a component library where every component manages its own state. It would not scale for page-level layout — that's where we use CSS modules (for the editor shell layout, as you'll see later).

### Button

The Button component demonstrates the pattern used across all components: type-safe variants, size scale, composable features, and `forwardRef` for imperative access:

```typescript
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  iconOnly?: boolean;
  fullWidth?: boolean;
}
```

Four variants cover every context: `primary` (violet accent, for main actions), `secondary` (subtle background, the default), `ghost` (transparent, for toolbar-style buttons), `danger` (red, for destructive actions like delete).

The variant system is a lookup table:

```typescript
const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--color-accent-primary)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-accent-primary)',
  },
  secondary: {
    backgroundColor: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: 'var(--color-accent-error)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-accent-error)',
  },
};
```

Each size maps to specific dimensions. The `iconOnly` variant overrides padding to make a perfect square:

```typescript
const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { height: '28px', padding: '0 12px', fontSize: 'var(--font-size-sm)' },
  md: { height: '36px', padding: '0 16px', fontSize: 'var(--font-size-md)' },
  lg: { height: '44px', padding: '0 24px', fontSize: 'var(--font-size-lg)' },
};

const iconOnlySizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: { width: '28px', height: '28px', padding: 0 },
  md: { width: '36px', height: '36px', padding: 0 },
  lg: { width: '44px', height: '44px', padding: 0 },
};
```

The `loading` prop replaces children with a spinner SVG. This is better than adding a spinner next to the text, because it prevents the button from changing width during async operations. The spinner is a simple animated SVG circle with a `strokeDasharray` that creates the rotating arc effect:

```typescript
{loading ? (
  <LoadingSpinner size={size} />
) : (
  <>
    {iconLeft && <span style={{ display: 'flex' }}>{iconLeft}</span>}
    {!iconOnly && children}
    {iconRight && <span style={{ display: 'flex' }}>{iconRight}</span>}
  </>
)}
```

Note the `display: 'flex'` wrapper around icons. Without it, the icon's inline rendering doesn't vertically center with the text. This is one of those tiny details that took three attempts to get right.

### Input

The Input component wraps the native `<input>` with labels, validation, and icon support:

```typescript
export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: InputSize;
  label?: string;
  helperText?: string;
  error?: boolean;
  errorMessage?: string;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}
```

Notice the `Omit<..., 'size'>`. The native `<input>` has a `size` attribute (number of visible characters), which conflicts with our `InputSize` union type. Omitting it prevents TypeScript from complaining about the type mismatch.

The focus border changes color to `--color-border-focus` (amber), distinct from the default border. Error state overrides this with `--color-accent-error` (red). This three-state border — default, focused, error — is enough for editor inputs where validation is immediate:

```typescript
const computedInputStyles: React.CSSProperties = {
  ...baseInputStyles,
  ...sizeStyles[size],
  ...(error && { borderColor: 'var(--color-accent-error)' }),
  ...(isFocused && !error && { borderColor: 'var(--color-border-focus)' }),
  ...(disabled && { opacity: 0.5, cursor: 'not-allowed' }),
};
```

Icon positioning uses absolute positioning with computed padding. When an icon is present, the input's padding increases to prevent text from overlapping the icon:

```typescript
const iconPadding = size === 'sm' ? 8 : size === 'md' ? 12 : 16;

...(iconLeft && { paddingLeft: `${iconPadding * 2 + iconSize}px` }),
...(iconRight && { paddingRight: `${iconPadding * 2 + iconSize}px` }),
```

The `pointerEvents: 'none'` on icon wrappers ensures clicks pass through to the input underneath.

### IconButton

Toolbars in graphic editors are full of icon-only buttons. The IconButton is purpose-built for this:

```typescript
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  size?: IconButtonSize;
  variant?: IconButtonVariant;
  active?: boolean;
  tooltip?: string;
}
```

The `active` prop is the key feature. In a toolbar, exactly one tool is selected at a time. The active tool gets a violet background (`--color-accent-primary`), making it visually prominent. Inactive tools show their icons in secondary text color and highlight on hover:

```typescript
const activeStyles: React.CSSProperties = {
  backgroundColor: 'var(--color-accent-primary)',
  color: 'var(--color-text-primary)',
};

// Hover only applies when not active (active already has full highlight)
...(isHovered && !disabled && !active && hoverStyles[variant]),
```

### Panel

The Panel component is the most structurally important component in the editor. Properties Panel, Layer Panel, Symbol Library — they're all Panels with different content:

```typescript
export interface PanelProps {
  title: string;
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  collapsible?: boolean;
  headerActions?: ReactNode;
}
```

It supports both controlled and uncontrolled expansion state. This dual-mode pattern is common in form components, but it's equally useful here — some panels manage their own collapse state, while others are controlled by parent components (like a "collapse all" button):

```typescript
const [internalExpanded, setInternalExpanded] = React.useState(defaultExpanded);

const isControlled = controlledExpanded !== undefined;
const isExpanded = isControlled ? controlledExpanded : internalExpanded;

const handleToggle = () => {
  if (!collapsible) return;
  const newExpanded = !isExpanded;
  if (!isControlled) {
    setInternalExpanded(newExpanded);
  }
  onExpandedChange?.(newExpanded);
};
```

The `headerActions` slot is critical. It lets you put action buttons in the panel header without them triggering collapse when clicked. This is achieved with `stopPropagation`:

```typescript
{headerActions && (
  <div
    style={headerActionsStyles}
    onClick={(e) => e.stopPropagation()}
  >
    {headerActions}
  </div>
)}
```

Content is conditionally rendered — when collapsed, the children don't exist in the DOM. This matters for performance when you have panels with hundreds of layer items or dozens of property inputs.

### Tooltip

Every toolbar button needs a tooltip. Ours supports a keyboard shortcut badge — a monospace-font indicator that tells users the hotkey for each tool:

```typescript
export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  position?: TooltipPosition;
  shortcut?: string;
  delay?: number;
  disabled?: boolean;
}
```

Positioning uses `getBoundingClientRect` on the trigger element and `position: fixed` on the tooltip. The `getTransform` function handles centering:

```typescript
const getTransform = (): string => {
  switch (position) {
    case 'top':
      return 'translate(-50%, -100%)';
    case 'bottom':
      return 'translate(-50%, 0)';
    case 'left':
      return 'translate(-100%, -50%)';
    case 'right':
      return 'translate(0, -50%)';
  }
};
```

The `translate(-50%, -100%)` for top position centers the tooltip horizontally and positions it above the trigger. The 8px offset prevents the tooltip from touching the trigger element.

The shortcut badge is styled with monospace font and a subtle background:

```typescript
{shortcut && <span style={shortcutStyles}>{shortcut}</span>}
```

This renders as something like `Selection Tool [V]` — the tool name in regular text and the shortcut key in a pill-shaped badge.

A 300ms delay prevents tooltips from flickering during rapid mouse movement across toolbar buttons. The delay is cleared on mouse leave, so moving between buttons feels responsive without visual noise.

## Editor Layout Architecture

With the component library built, we compose the editor shell. This is where CSS modules shine — the layout is structural, not variant-based, and it benefits from real CSS features like `flex`, `::before`/`::after` pseudo-elements, and `overflow: hidden`.

### The Layout Structure

The editor uses a nested flex layout:

```
┌─────────────────────────────────────────────────┐
│ MenuBar (full width)                            │
├─────────────────────────────────────────────────┤
│ Toolbar (full width)                            │
├─────────────────────────────────────────────────┤
│ PageTabs (full width)                           │
├────────┬─────────────────────────┬──────────────┤
│        │                         │              │
│ Layers │       Canvas            │  Properties  │
│ 220px  │       (flex: 1)         │  260px       │
│        │                         │              │
│ Symbols│                         │              │
│        │                         │              │
└────────┴─────────────────────────┴──────────────┘
```

In code, this is a four-level nesting of flex containers:

```tsx
<div className={styles.editor}>
  {/* column: full viewport */}
  <MenuBar />
  <Toolbar />
  <PageTabs />
  <div className={styles.main}>
    {/* column: flex: 1 */}
    <div className={styles.workspace}>
      {/* row: flex: 1 */}
      <div className={styles.leftPanel}>
        <LayerPanel />
        <SymbolLibraryPanel />
      </div>
      <div className={styles.canvasArea}>
        <Canvas />
      </div>
      <div className={styles.rightPanel}>
        <PropertiesPanel />
      </div>
    </div>
  </div>
</div>
```

The CSS is straightforward flexbox:

```css
.editor {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.main {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.workspace {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.canvasArea {
  flex: 1;
  display: flex;
  overflow: hidden;
  position: relative;
}
```

### Fixed vs. Flexible Panels

The left panel (220px) and right panel (260px) have fixed widths with min/max constraints. The canvas takes all remaining space via `flex: 1`. This means resizing the browser window only affects the canvas — the panels maintain their width, which is what users expect from a creative tool:

```css
.leftPanel {
  display: flex;
  flex-direction: column;
  width: 220px;
  min-width: 180px;
  max-width: 320px;
  border-right: 1px solid var(--color-border-subtle);
  background: linear-gradient(90deg, var(--color-bg-secondary) 0%, rgba(17, 17, 19, 0.98) 100%);
}

.rightPanel {
  display: flex;
  flex-direction: column;
  width: 260px;
  min-width: 200px;
  max-width: 360px;
  border-left: 1px solid var(--color-border-subtle);
  background: linear-gradient(270deg, var(--color-bg-secondary) 0%, rgba(17, 17, 19, 0.98) 100%);
}
```

The gradient backgrounds are a polish detail — they create a subtle directional lighting effect, making panels feel slightly three-dimensional. The gradient goes from the panel's background color to a very slightly different shade, creating depth without being distracting.

### The Canvas Area

The canvas area gets special treatment with two pseudo-elements:

```css
.canvasArea::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  box-shadow:
    inset 0 1px 0 var(--color-border-subtle),
    inset 1px 0 0 var(--color-border-subtle),
    inset -1px 0 0 var(--color-border-subtle);
}

.canvasArea::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0, 0, 0, 0.15) 100%);
}
```

The `::before` adds subtle inset borders that visually separate the canvas from adjacent panels. The `::after` adds a radial vignette — a darkening around the edges of the canvas area. These are barely visible, but they guide the eye toward the center of the canvas where the user's artwork lives.

Both use `pointer-events: none` so they don't interfere with canvas interactions.

### The `overflow: hidden` Chain

Notice that `overflow: hidden` appears on the editor, main, workspace, and canvas area. This is deliberate. In a full-viewport application, any element that can scroll will eventually scroll at the wrong time — a stray wheel event on a panel shouldn't scroll the page. The `overflow: hidden` chain ensures that the only scrollable areas are ones we explicitly make scrollable (like the layer list inside the Layer Panel).

### The SceneGraphProvider

The entire editor is wrapped in a `SceneGraphProvider`:

```tsx
export function Editor() {
  return (
    <SceneGraphProvider>
      <EditorInner />
    </SceneGraphProvider>
  );
}
```

This React context provides the scene graph instance to all child components. We separate `Editor` (the provider wrapper) from `EditorInner` (the actual layout) because hooks inside `EditorInner` need access to the context — you can't consume a context in the same component that provides it.

The inner component initializes several hooks that wire up the application:

```typescript
function EditorInner() {
  const sceneGraph = useSceneGraph();
  useEffect(() => {
    const markDirty = () => useEditorStore.getState().markDirty();
    const unsubs = [
      sceneGraph.on('nodeAdded', markDirty),
      sceneGraph.on('nodeChanged', markDirty),
      sceneGraph.on('nodeRemoved', markDirty),
    ];
    return () => unsubs.forEach((u) => u());
  }, [sceneGraph]);

  const projectActions = useProjectActions({ loadProjectId: projectId });
  useProjectShortcuts(shortcutCallbacks);

  return (
    <div className={styles.editor}>
      {/* ... layout ... */}
    </div>
  );
}
```

Each hook is responsible for one concern: `useProjectActions` provides save/load operations, and `useProjectShortcuts` wires up Ctrl+S, Ctrl+O, and similar file shortcuts.

The scene graph event subscription (`nodeAdded`, `nodeChanged`, `nodeRemoved`) marks the project as dirty whenever anything changes. This drives the "unsaved changes" indicator and auto-save logic. We use `useEditorStore.getState()` (imperative access) rather than a reactive hook subscription because we don't want this effect to re-run when the store changes — we only need to register the listeners once.

## Testing the Shell

Even "just UI" code benefits from tests. Our component tests verify:

- **Variant rendering**: Each button variant produces the correct background color
- **State behavior**: Hover, focus, disabled, loading states work correctly
- **Controlled/uncontrolled**: Panel expansion works in both modes
- **Composition**: IconButton renders its icon, Tooltip shows on hover after delay
- **Accessibility**: Correct `role`, `aria-*`, and `disabled` attributes

These tests use React Testing Library, which encourages testing behavior rather than implementation. We don't assert on class names or inline style values — we assert that a disabled button has `disabled` attribute and can't be clicked.

The total test count at this point: 89 tests in the `@quar/ui` package. Not a huge number, but each test protects a behavior that dozens of future components will depend on.

## Lessons

**Build the shell before the engine.** Laying out empty panels forces you to define data contracts early: what properties exist, what a "layer" means, how tools switch. These architectural decisions are easier to make when you can see the UI skeleton than when you are deep in rendering code.

**Design tokens centralize every visual decision into one place.** Seventy CSS custom properties eliminate the problem of each component inventing its own shade of dark gray. When you decide the hover state should be slightly brighter, you change one variable, not forty selectors.

**Semi-transparent overlays adapt to any background automatically.** Using `rgba(255, 255, 255, 0.04)` for hover states instead of specific hex colors means the same token works on primary, secondary, and tertiary backgrounds without needing a separate hover variant for each.

**Inline CSSProperties work well for variant-heavy components but not for structural layout.** Buttons with four variants, three sizes, and five states express their combinatorial styles naturally as object spreads. Page-level layout needs real CSS features like pseudo-elements and overflow control. Use each approach where it fits.

**Fixed side panels with a flexible canvas is the correct resize behavior for creative tools.** Users expect the Properties Panel to stay at 260px when the browser window changes. Only the canvas should absorb the difference. This is a single `flex: 1` on the canvas container.

**The `overflow: hidden` chain prevents accidental scrolling in full-viewport applications.** Every flex container from the editor root down to the canvas area sets `overflow: hidden`. The only scrollable regions are ones you explicitly make scrollable, like the layer list inside a panel.

## What We Built

At the end of this chapter, we have:

- **A design token system** — ~70 CSS custom properties covering colors, spacing, typography, shadows, animation, and z-index. Every visual decision is centralized and consistent.
- **A component library** — Button, Input, IconButton, Panel, Tooltip, and Select components that handle variants, sizes, states, and composition. These live in `@quar/ui`, isolated from editor logic.
- **An editor shell** — A full-viewport flexbox layout with fixed side panels, a flexible canvas area, and stacked horizontal bars for menu, toolbar, and page tabs.
- **A data flow architecture** — The SceneGraphProvider, editor store, and hook system establish how data moves through the application before any rendering code exists.

None of this draws shapes. None of this handles user interaction beyond button clicks. But it establishes the architectural skeleton that every subsequent chapter builds on. When we add the scene graph in Chapter 3, it has a Layer Panel waiting for it. When we add drawing tools in later chapters, they have a Toolbar with icon buttons ready to host them. When we add properties editing later, the Properties Panel already has collapsible sections and input components.

Building the shell first is an investment that pays off continuously. You never have to stop implementing a feature to build the UI infrastructure for it — the infrastructure is already there.

In the next chapter, we build the data structure that sits at the heart of every graphic editor: the scene graph. It's where "editor shell" becomes "editor."
