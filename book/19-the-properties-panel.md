# The Properties Panel

## One Component, Every Attribute

Select a rectangle and you see width and height. Select a bone and you see length, style, and color. Select a text node and you see font family, font size, weight, alignment, line height, and letter spacing. Select nothing and you see an empty state — or, if multiple shapes are selected, a row of boolean operation buttons.

The Properties Panel is the single React component that bridges every node type in the scene graph to a set of editable controls. It is the largest component in the editor — over 4,000 lines — and the one most likely to contain subtle bugs. This chapter walks through the architecture that keeps those 4,000 lines manageable.

## Reactive Subscriptions

The component opens with approximately 35 individual Zustand selectors:

```tsx
export function PropertiesPanel() {
  const sceneGraph = useSceneGraph();
  const selectedNodeIds = useEditorStore((state) => state.selectedNodeIds);
  const aspectRatioLocked = useEditorStore((state) => state.aspectRatioLocked);
  const toggleAspectRatioLock = useEditorStore((state) => state.toggleAspectRatioLock);
  const autoKeyframe = useEditorStore((state) => state.autoKeyframe);
  const currentFrame = useEditorStore((state) => state.currentFrame);
  const addKeyframeAtFrame = useEditorStore((state) => state.addKeyframeAtFrame);
  const timeline = useEditorStore((state) => state.timeline);
  const snapToGrid = useEditorStore((state) => state.snapToGrid);
  const pushUndo = useEditorStore((state) => state.pushUndo);
  const activeTool = useEditorStore((state) => state.activeTool);
  const dynamicChains = useEditorStore((state) => state.dynamicChains);
  const symbols = useEditorStore((state) => state.symbols);
  // ... 20+ more selectors
```

Every one of these hooks lives at the top of the component, before any early returns. This is a hard React rule — hooks cannot be called conditionally — but it creates a useful side effect: a developer scanning the file immediately sees every piece of external state this component depends on.

Each selector subscribes to exactly one slice of the store. When the user changes a fill color, only the `selectedNodeIds` and timeline-related selectors might trigger a re-render. Zustand compares by reference equality, so `(state) => state.snapToGrid` only re-renders when that boolean flips.

But the scene graph is not part of Zustand. Nodes are managed by the `SceneGraph` class, which communicates changes through events. The component subscribes manually:

```tsx
const [, setVersion] = useState(0);
useEffect(() => {
  const increment = () => setVersion((v) => v + 1);
  const unsub1 = sceneGraph.on('nodeChanged', increment);
  const unsub2 = sceneGraph.on('nodeAdded', increment);
  const unsub3 = sceneGraph.on('nodeRemoved', increment);
  return () => {
    unsub1();
    unsub2();
    unsub3();
  };
}, [sceneGraph]);
```

This is the React pattern for "re-render when an external mutable source changes." The `setVersion` call forces a render; the version number itself is never read. Every time any node changes in the scene graph — whether from a tool operation, an undo, or a playback frame evaluation — the panel re-reads the selected node's current state.

## The `getState()` in Render Trap

There is exactly one place where reading from the store via `getState()` during render is correct, and many places where it is a bug. The distinction matters.

**Safe**: A `shouldKeyframe` helper reads `timeline` via `getState()` inside an event handler:

```tsx
function shouldKeyframe(autoKeyframe: boolean, nodeId: string, property: string): boolean {
  if (autoKeyframe) return true;
  const { timeline } = useEditorStore.getState();
  const track = findTrack(timeline, nodeId, property);
  return track != null && track.keyframes.length > 0;
}
```

This runs inside `useCallback` handlers — never during render. When the user changes a property value, this function decides whether to also create a keyframe. It reads `timeline` via `getState()` because the handler's closure captured `autoKeyframe` at hook creation time, but `timeline` may have changed since. Using `getState()` inside an event handler is always safe because it reads the latest value at the moment of the event.

**Dangerous**: Reading store state during render via `getState()`:

```tsx
// BAD — this won't re-render when weightPaintBoneId changes
<select value={useEditorStore.getState().weightPaintBoneId ?? ''}>
```

This reads a value once during render but never subscribes. When the user selects a different bone for weight painting, the dropdown stays on the old value. The fix is a reactive hook:

```tsx
const weightPaintBoneId = useEditorStore((state) => state.weightPaintBoneId);
// ...
<select value={weightPaintBoneId ?? ''}>
```

The general rule: `getState()` is for event handlers and callbacks. Hooks are for render. Violating this rule produces UI that displays stale data — a bug that's easy to write and hard to notice.

## Node-Type Dispatch

Different node types store their dimensions differently. A rectangle has `width` and `height` properties. An ellipse has `radiusX` and `radiusY`. A polygon has a single `radius` and uses `transform.scale` for non-uniform sizing. The Properties Panel must display "W" and "H" inputs for all of them, computing the display value differently for each type.

The `getNodeSize` function handles this dispatch:

```tsx
function getNodeSize(node: Node, sceneGraph?: SceneGraph): { width: number; height: number } {
  switch (node.type) {
    case 'rectangle':
      return { width: node.width, height: node.height };
    case 'ellipse':
      return { width: node.radiusX * 2, height: node.radiusY * 2 };
    case 'polygon': {
      const scaleX = node.transform.scale?.x ?? 1;
      const scaleY = node.transform.scale?.y ?? 1;
      return { width: node.radius * 2 * scaleX, height: node.radius * 2 * scaleY };
    }
    case 'path': {
      const bounds = getPathBounds(node.points, node.closed);
      if (!bounds) return { width: 0, height: 0 };
      const sx = node.transform.scale?.x ?? 1;
      const sy = node.transform.scale?.y ?? 1;
      return { width: bounds.width * sx, height: bounds.height * sy };
    }
    case 'group': {
      if (!sceneGraph) return { width: 0, height: 0 };
      const childIds = new Set(sceneGraph.getDescendants(node.id).map((n) => n.id));
      const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
      if (bounds) {
        const gsx = node.transform.scale?.x ?? 1;
        const gsy = node.transform.scale?.y ?? 1;
        return { width: bounds.rect.width * gsx, height: bounds.rect.height * gsy };
      }
      return { width: 0, height: 0 };
    }
    // ... image, artboard, symbol-instance, text
  }
}
```

The inverse operation — `handleSizeChange` — must reverse this logic. When the user types "200" into the W input for an ellipse, the handler computes `radiusX = 200 / 2`. For a polygon or path, it computes a new `transform.scale.x = 200 / baseBounds.width`. For a group, it computes the scale ratio against the children's bounding box.

A companion function, `getSizePropertyPaths`, returns the property path strings used for keyframe animation:

```tsx
function getSizePropertyPaths(node: Node): { w: string; h: string } {
  switch (node.type) {
    case 'rectangle':
    case 'image':
    case 'artboard':
      return { w: 'width', h: 'height' };
    case 'ellipse':
      return { w: 'radiusX', h: 'radiusY' };
    case 'polygon':
    case 'path':
    case 'group':
      return { w: 'transform.scale.x', h: 'transform.scale.y' };
  }
}
```

When the user changes W for an ellipse and auto-keyframe is on, the system creates a keyframe on the `radiusX` property — not `width`, which doesn't exist on an ellipse. The display label always says "W" and "H", but the underlying property path varies by node type.

## ScrubLabel: Drag-to-Adjust

Every numeric property in the panel has a small label — "X", "Y", "W", "H", "R" — that doubles as a drag handle. Click and drag left or right on the label, and the value changes. This is the ScrubLabel component:

```tsx
export function ScrubLabel({ label, value, onChange, sensitivity, min, max, onScrubStart }) {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const startXRef = useRef(0);
  const startValueRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      onScrubStart?.(); // <-- push undo snapshot
      startXRef.current = e.clientX;
      startValueRef.current = value;
      setIsScrubbing(true);
    },
    [value, onScrubStart]
  );

  useEffect(() => {
    if (!isScrubbing) return;
    const handlePointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startXRef.current;
      const delta = dx * sensitivity;
      const newValue = Math.round(Math.min(max, Math.max(min, startValueRef.current + delta)));
      onChange(newValue);
    };
    const handlePointerUp = () => setIsScrubbing(false);

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isScrubbing, sensitivity, min, max, onChange]);

  return (
    <span
      className={`${styles.scrubLabel} ${isScrubbing ? styles.scrubbing : ''}`}
      onPointerDown={handlePointerDown}
    >
      {label}
    </span>
  );
}
```

The `onScrubStart` callback is the integration point with the undo system. The Properties Panel passes `handleScrubStart`, which calls `pushUndo(sceneGraph)`. This pushes a single undo snapshot when the scrub gesture begins. As the user drags, `onChange` fires many times — but only one snapshot exists. The user gets one undo step for the entire scrub, not one per pixel of mouse movement.

This matches the pattern from canvas drag operations: push once at the start, let the operation run, stop when the pointer releases.

## The Numeric Input Pattern

Beyond scrub labels, every numeric input supports arrow keys and mouse wheel. The `numericInputProps` helper returns `onKeyDown` and `ref` props for any `<input>`:

```tsx
function numericInputProps(getValue: () => number, onChange: (v: string) => void) {
  return {
    onKeyDown: (e) => handleNumericInputKeyDown(e, getValue(), onChange),
    ref: (el) => {
      if (!el) return;
      if (el.__numWheel) return; // avoid duplicate listeners
      el.__numWheel = true;
      el.addEventListener(
        'wheel',
        (we: WheelEvent) => {
          if (document.activeElement !== el) return;
          we.preventDefault();
          const delta = (we.deltaY < 0 ? 1 : -1) * (we.shiftKey ? 10 : 1);
          onChange(String(getValue() + delta));
        },
        { passive: false }
      );
    },
  };
}
```

ArrowUp/ArrowDown adjusts by 1; hold Shift for 10. Mouse wheel does the same. The `ref` callback attaches a native wheel listener because React's `onWheel` is passive by default — calling `preventDefault()` on a passive listener throws a browser warning and doesn't actually prevent scrolling.

The `getValue` parameter is a getter function, not a value. This avoids stale closures — the getter always reads the current value at the moment the wheel event fires. The pattern appears on every numeric input in the panel, applied with a simple spread:

```tsx
<input
  type="text"
  value={fmt1(pos.x)}
  onChange={(e) => handlePositionChange('x', e.target.value)}
  {...numericInputProps(
    () => numericRef.current.posX,
    (v) => numericRef.current.handlePositionChange('x', v)
  )}
/>
```

## Fill and Stroke Editing

Fills and strokes are arrays. A node can have multiple fills (stacked, each with its own color, opacity, and gradient) and multiple strokes. The UI renders each one as a row with a color swatch, hex input, opacity input, visibility toggle, and remove button.

The multi-fill architecture mirrors Figma's model. Each fill is an object:

```tsx
interface Fill {
  type: 'solid' | 'gradient';
  color?: Color;
  gradient?: Gradient;
  opacity: number;
  visible: boolean;
}
```

Clicking the color swatch opens a `ColorPicker` portal. Clicking the fill type dropdown switches between solid and gradient, which opens the `GradientEditor` inline. Every handler follows the same pattern: clone the array, update the targeted index, write back:

```tsx
const handleFillColorChange = useCallback(
  (index: number, hex: string) => {
    const color = hexToColor(hex);
    if (!color) return;
    applyFillToAll((nodeId, currentNode) => {
      const fills = [...getNodeFills(currentNode)];
      const fill = fills[index];
      if (!fill) return;
      fills[index] = { ...fill, color: { ...color, a: fill.color?.a ?? 1 } };
      sceneGraph.updateNode(nodeId, { fills });
      if (shouldKeyframe(autoKeyframe, nodeId, `fills.${index}.color`)) {
        addKeyframeAtFrame(nodeId, `fills.${index}.color`, currentFrame, fills[index].color);
      }
    });
  },
  [applyFillToAll, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
);
```

The `applyFillToAll` helper is the multi-selection bridge. When a single object is selected, it calls the callback once. When multiple objects are selected, it iterates all selected node IDs:

```tsx
const applyFillToAll = useCallback(
  (fn: (nodeId: string, node: Node) => void) => {
    for (const id of selectedNodeIds) {
      const n = sceneGraph.getNode(id);
      if (n && hasFillsStrokes(n)) fn(id, n);
    }
  },
  [selectedNodeIds, sceneGraph]
);
```

This means every fill and stroke handler automatically works for multi-selection. The UI shows the primary node's values, but when the user changes a color, all selected nodes update.

## The Color Picker Popover

Color pickers are portals anchored to their swatch. A `swatchRefs` map stores DOM element references for each swatch, keyed by strings like `"fill-0"`, `"stroke-1"`, or `"effect-2-color"`. When the user clicks a swatch, the panel calculates the anchor position from the element's bounding rect and stores it in state:

```tsx
const openPicker = useCallback((key: string) => {
  const el = swatchRefs.current.get(key);
  if (!el) return;
  const rect = el.getBoundingClientRect();
  setPickerAnchor({ x: rect.left, y: rect.bottom + 4 });
  setActivePickerKey(key);
}, []);
```

Only one picker can be open at a time — `activePickerKey` is a single string. The `ColorPicker` component renders in a portal and receives the color, an `onChange` callback, anchor coordinates, and an `onClose` callback. The same system handles fill color pickers, stroke color pickers, and effect shadow color pickers — the only difference is the key string.

## Effects: Drop Shadow, Inner Shadow, Layer Blur

The effects section uses a dropdown to add effects and renders each one with type-specific controls. Drop shadows and inner shadows share a set of parameters: color, opacity, X offset, Y offset, blur radius, and spread. Layer blur has a single radius parameter.

Each parameter gets a ScrubLabel and a text input, following the same handler pattern. The verbose repetition is intentional — each handler calls `updateEffect` on the scene graph and conditionally creates a keyframe via `shouldKeyframe`. A more abstract approach might reduce line count but would obscure which properties are animatable and how:

```tsx
<ScrubLabel
  label="Blur"
  value={shadow.blur}
  onChange={(v) => {
    if (selectedId) {
      const clamped = Math.max(0, v);
      updateEffect(sceneGraph, selectedId, index, { blur: clamped });
      if (shouldKeyframe(autoKeyframe, selectedId, `effects.${index}.blur`))
        addKeyframeAtFrame(selectedId, `effects.${index}.blur`, currentFrame, clamped);
    }
  }}
  onScrubStart={handleScrubStart}
  min={0}
  max={100}
/>
```

The `updateEffect` store action handles the immutable update: clone the effects array, spread the partial update into the target effect, write back. The pattern is always clone-update-write, never mutate-in-place.

## Corner Radius: Three Modes

Corner radius has three distinct behaviors depending on node type.

**Rectangles and images** have per-corner radii — a tuple of four numbers `[TL, TR, BR, BL]`. By default, a lock icon binds all four corners together. Clicking unlock reveals four independent inputs. The handler branches on whether a specific corner index was passed:

```tsx
const handleCornerRadiusChange = useCallback(
  (value: string, corner?: number) => {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;

    if (currentNode.type === 'rectangle') {
      const newRadius = [...rect.cornerRadius];
      if (corner !== undefined) {
        newRadius[corner] = num;
      } else {
        newRadius[0] = num;
        newRadius[1] = num;
        newRadius[2] = num;
        newRadius[3] = num;
      }
      sceneGraph.updateNode(selectedId, { cornerRadius: newRadius });
      // keyframe each corner...
    }
  },
  [selectedId, sceneGraph, autoKeyframe, currentFrame, addKeyframeAtFrame]
);
```

**Polygons** have a single corner radius value — one number that applies uniformly to every vertex. The UI shows a single input without a lock toggle.

**Path nodes** have per-vertex corner radius, but that's handled in the Vertex section when the Direct Selection tool has points selected — not in the main corner radius area.

## Type-Specific Sections

The JSX template uses conditional rendering to show sections relevant to the selected node type. This is a series of `{node.type === 'bone' && (...)}` guards:

- **Symbol instances** show the symbol name, Edit/Detach/Reset buttons
- **Polygons** show a Sides input and an Inner Radius input (with scale-aware display)
- **Bones** show length, style dropdown, and color picker, plus sub-panels for Smart Bones, Vitruvian Bones, and Dynamic Chains
- **IK targets** show the chain name, type (effector/pole), and enabled checkbox
- **Text nodes** show font family (with Google Fonts integration and async loading), font size, weight, alignment buttons, line height, and letter spacing
- **Artboards** show a Clip Content checkbox
- **Skinned nodes** show bone count, a bone selector dropdown, and Weight Paint/Unbind buttons
- **Path nodes with `brushData`** show brush width and profile selector
- **Vertex section** appears when DirectSelectionTool has selected points — shows per-vertex position and corner radius with keyframe indicators

Each section is self-contained: it reads the node, renders its controls, and handles its own state changes. The sections stack vertically in a natural order — Transform at the top, then type-specific properties, then Appearance (fills, strokes, opacity), then Effects, then Blend Mode, then Export.

## The Export Section

The Export section is extracted into its own `ExportSection` function component — the only sub-component within the file. It manages its own `exporting` loading state and computes selection bounds via a `useMemo` that instantiates a `SelectionManager`:

```tsx
function ExportSection({ nodes, sceneGraph, selectedId, node }) {
  const [exporting, setExporting] = useState(false);
  const exportSettings = node?.exports ?? [];

  const selectionBounds = useMemo(() => {
    if (nodes.length === 0) return null;
    const sm = new SelectionManager();
    const ids = new Set(nodes.map((n) => n.id));
    return sm.getSelectionBounds(ids, sceneGraph);
  }, [nodes, sceneGraph]);

  // ...
}
```

Each export preset shows a format/multiplier dropdown (PNG 1x/2x/3x/4x, SVG), computed dimensions based on selection bounds, and a remove button. The export button triggers `exportSelectionAsPng` or `exportSelectionAsSvg` from the export service. For artboards, a "Include background" checkbox controls whether the artboard's fill renders in the exported image.

Export presets are stored on the node itself (`BaseNode.exports?: ExportSetting[]`) and persisted through project serialization. This means export settings follow the node — duplicate a node and its export presets come along.

## Keyframe Integration

Nearly every property change in the panel checks whether it should create a keyframe. The `shouldKeyframe` helper encodes the rule: if auto-keyframe mode is on, always create a keyframe. If it's off but the property already has keyframes on this track, still create one — this prevents the user from accidentally drifting a property out of its animation curve.

Each property row includes a `KeyframeIndicator` — a small diamond icon that shows three states:

- **None** (empty diamond): no keyframes exist for this property
- **Active** (filled diamond): a keyframe exists at the current frame
- **Inactive** (half-filled diamond): keyframes exist but not at the current frame

Clicking the indicator toggles: if active, remove the keyframe at the current frame. If none or inactive, add one. The toggle function is three lines:

```tsx
const toggleKeyframe = (property: string, value: unknown) => {
  if (!selectedId) return;
  const state = getKeyframeState(timeline, selectedId, property, currentFrame);
  if (state === 'active') {
    removeKeyframeAtFrame(selectedId, property, currentFrame);
  } else {
    addKeyframeAtFrame(selectedId, property, currentFrame, value);
  }
};
```

Keyframe indicators appear on Position, Size, Rotation, Opacity, Corner Radius, Sides, Inner Radius, Bone Length, Font Size, Line Height, Letter Spacing, and every fill/stroke color — any property that can be animated.

## Position Display: Top-Left vs. Center

The scene graph stores position as the center point (adjusted by anchor). The Properties Panel displays position as the visual top-left corner — the point the user sees at the top-left of the bounding box. The conversion accounts for both anchor and the Y-up coordinate system:

```tsx
const center = isGroup ? getGroupPosition(node, sceneGraph) : node.transform.position;
const anchor = node.transform.anchor ?? { x: 0.5, y: 0.5 };
const pos = {
  x: center.x - size.width * anchor.x,
  y: center.y + size.height * (1 - anchor.y),
};
```

In a Y-up world, the visual top is the maximum Y value. The top-left X is `center - width * anchor.x`. The top-left Y is `center + height * (1 - anchor.y)`. When the user types a new position value, the handler reverses this: compute the delta between the desired display position and the current display position, then add that delta to the stored center position.

Groups require special handling. A group's `transform.position` is not the center of its visual bounds — it's an offset in the group's own coordinate space. The `getGroupPosition` function computes the actual visual center from the children's bounding box:

```tsx
function getGroupPosition(node: Node, sceneGraph: SceneGraph): { x: number; y: number } {
  const childIds = new Set(sceneGraph.getDescendants(node.id).map((n) => n.id));
  const bounds = groupBoundsManager.getSelectionBounds(childIds, sceneGraph);
  if (bounds) {
    return { x: bounds.rect.x + bounds.rect.width / 2, y: bounds.rect.y + bounds.rect.height / 2 };
  }
  return node.transform.position;
}
```

The position edit handler uses a delta-based approach rather than direct assignment:

```tsx
const handlePositionChange = useCallback((axis: 'x' | 'y', value: string) => {
  const num = parseFloat(value);
  if (isNaN(num)) return;
  // Current display position
  const currentDisplay = isGroup
    ? getGroupPosition(node, sceneGraph)
    : /* ... compute from center, anchor, size */;
  // Delta between desired and current display
  const delta = num - currentDisplay[axis];
  // Apply delta to stored position
  const newPos = {
    x: node.transform.position.x + (axis === 'x' ? delta : 0),
    y: node.transform.position.y + (axis === 'y' ? delta : 0),
  };
  sceneGraph.updateNode(nodeId, { transform: { ...node.transform, position: newPos } });
}, [...]);
```

The delta approach avoids the trap where the display-to-position formula gets applied incorrectly. For groups, the display position includes an offset from the children's local center — applying the raw formula to a typed value would add that offset on every keystroke, causing the group to jump.

## Aspect Ratio Lock

Between the W and H inputs sits a lock/unlock icon button. When locked, changing W auto-computes H to maintain the current aspect ratio (and vice versa). The lock state lives in the editor store as `aspectRatioLocked`.

The size handler checks the lock state and computes the constrained dimension when needed. This integrates with the node-type dispatch — the constraint calculation happens after the raw value is parsed but before it's written to the scene graph.

## The Blend Mode Dropdown

The blend mode section is the simplest in the panel: a `<select>` with 16 options mapping to CSS/WebGL blend modes. The handler calls `setBlendMode`, a store action that wraps `sceneGraph.updateNode`. Blend mode is stored on every node and defaults to `'normal'` when `undefined` — a pattern that avoids requiring migration when the field was added to the schema.

## Lessons

The Properties Panel teaches a few patterns that apply broadly to editor UI:

**Explicit selectors over derived state.** Thirty-five hooks at the top of the component is verbose. But each one is a direct subscription to exactly the state it needs. A single `useEditorStore()` call would re-render on every store change — hundreds of times per second during playback.

**Dispatch on node type in helpers, not in JSX.** The `getNodeSize`, `getSizePropertyPaths`, and `isSizeEditable` functions centralize the type-switching logic. The JSX reads `size.width` without caring whether it came from `node.width`, `node.radiusX * 2`, or `bounds.width * scaleX`.

**Multi-selection through iteration helpers.** Rather than branching on "is this single selection or multi?" in every handler, the `applyFillToAll` and `applyStrokeToAll` helpers iterate `selectedNodeIds` and call a per-node callback. The callback itself is identical to what single-selection would do.

**Event handlers can use `getState()`; render paths cannot.** This distinction is worth internalizing. During render, subscribe reactively via hooks. During callbacks, read the latest state imperatively. Mixing them up produces stale UI.

## What We Built

This chapter covered the Properties Panel — the largest single component in the editor, responsible for displaying and editing every attribute of every node type:

- **35+ Zustand selectors** subscribe to individual store slices. Scene graph mutations trigger re-renders through manual event subscriptions. No wasted renders, no stale data.
- **Node-type dispatch** in helper functions (`getNodeSize`, `getSizePropertyPaths`, `applySize`) translates between the user's mental model (W/H for everything) and each node type's actual storage (width/height, radiusX/radiusY, transform.scale).
- **ScrubLabel** turns every property label into a drag-to-adjust handle. The `onScrubStart` callback pushes a single undo snapshot for the entire gesture.
- **`numericInputProps`** adds arrow key and mouse wheel support to every numeric input. A non-passive wheel listener avoids the React passive event limitation.
- **Array-based fills and strokes** with per-entry color, opacity, gradient, visibility, and removal. `applyFillToAll`/`applyStrokeToAll` iterators handle multi-selection transparently.
- **ColorPicker portals** anchored to swatches via a `swatchRefs` map. One picker open at a time, keyed by `"fill-0"`, `"stroke-1"`, `"effect-2-color"`.
- **Three corner radius modes**: per-corner tuples for rectangles/images (with lock toggle), single value for polygons, per-vertex via DirectSelectionTool for paths.
- **Type-specific sections** rendered conditionally — text properties, bone properties, IK targets, brush data, artboard settings, symbol instance controls, rigging info.
- **Effects section** with add dropdown (drop shadow, inner shadow, layer blur), per-effect visibility toggle, type-specific parameter editing with ScrubLabels.
- **KeyframeIndicator** on every animatable property row, toggling between none/active/inactive states. `shouldKeyframe` auto-creates keyframes when existing tracks have data, even with auto-keyframe off.
- **Position display as top-left** with center-based storage — anchor-aware conversion in both directions, delta-based editing for groups to avoid accumulation errors.
- **Export section** as a sub-component with per-node export presets, format/multiplier dropdown, computed dimensions, and background toggle for artboards.

The next chapter builds the other side of the spatial hierarchy — the Layer Panel, a recursive tree view of the scene graph where users rename nodes, toggle visibility, reorder layers, and navigate the document structure.
