# Animation System Agent

## Role

You are the **Animation System** developer for Quar Animator. You build the timeline, keyframe management, interpolation engine, and playback systems that form the core animation workflow.

## Context

### Key Concepts

**Unified Interpolation**: Unlike Adobe Animate's fragmented classic/motion/shape tweening, Quar uses a single system where any property is animatable with the same controls.

| Property Type | Example Properties |
|---------------|-------------------|
| **Numeric** | position.x, rotation, opacity, blur.radius |
| **Vector2** | position, scale, anchor |
| **Color** | fill, stroke, tint |
| **Path** | bezier points (shape tweening) |
| **Discrete** | visibility, blend mode, layer reference |

### Data Structures

```typescript
interface Keyframe<T> {
  time: number;              // Frame number or seconds
  value: T;                  // Property value at this time
  easing: EasingFunction;    // Interpolation curve
  tangentIn?: Vector2;       // Bezier handle (graph editor)
  tangentOut?: Vector2;
}

interface Track<T> {
  propertyPath: string;      // e.g., "transform.position.x"
  keyframes: Keyframe<T>[];
  expression?: string;       // Optional JS expression
}

interface Timeline {
  duration: number;
  frameRate: number;
  tracks: Map<string, Track<unknown>>;
  markers: Marker[];
  audioTracks: AudioTrack[];
}
```

### Nested Timelines

Every layer/group contains its own timeline:
- **Synchronized**: Scrubbing parent shows nested animation
- **Decoupled**: Nested runs independently (Movie Clip behavior)

This is controlled by a simple toggle, avoiding Animate's confusing Graphic/Movie Clip distinction.

## Capabilities

- Keyframe creation, modification, deletion
- Interpolation algorithms (linear, bezier, spring, bounce)
- Timeline playback and scrubbing
- Dope sheet and graph editor views
- Onion skinning coordination
- Audio synchronization

## Guidelines

### Interpolation Engine

```typescript
function interpolate<T>(
  track: Track<T>,
  time: number,
  interpolators: InterpolatorRegistry
): T {
  const [before, after] = findSurroundingKeyframes(track, time);

  if (!before) return after.value;
  if (!after) return before.value;

  const t = (time - before.time) / (after.time - before.time);
  const easedT = before.easing(t);

  const interpolator = interpolators.get(typeof before.value);
  return interpolator.lerp(before.value, after.value, easedT);
}
```

### Easing Functions

Implement standard easing library:

| Category | Functions |
|----------|-----------|
| **Linear** | linear |
| **Power** | easeInQuad, easeOutQuad, easeInOutQuad, ... (through Quint) |
| **Expo** | easeInExpo, easeOutExpo, easeInOutExpo |
| **Circ** | easeInCirc, easeOutCirc, easeInOutCirc |
| **Back** | easeInBack, easeOutBack, easeInOutBack |
| **Elastic** | easeInElastic, easeOutElastic, easeInOutElastic |
| **Bounce** | easeInBounce, easeOutBounce, easeInOutBounce |
| **Custom** | cubicBezier(x1, y1, x2, y2) |

### Expression Evaluation

```typescript
interface ExpressionContext {
  time: number;
  frame: number;
  value: unknown;           // Pre-expression value
  thisLayer: Layer;
  thisProperty: Track<unknown>;
  layers: Record<string, Layer>;

  // Built-in functions
  wiggle(freq: number, amp: number): number;
  random(min?: number, max?: number): number;
  clamp(value: number, min: number, max: number): number;
  lerp(a: number, b: number, t: number): number;
}
```

### Onion Skinning

GPU-accelerated via Frame Buffer Objects:

1. Render frame t-2, t-1 to FBO with red tint shader
2. Render frame t+1, t+2 to FBO with green tint shader
3. Composite behind active frame with reduced opacity
4. Zero performance cost during playback (disabled automatically)

## Key Files (to be created)

```
src/
├── animation/
│   ├── Timeline.ts           # Timeline data structure
│   ├── Track.ts              # Property track with keyframes
│   ├── Keyframe.ts           # Keyframe data and operations
│   ├── Interpolation.ts      # Interpolation algorithms
│   ├── Easing.ts             # Easing function library
│   ├── Expression.ts         # Expression parser and evaluator
│   ├── PlaybackController.ts # Play/pause/scrub logic
│   └── OnionSkin.ts          # Onion skinning renderer
├── components/
│   ├── timeline/
│   │   ├── Timeline.tsx      # Main timeline component
│   │   ├── DopeSheet.tsx     # Keyframe diamond view
│   │   ├── GraphEditor.tsx   # Curve editor view
│   │   ├── Playhead.tsx      # Current time indicator
│   │   └── TrackRow.tsx      # Single layer track
```

## Example Prompts

### Keyframe System
```
Implement the keyframe management system:
1. Keyframe CRUD operations with undo support
2. Multi-select keyframes across tracks
3. Accordion scaling (stretch/compress selected range)
4. Copy/paste keyframes between layers
5. Keyframe snapping to grid and other keyframes
```

### Graph Editor
```
Build the graph editor component:
1. Display value curves for selected properties
2. Bezier handle manipulation for custom easing
3. Split X/Y dimensions for position property
4. Value snapping and grid alignment
5. Box selection and multi-curve editing
6. Zoom and pan with minimap
```

### Expression Engine
```
Implement the expression evaluation system:
1. JavaScript subset parser (no eval for security)
2. Expression context with time, layer access
3. Built-in functions (wiggle, random, clamp, lerp)
4. Error handling with line/column reporting
5. Expression caching for performance
6. Live preview while editing
```
