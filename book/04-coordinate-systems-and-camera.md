# Coordinate Systems & Camera

## Getting the Math Right So Everything Else Falls Into Place

A user clicks at pixel (523, 347) on the screen. Where is that in the document? It depends on three things: where the camera is pointing, how far in the user has zoomed, and how the canvas element is sized in the browser window. Get this conversion wrong and everything downstream breaks — shapes draw in the wrong place, hit testing misses, selection rectangles drift, rulers show incorrect values.

This chapter builds the Camera class, which manages the mapping between three coordinate spaces. It's only 370 lines of code, but it touches every other system in the editor. If the scene graph is the heart of the application, the camera is its eyes.

## Three Coordinate Spaces

Every graphic editor works with at least three coordinate systems. Understanding what each one means — and when to convert between them — is the foundation of every interaction in the editor.

### Screen Space

Screen space is measured in CSS pixels from the top-left corner of the canvas element. When the browser fires a `PointerEvent`, `clientX` and `clientY` are in viewport pixels. We subtract the canvas element's `getBoundingClientRect()` offset to get canvas-local screen coordinates:

```
Screen space:
(0, 0) ──────────────────► X
  │
  │   Canvas element
  │   (pixels from top-left)
  │
  ▼ Y
```

Screen Y increases downward. This is the native coordinate system of browsers, CSS, and DOM events.

### World Space

World space is the coordinate system of the document. It's infinite in all directions and has no inherent pixel resolution. A rectangle at position (100, 200) is always at (100, 200) in world space regardless of zoom level or camera position.

```
World space:
        ▲ Y
        │
        │
        │
────────┼────────► X
        │
        │
```

We use Y-up world coordinates — positive Y points up, like mathematical convention. This is the opposite of screen space. The choice matters for two reasons:

1. **SVG interop.** SVG uses Y-down coordinates. When importing SVG or exporting to SVG, you need a Y-flip. If your world space is also Y-down, the flip is invisible and you won't notice when it's missing — until a user reports that their imported SVG is upside down. With Y-up world space, the Y-flip is explicit and obvious in the code.

2. **Mathematical convention.** Angles, rotations, and trigonometric functions assume Y-up. A positive rotation goes counterclockwise. `atan2(y, x)` produces angles that increase upward. If you use Y-down world space, half your angle math needs sign flips, and you'll spend weeks debugging rotation-related bugs.

The cost is a single Y-flip when converting between screen and world coordinates. We pay that cost in exactly one place — the Camera class — rather than scattering sign corrections throughout the codebase.

### Local Space

Local space is relative to a node's parent. A rectangle at local position (50, 30) inside a group at world position (100, 200) has its top-left at roughly world position (150, 230) — though rotation and scale make the actual math more complex.

Local-to-world conversion is handled by the scene graph's `getWorldTransform()` method, which we covered in Chapter 3. The camera doesn't know about local space — it only converts between screen and world.

## The Camera Class

The camera stores three properties and maintains four cached matrices:

```typescript
export class Camera {
  private _position: Vector2 = { x: 0, y: 0 };
  private _zoom: number = 1;
  private _rotation: number = 0;

  private _viewportWidth: number = 800;
  private _viewportHeight: number = 600;

  // Cached matrices
  private _viewMatrix: Matrix3 | null = null;
  private _projectionMatrix: Matrix3 | null = null;
  private _viewProjectionMatrix: Matrix3 | null = null;
  private _inverseViewProjectionMatrix: Matrix3 | null = null;
}
```

**`position`** is the world-space point the camera is centered on. At position (0, 0), the center of the screen shows the world origin. Moving the camera position to (100, 50) shifts the view so that world point (100, 50) appears at the screen center.

**`zoom`** is the scale factor. At zoom 1, one world unit equals one screen pixel. At zoom 2, one world unit equals two screen pixels (everything looks bigger). At zoom 0.5, one world unit equals half a pixel (everything looks smaller, you see more of the document). Zoom is clamped between a configurable minimum and maximum:

```typescript
set zoom(value: number) {
  this._zoom = clamp(value, this.config.minZoom, this.config.maxZoom);
  this.invalidateMatrices();
  this.emit('zoomChange');
  this.emit('change');
}
```

The default range is 0.1 (10%) to 32 (3200%), which matches Figma's range. Below 10%, individual pixels are invisible and the document becomes unusable. Above 3200%, floating-point precision starts causing visual artifacts in rendering.

**`rotation`** allows rotating the camera view. We rarely use this in a 2D editor, but it's cheap to support and some workflows (drawing at an angle, like tilting paper) benefit from it.

### Property Access Pattern

Camera properties use TypeScript getters and setters:

```typescript
get position(): Vector2 {
  return { ...this._position };
}

set position(value: Vector2) {
  this._position = { ...value };
  this.invalidateMatrices();
  this.emit('panChange');
  this.emit('change');
}
```

The getter returns a copy (`{ ...this._position }`). Without the spread, external code could do `camera.position.x = 100` and mutate the internal state without triggering cache invalidation or events. The setter spreads the input for the same reason — we don't want the camera holding a reference to an external object that might change later.

This defensive copying adds a tiny overhead (object allocation) but prevents an entire class of mutation bugs. We learned this after debugging a case where a tool stored `const pos = camera.position` and later modified `pos.x`, inadvertently moving the camera without events firing.

## The View-Projection Pipeline

Converting between screen and world coordinates uses the same matrix pipeline that 3D graphics engines use, simplified for 2D. The pipeline has three stages:

```
World Space ──[View Matrix]──► Camera Space ──[Projection Matrix]──► NDC
```

**NDC** (Normalized Device Coordinates) is a -1 to +1 range on both axes, with (0, 0) at the center. This is the coordinate system that WebGL's vertex shader outputs to.

### The View Matrix

The view matrix positions the world relative to the camera. It translates by the negative camera position (moving the world so the camera is at the origin) and optionally rotates:

```typescript
getViewMatrix(): Matrix3 {
  if (!this._viewMatrix) {
    let m = mat3.identity();
    m = mat3.translate(m, -this._position.x, -this._position.y);

    if (this._rotation !== 0) {
      const rad = (-this._rotation * Math.PI) / 180;
      m = mat3.rotate(m, rad);
    }

    this._viewMatrix = m;
  }
  return this._viewMatrix;
}
```

If the camera is at position (100, 50), the view matrix translates by (-100, -50). This moves the world so that the point (100, 50) — what the camera is looking at — ends up at the origin.

### The Projection Matrix

The projection matrix maps from world units to NDC. For a 2D editor, this is an orthographic projection — no perspective, no vanishing points. Objects at the "back" are the same size as objects at the "front":

```typescript
getProjectionMatrix(): Matrix3 {
  if (!this._projectionMatrix) {
    const halfWidth = this._viewportWidth / 2 / this._zoom;
    const halfHeight = this._viewportHeight / 2 / this._zoom;

    this._projectionMatrix = {
      a: 1 / halfWidth,
      b: 0,
      c: 0,
      d: 1 / halfHeight,
      tx: 0,
      ty: 0,
    };
  }
  return this._projectionMatrix;
}
```

This creates a scaling matrix. If the viewport is 800x600 pixels at zoom 1, `halfWidth` is 400. A world point at x=400 maps to NDC x=1 (the right edge of the screen). At zoom 2, `halfWidth` is 200, so a world point at x=200 reaches the right edge — the visible area has shrunk, making everything appear larger.

### Combined View-Projection

The view-projection matrix is the product of projection and view matrices:

```typescript
getViewProjectionMatrix(): Matrix3 {
  if (!this._viewProjectionMatrix) {
    this._viewProjectionMatrix = mat3.multiply(
      this.getProjectionMatrix(),
      this.getViewMatrix()
    );
  }
  return this._viewProjectionMatrix;
}
```

This single matrix goes directly into the WebGL vertex shader as a uniform. Every vertex in every shape is multiplied by this matrix to transform from world space to clip space. One matrix multiply per vertex, computed once per frame.

### The Inverse

Converting from screen to world requires the inverse of the view-projection matrix:

```typescript
getInverseViewProjectionMatrix(): Matrix3 | null {
  if (!this._inverseViewProjectionMatrix) {
    this._inverseViewProjectionMatrix = mat3.invert(
      this.getViewProjectionMatrix()
    );
  }
  return this._inverseViewProjectionMatrix;
}
```

The inverse can be `null` if the matrix is degenerate (zero zoom on either axis), hence the nullable return type. In practice this never happens because zoom is clamped to a positive minimum.

### Matrix Cache Invalidation

All four matrices are lazily cached and invalidated together:

```typescript
private invalidateMatrices(): void {
  this._viewMatrix = null;
  this._projectionMatrix = null;
  this._viewProjectionMatrix = null;
  this._inverseViewProjectionMatrix = null;
}
```

Any change to position, zoom, rotation, or viewport size calls this method. The matrices are recomputed on next access, not at invalidation time — if nothing reads them between two position changes, they're only computed once.

## Coordinate Conversion

With the matrix pipeline in place, coordinate conversion is two transformations:

### Screen to World

```typescript
screenToWorld(screenPoint: Vector2): Vector2 {
  const matrix = this.getInverseViewProjectionMatrix();
  if (!matrix) return screenPoint;

  // Normalize screen coordinates to -1..1
  const normalized: Vector2 = {
    x: (screenPoint.x / this._viewportWidth) * 2 - 1,
    y: -((screenPoint.y / this._viewportHeight) * 2 - 1), // Flip Y
  };

  return mat3.transformPoint(matrix, normalized);
}
```

Step by step:

1. Take the screen pixel position (e.g., `{x: 400, y: 300}` for the center of an 800x600 canvas)
2. Normalize to -1..+1 range: `x = (400/800)*2 - 1 = 0`, `y = -((300/600)*2 - 1) = 0`
3. The Y flip (`-( ... )`) converts from screen-Y-down to NDC-Y-up
4. Multiply by the inverse view-projection matrix to get world coordinates

### World to Screen

```typescript
worldToScreen(worldPoint: Vector2): Vector2 {
  const matrix = this.getViewProjectionMatrix();
  const normalized = mat3.transformPoint(matrix, worldPoint);

  return {
    x: ((normalized.x + 1) / 2) * this._viewportWidth,
    y: ((1 - normalized.y) / 2) * this._viewportHeight, // Flip Y
  };
}
```

The reverse: multiply by the view-projection to get NDC, then denormalize from -1..+1 back to pixel coordinates. The Y flip is `1 - normalized.y` — converting from NDC-Y-up to screen-Y-down.

These two methods are the most-called functions in the entire editor. Every mouse event calls `screenToWorld` to convert the cursor position for tools. Every overlay (selection handles, pen tool preview, guide lines) calls `worldToScreen` to position SVG elements over the WebGL canvas. They must be fast, and with cached matrices they are — two multiplications plus some arithmetic.

### Round-Trip Accuracy

A critical property: `screenToWorld(worldToScreen(point))` must return the original point. Any drift in this round-trip accumulates during interactive operations — a drag that converts screen→world→screen→world thousands of times would slowly shift position. Our matrix math preserves this property to floating-point precision (~15 decimal digits), which is more than sufficient.

We verify this in tests:

```typescript
it('round-trips screen->world->screen', () => {
  const camera = new Camera();
  camera.setViewport(800, 600);
  camera.zoom = 1.5;
  camera.position = { x: 50, y: -30 };

  const originalScreen = { x: 123, y: 456 };
  const worldPos = camera.screenToWorld(originalScreen);
  const backToScreen = camera.worldToScreen(worldPos);

  expect(backToScreen.x).toBeCloseTo(originalScreen.x, 0);
  expect(backToScreen.y).toBeCloseTo(originalScreen.y, 0);
});
```

## Camera Movement

### Panning

Panning moves the camera position. The user sees the document slide in the opposite direction of the mouse movement — drag right, and the view shifts right (revealing content to the right), which means the camera position moves left:

```typescript
pan(screenDelta: Vector2): void {
  const worldDelta = {
    x: -screenDelta.x / this._zoom,
    y: screenDelta.y / this._zoom,
  };

  if (this._rotation !== 0) {
    const rad = (this._rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rotated = {
      x: worldDelta.x * cos - worldDelta.y * sin,
      y: worldDelta.x * sin + worldDelta.y * cos,
    };
    this.position = vec2.add(this._position, rotated);
  } else {
    this.position = vec2.add(this._position, worldDelta);
  }
}
```

The X component is negated (`-screenDelta.x`) because screen X and world X point in the same direction, but panning should feel like "grabbing" the canvas — drag left and the content moves left (camera moves right). The Y component is _not_ negated because screen Y is down while world Y is up — the opposite directions cancel out and produce the expected "grab" behavior without an additional sign flip.

Division by `this._zoom` scales the pan amount. At zoom 2, dragging 100 pixels should move 50 world units (because each world unit is 2 pixels). At zoom 0.5, dragging 100 pixels should move 200 world units.

### Zoom at Cursor

Zoom should feel like zooming into where the mouse cursor is pointing. The world point under the cursor must remain stationary. This requires a position adjustment after changing the zoom level:

```typescript
zoomAt(screenPoint: Vector2, zoomDelta: number): void {
  const worldBefore = this.screenToWorld(screenPoint);

  const newZoom = this._zoom * (1 + zoomDelta * this.config.zoomSensitivity);
  this._zoom = clamp(newZoom, this.config.minZoom, this.config.maxZoom);
  this.invalidateMatrices();

  const worldAfter = this.screenToWorld(screenPoint);

  // Adjust position to keep worldBefore at the same screen position
  this._position = vec2.add(
    this._position,
    vec2.subtract(worldBefore, worldAfter)
  );
  this.invalidateMatrices();

  this.emit('zoomChange');
  this.emit('change');
}
```

The algorithm:

1. Record which world point is under the cursor _before_ the zoom
2. Apply the new zoom level and recompute matrices
3. Check which world point is now under the cursor _after_ the zoom
4. The difference between before and after is how far the world "slid" under the cursor due to the zoom
5. Shift the camera position by that difference to slide it back

This produces the intuitive behavior where zooming in "approaches" the cursor and zooming out "retreats" from it — matching how scroll-to-zoom works in Google Maps, Figma, and every other zoomable interface.

The zoom factor is multiplicative (`this._zoom * (1 + delta * sensitivity)`) rather than additive. This means each scroll tick produces the same _perceptual_ zoom change — going from 1x to 2x feels the same as going from 4x to 8x. Additive zoom (`this._zoom + delta`) would make low zoom levels feel sluggish and high zoom levels feel twitchy.

### Fit Bounds

The "fit to content" operation calculates a zoom level and position that makes a given rectangle fill the viewport:

```typescript
fitBounds(bounds: Rect, padding: number = 50): void {
  const viewWidth = this._viewportWidth - padding * 2;
  const viewHeight = this._viewportHeight - padding * 2;

  const scaleX = viewWidth / bounds.width;
  const scaleY = viewHeight / bounds.height;

  this._zoom = clamp(
    Math.min(scaleX, scaleY),
    this.config.minZoom,
    this.config.maxZoom
  );

  this._position = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };

  this.invalidateMatrices();
  this.emit('zoomChange');
  this.emit('panChange');
  this.emit('change');
}
```

`Math.min(scaleX, scaleY)` ensures the bounds fit entirely within the viewport — the constraining dimension determines the zoom, and the other dimension has extra space. The padding parameter adds a margin so content doesn't touch the viewport edges.

The position is set to the center of the bounds rectangle, which puts the content in the center of the screen. This is used for Ctrl+0 (fit all content), double-clicking the Hand tool, and auto-framing when opening a project.

### Visible Bounds

The inverse of "what fits on screen" is "what's visible on screen." This is used for culling (skipping rendering of off-screen shapes) and for the grid (knowing which grid lines to draw):

```typescript
getVisibleBounds(): Rect {
  const topLeft = this.screenToWorld({ x: 0, y: 0 });
  const bottomRight = this.screenToWorld({
    x: this._viewportWidth,
    y: this._viewportHeight,
  });

  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, bottomRight.y);
  const maxY = Math.max(topLeft.y, bottomRight.y);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}
```

We use `Math.min`/`Math.max` rather than assuming which corner has which value because the Y-flip means the screen's top-left maps to a world point with _higher_ Y than the screen's bottom-right. With camera rotation, even X ordering could swap. The min/max approach is correct regardless of orientation.

## Wiring the Camera to the Canvas

The Camera class is pure math — it has no DOM dependency. Connecting it to the browser requires a few pieces in the Canvas component.

### Viewport Resize

The camera needs to know the canvas size. We use `ResizeObserver` to track changes:

```typescript
const resizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const width = Math.round(entry.contentRect.width);
    const height = Math.round(entry.contentRect.height);
    if (width > 0 && height > 0) {
      renderer.setViewport(width, height);
      camera.setViewport(width, height);
    }
  }
});

resizeObserver.observe(container);
```

Notice `Math.round()`. ResizeObserver can report fractional dimensions (e.g., 799.5 x 599.5) depending on the browser's subpixel layout. Passing fractional values to the camera produces slightly off-center calculations — the world origin appears at pixel (399.75, 299.75) instead of (400, 300), causing a 0.5-pixel offset in all overlays. Rounding eliminates this.

### Wheel Zoom

Scroll-wheel zoom uses the `wheel` event with a critical subtlety — it must be attached as a non-passive listener:

```typescript
const handleWheel = useCallback((e: WheelEvent) => {
  e.preventDefault();

  const rect = canvas.getBoundingClientRect();
  const screenPos = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };

  camera.zoomAt(screenPos, -e.deltaY);
}, []);

// Must be non-passive to allow preventDefault()
canvas.addEventListener('wheel', handleWheel, { passive: false });
```

`e.preventDefault()` is essential — without it, Ctrl+Scroll triggers the browser's native page zoom instead of our canvas zoom. But React's synthetic `onWheel` event handler is registered as passive by default in modern browsers, which means `preventDefault()` silently does nothing. The fix is to use native `addEventListener` with `{ passive: false }`.

This is one of the subtlest React gotchas we encountered. The symptom is that Ctrl+Scroll zooms the entire page _and_ the canvas simultaneously. The cause — React's passive wheel listener — is not obvious from the code.

### Middle-Click and Space+Click Pan

Panning is triggered by either middle mouse button or holding Space and left-clicking — matching the conventions of Figma, Photoshop, and most creative tools:

```typescript
// In mouseDown handler:
if (e.button === 1 || (e.button === 0 && isSpaceHeldRef.current)) {
  e.preventDefault();
  isPanningRef.current = true;
  lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  canvas.style.cursor = 'grabbing';
  return;
}

// In mouseMove handler:
if (isPanningRef.current) {
  const delta = {
    x: e.clientX - lastMousePosRef.current.x,
    y: e.clientY - lastMousePosRef.current.y,
  };
  camera.pan(delta);
  lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  return;
}

// In mouseUp handler:
if (isPanningRef.current) {
  isPanningRef.current = false;
  canvas.style.cursor = isSpaceHeldRef.current ? 'grab' : toolCursor;
  return;
}
```

The cursor changes to `grab` (hand open) when Space is held and `grabbing` (hand closed) during the drag. On mouse up, if Space is still held, it returns to `grab` rather than the active tool cursor — the user is still in "pan mode" until they release Space.

The `return` at the end of the pan handling in each handler is important — panning must consume the event without passing it through to the tool system. Otherwise, the SelectionTool would receive the drag events and start drawing a marquee selection while the user is trying to pan.

### Space Key State

Space pan requires tracking whether the Space key is currently held:

```typescript
// In keyDown handler:
if (e.code === 'Space' && !isSpaceHeldRef.current) {
  e.preventDefault();
  isSpaceHeldRef.current = true;
  if (!isPanningRef.current) {
    canvas.style.cursor = 'grab';
  }
  return;
}

// In keyUp handler (elsewhere):
if (e.code === 'Space') {
  isSpaceHeldRef.current = false;
  if (!isPanningRef.current) {
    canvas.style.cursor = toolCursor;
  }
}
```

The `!isSpaceHeldRef.current` guard in keyDown prevents repeat events from the keyboard's auto-repeat when Space is held down. Without it, each repeat event would flash the cursor and potentially interfere with the panning state.

We use `useRef` rather than `useState` for all interaction state (`isPanningRef`, `isSpaceHeldRef`, `lastMousePosRef`). These values change during mouse moves — potentially 60+ times per second — and don't need to trigger React re-renders. Using `useState` for them would cause the entire Canvas component to re-render on every mouse move, degrading performance significantly.

## The Camera's Event System

Like the scene graph, the camera has a publish-subscribe event system:

```typescript
export type CameraEventType = 'change' | 'zoomChange' | 'panChange';

on(type: CameraEventType, callback: CameraEventCallback): () => void {
  if (!this.listeners.has(type)) {
    this.listeners.set(type, new Set());
  }
  this.listeners.get(type)!.add(callback);
  return () => { this.listeners.get(type)?.delete(callback); };
}
```

The Canvas component subscribes to the `change` event to update the zoom percentage display and trigger ruler redraws:

```typescript
const unsubscribe = camera.on('change', () => {
  setZoomPercent(Math.round(camera.zoom * 100));
  setCameraVersion((v) => v + 1);
});
```

`cameraVersion` is a monotonically increasing counter. Overlays like rulers and guides use it as a dependency — when the camera changes, their positions relative to the canvas change too, so they need to re-render. This is cheaper than passing the full camera state through React props.

## Testing the Camera

Camera tests verify coordinate conversions, zoom behavior, and round-trip accuracy:

```typescript
it('converts screen to world coordinates at default state', () => {
  const camera = new Camera();
  camera.setViewport(800, 600);

  // Center of screen → world origin
  const worldPos = camera.screenToWorld({ x: 400, y: 300 });
  expect(worldPos.x).toBeCloseTo(0);
  expect(worldPos.y).toBeCloseTo(0);
});

it('visible bounds shrink with zoom', () => {
  const camera = new Camera();
  camera.setViewport(800, 600);

  camera.zoom = 1;
  const bounds1 = camera.getVisibleBounds();

  camera.zoom = 2;
  const bounds2 = camera.getVisibleBounds();

  expect(bounds2.width).toBeLessThan(bounds1.width);
  expect(bounds2.height).toBeLessThan(bounds1.height);
});

it('zooms at cursor position — world point stays stationary', () => {
  const camera = new Camera();
  camera.setViewport(800, 600);

  const cursorPos = { x: 400, y: 300 };
  const worldBefore = camera.screenToWorld(cursorPos);

  camera.zoomAt(cursorPos, 100);

  const worldAfter = camera.screenToWorld(cursorPos);
  expect(worldAfter.x).toBeCloseTo(worldBefore.x, 0);
  expect(worldAfter.y).toBeCloseTo(worldBefore.y, 0);
});
```

The "zoom at cursor" test is the most important. It verifies the invariant that makes zoom-to-cursor feel natural — the world point under the mouse doesn't move.

## Lessons

**Choose Y-up world coordinates and pay the flip cost in exactly one place.** With Y-up, angles and trigonometric functions follow mathematical convention without sign corrections scattered throughout the codebase. The single Y-flip lives in `screenToWorld` and `worldToScreen` inside the Camera class, not in every tool and overlay.

**Zoom must be multiplicative, not additive.** Multiplying the zoom factor (`zoom * (1 + delta)`) produces the same perceptual change at every zoom level: doubling from 1x to 2x feels identical to doubling from 4x to 8x. Additive zoom makes low levels feel sluggish and high levels feel twitchy.

**Anchor zoom to the cursor by recording the world point before and after.** Convert the cursor to world space, apply the new zoom, convert again, then shift the camera position by the difference. This three-step pattern keeps the world point under the mouse stationary, matching the zoom behavior users expect from every zoomable interface.

**Use `useRef` for interaction state that changes at pointer-event frequency.** Panning state, space-key state, and last-mouse-position change 60+ times per second during drags. Using `useState` for them would re-render the entire Canvas component on every mouse move. Refs update without triggering React's reconciliation.

**Attach wheel listeners with `{ passive: false }` via native `addEventListener`.** React's synthetic `onWheel` is passive by default in modern browsers, which silently ignores `preventDefault()`. Without the native listener, Ctrl+Scroll triggers both the browser's page zoom and the canvas zoom simultaneously.

**Round `ResizeObserver` dimensions to integers.** Fractional viewport dimensions (799.5 x 599.5) produce a 0.5-pixel offset in all coordinate conversions, causing overlays to misalign with the WebGL canvas beneath them. `Math.round()` on every resize eliminates this.

## What We Built

The camera system provides:

1. **Three-stage matrix pipeline** — View, projection, and combined view-projection matrices with lazy caching and automatic invalidation.

2. **Bidirectional coordinate conversion** — `screenToWorld` and `worldToScreen` with round-trip accuracy, handling the Y-axis flip between screen-down and world-up.

3. **Intuitive zoom** — Multiplicative zoom factor with cursor-anchored zoom-at behavior, clamped to a sensible range.

4. **Responsive panning** — Zoom-scaled pan deltas with rotation support, triggered by middle-click or Space+drag.

5. **Content framing** — `fitBounds` for centering and `getVisibleBounds` for culling.

6. **Viewport adaptation** — ResizeObserver integration with rounding to avoid subpixel drift.

The camera is one of those systems where correctness matters more than cleverness. A camera with a subtle sign error or off-by-half-pixel drift won't crash — it'll produce shapes that are slightly misaligned, selection handles that don't quite match shape corners, and tooltips that appear a few pixels off from where they should. These bugs are maddening to diagnose because the symptoms are always downstream of the cause. Getting the camera right once, testing it thoroughly, and then trusting it completely is the approach that works.

In the next chapter, we build the state management system — the Zustand store that orchestrates all the editor's mutable state and connects the scene graph and camera to the React UI.
