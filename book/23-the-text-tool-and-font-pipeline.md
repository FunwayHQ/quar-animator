# The Text Tool & Font Pipeline

## From Keystrokes to Triangles

A rectangle is four vertices. An ellipse is a parametric curve tessellated to a fan of triangles. A path is a sequence of points with bezier handles. But text is none of these — it is a string of Unicode characters that must be resolved through a font file into glyph outlines, converted to bezier paths, tessellated into triangles, and finally sent to the GPU. No other node type in the editor spans this many transformations between user input and rendered pixels.

This chapter traces the full pipeline: from the `TextNode` type definition, through font loading and caching, through glyph-to-path conversion with coordinate system flips, through metrics computation for selection bounds, to the inline editing overlay that positions a `<textarea>` precisely over the text on the canvas. Each stage is a pure function operating on the output of the previous one, with the FontManager as the single point of shared state.

## The TextNode Type

A text node carries everything needed to render and edit text:

```typescript
export interface TextNode extends BaseNode {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textAlign: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  fills: Fill[];
  strokes: Stroke[];
}
```

`content` is the raw text string, including newlines for multi-line text. `fontFamily` is a CSS-style family name — "Inter", "Roboto", "Arial". `fontSize` is in local-space units (typically points). `fontWeight` is a numeric CSS weight (100–900, where 400 is normal and 700 is bold). `lineHeight` is a unitless multiplier applied to `fontSize` (1.2 means 120% of the font size). `letterSpacing` is additional horizontal space between characters in local-space units.

The node also carries `fills` and `strokes` — the same visual properties as any other shape. Text is rendered through the same `renderFillsAndStrokes` pipeline as rectangles and paths. The fills are applied to the tessellated glyph triangles, and the strokes to the glyph contour outlines. This means gradient fills and dashed strokes work on text exactly as they do on shapes.

## The TextTool

The TextTool creates TextNode instances. It follows the same drag-to-create pattern as the RectangleTool:

```typescript
export class TextTool extends BaseTool {
  readonly type = 'text' as const;
  readonly cursor = 'crosshair';

  onPointerUp(event: CanvasPointerEvent): void {
    // ...
    const node = hasDragged
      ? this.createTextNode(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width,
          rect.height
        )
      : this.createTextNode(this.startPoint.x, this.startPoint.y, 0, 0);

    this.context.onTransformStart?.();
    this.context.sceneGraph.addNode(node);
    this.context.setSelectedIds([node.id]);

    // Trigger inline text editing
    this.context.onEnterTextEdit?.(node.id);

    this.previewNode = null;
    this.startPoint = null;
    this.resetState();
  }
}
```

A simple click (no drag) creates a default-sized text node at the click position. A click-and-drag creates a text box scaled to fit the drag rectangle. In both cases, the tool immediately triggers `onEnterTextEdit` — the user never sees the text node without the editing overlay. This is the expected behavior: click the T tool, click the canvas, start typing.

The `createTextNode` method constructs the full node with default properties:

```typescript
private createTextNode(cx: number, cy: number, width: number, height: number): TextNode {
  const fontSize = 24;
  const scaleX = width > 0 ? width / 100 : 1;
  const scaleY = height > 0 ? height / 100 : 1;

  return {
    id: this.context.generateId(),
    name: 'Text',
    type: 'text',
    transform: {
      position: { x: cx, y: cy },
      rotation: 0,
      scale: { x: scaleX, y: scaleY },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    content: '',
    fontFamily: 'Inter',
    fontSize,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [{ ...this.context.defaultFill }],
    strokes: [{ ...this.context.defaultStroke, visible: false }],
    // ... visible, locked, opacity, blendMode
  };
}
```

The anchor is `(0.5, 0.5)` — centered — so that rotation pivots around the visual center of the text, matching the behavior of every other shape type.

## Font Loading with opentype.js

Rendering text requires parsing font files to extract glyph outlines. The editor uses opentype.js, a JavaScript library that reads TrueType (.ttf) and OpenType (.otf) font files and exposes glyph paths as command sequences (moveTo, lineTo, curveTo, closePath).

The FontManager class handles loading, caching, and retrieval:

```typescript
export class FontManager {
  private fontCache: Map<string, opentype.Font> = new Map();
  private loadingPromises: Map<string, Promise<opentype.Font>> = new Map();
  private availableFonts: Map<string, FontInfo> = new Map();
}
```

Three maps serve different purposes. `fontCache` stores parsed `opentype.Font` objects, keyed by `family:weight` — for example, `"Roboto:700"`. `loadingPromises` tracks in-flight requests to prevent duplicate fetches. `availableFonts` records metadata (family name and source: bundled, Google, or local upload) for the UI to enumerate.

### Weight-Aware Caching

The cache key includes the font weight because a font family may have distinct binary files for each weight. Roboto Regular (400) and Roboto Bold (700) are two separate TTF files with different glyph outlines — not the same file rendered thicker.

```typescript
function fontCacheKey(family: string, weight: number = 400): string {
  return `${family}:${weight}`;
}
```

The retrieval method cascades through fallbacks:

```typescript
getFont(family: string, weight: number = 400): opentype.Font | null {
  // Exact match
  const exact = this.fontCache.get(fontCacheKey(family, weight));
  if (exact) return exact;
  // Fallback to regular weight
  if (weight !== 400) {
    const regular = this.fontCache.get(fontCacheKey(family, 400));
    if (regular) return regular;
  }
  // Fallback to any weight of this family
  for (const [key, font] of this.fontCache) {
    if (key.startsWith(family + ':')) return font;
  }
  return null;
}
```

If the user requests Roboto Bold but only Roboto Regular is loaded, the regular variant is returned rather than nothing. `getFontOrFallback` goes one step further — if the entire family is missing, it returns the first available font of any family as a last resort.

### Loading from URLs

Fonts can be loaded from local ArrayBuffers (drag-and-drop or file upload) or from URLs. The Google Fonts integration uses a hardcoded catalog of per-weight TTF URLs:

```typescript
export const GOOGLE_FONTS_CATALOG: GoogleFontEntry[] = [
  {
    family: 'Roboto',
    weights: [100, 300, 400, 500, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/roboto/v50/...ttf',
        700: 'https://fonts.gstatic.com/s/roboto/v50/...ttf',
        // ...
      };
      return map[w] ?? map[400]!;
    },
  },
  // ... 24 more font families
];
```

Why hardcoded URLs instead of calling the Google Fonts CSS2 API at runtime? Because the browser's `fetch` cannot set a custom `User-Agent` header (it is a forbidden header), and the Google Fonts CSS2 API returns WOFF2 format to modern browsers. opentype.js version 1.3.4 cannot parse WOFF2 (it requires Brotli decompression). The static TTF URLs bypass this limitation entirely. When Google updates their font CDN and the URLs change, a maintenance script re-fetches the current URLs.

### The Singleton Pattern

The FontManager is a singleton accessed through `getFontManager()`:

```typescript
let globalFontManager: FontManager | null = null;

export function getFontManager(): FontManager {
  if (!globalFontManager) {
    globalFontManager = new FontManager();
  }
  return globalFontManager;
}
```

This ensures all components — the ShapeRenderer, the textMetrics module, the PropertiesPanel font dropdown — share the same font cache. Loading a font once makes it available everywhere.

## The Glyph Conversion Pipeline

The heart of the text rendering system is `glyphPathToSubpaths` — a function that converts opentype.js path commands into the editor's `PathPoint` arrays:

```typescript
export function glyphPathToSubpaths(opPath: opentype.Path): PathPoint[][] {
  const subpaths: PathPoint[][] = [];
  let current: PathPoint[] = [];
  let currentPos: Vector2 = { x: 0, y: 0 };

  for (const cmd of opPath.commands) {
    switch (cmd.type) {
      case 'M': // Move to — start new subpath
      case 'L': // Line to — corner point
      case 'C': // Cubic bezier
      case 'Q': // Quadratic bezier — must promote to cubic
      case 'Z': // Close — deduplicate closing point
    }
  }
  return subpaths;
}
```

opentype.js returns path data as a sequence of SVG-style commands. Each glyph — a letter "A", a comma, a curly brace — is a series of these commands describing its outline. The function walks the commands and builds `PathPoint` arrays that the renderer already knows how to tessellate and draw.

### The Y-Axis Flip

Font files use a Y-down coordinate system (positive Y goes downward, matching screen coordinates). The editor uses Y-up (positive Y goes upward, matching mathematical convention). Every Y coordinate must be negated:

```typescript
case 'M': {
  currentPos = { x: cmd.x, y: -cmd.y }; // Y-flip
  current.push({
    position: { ...currentPos },
    handleIn: null,
    handleOut: null,
    type: 'corner',
  });
  break;
}
```

This flip happens once, at the conversion boundary. Every function downstream — tessellation, rendering, hit testing — works in Y-up coordinates without needing to know the data originally came from a font.

### Quadratic-to-Cubic Promotion

TrueType fonts use quadratic bezier curves (one control point per segment). The editor's `PathPoint` system uses cubic beziers (two control points — `handleIn` and `handleOut`). Quadratic curves must be promoted to cubic:

```typescript
case 'Q': {
  const prevPt = current[current.length - 1];
  const ctrl = { x: cmd.x1, y: -cmd.y1 };
  const endPt = { x: cmd.x, y: -cmd.y };

  // Quadratic-to-cubic: cp1 = prev + 2/3*(ctrl - prev)
  const cubicCp1 = {
    x: prevPt.position.x + (2/3) * (ctrl.x - prevPt.position.x),
    y: prevPt.position.y + (2/3) * (ctrl.y - prevPt.position.y),
  };
  // cp2 = end + 2/3*(ctrl - end)
  const cubicCp2 = {
    x: endPt.x + (2/3) * (ctrl.x - endPt.x),
    y: endPt.y + (2/3) * (ctrl.y - endPt.y),
  };

  prevPt.handleOut = { x: cubicCp1.x - prevPt.position.x, y: cubicCp1.y - prevPt.position.y };
  current.push({
    position: { ...endPt },
    handleIn: { x: cubicCp2.x - endPt.x, y: cubicCp2.y - endPt.y },
    handleOut: null,
    type: 'smooth',
  });
  break;
}
```

The formula `prev + 2/3 * (ctrl - prev)` is the standard quadratic-to-cubic promotion. It produces a cubic curve that is visually identical to the original quadratic. OpenType fonts (CFF-based) already use cubic curves and hit the `case 'C'` branch directly. TrueType fonts (glyf-based) use quadratic and always go through this promotion.

### Closing Point Deduplication

When a subpath closes with `Z`, the last point often duplicates the first point's position (the pen returns to where it started). The converter detects this and removes the duplicate, transferring its `handleIn` to the first point:

```typescript
case 'Z': {
  if (current.length >= 2) {
    const first = current[0]!;
    const last = current[current.length - 1]!;
    const dx = Math.abs(last.position.x - first.position.x);
    const dy = Math.abs(last.position.y - first.position.y);
    if (dx < 0.01 && dy < 0.01) {
      if (last.handleIn) {
        first.handleIn = last.handleIn;
        if (first.type === 'corner') first.type = 'smooth';
      }
      current.pop();
    }
  }
  subpaths.push(current);
  current = [];
  break;
}
```

Without this deduplication, the tessellator would generate a zero-length segment at the closure point, wasting two triangles and potentially causing visual artifacts at the seam.

## Text Layout: `textToSubpaths`

Individual glyphs need to be positioned into a line of text with proper spacing, kerning, and multi-line layout. The `textToSubpaths` function orchestrates this:

```typescript
export function textToSubpaths(
  text: string, font: opentype.Font, fontSize: number,
  options: TextLayoutOptions = {}
): TextToSubpathsResult {
  const scale = fontSize / font.unitsPerEm;
  const lineHeightPx = fontSize * lineHeightMultiplier;
```

The function splits the text by newlines, measures each line's width for alignment, then lays out glyphs left-to-right with advance widths, letter spacing, and kerning:

```typescript
const glyphs = font.stringToGlyphs(line);
let advanceX = xOffset;

for (let i = 0; i < glyphs.length; i++) {
  const glyph = glyphs[i]!;
  const path = glyph.getPath(advanceX / scale, 0, font.unitsPerEm);
  const subpaths = glyphPathToSubpaths(path);

  // Scale subpath points from font units to local-space units
  for (const sp of subpaths) {
    for (const pt of sp) {
      pt.position.x *= scale;
      pt.position.y = pt.position.y * scale + yOffset;
      if (pt.handleIn) {
        pt.handleIn.x *= scale;
        pt.handleIn.y *= scale;
      }
      if (pt.handleOut) {
        pt.handleOut.x *= scale;
        pt.handleOut.y *= scale;
      }
    }
  }

  advanceX += (glyph.advanceWidth ?? 0) * scale;
  // Add kerning between adjacent glyphs
  if (i < glyphs.length - 1) {
    advanceX += letterSpacing;
    const nextGlyph = glyphs[i + 1];
    if (nextGlyph) advanceX += font.getKerningValue(glyph, nextGlyph) * scale;
  }
}
```

The `glyph.getPath()` call returns the glyph's outline commands with the horizontal advance already applied — the glyph is positioned at `advanceX / scale` in font units, which the converter then scales to local-space pixels. Kerning adjusts the spacing between specific character pairs (e.g., "AV" or "To") for more visually pleasing results.

The result includes both the flattened list of all subpaths (for rendering) and per-glyph groupings (for text-to-path conversion, covered in the next chapter):

```typescript
return { subpaths: allSubpaths, glyphs: allGlyphs, bounds };
```

## Text Metrics: Fast Bounds Without Tessellation

Rendering text requires the full glyph conversion pipeline. But measuring text — for selection bounds, hit testing, and overlay positioning — does not. The `textMetrics` module provides fast bounds calculation with two strategies:

```typescript
export function getTextBounds(
  content: string,
  fontFamily: string,
  fontSize: number,
  lineHeight: number = 1.2,
  letterSpacing: number = 0,
  textAlign: 'left' | 'center' | 'right' = 'left'
): Rect {
  const fm = getFontManager();
  const font = fm.getFont(fontFamily);

  if (font) {
    return getTextBoundsFromFont(content, font, fontSize, lineHeight, letterSpacing, textAlign);
  }

  // Canvas 2D fallback for system fonts
  return getTextBoundsFromCanvas(content, fontFamily, fontSize, lineHeight, letterSpacing);
}
```

**Strategy 1: opentype.js metrics.** When the font is loaded, `getTextBoundsFromFont` measures each line by summing glyph advance widths, letter spacing, and kerning — the same arithmetic as `textToSubpaths`, but without actually generating path data. This is fast because it reads only the font's horizontal metrics, not its glyph outlines.

**Strategy 2: Canvas 2D fallback.** When the font is not loaded in opentype.js (web-safe system fonts like Arial or Helvetica), the function creates an offscreen 1x1 canvas and uses `ctx.measureText()`. This is a browser-native measurement that works with any font the system has installed. A shared offscreen canvas is reused across calls to avoid allocation overhead:

```typescript
let measureCanvas: HTMLCanvasElement | null = null;
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureContext(): CanvasRenderingContext2D | null {
  if (measureCtx) return measureCtx;
  if (typeof document === 'undefined') return null;
  measureCanvas = document.createElement('canvas');
  measureCanvas.width = 1;
  measureCanvas.height = 1;
  measureCtx = measureCanvas.getContext('2d');
  return measureCtx;
}
```

The `typeof document === 'undefined'` guard handles the test environment (JSDOM may or may not support canvas), falling back to a character-width estimate (`fontSize * 0.6` per character).

## Inline Text Editing

When the user clicks the canvas with the Text tool — or double-clicks an existing text node with the Selection tool — the editor enters inline text editing mode. A `<textarea>` appears directly over the text on the canvas, styled to match the node's font properties.

### Positioning the Overlay

The TextEditOverlay receives the text node and the camera, and must compute where the textarea should appear on screen:

```typescript
const bounds = getTextBounds(
  node.content || 'X', // placeholder for empty text
  node.fontFamily,
  node.fontSize,
  node.lineHeight,
  node.letterSpacing,
  node.textAlign
);
const worldTopLeft = {
  x: node.transform.position.x + bounds.x * node.transform.scale.x,
  y: node.transform.position.y + (bounds.y + bounds.height) * node.transform.scale.y,
};
const screenPos = camera.worldToScreen(worldTopLeft);
```

The text node's anchor is `(0.5, 0.5)` — its `position` is at the visual center. To find the top-left corner (where the textarea starts), the code adds the bounds offset scaled by the node's scale. In the Y-up world, `bounds.y + bounds.height` gives the ascender position — the visual top of the text.

For empty text nodes (the initial state after creating one), the placeholder `'X'` is used for bounds calculation. Without it, `getTextBounds` would return zero-height bounds, and the textarea would collapse to a single line with no vertical extent.

### Font Matching

The textarea is styled to visually match the text node:

```tsx
<textarea
  style={{
    fontFamily: `"${node.fontFamily}", sans-serif`,
    fontSize: `${node.fontSize * zoom}px`,
    fontWeight: node.fontWeight,
    fontStyle: node.fontStyle,
    textAlign: node.textAlign,
    lineHeight: node.lineHeight,
    letterSpacing: `${node.letterSpacing * zoom}px`,
  }}
/>
```

The `fontSize` and `letterSpacing` are multiplied by the camera zoom level so the text in the textarea scales with the canvas. The font family is quoted and includes a `sans-serif` fallback for robustness. When the user types, they see text that matches the rendered output — the textarea is effectively transparent to the editing experience.

### The Double-Click Focus Steal

The most subtle bug in the text editing system is the double-click focus steal. When the user double-clicks a text node, this sequence of events occurs:

1. First `mousedown` — the Selection tool starts processing.
2. First `mouseup` — the Selection tool selects the node.
3. Second `mousedown` — the Selection tool detects a double-click and enters text edit mode.
4. React mounts the TextEditOverlay and focuses the textarea.
5. Second `mouseup` and `click` events — the browser delivers these to the canvas, which steals focus from the textarea.

The result: the textarea mounts, gains focus, and immediately loses it. The user sees a textarea that appears but is not focused — they cannot type.

The fix has multiple layers:

```typescript
useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;
  el.focus();
  if (node.content) el.select();

  // Re-focus after browser click events settle
  const timer = setTimeout(() => {
    if (el && document.activeElement !== el) {
      el.focus();
      if (node.content) el.select();
    }
  }, 0);
  return () => clearTimeout(timer);
}, [node.content]);
```

The `setTimeout(fn, 0)` defers a re-focus to after the browser has finished delivering the remaining double-click events. If the textarea still is not focused (because the canvas stole it), the timeout re-focuses.

The blur handler has a complementary guard:

```typescript
const handleBlur = useCallback(() => {
  setTimeout(() => {
    if (textareaRef.current && document.activeElement === textareaRef.current) {
      return; // textarea regained focus — don't close
    }
    onCommit(textareaRef.current?.value ?? node.content);
  }, 50);
}, [onCommit, node.content]);
```

When the textarea loses focus, instead of immediately committing, it waits 50 milliseconds and checks whether the textarea has regained focus (from the re-focus timer). If it has, the blur was spurious and should be ignored. If it has not, the user genuinely moved focus elsewhere, and the edit should commit.

### Keyboard Handling

The textarea intercepts keyboard events to prevent them from reaching the tool system:

```typescript
const handleKeyDown = useCallback(
  (e: React.KeyboardEvent) => {
    e.stopPropagation();

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onCommit(textareaRef.current?.value ?? node.content);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  },
  [onCommit, onCancel, node.content]
);
```

`stopPropagation` is critical. Without it, pressing "V" while editing text would switch to the Selection tool, "R" would switch to the Rectangle tool, and "Delete" would delete the node. Enter commits the text (Shift+Enter inserts a newline). Escape cancels the edit, reverting to the previous content.

Pointer events are also stopped — `onPointerDown`, `onPointerMove`, and `onPointerUp` all call `e.stopPropagation()` — so that clicking inside the textarea to reposition the cursor does not trigger the tool system.

## The Rendering Pipeline

The full text rendering pipeline, from node to GPU triangles:

1. **FontManager** retrieves the cached `opentype.Font` for the node's `fontFamily` and `fontWeight`.
2. **`textToSubpaths`** calls `font.stringToGlyphs()` → `glyph.getPath()` → `glyphPathToSubpaths()` for each glyph, scaling and positioning them into a line.
3. **ShapeRenderer** tessellates the resulting `PathPoint[][]` subpaths through the same `tessellateSubpaths` → earcut pipeline as any other path node. The geometry cache key includes the text content, font family, font size, and other properties: `T:${content}:${fontFamily}:${fontSize}:...`
4. **`renderFillsAndStrokes`** draws the tessellated triangles with the node's fill colors or gradients, and generates stroke outlines from the glyph contours.

The cache key ensures that changing any text property — content, font, size, weight, alignment, spacing — invalidates the cached geometry and triggers re-tessellation. Unchanged text reuses the cached vertex buffers.

## Lessons

**Coordinate system boundaries need a single, clear flip.** Font files are Y-down. The editor is Y-up. The flip happens exactly once, inside `glyphPathToSubpaths`, at the point where external data enters the internal system. Every function downstream operates in the editor's native coordinates. If the flip were scattered across multiple locations, it would inevitably be applied twice somewhere or missed entirely.

**Quadratic-to-cubic promotion is lossless.** The 2/3 formula converts a quadratic bezier to a cubic that traces the same curve — no approximation, no sampling, no error. This means TrueType and OpenType fonts render with identical fidelity despite using different curve orders internally.

**Closing point deduplication prevents ghost segments.** Font paths typically end with a Z command after a line or curve back to the start. The last point and the first point coincide. Keeping both would create a zero-length segment that wastes geometry and can cause seam artifacts. Detecting and removing the duplicate, while transferring its incoming handle to the first point, eliminates the problem.

**The focus steal problem is fundamentally about event ordering.** The browser delivers a double-click as mousedown, mouseup, mousedown, mouseup, click, dblclick. Mounting a focused element during the second mousedown means the remaining mouseup and click events target the old focus. The fix is not to prevent the events (they cannot be cancelled retroactively) but to re-establish focus after they have finished firing.

**Two measurement strategies avoid a hard dependency on font loading.** Web-safe fonts (Arial, Helvetica) may never be loaded through opentype.js because the user's system already has them. The Canvas 2D `measureText()` fallback provides accurate bounds without requiring the font binary. This dual path keeps the editor functional even when opentype.js fonts have not yet loaded or fail to load.

## What We Built

This chapter traced the text rendering pipeline from user input to GPU triangles:

- **`TextNode`** carries content, font properties, alignment, spacing, and the standard fills/strokes array. Text renders through the same fill-and-stroke pipeline as every other shape.
- **The TextTool** creates text nodes on click or drag, immediately triggering inline editing via `onEnterTextEdit`. The anchor is `(0.5, 0.5)` for centered rotation.
- **FontManager** is a singleton with weight-aware caching (`family:weight` keys), cascading fallback retrieval (exact weight → regular → any weight → any family), and a hardcoded Google Fonts catalog with static TTF URLs to bypass the WOFF2 limitation.
- **`glyphPathToSubpaths`** converts opentype.js M/L/C/Q/Z commands to the editor's `PathPoint[][]` format, flipping Y coordinates once at the conversion boundary and promoting quadratic beziers to cubic with the 2/3 formula.
- **`textToSubpaths`** lays out glyphs left-to-right with advance widths, kerning, letter spacing, multi-line support, and text alignment. It returns both flattened subpaths (for rendering) and per-glyph groupings (for text-to-path conversion).
- **`textMetrics`** provides fast bounds through opentype.js advance-width summation when the font is loaded, or Canvas 2D `measureText()` as a fallback for system fonts.
- **TextEditOverlay** positions a `<textarea>` over the text node using camera-to-screen projection, matches its font styling, and handles the double-click focus steal with a deferred re-focus and a guarded blur handler.

The next chapter picks up where glyph conversion leaves off — converting live text into editable vector paths, and turning strokes into filled outlines.
