# Canvas Rulers & Guides

## Precision by Default

Freehand drawing is creative. Alignment is professional. The gap between "that looks about right" and "that's exactly 200 pixels from the left edge" is the difference between a sketch and a finished design. Every serious graphic editor provides two alignment primitives: rulers that show coordinates along the canvas edges, and guides — user-placed lines that shapes snap to during movement.

This chapter builds both. The rulers are adaptive — their tick marks adjust spacing as the user zooms in and out, always showing useful intervals without cluttering the display. The guides are interactive — drag from a ruler to create one, drag it to reposition, drag it back onto the ruler to delete it. And the guide snapping integrates directly into the Selection Tool, checking all five edges of a shape (left, right, top, bottom, center) against every guide, with guide snap taking priority over grid snap when the guide is closer. The result is a precision alignment system that feels invisible when you don't need it and indispensable when you do.

## The Guide Type

A guide is a world-space line along one axis:

```typescript
export interface Guide {
  id: string;
  axis: 'x' | 'y'; // 'x' = vertical line at x, 'y' = horizontal line at y
  position: number; // world coordinate
}
```

The naming convention can be confusing. A guide with `axis: 'x'` is a _vertical_ line — it's positioned along the X axis, but the line itself runs vertically across the full canvas height. A guide with `axis: 'y'` is a _horizontal_ line. The convention matches how you'd describe the coordinate: "a guide at x = 200" is a vertical line.

Guides live in the Zustand store as a simple array with CRUD operations:

```typescript
// State
guides: Guide[];
showGuides: boolean;
snapToGuides: boolean;

// Actions
addGuide: (axis: 'x' | 'y', position: number) => {
  const id = `guide-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  set((state) => ({ guides: [...state.guides, { id, axis, position }] }));
},
removeGuide: (id: string) =>
  set((state) => ({ guides: state.guides.filter((g) => g.id !== id) })),
updateGuidePosition: (id: string, position: number) =>
  set((state) => ({
    guides: state.guides.map((g) => (g.id === id ? { ...g, position } : g)),
  })),
clearGuides: () => set({ guides: [] }),
toggleShowGuides: () => set((state) => ({ showGuides: !state.showGuides })),
toggleSnapToGuides: () => set((state) => ({ snapToGuides: !state.snapToGuides })),
```

The ID generation uses `Date.now()` plus a random suffix. Guides don't need globally unique IDs — they exist only within one project and are never referenced by other data structures. A timestamp-based ID is sufficient and debuggable: seeing `guide-1708234567890-a3f7k` in the store tells you when it was created.

The `showGuides` and `snapToGuides` booleans are independent. A user might want to see guides for reference without snapping to them, or snap to guides without the visual distraction. Both default to `true` — guides are useful and visible by default.

## The Rulers: Adaptive Tick Marks

The `CanvasRuler` component renders horizontal and vertical rulers along the canvas edges. It borrows the adaptive spacing algorithm from the grid renderer (Chapter 8): tick marks adjust their world-space interval so that the screen-space distance between major ticks stays between 50 and 200 pixels, regardless of zoom level.

### Adaptive Spacing

```typescript
const MIN_SCREEN_SPACING = 50;
const MAX_SCREEN_SPACING = 200;
const BASE_SPACING = 100;

function calculateAdaptiveSpacing(zoom: number): number {
  let spacing = BASE_SPACING;
  while (spacing * zoom < MIN_SCREEN_SPACING) spacing *= 2;
  while (spacing * zoom > MAX_SCREEN_SPACING) spacing /= 2;
  return spacing;
}
```

At zoom 1.0, the major spacing is 100 world units — one tick per 100 pixels. Zoom in to 4x, and the ticks are 400 screen pixels apart, which is too sparse. The algorithm doubles the spacing until it fits the range: 100 → 50 → 25 world units. At 25 world units × 4x zoom = 100 screen pixels between major ticks — comfortable and readable. Zoom out to 0.1x, and it goes the other way: 100 → 200 → 400 → 800 world units per tick.

Minor ticks subdivide each major interval by five. At zoom 1.0, major ticks are every 100 units and minor ticks every 20 units. This gives the ruler a visual rhythm without overwhelming the display.

### Generating Ticks

The tick generator converts world-space intervals to screen-space positions:

```typescript
function generateTicks(camera: Camera, viewportSize: number, axis: 'x' | 'y'): TickMark[] {
  const zoom = camera.zoom;
  const majorSpacing = calculateAdaptiveSpacing(zoom);
  const minorSpacing = majorSpacing / 5;

  const ticks: TickMark[] = [];

  // Get world bounds for this axis
  const startWorld = camera.screenToWorld({ x: 0, y: viewportSize });
  const endWorld = camera.screenToWorld({ x: viewportSize, y: 0 });

  const worldMin = axis === 'x' ? startWorld.x : startWorld.y;
  const worldMax = axis === 'x' ? endWorld.x : endWorld.y;

  // Generate minor ticks
  const firstMinor = Math.floor(worldMin / minorSpacing) * minorSpacing;
  for (let w = firstMinor; w <= worldMax; w += minorSpacing) {
    const screenPt = camera.worldToScreen(axis === 'x' ? { x: w, y: 0 } : { x: 0, y: w });
    const screenPos = axis === 'x' ? screenPt.x : screenPt.y;

    if (screenPos < -10 || screenPos > viewportSize + 10) continue;

    const isMajor = Math.abs(w % majorSpacing) < minorSpacing * 0.1;
    ticks.push({ screenPos, worldValue: w, isMajor });
  }

  return ticks;
}
```

The `isMajor` check uses a tolerance (`minorSpacing * 0.1`) instead of exact equality. Floating-point accumulation means `w` might be `99.99999999` instead of `100.0` after many additions. The tolerance catches these near-misses, ensuring major ticks always appear at the expected intervals.

The 10-pixel overshoot range (`screenPos < -10 || screenPos > viewportSize + 10`) allows ticks near the viewport edge to render their labels without clipping abruptly at the boundary.

### The Ruler Component

The component renders two positioned `div` strips with memoized tick arrays:

```typescript
export const RULER_SIZE = 20;

export function CanvasRuler({
  camera,
  viewportWidth,
  viewportHeight,
  cameraVersion,
  canvasRef: externalCanvasRef,
  onGuideDragStart,
  onGuideDrag,
  onGuideDragEnd,
}: CanvasRulerProps) {
  const hTicks = useMemo(
    () => (camera ? generateTicks(camera, viewportWidth, 'x') : []),
    [camera, viewportWidth, cameraVersion]
  );

  const vTicks = useMemo(
    () => (camera ? generateTicks(camera, viewportHeight, 'y') : []),
    [camera, viewportHeight, cameraVersion]
  );
```

The `cameraVersion` prop is a counter that increments on every camera change (zoom or pan). Including it in the `useMemo` dependencies forces tick recalculation when the camera moves. Without it, React wouldn't know the ticks are stale because the `camera` object reference doesn't change — its internal state mutates in place.

Each tick renders as a positioned `div` with conditional label text:

```typescript
<div
  className={styles.hRuler}
  style={{ height: RULER_SIZE, left: RULER_SIZE }}
  data-testid="canvas-ruler-h"
  onPointerDown={handleHRulerPointerDown}
>
  {hTicks.map((tick, i) => (
    <div
      key={i}
      className={tick.isMajor ? styles.majorTick : styles.minorTick}
      style={{ left: tick.screenPos - RULER_SIZE }}
    >
      {tick.isMajor && (
        <span className={styles.tickLabel}>
          {formatValue(tick.worldValue)}
        </span>
      )}
    </div>
  ))}
</div>
```

Major ticks are 10 pixels tall with a numeric label. Minor ticks are 5 pixels tall with no label. The labels use a monospace font at 8px — small enough to fit between ticks, readable enough to show coordinates. The `formatValue` helper strips unnecessary decimals: `100` stays `100`, `100.0` becomes `100`, `100.5` stays `100.5`, and values near zero become `0`.

The vertical ruler uses `writing-mode: vertical-rl` with `transform: rotate(180deg)` for its labels. This renders the text reading bottom-to-top along the left edge, matching the convention of professional graphic editors.

### The Corner Square

Where the horizontal and vertical rulers meet — the top-left corner of the canvas — a small square fills the gap:

```typescript
<div
  className={styles.corner}
  style={{ width: RULER_SIZE, height: RULER_SIZE }}
/>
```

The corner square has `pointer-events: none` and uses the same background color as the rulers. It's a cosmetic element, but without it, the grid lines bleed through the gap between the two rulers.

## Dragging Guides from Rulers

The rulers are interactive. Dragging from the horizontal ruler creates a horizontal guide; dragging from the vertical ruler creates a vertical guide. The cursor changes to `row-resize` (horizontal) or `col-resize` (vertical) to hint at the drag direction.

### The Pointer Capture Pattern

The drag interaction uses the same pointer capture pattern as the selection tool: capture the pointer on `pointerDown`, track movement on `pointermove`, commit on `pointerup`:

```typescript
const handleHRulerPointerDown = useCallback(
  (e: React.PointerEvent) => {
    if (!cameraRef.current) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const rulerRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    onGuideDragStart?.('y');

    const onMove = (ev: PointerEvent) => {
      if (!cameraRef.current) return;
      const screen = toCanvasScreen(ev.clientX, ev.clientY);
      const worldPos = cameraRef.current.screenToWorld(screen);
      onGuideDragRef.current?.('y', worldPos.y);
    };

    const onUp = (ev: PointerEvent) => {
      if (!cameraRef.current) return;
      const screen = toCanvasScreen(ev.clientX, ev.clientY);
      const worldPos = cameraRef.current.screenToWorld(screen);
      // Only create guide if pointer is below the ruler area
      if (ev.clientY > rulerRect.bottom) {
        onGuideDragEndRef.current?.('y', worldPos.y);
      } else {
        // Cancelled — dragged back onto ruler
        onGuideDragEndRef.current?.('y', NaN);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  },
  [onGuideDragStart, toCanvasScreen]
);
```

Note the axis inversion: dragging from the _horizontal_ ruler (the top edge) creates a guide on the _Y axis_. The user drags downward from the top ruler, pulling a horizontal line into position. The guide's position is the Y coordinate where the user drops it. Similarly, dragging from the vertical ruler creates an X-axis guide.

### The "Drag Back to Delete" Pattern

The `rulerRect` captured at `pointerDown` is compared against the final pointer position at `pointerUp`. If the user drags a guide back above the horizontal ruler (or left of the vertical ruler), the guide is cancelled. The callback receives `NaN` as the position, which the canvas handler interprets as "don't create":

```typescript
onGuideDragEnd={(axis, worldPosition) => {
  setGuideDragPreview(null);
  if (!isNaN(worldPosition)) {
    addGuide(axis, worldPosition);
  }
}}
```

This same pattern works for repositioning existing guides — dragging an existing guide back onto the ruler area removes it, matching Figma's behavior.

### Converting Browser Coordinates

The ruler receives `clientX`/`clientY` from the browser (relative to the viewport), but the camera needs screen coordinates relative to the WebGL canvas. The `toCanvasScreen` helper handles the conversion:

```typescript
const toCanvasScreen = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
  const canvas = canvasElRef.current?.current;
  if (canvas) {
    const rect = canvas.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }
  return { x: clientX, y: clientY };
}, []);
```

The canvas element's bounding rect provides the offset. This is important because the rulers themselves occupy 20 pixels of space — the canvas doesn't start at the window origin. Without this conversion, guides would be offset by 20 pixels from where the user intended.

## The Guide Overlay

Guides render as an SVG overlay positioned over the canvas. Each guide is a pair of SVG `<line>` elements — an invisible wide line for hit testing, and a visible thin line for display:

```typescript
export function GuideOverlay({
  guides,
  camera,
  viewportWidth,
  viewportHeight,
  cameraVersion,
  dragPreview,
  onRemoveGuide,
  onUpdateGuidePosition,
}: GuideOverlayProps) {
```

### World-to-Screen Conversion

Guides are stored in world coordinates but rendered in screen coordinates. The component memoizes the conversion:

```typescript
const guideLines = useMemo(() => {
  if (!camera) return [];
  return guides.map((g) => {
    if (g.axis === 'x') {
      const screenPt = camera.worldToScreen({ x: g.position, y: 0 });
      return { ...g, screenPos: screenPt.x };
    } else {
      const screenPt = camera.worldToScreen({ x: 0, y: g.position });
      return { ...g, screenPos: screenPt.y };
    }
  });
}, [guides, camera, cameraVersion]);
```

When the camera pans or zooms, `cameraVersion` changes, and the screen positions recalculate. The guides stay at their world-space positions, but their visual positions slide across the screen to follow the camera.

### The Double-Line Pattern

Each guide renders two SVG lines at the same position:

```typescript
{g.axis === 'x' && (
  <g key={g.id}>
    {/* Invisible hit area */}
    <line
      x1={g.screenPos} y1={0}
      x2={g.screenPos} y2={viewportHeight}
      stroke="transparent"
      strokeWidth={GUIDE_HIT_WIDTH}
      style={{ pointerEvents: 'stroke', cursor: 'col-resize' }}
      onPointerDown={(e) => handleGuidePointerDown(e, g)}
    />
    {/* Visible guide line */}
    <line
      x1={g.screenPos} y1={0}
      x2={g.screenPos} y2={viewportHeight}
      stroke={GUIDE_COLOR}
      strokeWidth={isSelected || isDragging ? 2 : GUIDE_STROKE_WIDTH}
      opacity={isDragging ? 0.7 : 1}
      style={{ pointerEvents: 'none' }}
    />
  </g>
)}
```

The invisible line has `strokeWidth={8}` — an 8-pixel hit area that makes the 1-pixel guide easy to click. The visible line has `pointerEvents: 'none'` so it doesn't interfere with the hit area. The hit-area line has `stroke="transparent"` so it's invisible, and `pointerEvents: 'stroke'` so only the stroke (not the fill) responds to clicks.

The `GUIDE_COLOR` is cyan (`#00D4FF`) — a color chosen for high contrast against the dark canvas background. Selected or dragged guides thicken to 2 pixels for visual feedback.

### Selecting and Repositioning Guides

Clicking a guide selects it. Dragging a selected guide repositions it. Dragging it back onto the ruler area removes it:

```typescript
const handleGuidePointerDown = useCallback(
  (e: React.PointerEvent, guide: Guide) => {
    e.stopPropagation();
    setSelectedGuideId(guide.id);
    setDraggingGuideId(guide.id);

    const onMove = (ev: PointerEvent) => {
      if (!cameraRef.current) return;
      const screen = toCanvasScreen(ev.clientX, ev.clientY);
      if (guide.axis === 'x') {
        const worldPos = cameraRef.current.screenToWorld(screen);
        onUpdateGuidePositionRef.current(guide.id, worldPos.x);
      } else {
        const worldPos = cameraRef.current.screenToWorld(screen);
        onUpdateGuidePositionRef.current(guide.id, worldPos.y);
      }
    };

    const onUp = (ev: PointerEvent) => {
      setDraggingGuideId(null);
      const screen = toCanvasScreen(ev.clientX, ev.clientY);
      // If dragged back onto ruler area, remove the guide
      if (guide.axis === 'x' && screen.x <= 0) {
        onRemoveGuideRef.current(guide.id);
        setSelectedGuideId(null);
      } else if (guide.axis === 'y' && screen.y <= 0) {
        onRemoveGuideRef.current(guide.id);
        setSelectedGuideId(null);
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  },
  [toCanvasScreen]
);
```

The "drag back to ruler" detection uses canvas-local coordinates: `screen.x <= 0` means the pointer is to the left of the canvas area, which is where the vertical ruler sits. `screen.y <= 0` means above the canvas, where the horizontal ruler sits. The ruler is 20 pixels wide, but checking against zero works because the canvas-local coordinate system already accounts for the ruler offset.

### Deleting with the Keyboard

A selected guide can be deleted with the Delete or Backspace key:

```typescript
useEffect(() => {
  if (!selectedGuideId) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRemoveGuideRef.current(selectedGuideId);
      setSelectedGuideId(null);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedGuideId]);
```

The listener only attaches when a guide is selected (`if (!selectedGuideId) return`). This prevents the guide overlay from intercepting Delete keypresses intended for shape deletion. When no guide is selected, the canvas handler receives Delete events normally.

### The Drag Preview

While the user is dragging from a ruler — before they release to create a guide — a semi-transparent preview line follows the cursor:

```typescript
const previewLine = useMemo(() => {
  if (!camera || !dragPreview || isNaN(dragPreview.worldPosition)) return null;
  if (dragPreview.axis === 'x') {
    const screenPt = camera.worldToScreen({ x: dragPreview.worldPosition, y: 0 });
    return { axis: dragPreview.axis, screenPos: screenPt.x };
  } else {
    const screenPt = camera.worldToScreen({ x: 0, y: dragPreview.worldPosition });
    return { axis: dragPreview.axis, screenPos: screenPt.y };
  }
}, [camera, dragPreview, cameraVersion]);
```

The preview renders at half opacity, giving immediate visual feedback of where the guide will land. If the drag is cancelled (NaN position), the preview doesn't render.

## Guide Snapping in the Selection Tool

The guide system's real value is snapping. When the user moves a shape, the Selection Tool checks whether any of the shape's edges are close to a guide. If so, the shape snaps to the guide position.

### The Snap Function

The snap function takes an array of edge values and finds the closest guide:

```typescript
private snapToGuide(
  edgeValues: number[],
  axis: 'x' | 'y'
): number | null {
  if (!this.context.getSnapToGuides?.()) return null;
  const guides = this.context.getGuides?.() ?? [];
  const threshold = 5 / this.context.camera.zoom;
  let bestOffset: number | null = null;
  let bestDist = threshold;
  for (const g of guides) {
    if (g.axis !== axis) continue;
    for (const val of edgeValues) {
      const dist = Math.abs(val - g.position);
      if (dist < bestDist) {
        bestDist = dist;
        bestOffset = g.position - val;
      }
    }
  }
  return bestOffset;
}
```

The threshold is `5 / camera.zoom` — 5 screen pixels converted to world units. At zoom 1.0, the snap threshold is 5 world units. At zoom 2.0, it's 2.5 world units. At zoom 0.5, it's 10 world units. This makes snapping feel consistent at any zoom level: the guide "pulls" shapes from the same visual distance on screen.

The function returns an _offset_, not a position. This is the delta to add to the shape's current position to align it with the guide. Returning `null` means no guide was close enough.

### Edge-Based Snapping

The `snapNodePosition` function checks all five logical edges of a shape — left, right, top, bottom, and center:

```typescript
private snapNodePosition(
  node: Node,
  centerPos: Vector2
): Vector2 {
  const gridEnabled = this.context.getSnapToGrid?.() ?? false;
  const guideEnabled = this.context.getSnapToGuides?.() ?? false;
  if (!gridEnabled && !guideEnabled) return centerPos;

  const size = this.getNodeBoundsSize(node);
  const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };

  // Compute edges in world space (Y-up)
  const left = centerPos.x - size.width * anchor.x;
  const right = left + size.width;
  const bottom = centerPos.y - size.height * anchor.y;
  const top = bottom + size.height;

  let dx = 0;
  let dy = 0;

  // Try guide snap first (checks all edges)
  const guideSnapX = guideEnabled
    ? this.snapToGuide([left, right, centerPos.x], 'x')
    : null;
  const guideSnapY = guideEnabled
    ? this.snapToGuide([top, bottom, centerPos.y], 'y')
    : null;

  if (guideSnapX != null) {
    dx = guideSnapX;
  } else if (gridEnabled) {
    const visualTopLeft = { x: left, y: top };
    const snappedTL = this.snapPosition(visualTopLeft);
    dx = snappedTL.x - left;
  }

  if (guideSnapY != null) {
    dy = guideSnapY;
  } else if (gridEnabled) {
    const visualTopLeft = { x: left, y: top };
    const snappedTL = this.snapPosition(visualTopLeft);
    dy = snappedTL.y - top;
  }

  return { x: centerPos.x + dx, y: centerPos.y + dy };
}
```

The edge array `[left, right, centerPos.x]` for the X axis means the guide checks against the shape's left edge, right edge, and center. If the left edge is 3 world units from a guide and the center is 50 units away, the left edge wins. The shape snaps so its left edge aligns with the guide.

The priority system — guide snap first, grid snap as fallback — is the key design decision. Guide snap and grid snap are independent per axis. The X axis might snap to a guide while the Y axis snaps to the grid. Each axis uses the best available alignment.

### The ToolContext Bridge

The Selection Tool accesses guides through the `ToolContext` interface:

```typescript
export interface ToolContext {
  // ... other fields
  getGuides?: () => { id: string; axis: 'x' | 'y'; position: number }[];
  getSnapToGuides?: () => boolean;
}
```

The optional chaining (`getGuides?.()`) means the function gracefully handles tool contexts that don't provide guide access — like in unit tests where mocking guides isn't relevant. The default is an empty array and snapping disabled, so tests that don't care about guides don't need to mock them.

The Canvas component wires the store values into the tool context:

```typescript
getGuides: () => useEditorStore.getState().guides,
getSnapToGuides: () => useEditorStore.getState().snapToGuides,
```

Using `getState()` instead of a reactive subscription is correct here. The tool context callbacks are called imperatively during drag operations — they need the current value at the moment of the call, not a React-render-cycle-old value.

## Wiring It Together

The Canvas component mounts both the rulers and the guide overlay, managing the drag preview state between them:

```typescript
const [guideDragPreview, setGuideDragPreview] = useState<{
  axis: 'x' | 'y';
  worldPosition: number;
} | null>(null);

// ...

{showGuides && (
  <GuideOverlay
    guides={guides}
    camera={cameraRef.current}
    viewportWidth={viewportSize.width}
    viewportHeight={viewportSize.height}
    cameraVersion={cameraVersion}
    dragPreview={guideDragPreview}
    canvasRef={canvasRef}
    onRemoveGuide={removeGuide}
    onUpdateGuidePosition={updateGuidePosition}
  />
)}
{showRulers && (
  <CanvasRuler
    camera={cameraRef.current}
    viewportWidth={viewportSize.width}
    viewportHeight={viewportSize.height}
    cameraVersion={cameraVersion}
    canvasRef={canvasRef}
    onGuideDrag={(axis, worldPosition) =>
      setGuideDragPreview({ axis, worldPosition })
    }
    onGuideDragEnd={(axis, worldPosition) => {
      setGuideDragPreview(null);
      if (!isNaN(worldPosition)) {
        addGuide(axis, worldPosition);
      }
    }}
  />
)}
```

The data flow is clean: the ruler emits drag events, the canvas manages preview state, and the guide overlay renders the preview. The ruler doesn't know about guides. The guide overlay doesn't know about rulers. The canvas coordinates between them.

The `showRulers` and `showGuides` toggles control visibility independently. Rulers can be hidden while guides remain visible (and snappable). Both are toggled from the View menu and keyboard shortcuts: Shift+R for rulers, Shift+G for guides.

## Project Serialization

Guides persist across save and load. The project serializer includes them in the settings block:

```typescript
settings: {
  timelineDuration: number;
  frameRate: number;
  autoKeyframe: boolean;
  onionSkin: OnionSkinSettings;
  guides?: Guide[];
}
```

The optional `?` means old project files (v1, v2 without guides) load without error — the guides array defaults to empty. New saves always include guides, even if the array is empty (for clarity over implicit defaults).

The View menu provides three guide-related commands:

- **Show Guides** (Shift+G): toggle guide visibility
- **Snap to Guides**: toggle whether shapes snap to guides during movement
- **Clear All Guides**: remove every guide from the project

## Styling the Rulers

The CSS uses absolute positioning to lock the rulers to the canvas edges:

```css
.hRuler {
  position: absolute;
  top: 0;
  right: 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-border-subtle);
  z-index: 8;
  cursor: row-resize;
  user-select: none;
}

.vRuler {
  position: absolute;
  left: 0;
  bottom: 0;
  overflow: hidden;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border-subtle);
  z-index: 8;
  cursor: col-resize;
  user-select: none;
}
```

The `cursor: row-resize` on the horizontal ruler and `cursor: col-resize` on the vertical ruler hint that dragging creates a guide. The `user-select: none` prevents text selection during drag. The `overflow: hidden` clips tick marks that extend past the ruler boundaries.

The z-index is 8 — above the canvas (no z-index) but below the selection overlay, context menus, and modals. The guide overlay uses z-index 7, placing it between the canvas content and the rulers. This ordering ensures guides render behind the ruler edges, and the rulers render behind UI overlays.

## Testing the Rulers

Ruler tests verify rendering, adaptive behavior, and drag callbacks:

```typescript
describe('CanvasRuler', () => {
  it('renders horizontal and vertical rulers', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    render(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
      />
    );
    expect(screen.getByTestId('canvas-ruler-h')).toBeTruthy();
    expect(screen.getByTestId('canvas-ruler-v')).toBeTruthy();
  });

  it('renders tick marks that adapt to zoom', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const { rerender } = render(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
      />
    );
    const hRuler1 = screen.getByTestId('canvas-ruler-h');
    expect(hRuler1.children.length).toBeGreaterThan(0);

    // Zoom in and rerender
    camera.zoom = 2.0;
    rerender(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={1}
      />
    );
    const hRuler2 = screen.getByTestId('canvas-ruler-h');
    expect(hRuler2.children.length).toBeGreaterThan(0);
  });

  it('calls onGuideDragStart on horizontal ruler pointerDown', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const onGuideDragStart = vi.fn();
    render(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        onGuideDragStart={onGuideDragStart}
      />
    );
    const hRuler = screen.getByTestId('canvas-ruler-h');
    hRuler.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hRuler, {
      clientX: 100,
      clientY: 10,
      pointerId: 1,
    });
    // Horizontal ruler drags create Y-axis guides
    expect(onGuideDragStart).toHaveBeenCalledWith('y');
  });

  it('renders nothing when camera is null', () => {
    render(
      <CanvasRuler
        camera={null}
        viewportWidth={800}
        viewportHeight={600}
      />
    );
    const hRuler = screen.getByTestId('canvas-ruler-h');
    expect(hRuler.children.length).toBe(0);
  });
});
```

The `setPointerCapture = vi.fn()` mock is necessary because JSDOM doesn't implement the Pointer Events API. Without it, the pointer-down handler crashes on `(e.target as HTMLElement).setPointerCapture(e.pointerId)`.

Guide overlay tests verify SVG line rendering and the double-line hit area pattern:

```typescript
describe('GuideOverlay', () => {
  it('renders two lines per guide (hit area + visible)', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const guides = [
      { id: 'g1', axis: 'x' as const, position: 100 },
    ];

    const { container } = render(
      <GuideOverlay
        guides={guides}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(2);
  });

  it('does not render preview when position is NaN', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);

    const { container } = render(
      <GuideOverlay
        guides={[]}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={{ axis: 'y', worldPosition: NaN }}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(0);
  });
});
```

The NaN preview test verifies the "drag back onto ruler" cancellation — when the ruler sends NaN, the preview disappears and no guide is created.

## Lessons

**Rulers and guides serve different cognitive needs.** Rulers provide continuous spatial awareness — "where am I?" Guides provide anchored reference points — "where should this go?" Both are necessary. Rulers without guides give you coordinates but no alignment targets. Guides without rulers give you snap points but no spatial context. Building them together ensures the coordinate systems align.

**The axis naming is counterintuitive, so be explicit.** A guide with `axis: 'x'` is a vertical line. This confuses everyone on first encounter, including the person who wrote it. The convention — "axis names the coordinate the guide lives on, not the direction the line runs" — is standard in graphic editors, but the code should use comments and variable names that make the mapping clear.

**Adaptive spacing is the same algorithm everywhere.** The ruler's `calculateAdaptiveSpacing` is identical to the grid's: double or halve the base interval until the screen-space distance falls in a comfortable range. Using the same algorithm in both places ensures the ruler ticks align with the grid lines, preventing visual inconsistency at any zoom level.

**Guide snap beats grid snap when closer, but they don't compete per-axis.** The X axis might snap to a guide while the Y axis snaps to the grid. This independence feels natural — the user placed a guide at x=200 and enabled the grid, so the shape aligns to x=200 horizontally and the nearest grid line vertically. Making them compete (guide wins everywhere or grid wins everywhere) would be less useful.

**The double-line SVG pattern makes thin lines clickable.** A 1-pixel line is almost impossible to click reliably. An 8-pixel transparent line on top of a 1-pixel visible line gives the user a generous hit area while keeping the visual clean. The visible line uses `pointerEvents: 'none'` so it doesn't interfere. This pattern applies to any interactive thin line — graph editor curves, connection wires, path outlines.

**Use NaN as a cancellation signal in coordinate callbacks.** When the user drags a guide back onto the ruler, the handler sends `NaN` as the position. The consumer checks `isNaN(worldPosition)` and skips creation. This is cleaner than a separate "cancelled" boolean parameter or a nullable type — NaN is already the natural "invalid coordinate" value in JavaScript, and `isNaN` is a single, readable check.

## What We Built

This chapter covered canvas rulers and guides — the precision alignment tools that turn approximate placement into exact positioning:

- **`CanvasRuler`** renders horizontal and vertical rulers with adaptive tick marks that adjust spacing as the user zooms, using the same `calculateAdaptiveSpacing` algorithm as the grid. Major ticks show world-coordinate labels in monospace font; minor ticks subdivide by five.
- **Guide creation** works by dragging from a ruler: horizontal ruler creates Y-axis (horizontal) guides, vertical ruler creates X-axis (vertical) guides. Dragging back onto the ruler cancels creation via NaN position signaling.
- **`GuideOverlay`** renders guides as cyan SVG lines with 8-pixel transparent hit areas for reliable click targeting. Guides can be selected (click), repositioned (drag), and deleted (Delete key or drag back to ruler).
- **Guide snapping** in the Selection Tool checks all five edges of a shape (left, right, top, bottom, center) against every guide, with a zoom-aware threshold of 5 screen pixels. Guide snap takes priority over grid snap when closer, independently per axis.
- **`Guide` type** stores axis and world-space position in the Zustand store, with CRUD actions (add, remove, update, clear) and independent `showGuides`/`snapToGuides` toggles.
- **Project serialization** includes guides in the settings block, with graceful degradation for older project files that lack the field.
- **`cameraVersion`** counter forces `useMemo` recalculation when the camera pans or zooms, since the camera object mutates in place without changing its reference.

The next chapter covers context menus and clipboard operations — the right-click menus that expose editing commands on the canvas, layers, and timeline, plus the copy-paste system that handles both internal node duplication and external SVG/image import from the system clipboard.
