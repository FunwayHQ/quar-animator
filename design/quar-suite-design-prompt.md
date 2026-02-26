# QUAR Suite Design Prompt — Quar Artist

> **Purpose**: Design specification for **Quar Artist**, a Procreate-like digital painting & illustration app in the QUAR Suite. Inherits the shared "Neo-Industrial Studio" design language from Quar Animator with a warm amber accent for creative flow.

---

## 1. Suite Identity: Neo-Industrial Studio

All QUAR Suite apps share one visual DNA:

- **Dark-mode default** — warm charcoal blacks, not cold grays
- **Noise texture overlay** — fractal noise at 1.5% opacity over the entire viewport
- **Glass panel surfaces** — `backdrop-filter: blur(12px) saturate(150%)` with `rgba(17,17,19,0.85)` background
- **Geometric sans typography** — DM Sans for UI, IBM Plex Mono for numeric readouts
- **Thin 6px scrollbars** with `rgba(255,255,255,0.1)` thumbs
- **Snappy micro-interactions** — 120ms fast, 200ms normal, spring easing `cubic-bezier(0.34, 1.56, 0.64, 1)`
- **Layered shadows** — dual-shadow system (large soft + small sharp) for depth
- **Focus ring** — 1.5px solid accent color, 1px offset

### What changes per app: the **accent color**

| App              | Primary Accent   | Glow Color                | Personality       |
| ---------------- | ---------------- | ------------------------- | ----------------- |
| Quar Animator    | `#A855F7` violet | `rgba(168, 85, 247, 0.3)` | Motion & time     |
| **Quar Artist**  | `#F59E0B` amber  | `rgba(245, 158, 11, 0.3)` | Warmth & creation |
| Quar Vector      | `#06B6D4` cyan   | `rgba(6, 182, 212, 0.3)`  | Precision & craft |
| Quar Editor (3D) | `#F97316` orange | `rgba(249, 115, 22, 0.3)` | Space & depth     |

The secondary accent (bordeaux `#9F1239`) stays constant across the suite — it's the family signature.

---

## 2. Shared Design Tokens (CSS Custom Properties)

Copy this `:root` block verbatim into every QUAR app. Only override the `--color-accent-*` values per app.

```css
:root {
  /* ── Backgrounds (warm charcoal blacks) ── */
  --color-bg-primary: #0a0a0b;
  --color-bg-secondary: #111113;
  --color-bg-tertiary: #18181b;
  --color-bg-elevated: #1f1f23;
  --color-bg-hover: rgba(255, 255, 255, 0.04);
  --color-bg-active: rgba(255, 255, 255, 0.08);
  --color-bg-canvas: #09090a;

  /* ── Glass surfaces ── */
  --color-glass: rgba(17, 17, 19, 0.85);
  --color-glass-border: rgba(255, 255, 255, 0.06);
  --color-glass-highlight: rgba(255, 255, 255, 0.03);

  /* ── Text (warm whites) ── */
  --color-text-primary: #fafaf9;
  --color-text-secondary: #a1a1aa;
  --color-text-tertiary: #71717a;
  --color-text-disabled: #3f3f46;
  --color-text-inverse: #0a0a0b;

  /* ── Borders ── */
  --color-border-default: rgba(255, 255, 255, 0.08);
  --color-border-subtle: rgba(255, 255, 255, 0.04);
  --color-border-strong: rgba(255, 255, 255, 0.12);

  /* ── Semantic colors (constant across suite) ── */
  --color-accent-secondary: #9f1239;
  --color-accent-secondary-glow: rgba(159, 18, 57, 0.3);
  --color-accent-success: #34d399;
  --color-accent-warning: #fbbf24;
  --color-accent-error: #fb7185;

  /* ── Spacing ── */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 12px;
  --space-lg: 16px;
  --space-xl: 24px;
  --space-2xl: 32px;
  --space-3xl: 48px;

  /* ── Typography ── */
  --font-family-ui: 'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --font-family-mono: 'IBM Plex Mono', 'SF Mono', 'Consolas', monospace;
  --font-size-2xs: 9px;
  --font-size-xs: 10px;
  --font-size-sm: 11px;
  --font-size-md: 13px;
  --font-size-lg: 15px;
  --font-size-xl: 18px;
  --font-size-2xl: 24px;
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;

  /* ── Border Radius ── */
  --radius-none: 0px;
  --radius-xs: 3px;
  --radius-sm: 5px;
  --radius-md: 8px;
  --radius-lg: 10px;
  --radius-xl: 14px;
  --radius-full: 9999px;

  /* ── Shadows (layered) ── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.3);
  --shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.45), 0 4px 16px rgba(0, 0, 0, 0.35);
  --shadow-inset: inset 0 1px 0 var(--color-glass-highlight);

  /* ── Animation ── */
  --duration-instant: 50ms;
  --duration-fast: 120ms;
  --duration-normal: 200ms;
  --duration-slow: 350ms;
  --duration-slower: 500ms;
  --easing-default: cubic-bezier(0.2, 0, 0, 1);
  --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --easing-in: cubic-bezier(0.4, 0, 1, 1);
  --easing-out: cubic-bezier(0, 0, 0.2, 1);
  --easing-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* ── Z-index scale ── */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 1000;
  --z-context-menu: 1010;
  --z-popover: 1020;
  --z-modal: 1030;
  --z-color-picker: 1040;
  --z-tooltip: 1050;

  /* ── Noise overlay ── */
  --noise-opacity: 0.015;
}
```

---

## 3. Quar Artist — App-Specific Overrides

```css
/* Quar Artist accent: Amber — warmth, creative flow, natural media feel */
:root {
  --color-accent-primary: #f59e0b;
  --color-accent-primary-hover: #fbbf24;
  --color-accent-primary-active: #d97706;
  --color-accent-primary-glow: rgba(245, 158, 11, 0.3);
  --color-border-focus: #f59e0b;
  --shadow-glow: 0 0 20px var(--color-accent-primary-glow);
}

::selection {
  background-color: rgba(245, 158, 11, 0.35);
  color: var(--color-text-primary);
}
```

---

## 4. App Concept — Quar Artist

**Quar Artist** is a Procreate-inspired raster painting and illustration app for web and tablet. It prioritizes:

- **Canvas-first UX** — maximum painting area, minimal chrome
- **Touch + Stylus optimized** — pressure, tilt, velocity sensitivity
- **Natural media simulation** — oils, watercolor, charcoal, ink, pencil
- **Layer compositing** — blend modes, masks, clipping groups, adjustment layers
- **Non-destructive workflow** — smart filters, transform warp, liquify

### Core Differentiators from Procreate

- Runs in the browser (WebGL 2 / WebGPU rendering)
- QUAR Suite interop (import/export with Animator and Vector)
- Collaborative layer sharing (future)
- Plugin-based brush engine (WASM brush kernels)

---

## 5. Layout Specification

Quar Artist maximizes canvas real estate. All panels auto-hide and slide in on demand (Procreate pattern adapted for desktop).

### Desktop Layout

```
┌─────────────────────────────────────────────────────────┐
│  Title Bar (28px, drag area, glass — app name + ··· )   │
├────┬────────────────────────────────────────────┬───────┤
│    │                                            │       │
│Tool│              Canvas                        │ Right │
│Bar │        (full bleed, bg-canvas)             │ Shelf │
│48px│                                            │  48px │
│    │     ┌──────────────────────┐               │       │
│    │     │   Brush cursor       │               │Color  │
│    │     │   (dynamic ring)     │               │Disc   │
│    │     └──────────────────────┘               │       │
│    │                                            │Layers │
│    │                                            │Toggle │
│    │                                            │       │
│    │                                            │Brush  │
│    │                                            │Size   │
│    │                                            │Slider │
│    │                                            │       │
│    │                                            │Opacity│
│    │                                            │Slider │
├────┴────────────────────────────────────────────┴───────┤
│  (no bottom bar — clean edge)                           │
└─────────────────────────────────────────────────────────┘
```

### Tablet / Touch Layout

```
┌─────────────────────────────────────────────────┐
│                                                 │
│              Canvas (full screen)                │
│                                                 │
│  ┌───┐                              ┌───┐      │
│  │ T │  ← floating tool palette     │ C │ ←    │
│  │ O │     (draggable, 48px)        │ O │ color│
│  │ O │                              │ L │ disc │
│  │ L │                              │ O │      │
│  │ S │                              │ R │      │
│  └───┘                              └───┘      │
│                                                 │
│       Brush size ← two-finger pinch on canvas   │
│                                                 │
│  ┌──────────────────────────────────────────┐   │
│  │ Undo  Redo  ···  Layers  Color  Brushes  │   │
│  └──────────────────────────────────────────┘   │
│     ↑ bottom context bar (auto-hide)            │
└─────────────────────────────────────────────────┘
```

### Key Layout Principles

- **No menu bar** on tablet — replaced by `···` overflow and long-press gestures
- **Floating palettes** — Tool, Color, and Brush panels are draggable and auto-dock to edges
- **Auto-hide** — panels fade to 10% opacity after 3s of no interaction, reappear on hover/touch
- **Full-bleed canvas** — painting area extends to window edges, no panel gutters

---

## 6. Brush System UI

### Brush Library Panel (slide-in from left, 320px wide)

```
┌─ Brush Library ──────────────────────────────┐
│ [Search brushes...]                     [+]  │
│                                              │
│ ── Favorites ──                              │
│ ● Studio Pen    ● Soft Airbrush             │
│ ● Dry Ink       ● Flat Marker               │
│                                              │
│ ── Sketching ──                              │
│ ○ 6B Pencil        ○ Technical Pencil       │
│ ○ Charcoal Vine    ○ Conte Crayon           │
│ ○ HB Graphite      ○ Mechanical 0.5         │
│                                              │
│ ── Inking ──                                 │
│ ○ Studio Pen       ○ Dry Ink                │
│ ○ Syrup            ○ Technical Pen          │
│ ○ Gel Pen          ○ Calligraphy            │
│                                              │
│ ── Painting ──                               │
│ ○ Round Brush      ○ Flat Brush             │
│ ○ Filbert          ○ Fan Brush              │
│ ○ Oil Paint        ○ Palette Knife          │
│                                              │
│ ── Watercolor ──                             │
│ ○ Wet Wash         ○ Dry Edge               │
│ ○ Bleed            ○ Splatter               │
│                                              │
│ ── Textures ──                               │
│ ○ Noise Grain      ○ Canvas Texture         │
│ ○ Paper Fiber      ○ Halftone               │
│                                              │
│ ── Erasers ──                                │
│ ○ Soft Eraser      ○ Hard Eraser            │
│ ○ Block Eraser     ○ Precision              │
└──────────────────────────────────────────────┘
```

### Brush Settings Panel (slide-in, replaces library)

```
┌─ Brush Settings ─────────────────────────────┐
│ [← Back]                       Studio Pen    │
│                                              │
│  ┌────────────────────────────────┐          │
│  │  Preview stroke (live)         │          │
│  │  ~~~~~~~~~~~~~~~~~~~~~~~~      │          │
│  └────────────────────────────────┘          │
│                                              │
│ ── Shape ──                                  │
│ Source   [Circle ▾]   Spacing [12%]          │
│ Scatter  [0%  ─────●── 100%]                │
│ Rotation [Follow stroke ▾]                   │
│                                              │
│ ── Dynamics ──                               │
│ Size     Pressure [min 10% ──●── max 100%]  │
│ Opacity  Pressure [min 30% ──●── max 100%]  │
│ Flow     Velocity [min 50% ──●── max 100%]  │
│ Tilt     Angle    [──●── ]                   │
│                                              │
│ ── Rendering ──                              │
│ Blend Mode  [ Normal ▾ ]                     │
│ Wet Mix     [0%  ────●──── 100%]             │
│ Color Mix   [0%  ──●────── 100%]             │
│ Dilution    [0%  ─────●─── 100%]             │
│                                              │
│ ── Texture ──                                │
│ Grain  [Canvas ▾]  [Depth 60%]              │
│ Scale  [100%]  Rotation [0°]                 │
│                                              │
│ [Reset to Default]          [Save as New]    │
└──────────────────────────────────────────────┘
```

### Brush Cursor

- **Outer ring**: Solid `rgba(250, 250, 249, 0.5)`, 1px stroke, diameter = brush size at current zoom
- **Inner dot**: 2px solid circle at exact cursor position
- **Pressure preview**: Ring diameter animates with pen pressure in real-time
- **Crosshair mode**: At sizes < 4px, switch to crosshair cursor

---

## 7. Color System UI

### Color Disc (right shelf, always visible)

```
         ┌───────────────┐
         │   ╱  Hue     │
         │  ╱  Ring      │
         │ ╱ ┌───────┐   │
         │   │ SB    │   │
         │   │ Square│   │
         │   │  ●    │   │
         │   └───────┘   │
         │               │
         └───────────────┘
         Primary  Secondary
         [■ ▓]   swap ↔
```

- **Hue ring**: 4px wide outer ring, drag to rotate hue
- **SB square**: Saturation (X axis) × Brightness (Y axis) inside the ring
- **Current/Secondary**: Two overlapping swatches at the bottom, click to swap (X shortcut)
- **Tap ring to expand**: opens full Color Panel

### Color Panel (expanded, slide-in overlay)

```
┌─ Color ──────────────────────────────────────┐
│                                              │
│  [Disc] [Classic] [Harmony] [Palettes]       │
│                                              │
│  ── Disc View ──                             │
│  (large hue ring + SB square, 200px)         │
│                                              │
│  H [0°  ─────●───── 360°]                   │
│  S [0%  ──────●──── 100%]                   │
│  B [0%  ───────●─── 100%]                   │
│  A [0%  ────────●── 100%]                   │
│                                              │
│  Hex  [#F59E0B]  RGB [245, 158, 11]         │
│                                              │
│  ── Recent ──                                │
│  [■][■][■][■][■][■][■][■][■][■][■][■]       │
│                                              │
│  ── Harmony View ──                          │
│  Mode: [Complementary ▾]                     │
│  (hue wheel with harmony markers)            │
│                                              │
│  ── Palettes ──                              │
│  [Default] [Skin Tones] [Nature] [+]         │
│  [■][■][■][■][■][■]                         │
│  [■][■][■][■][■][■]                         │
│  [■][■][■][■][■][■]                         │
│                                              │
└──────────────────────────────────────────────┘
```

### Color Harmony Modes

- Complementary, Analogous, Triadic, Split-Complementary, Tetradic, Custom

---

## 8. Layer Panel (slide-in from right, 300px wide)

```
┌─ Layers ─────────────────────────────────────┐
│ [+ Layer] [+ Group] [Merge ▾]   [···]        │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ ☐ Layer 5        Normal ▾  100%  [eye]  │ │
│ │   (thumbnail 40×40)                      │ │
│ ├──────────────────────────────────────────┤ │
│ │ ▶ Group: Character                       │ │
│ │ │ ☐ Highlights   Screen ▾   80%  [eye]  │ │
│ │ │ ☐ Base Color   Normal ▾  100%  [eye]  │ │
│ │ │ ☐ Linework     Multiply ▾ 90%  [eye]  │ │
│ ├──────────────────────────────────────────┤ │
│ │ ☐ Background     Normal ▾  100%  [eye]  │ │
│ │   [🔒 locked]                            │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ── Layer Options ──                          │
│ Blend Mode   [ Normal ▾ ]                    │
│ Opacity      [100% ──────────●]              │
│ [Alpha Lock] [Clipping Mask] [Reference]     │
│ [Mask] [Merge Down] [Flatten]                │
└──────────────────────────────────────────────┘
```

### Layer Interactions

- **Drag to reorder** — 4px grab handle on left edge, drop indicator = 2px amber line
- **Swipe left** (touch) — reveal Delete, Duplicate, Lock buttons
- **Long press** (touch) — enter multi-select mode with checkboxes
- **Two-finger tap** (touch) — toggle alpha lock
- **Thumbnail**: 40×40 live preview with checkerboard for transparency
- **Blend mode**: inline dropdown, `--font-size-xs`
- **Opacity**: inline scrub-to-adjust (`--font-family-mono`)

---

## 9. Tool Bar

### Desktop (left edge, 48px wide, vertical)

```
┌────┐
│ ✋ │  Move / Transform
│ ✂️ │  Selection (Rect / Lasso / Magic Wand)
├────┤
│ 🖌 │  Brush (active: amber ring indicator)
│ 🔲 │  Eraser
│ 💧 │  Smudge
│ 🎨 │  Color Fill / Gradient
├────┤
│ T  │  Text
│ ▭  │  Shape (Rect / Ellipse / Line / Polygon)
├────┤
│ 🔍 │  Zoom
│ ✋ │  Pan (Hand)
│ 💉 │  Eyedropper
├────┤
│ ↩  │  Undo
│ ↪  │  Redo
└────┘
```

- Each tool: 40×40 `IconButton`, ghost variant
- Active tool: `--color-bg-active` background + left 2px `--color-accent-primary` border
- Long-press or right-click: tool variant flyout (e.g., Lasso sub-tools)
- Tool icon size: 22×22 (slightly larger than Animator's 20×20 for painting comfort)

### Touch (floating palette, draggable)

- Same tools in a 2-column compact grid
- Drag from any edge to reposition
- Double-tap to collapse to single icon (last used tool)

---

## 10. Canvas Gestures (Touch / Stylus)

| Gesture                 | Action                                   |
| ----------------------- | ---------------------------------------- |
| One finger / Stylus     | Paint stroke                             |
| Two-finger pinch        | Zoom canvas                              |
| Two-finger rotate       | Rotate canvas                            |
| Two-finger drag         | Pan canvas                               |
| Three-finger tap        | Undo                                     |
| Three-finger swipe down | Paste                                    |
| Four-finger tap         | Redo                                     |
| Touch + hold            | Eyedropper                               |
| Stylus hover            | Brush preview (size ring follows cursor) |
| Stylus tilt             | Brush angle (charcoal, calligraphy)      |
| Stylus pressure         | Size / opacity dynamic                   |
| Quick-pinch in          | Zoom to fit                              |
| Quick-pinch out         | Zoom to 100%                             |

---

## 11. Keyboard Shortcuts (Desktop)

| Shortcut      | Action                             |
| ------------- | ---------------------------------- |
| B             | Brush tool                         |
| E             | Eraser                             |
| S             | Smudge                             |
| G             | Color fill / gradient              |
| V             | Move tool                          |
| M             | Selection (marquee)                |
| L             | Lasso selection                    |
| W             | Magic wand                         |
| T             | Text                               |
| U             | Shape tool                         |
| I / Alt+click | Eyedropper                         |
| X             | Swap primary / secondary color     |
| D             | Reset to black / white             |
| H             | Hand tool (also Space+drag)        |
| Z             | Zoom tool                          |
| [ / ]         | Decrease / increase brush size     |
| { / }         | Decrease / increase brush hardness |
| 1-0           | Opacity 10%-100%                   |
| Ctrl+Z        | Undo                               |
| Ctrl+Shift+Z  | Redo                               |
| Ctrl+T        | Transform                          |
| Ctrl+D        | Deselect                           |
| Ctrl+Shift+I  | Invert selection                   |
| Ctrl+G        | Group layers                       |
| Ctrl+E        | Merge down                         |
| Ctrl+Shift+E  | Flatten visible                    |
| Ctrl+N        | New canvas                         |
| Ctrl+S        | Save                               |
| Ctrl+Shift+S  | Save as                            |
| Ctrl+Shift+E  | Export                             |
| Tab           | Toggle UI visibility               |
| F             | Fullscreen canvas                  |
| R             | Rotate canvas (drag)               |
| Ctrl+0        | Reset canvas rotation + zoom       |

---

## 12. Component Library (Shared `@quar/ui`)

Quar Artist reuses all shared components. They auto-adapt to the amber accent via CSS variables:

### Button

- Primary: amber `#F59E0B` bg, dark text `#0a0a0b` (inverse for contrast)
- Secondary: `--color-bg-tertiary` bg
- Ghost: transparent, `--color-text-secondary`
- Note: amber primary is light enough to need dark text (`--color-text-inverse`)

### Slider (New — painting-specific)

A custom slider component needed for brush size, opacity, flow:

- Track: `--color-bg-tertiary`, 4px height, `--radius-full`
- Fill: gradient from `--color-accent-primary` (left) to transparent (right)
- Thumb: 14px circle, white fill, 2px `--color-accent-primary` border
- Scrub-anywhere: clicking the track jumps to that value
- Vertical variant for right-shelf brush size / opacity

### Color Swatch

- 24×24 rounded square (`--radius-xs`)
- Checkerboard background for alpha indication
- 1px `--color-border-default` border
- Active: 2px `--color-accent-primary` ring

### Thumbnail

- 40×40 for layers, 60×60 for brush library
- `--radius-sm` corners
- Checkerboard for transparency
- 1px `--color-border-subtle` border

---

## 13. Motion & Transitions

| Element             | Duration                                  | Easing             | Trigger          |
| ------------------- | ----------------------------------------- | ------------------ | ---------------- |
| Panel slide-in      | 250ms                                     | `--easing-default` | tap toggle       |
| Panel auto-hide     | 3000ms idle → 200ms fade to 10%           | `--easing-out`     | inactivity       |
| Panel reappear      | 120ms                                     | `--easing-out`     | hover/touch      |
| Brush cursor resize | 80ms                                      | `--easing-default` | [ ] keys         |
| Tool switch         | 100ms                                     | `--easing-default` | tap/shortcut     |
| Layer reorder       | 200ms                                     | `--easing-spring`  | drag release     |
| Color disc expand   | 200ms                                     | `--easing-spring`  | tap disc         |
| Undo flash          | 150ms                                     | `--easing-out`     | three-finger tap |
| Canvas rotate       | real-time, 0ms                            | linear             | gesture          |
| Toast notification  | 350ms slide-up + 3000ms hold + 200ms fade | `--easing-spring`  | event            |

---

## 14. Rendering Pipeline

```
Stylus Input → Stroke Smoothing → Brush Kernel (WASM) → Stroke Tile → Layer Compositing → Display
```

- **Brush Kernel**: Per-dab stamp compositing in WASM for performance
- **Tile-based**: Canvas divided into 256×256 tiles, only dirty tiles re-composited
- **WebGL 2 compositing**: Layer stack composed via fragment shaders (blend modes as GLSL)
- **WebGPU path**: Compute shaders for brush simulation when available
- **Undo granularity**: One undo step per stroke (pointer-down → pointer-up)

---

## 15. File Format

| Extension     | Type                                                                       | Contents                                      |
| ------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| `.qart`       | Binary (QUAR container)                                                    | Layer stack + brush settings + color palettes |
| Binary layout | `[QART magic 4B][Version 4B][Flags 4B][JSON metadata][Layer tile buffers]` |                                               |
| Tile format   | Raw RGBA `Uint8Array` per 256×256 tile                                     | Sparse — only non-empty tiles stored          |
| Export        | PNG, JPEG, PSD, TIFF, WebP                                                 | Flattened or layered (PSD)                    |
| Import        | PNG, JPEG, PSD, SVG (rasterized), `.quar` (static frame)                   |                                               |

---

## 16. Design System Migration Checklist

When bootstrapping Quar Artist:

1. Install shared packages: `@quar/ui`, `@quar/types`
2. Copy the shared `:root` tokens block from Section 2
3. Add amber accent overrides from Section 3
4. **Note**: Amber primary needs `color: var(--color-text-inverse)` for button text (light-on-dark contrast)
5. Import `@fontsource/dm-sans` (400, 500, 600) and `@fontsource/ibm-plex-mono` (400, 500)
6. Add noise texture `body::before` overlay
7. Add glass panel utility class
8. Use `@quar/ui` components — accent auto-adapts
9. Add new components: `Slider`, `ColorDisc`, `BrushCursor`, `LayerThumbnail`
10. Use Lucide React for all icons (stroke 1.5px at 22×22 in toolbars)
11. Implement auto-hide panel behavior (3s timeout → fade)
12. Match animation timing from Section 13

---

## 17. Accessibility Notes

- **Minimum touch target**: 44×44px for all interactive elements
- **Color contrast**: Amber on dark passes WCAG AA (contrast ratio ~7.2:1 for `#F59E0B` on `#0a0a0b`)
- **Reduced motion**: Respect `prefers-reduced-motion` — disable brush cursor animation, canvas rotation, panel slides
- **Screen reader**: Layer panel uses `role="tree"` with `aria-expanded` for groups
- **Keyboard painting**: Arrow keys nudge selection, Enter confirms transform, Escape cancels
