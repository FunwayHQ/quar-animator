# Quar Animator

## Product Requirements Document

**Version:** 1.1  
**Date:** February 2026  
**License:** MIT  
**Platform:** Web (PWA), Desktop (Electron)

---

## Executive Summary

### The Market Opportunity

Adobe's February 2026 announcement that Animate is entering maintenance mode—with individual user access terminating by March 2027 and enterprise support ending by March 2029—marks the end of the Flash era that defined two decades of web and broadcast animation. This creates an unprecedented market vacuum affecting millions of animators with decades of accumulated work in proprietary FLA/XFL formats.

The current alternatives remain fragmented:

| Tool                  | Strength                 | Critical Gap                           |
| --------------------- | ------------------------ | -------------------------------------- |
| **Toon Boom Harmony** | Broadcast standard       | $139/month, desktop-only               |
| **Moho Pro**          | Rigging excellence       | No web export, no state machines       |
| **Rive**              | Interactive UI animation | Lacks long-form storytelling tools     |
| **OpenToonz**         | Professional scanning    | Notoriously unintuitive UI             |
| **Synfig**            | Vector tweening          | Steep learning curve, stability issues |

**Quar Animator** fills this void as the animation pillar of the QUAR family—alongside Quar Editor (3D) and Quar Vector (2D). It will be a free, open-source, web-native platform that synthesizes the narrative timeline of Animate, the rigging power of Moho, and the runtime performance of Rive.

### Product Vision

Quar Animator democratizes professional-grade 2D animation through modern browser technologies including WebAssembly (WASM) and WebGL. The tool supports hybrid workflows—unifying symbol-based tweening (Animate legacy) with mesh-based deformation (Moho legacy)—while pioneering interactive state machines for the web era.

### Strategic Pillars

1. **Web-Native Performance**: ThorVG/custom WASM renderers achieving 60fps vector manipulation with thousands of nodes
2. **Hybrid Workflow**: Unified symbol-based tweening and mesh-based deformation
3. **State Machine Paradigm**: Interactive animations without code—visual logic connecting animation states
4. **Ecosystem Integration**: Seamless interoperability with Quar Vector and Quar Editor via shared formats
5. **Open-Source First**: MIT license ensuring maximum adoption and community contribution

---

## Product Identity

| Attribute          | Value                                                                      |
| ------------------ | -------------------------------------------------------------------------- |
| **Product Name**   | Quar Animator                                                              |
| **Product Family** | QUAR Suite (Editor, Vector, Animator)                                      |
| **License**        | MIT                                                                        |
| **Platform**       | Web (PWA), Desktop (Electron wrapper)                                      |
| **Primary Users**  | 2D Rigging Artists, Motion Designers, Game Animators, Hobbyists, Educators |
| **File Format**    | `.quar` (glTF 2.0 with custom extensions)                                  |
| **Storage**        | Local only (IndexedDB for web, filesystem for desktop)                     |

---

## Target Users

### Professional Animators

Studio artists and freelancers currently using Adobe Animate, Toon Boom Harmony, or Moho for broadcast, web series, and commercial animation. They require complex rigging, efficient workflows, and broadcast-quality export.

### Game Developers

Indie and professional game developers needing skeletal animation with runtime integration for Unity, Unreal, Godot, and web game engines. They prioritize sprite sheet export, Spine-compatible formats, and efficient file sizes.

### Motion Designers

UI/UX designers and motion graphics artists creating interactive animations for websites, applications, and products. They need Lottie export, state machines for interactivity, and integration with design tools.

### Hobbyists and Educators

Animation students, teachers, and enthusiasts who need an accessible, free tool for learning and teaching animation principles. They require an intuitive interface, educational resources, and community support.

---

## Competitive Analysis

### Feature Comparison Matrix

| Feature            | Adobe Animate          | Moho Pro        | Rive                | Quar Animator           |
| ------------------ | ---------------------- | --------------- | ------------------- | ----------------------- |
| **Platform**       | Desktop (EOL)          | Desktop         | Web                 | Web + Desktop           |
| **Price**          | $23/mo                 | $399 perpetual  | Freemium            | Free (MIT)              |
| **Drawing Engine** | Destructive vector     | Non-destructive | Vector              | Hybrid modes            |
| **Rigging**        | Basic IK               | Smart Bones     | Bones + constraints | Smart Constraints       |
| **Interpolation**  | Fragmented (3 systems) | Unified graph   | Unified             | Unified                 |
| **Deformation**    | Limited warp           | Mesh binding    | Mesh                | GPU-accelerated mesh    |
| **State Machines** | Via code only          | None            | Visual editor       | Visual editor           |
| **Web Export**     | HTML5 Canvas           | None            | Rive runtime        | Lottie, SVG, WebGL      |
| **Scripting**      | ActionScript/JS        | Lua             | Luau                | TypeScript/WASM plugins |

### Open-Source Landscape Gaps

The open-source animation ecosystem lacks:

- **Modern UI/UX**: Most tools have dated, unintuitive interfaces
- **Integrated Rigging + Painting**: No single tool does both well
- **Stable Performance**: Crashes and memory issues plague existing options
- **Browser-Based Access**: All serious tools are desktop-only
- **State Machines**: No open-source tool offers visual interactive logic

Quar Animator addresses all of these gaps.

---

## Technical Architecture

### Rendering Engine

#### The DOM Constraint

Manipulating thousands of SVG nodes in the DOM triggers massive reflow and layout thrashing, making 60fps impossible for complex rigs. Canvas 2D is faster but lacks the shader pipeline needed for real-time mesh deformation (skinning).

#### The Solution: ThorVG + WebGL

**ThorVG** is selected as the primary vector rasterization engine—an open-source library designed for portability and performance with native Lottie support.

**Rendering Pipeline:**

```
Input: Vector Path (Bezier curves)
    ↓
Processing (WASM): Tessellate curves → triangles
                   Calculate bone influence (skinning matrices)
    ↓
Render (WebGL): Submit vertex buffers to GPU
                Vertex shader applies transformation matrices
```

WebAssembly delivers 6-10x performance improvement over JavaScript for animation calculations. Benchmarks demonstrate 200 mesh-deforming characters at 60fps using this architecture.

### Technology Stack

| Layer                    | Technology             | Purpose                              |
| ------------------------ | ---------------------- | ------------------------------------ |
| **Vector Rasterization** | ThorVG (WASM)          | Path tessellation, Lottie parsing    |
| **GPU Rendering**        | WebGL 2 / WebGPU       | Mesh deformation, skinning shaders   |
| **Physics**              | Rapier (WASM)          | Dynamic secondary motion, cloth/hair |
| **Video Export**         | FFmpeg.wasm            | Client-side MP4, WebM, GIF encoding  |
| **Local Storage**        | IndexedDB / Filesystem | Project persistence, asset cache     |
| **UI Framework**         | React + TypeScript     | Component architecture, type safety  |
| **Desktop Wrapper**      | Electron               | Native file access, menu integration |

### File Format: `.quar`

#### Why glTF 2.0

Lottie JSON is too verbose and slow to parse, lacking support for advanced rigging constraints. Rive's format is proprietary. **glTF 2.0** is the industry standard for scene graphs, supporting:

- Node hierarchies (layer trees)
- Meshes and accessors (vector geometry)
- Skins (bone systems)
- Animations (keyframe data)
- Binary efficiency via `.glb` variation

#### Custom Extensions for 2D Animation

| Extension                | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `QUAR_2d_shapes`         | Bezier path data (control points) for runtime curve editing |
| `QUAR_smart_constraints` | Dependency graph for Smart Bones (Driver → Driven Property) |
| `QUAR_vitruvian`         | Visibility groups for bone switching                        |
| `QUAR_state_machines`    | Interactive state machines with conditions and triggers     |

#### Example Constraint Schema

```json
{
  "extensions": {
    "QUAR_smart_constraints": {
      "constraints": [
        {
          "name": "Elbow_Correction",
          "driver": {
            "node": 12,
            "property": "rotation.z",
            "range": [0.0, 1.57]
          },
          "driven": {
            "target": 45,
            "property": "morphTarget_0",
            "interpolation": "LINEAR"
          }
        }
      ]
    }
  }
}
```

### Rigging Algorithm: FABRIK

For Inverse Kinematics, Quar Animator implements **FABRIK** (Forward And Backward Reaching Inverse Kinematics) rather than CCD:

- Treats joints as points on a line, iteratively adjusting positions
- Converges faster than Jacobian methods with no matrix inversion
- Angle constraints applied during backward-reaching phase
- Ideal for web performance due to computational efficiency

### Physics Engine: Rapier

**Rapier (WASM)** is selected over Matter.js for:

| Criteria     | Matter.js           | Rapier                   | Winner |
| ------------ | ------------------- | ------------------------ | ------ |
| Performance  | Good (< 100 bodies) | Excellent (1000+ bodies) | Rapier |
| Determinism  | No (FP variance)    | Yes (cross-platform)     | Rapier |
| Soft Bodies  | Limited             | Advanced                 | Rapier |
| Architecture | JavaScript          | Rust → WASM              | Rapier |

Determinism is crucial for consistent physics across sessions and potential future collaboration features.

### Undo/Redo Architecture

#### Per-Layer History

Each layer maintains its own history stack, enabling:

- Selective undo within one layer without affecting others
- Efficient memory usage (only changed layers grow history)
- Clear mental model for complex multi-layer edits

#### Implementation

| Aspect          | Approach                                                 |
| --------------- | -------------------------------------------------------- |
| **Pattern**     | Command pattern with layer-scoped stacks                 |
| **Limit**       | Unlimited until memory pressure detected                 |
| **Coalescing**  | Rapid changes (e.g., dragging) grouped into single entry |
| **Persistence** | History cleared on project close                         |

#### Global vs Local Undo

- `Ctrl/Cmd + Z`: Undo last action on **currently selected layer**
- `Ctrl/Cmd + Shift + Z`: Redo on current layer
- `Ctrl/Cmd + Alt + Z`: **Global undo** (across all layers, chronological)

---

## Functional Requirements

### Module 1: Canvas & Vector Engine

This module shares DNA with Quar Vector but is optimized for deformation and animation workflows.

#### Drawing Tools

| Tool                 | Priority | Description                                                        |
| -------------------- | -------- | ------------------------------------------------------------------ |
| **Bezier Pen**       | P0       | Standard path creation with split tangents (Alt-click)             |
| **Freehand Brush**   | P0       | Ramer-Douglas-Peucker simplification, pressure sensitivity         |
| **Shape Primitives** | P1       | Parametric rectangles, polygons, stars (editable until converted)  |
| **Boolean Brush**    | P1       | Real-time union/subtract for destructive painting (Animate legacy) |
| **Eraser**           | P0       | Vector-aware erasing with path splitting                           |
| **Selection Tools**  | P0       | Direct selection, lasso, marquee                                   |

#### Pressure Sensitivity

Via Pointer Events API `pressure` property for variable stroke width on supported devices (tablets, styluses).

#### Mesh Generation

- **Create Mesh from Layer**: Generates Delaunay triangulation encompassing vector bounds
- **Steiner Points**: User-added internal vertices define deformation behavior
- **Bitmap Mesh Rigging**: Import PNG, overlay vector mesh, texture-map for Spine-style raster animation

#### Text Tools

| Feature                     | Description                                   |
| --------------------------- | --------------------------------------------- |
| **Text Layers**             | Point text and area text with full formatting |
| **Font Library**            | Google Fonts integration (Figma-style picker) |
| **Text on Path**            | Bind text baseline to any vector path         |
| **Per-Character Animation** | Kinetic typography with staggered transforms  |

**Animatable Text Properties:**

- Content (with keyframed string interpolation)
- Font size, tracking (letter-spacing), line height
- Per-character position, rotation, scale, opacity
- Fill and stroke (independent animation)

**Export Handling:**

Text is baked to vector shapes for Lottie/dotLottie export to ensure cross-platform fidelity. Native `.quar` format preserves editability.

#### Effects System

All effects render in real-time with GPU acceleration.

| Effect           | Parameters                                  |
| ---------------- | ------------------------------------------- |
| **Blur**         | Radius, quality (box/gaussian)              |
| **Drop Shadow**  | Offset, blur, color, opacity, spread        |
| **Glow**         | Inner/outer, radius, color, intensity       |
| **Color Adjust** | Brightness, contrast, saturation, hue shift |
| **Color Matrix** | Custom 5x4 matrix for advanced correction   |

#### Masks & Clipping

| Type              | Description                              |
| ----------------- | ---------------------------------------- |
| **Alpha Mask**    | Grayscale source controls target opacity |
| **Clipping Mask** | Vector path clips child layers           |
| **Inverted Mask** | Toggle to reveal outside mask area       |

#### Blend Modes

Standard Photoshop-compatible modes: Normal, Multiply, Screen, Overlay, Darken, Lighten, Color Dodge, Color Burn, Hard Light, Soft Light, Difference, Exclusion, Hue, Saturation, Color, Luminosity.

#### Effect Animation

- All effect parameters are keyframable
- Effects can be stacked with drag-to-reorder
- Custom effects via plugin system (see Scripting)

#### Camera Tools

| Feature            | Description                                     |
| ------------------ | ----------------------------------------------- |
| **Multi-Camera**   | Multiple named cameras, switchable per scene    |
| **2.5D Parallax**  | Layer Z-depth property for depth-based movement |
| **Depth of Field** | Simulated focus plane with adjustable bokeh     |
| **Camera Presets** | Shake, handheld, breathing, dolly, truck        |

**Animatable Camera Properties:**

- Position (X, Y, Z for parallax travel)
- Rotation (roll)
- Zoom (field of view / orthographic scale)
- Focus distance and aperture (DoF)

**Camera in State Machines:**

Cameras can be assigned to states, enabling interactive camera cuts or smooth transitions based on user input.

**Parallax System:**

Each layer has an optional `z-depth` property (default 0). Camera movement at Z=0 produces standard panning. Layers with negative Z move faster (foreground), positive Z move slower (background), creating parallax depth.

### Module 2: Timeline & Animation

#### Unified Interpolation Engine

Unlike Animate's fragmented classic/motion/shape tweening systems, Quar Animator provides a **unified approach**:

| Traditional Term | Quar Animator Approach                            |
| ---------------- | ------------------------------------------------- |
| Classic Tween    | Position/Scale/Rotation property interpolation    |
| Motion Tween     | Position property with spatial path visualization |
| Shape Tween      | PathData property interpolation                   |

Any property is animatable on the same graph editor with the same easing controls.

#### Dope Sheet View (Default)

- Keyframes displayed as diamonds on horizontal tracks
- **Accordion Scaling**: Select keyframe block, drag edge to stretch/compress time
- Layer tracks with expand/collapse for nested timelines
- Playhead scrubbing with audio sync

#### Graph Editor View

- Function curves: `f(t) = value`
- Cubic-bezier handles for custom easing
- **Split Dimensions**: Position X/Y separable for different curves (arc motion)
- Value snapping and grid alignment

#### Easing Presets

| Category     | Presets                                |
| ------------ | -------------------------------------- |
| **Standard** | Linear, Ease-In, Ease-Out, Ease-In-Out |
| **Power**    | Quad, Cubic, Quart, Quint, Expo        |
| **Physics**  | Bounce, Elastic, Spring, Back          |
| **Custom**   | User-defined cubic-bezier curves       |

#### Onion Skinning

GPU-accelerated using Frame Buffer Objects (FBOs):

1. Render previous frames (t-1, t-2) to off-screen texture with red tint shader
2. Render future frames (t+1, t+2) with green tint shader
3. Composite behind active frame

**Zero performance cost during playback.**

#### Nested Timelines

Every layer group or object contains its own timeline:

- **Synchronized (default)**: Scrubbing main timeline shows nested animation
- **Decoupled (toggle)**: Nested timeline runs independently (Movie Clip behavior)

Unlike Animate's confusing Graphic/Movie Clip distinction, behavior is a simple toggle.

### Module 3: Rigging Laboratory

The core differentiator—Moho-level rigging in a web-native environment.

#### Bone Tool

| Feature               | Description                                     |
| --------------------- | ----------------------------------------------- |
| **Creation**          | Click-drag to create chains with auto-parenting |
| **Split/Reparent**    | Drag bones in hierarchy tree to restructure     |
| **IK Chains**         | Define start/end bones for IK solving           |
| **Angle Constraints** | Set rotation limits per bone                    |
| **Length Lock**       | Prevent bone stretching during IK               |

#### Weight Painting

| Tool         | Function                                |
| ------------ | --------------------------------------- |
| **Add**      | Increase bone influence on vertices     |
| **Subtract** | Decrease bone influence                 |
| **Smooth**   | Blend weights between adjacent vertices |
| **Blur**     | Soften weight boundaries                |

**Visual Mode**: Mesh displays as heat map (Blue = 0%, Red = 100% influence)

**Auto-Rig Algorithm**: Bounded Biharmonic Weights automatically calculates smooth skinning weights from bone skeleton, providing 90%+ starting point for manual refinement.

#### Smart Dials (Constraint System)

Smart Bones solve the **joint distortion problem** where vector arms create the "candy-wrapper" effect when bending.

**Workflow:**

1. Select bone (e.g., Forearm)
2. Create new Action "Bend 90°"
3. Timeline enters **Isolation Mode**
4. Rotate bone to target angle
5. Use **Point Magnet Tool** to reshape geometry naturally
6. System records point offsets as morph target driven by bone rotation

**Driver → Driven Mapping:**

```
Driver: Forearm.rotation.z [0° → 90°]
    ↓
Driven: BicepMesh.morphTarget_0 [0.0 → 1.0]
Interpolation: LINEAR (or custom curve)
```

#### Vitruvian Bones

Handles topology changes for complex limb configurations:

- **Problem**: Character needs "Straight Arm" (Shoulder → Elbow → Wrist) AND "Foreshortened Arm" (Shoulder → Wrist) for different poses
- **Solution**: Bone Groups with keyframable visibility toggles
- Inactive bones and bound artwork hidden from rendering and IK calculation
- Switch between configurations at any keyframe

#### Physics Integration

Rapier WASM engine for automatic secondary motion:

| Feature               | Description                                  |
| --------------------- | -------------------------------------------- |
| **Dynamic Chains**    | Tag bone chains for physics simulation       |
| **Per-Bone Settings** | Weight, gravity, damping, stiffness          |
| **Collision Shapes**  | Optional collision geometry                  |
| **Wind Forces**       | Directional forces for environmental effects |

Use cases: Hair, cloth, tails, antenna, dangling accessories.

### Module 4: State Machines

Visual interactive animations without code—Rive's paradigm for open-source.

#### Visual State Editor

- Node-based interface connecting animation states
- Drag to create transitions between states
- Preview mode for testing state logic

#### State Types

| Type                | Description                                           |
| ------------------- | ----------------------------------------------------- |
| **Animation State** | Plays a timeline animation                            |
| **Blend State**     | Blends between multiple animations based on parameter |
| **Entry State**     | Initial state on load                                 |
| **Any State**       | Transition source from any current state              |

#### Transition Conditions

| Input Type  | Example                |
| ----------- | ---------------------- |
| **Boolean** | `isHovered == true`    |
| **Numeric** | `scrollProgress > 0.5` |
| **Trigger** | `onClick` (fires once) |

#### Interactive Triggers

| Trigger         | Web Event                          |
| --------------- | ---------------------------------- |
| **Hover Enter** | `mouseenter`                       |
| **Hover Exit**  | `mouseleave`                       |
| **Click**       | `click`                            |
| **Scroll**      | `scroll` with progress calculation |
| **Custom**      | Exposed via runtime API            |

#### Data Binding (Future)

Connect live data to animation properties:

```javascript
// Runtime API example
animator.setInput('progress', fetchedData.percentage);
animator.setInput('isActive', user.isLoggedIn);
```

### Module 5: Asset Management

#### Symbol Library

| Feature            | Description                                     |
| ------------------ | ----------------------------------------------- |
| **Master Symbols** | Reusable assets with internal timelines         |
| **Instances**      | Lightweight references to masters               |
| **Overrides**      | Local property changes without affecting master |
| **Nested Symbols** | Full hierarchy with override inheritance        |

**Instance Override Properties:**

- Color effects (tint, brightness, alpha)
- Transform (position, scale, rotation, skew)
- Visibility
- Blend mode

#### Asset Import

| Format           | Support                                |
| ---------------- | -------------------------------------- |
| **SVG**          | Full path import, maintain editability |
| **PNG/JPG/WebP** | Bitmap import for mesh rigging         |
| **PSD**          | Layer import (via psd.js)              |
| **Lottie JSON**  | Import existing Lottie animations      |
| **Quar Vector**  | Native integration with .qvec files    |

#### Audio Management

| Feature              | Description                             |
| -------------------- | --------------------------------------- |
| **Waveform Display** | Visual audio representation in timeline |
| **Multiple Tracks**  | Independent volume controls             |
| **Markers**          | Sync points for animation alignment     |
| **Lip-Sync Assist**  | (Future) ML-based phoneme detection     |

Supported formats: MP3, WAV, OGG, AAC

### Module 6: Scripting & Plugin Architecture

#### Frame Expressions

JavaScript-syntax expressions for procedural animation:

```javascript
// Example: oscillating rotation
Math.sin(time * 2 * Math.PI) * 15

// Example: follow another layer with delay
layers["Target"].position.valueAtTime(time - 0.1)

// Example: random wiggle
wiggle(frequency: 3, amplitude: 10)
```

**Expression Context:**

| Variable       | Description                    |
| -------------- | ------------------------------ |
| `time`         | Current time in seconds        |
| `frame`        | Current frame number           |
| `value`        | Pre-expression property value  |
| `layers`       | Access to other layers by name |
| `thisLayer`    | Reference to current layer     |
| `thisProperty` | Reference to current property  |

#### Plugin System

**Plugin Formats:**

| Format             | Use Case                                        |
| ------------------ | ----------------------------------------------- |
| **Single-file JS** | Simple tools, expressions, UI panels            |
| **WASM Module**    | Performance-critical algorithms, custom effects |

**Plugin API Surface:**

- Canvas tools (custom drawing modes)
- Timeline actions (batch operations)
- Export processors (custom format handlers)
- Effect definitions (GPU shader + parameters)
- Panel UI (React components)

**Sandboxing:**

Plugins run in isolated Web Workers with:

- No direct DOM access
- Controlled file system access (user-approved paths only)
- Memory limits per plugin
- Permission prompts for sensitive operations (network, clipboard)

---

## Export Capabilities

### Export Format Strategy

Learning from Fable's failure where proprietary formats created lock-in anxiety, Quar Animator prioritizes **interoperability and portability**.

### Supported Formats

#### P0 - Essential (Phase 1)

| Format           | Best For                 | Limitations                    |
| ---------------- | ------------------------ | ------------------------------ |
| **Lottie JSON**  | Web/mobile UI animation  | No effects, expressions, audio |
| **dotLottie**    | Compressed web delivery  | Same as Lottie                 |
| **GIF**          | Social sharing, previews | 256 colors, large files        |
| **PNG Sequence** | Compositing workflows    | Large total size               |

#### P1 - High Priority (Phase 2)

| Format           | Best For                  | Limitations              |
| ---------------- | ------------------------- | ------------------------ |
| **Sprite Sheet** | Game engines (universal)  | No vector scaling        |
| **MP4 (H.264)**  | Universal video playback  | No interactivity         |
| **WebM (VP9)**   | Web video with alpha      | Limited Safari support   |
| **SVG + SMIL**   | Self-contained animations | Not hardware accelerated |

#### P2 - Extended (Phase 3)

| Format          | Best For                     | Limitations                 |
| --------------- | ---------------------------- | --------------------------- |
| **Spine JSON**  | Game engine skeletal         | Spine license for runtime   |
| **APNG**        | High-quality animated images | Large file sizes            |
| **glTF/GLB**    | 3D engine integration        | 2D features need extensions |
| **DragonBones** | Alternative game format      | Less common                 |

### Sprite Sheet Options

| Option          | Values                                             |
| --------------- | -------------------------------------------------- |
| **Layout**      | Grid, Packed (texture atlas)                       |
| **Format**      | PNG, WebP                                          |
| **Data Format** | JSON (generic), JSON (Phaser), XML (Unity), Custom |
| **Trim**        | Remove transparent pixels                          |
| **Padding**     | Pixels between frames                              |
| **Scale**       | 0.25x to 4x                                        |

### Video Export Settings

| Setting           | Options                           |
| ----------------- | --------------------------------- |
| **Resolution**    | 720p, 1080p, 4K, Custom           |
| **Frame Rate**    | 24, 30, 60, Custom                |
| **Codec**         | H.264, VP9, ProRes (desktop only) |
| **Quality**       | Low, Medium, High, Lossless       |
| **Alpha Channel** | WebM VP9, ProRes 4444             |

### Runtime Libraries (Future)

Open-source runtime libraries for playback:

- **quar-runtime-web**: JavaScript/TypeScript (browsers, Node.js)
- **quar-runtime-unity**: C# package
- **quar-runtime-godot**: GDScript/C#
- **quar-runtime-flutter**: Dart package
- **quar-runtime-react-native**: React Native component

---

## User Interface Design

### Design Principles

1. **Progressive Disclosure**: Simple interface revealing complexity as needed
2. **QUAR Family Consistency**: Shared patterns with Quar Editor and Quar Vector
3. **Keyboard-First**: Comprehensive shortcuts with industry defaults
4. **Dark Mode Default**: Reduced eye strain for extended sessions
5. **Responsive Panels**: Dockable, resizable, saveable layouts

### Workspace Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Menu Bar                                                        │
├──────────┬──────────────────────────────────────┬───────────────┤
│          │                                      │               │
│  Tools   │           Canvas                     │  Properties   │
│          │                                      │               │
│          │                                      ├───────────────┤
│          │                                      │               │
│          │                                      │  Layers       │
│          │                                      │               │
├──────────┴──────────────────────────────────────┼───────────────┤
│                                                 │               │
│              Timeline                           │  Assets       │
│                                                 │               │
└─────────────────────────────────────────────────┴───────────────┘
```

### Panel Descriptions

| Panel          | Purpose                                                         |
| -------------- | --------------------------------------------------------------- |
| **Menu Bar**   | File, Edit, View, Animation, Rigging, Export, Help              |
| **Tools**      | Mode-based tool switching (Selection, Drawing, Camera, Rigging) |
| **Canvas**     | Main viewport with zoom, pan, rotation, rulers, guides          |
| **Properties** | Context-sensitive panel for selected object                     |
| **Layers**     | Scene hierarchy with visibility, lock, blend mode               |
| **Timeline**   | Dope sheet/graph editor with layer tracks                       |
| **Assets**     | Symbol library, imported files, audio                           |

### Keyboard Shortcuts (Defaults)

| Action            | Shortcut               |
| ----------------- | ---------------------- |
| Selection Tool    | `V`                    |
| Direct Selection  | `A`                    |
| Pen Tool          | `P`                    |
| Brush Tool        | `B`                    |
| Eraser            | `E`                    |
| Bone Tool         | `Shift+B`              |
| Play/Pause        | `Space`                |
| Previous Frame    | `,`                    |
| Next Frame        | `.`                    |
| Insert Keyframe   | `F6`                   |
| Clear Keyframe    | `Shift+F6`             |
| Toggle Onion Skin | `O`                    |
| Zoom In           | `Ctrl/Cmd + =`         |
| Zoom Out          | `Ctrl/Cmd + -`         |
| Fit to Window     | `Ctrl/Cmd + 0`         |
| Undo (Layer)      | `Ctrl/Cmd + Z`         |
| Redo (Layer)      | `Ctrl/Cmd + Shift + Z` |
| Global Undo       | `Ctrl/Cmd + Alt + Z`   |
| Text Tool         | `T`                    |
| Camera Tool       | `C`                    |

### Accessibility

- Full keyboard navigation
- Screen reader support for UI elements
- High contrast mode option
- Customizable font sizes
- Color blindness accommodations for onion skinning

---

## Development Roadmap

### Phase 1: Foundation (Months 1-6)

**Objective**: Functional vector animator with basic export.

#### Milestones

| Month | Deliverable                                                 |
| ----- | ----------------------------------------------------------- |
| 1-2   | Project setup, ThorVG WASM integration, basic canvas        |
| 3-4   | Timeline (dope sheet), keyframe system, basic interpolation |
| 5     | Drawing tools (pen, brush, shapes), layer system            |
| 6     | Onion skinning, Lottie export, GIF export                   |

#### Phase 1 Features

- [ ] ThorVG WASM rendering engine
- [ ] Canvas with zoom, pan, rotation
- [ ] Basic timeline with dope sheet view
- [ ] Pen tool with Bezier curves
- [ ] Freehand brush with simplification
- [ ] Shape primitives (rectangle, ellipse, polygon)
- [ ] Layer system with groups
- [ ] Transform keyframes (position, scale, rotation, opacity)
- [ ] Linear and bezier interpolation
- [ ] Onion skinning (FBO-based)
- [ ] Lottie JSON export
- [ ] GIF export via FFmpeg.wasm
- [ ] PNG sequence export
- [ ] Local storage (IndexedDB)
- [ ] Undo/redo system

### Phase 2: Rigging Engine (Months 7-12)

**Objective**: Moho Debut parity for skeletal animation.

#### Milestones

| Month | Deliverable                                          |
| ----- | ---------------------------------------------------- |
| 7-8   | Bone tool, FK animation, basic weight painting       |
| 9-10  | IK solver (FABRIK), mesh deformation, WebGL skinning |
| 11    | Smart Bones constraint system, graph editor          |
| 12    | Vitruvian Bones, shape tweening, .quar format spec   |

#### Phase 2 Features

- [ ] Bone creation tool with auto-parenting
- [ ] Forward kinematics animation
- [ ] FABRIK inverse kinematics solver
- [ ] Angle constraints for bones
- [ ] Weight painting tools (add, subtract, smooth, blur)
- [ ] Auto-rig via Bounded Biharmonic Weights
- [ ] WebGL skinning shaders
- [ ] Mesh deformation with custom vertices
- [ ] Smart Bones Actions panel
- [ ] Point Magnet tool for corrective shapes
- [ ] Driver → Driven constraint mapping
- [ ] Vitruvian Bones (bone group switching)
- [ ] Graph editor for animation curves
- [ ] Shape tweening (PathData interpolation)
- [ ] Bitmap mesh rigging (texture mapping)
- [ ] .quar file format (glTF + extensions)
- [ ] Sprite sheet export (JSON + PNG)

### Phase 3: Production Features (Months 13-18)

**Objective**: Production-ready tool with advanced features.

#### Milestones

| Month | Deliverable                                       |
| ----- | ------------------------------------------------- |
| 13-14 | State machine editor, interactive triggers        |
| 15-16 | Audio sync, symbol library, nested timelines      |
| 17-18 | Physics engine, video export, plugin architecture |

#### Phase 3 Features

- [ ] Visual state machine editor
- [ ] State transitions with conditions
- [ ] Boolean, numeric, trigger inputs
- [ ] Hover, click, scroll triggers
- [ ] Audio import and waveform display
- [ ] Audio sync markers
- [ ] Symbol library with instances
- [ ] Instance overrides
- [ ] Nested timeline synchronization
- [ ] Rapier physics integration
- [ ] Dynamic bone chains
- [ ] MP4 export (H.264)
- [ ] WebM export (VP9 with alpha)
- [ ] SVG+SMIL export
- [ ] Plugin architecture (TypeScript API)
- [ ] Custom easing curve editor
- [ ] Project templates

### Phase 4: Ecosystem (Months 19-24)

**Objective**: Ecosystem integration and community growth.

#### Milestones

| Month | Deliverable                               |
| ----- | ----------------------------------------- |
| 19-20 | Quar Vector integration, PSD import       |
| 21-22 | Runtime libraries (web, Unity, Godot)     |
| 23-24 | Documentation, tutorials, community tools |

#### Phase 4 Features

- [ ] Quar Vector asset import (.qvec)
- [ ] Quar Editor export bridge (2D → 3D)
- [ ] PSD layer import
- [ ] Lottie import
- [ ] quar-runtime-web library
- [ ] quar-runtime-unity package
- [ ] quar-runtime-godot addon
- [ ] Spine JSON export
- [ ] DragonBones export
- [ ] Auto lip-sync (ML phoneme detection)
- [ ] Magic Rig (ML auto-rigging from image)
- [ ] Adobe Animate import (FLA/XFL) - best-effort conversion
  - Classic/motion tweens → unified keyframes
  - Symbols → Quar symbols with instances
  - ActionScript → warnings only (manual state machine conversion)
  - Unsupported features → warning report with workarounds
- [ ] Comprehensive documentation
- [ ] Video tutorials
- [ ] Example project library

### Milestone Timeline

| Milestone   | Target Date   | Key Deliverable                      |
| ----------- | ------------- | ------------------------------------ |
| **Alpha 1** | August 2026   | Vector animation with Lottie export  |
| **Alpha 2** | November 2026 | Basic rigging with bones and weights |
| **Beta 1**  | February 2027 | Full rigging with Smart Bones        |
| **Beta 2**  | June 2027     | State machines and audio sync        |
| **RC 1**    | October 2027  | Feature complete, optimization       |
| **v1.0**    | February 2028 | Production release                   |

---

## Success Metrics

### Technical Performance

| Metric                         | Target          | Measurement           |
| ------------------------------ | --------------- | --------------------- |
| Canvas frame rate (1000 nodes) | 60fps sustained | Performance profiling |
| Mesh deformation (100 bones)   | 60fps sustained | Benchmark scenes      |
| Time to first paint            | < 3 seconds     | Lighthouse audit      |
| WASM payload size              | < 5MB gzipped   | Bundle analysis       |
| Lottie export accuracy         | > 95% fidelity  | Visual comparison     |
| Project save time (100MB)      | < 2 seconds     | Stopwatch             |
| Undo/redo responsiveness       | < 50ms          | Performance profiling |

### Adoption Metrics (12 months post-launch)

| Metric                    | Target   |
| ------------------------- | -------- |
| Monthly Active Users      | 50,000+  |
| GitHub Stars              | 10,000+  |
| Community Contributors    | 100+     |
| Projects Created          | 500,000+ |
| Runtime Library Downloads | 100,000+ |
| Discord Community Members | 5,000+   |

### User Satisfaction

| Metric                    | Target            |
| ------------------------- | ----------------- |
| Net Promoter Score        | > 50              |
| Feature satisfaction      | > 4.0/5.0 average |
| Bug report resolution     | < 7 days average  |
| Documentation helpfulness | > 4.0/5.0 rating  |

---

## Risks and Mitigations

| Risk                         | Impact | Likelihood | Mitigation                                               |
| ---------------------------- | ------ | ---------- | -------------------------------------------------------- |
| Browser API limitations      | High   | Medium     | WebGPU fallback, Electron for advanced features          |
| WASM performance ceiling     | High   | Low        | Adaptive LOD, background worker optimization             |
| Feature scope creep          | Medium | High       | Strict phase gating, community feedback prioritization   |
| Rive competitive response    | Medium | Medium     | Focus on long-form animation, open ecosystem             |
| Community adoption lag       | Medium | Medium     | Migration tools, Animate import, comprehensive tutorials |
| Contributor burnout          | High   | Medium     | Clear contribution guidelines, modular architecture      |
| Browser compatibility issues | Medium | Medium     | Progressive enhancement, feature detection               |

### Lessons from Fable's Failure

Fable's November 2024 shutdown provides critical lessons:

1. **Format Portability**: Never lock users into proprietary formats
   - _Quar approach_: glTF-based .quar with comprehensive export options

2. **Sustainable Model**: Design for community sustainability
   - _Quar approach_: MIT license maximizes adoption; sustainability through ecosystem value

3. **Workflow Differentiation**: Focus on unique value, not AI gimmicks
   - _Quar approach_: Rigging + state machines + QUAR ecosystem integration

4. **User Data Ownership**: Users must own their files
   - _Quar approach_: Local-first storage, standard formats, no cloud lock-in

---

## Appendices

### Appendix A: Render Engine Comparison

| Engine               | Type          | Lottie Support | Size   | Role in Quar              |
| -------------------- | ------------- | -------------- | ------ | ------------------------- |
| **ThorVG**           | Vector/Raster | Native         | ~150KB | Primary rasterizer        |
| **PixiJS**           | WebGL 2D      | Via plugin     | Medium | Fallback renderer         |
| **Skia (CanvasKit)** | Vector/Raster | Native         | ~3MB   | Alternative consideration |
| **Three.js**         | 3D WebGL      | Partial        | Large  | Used in Quar Editor       |

**Decision**: ThorVG selected for native Lottie support, small footprint, and active development. PixiJS as fallback for WebGL 2D rendering when ThorVG encounters edge cases.

### Appendix B: IK Algorithm Comparison

| Algorithm    | Pros                         | Cons                        | Use Case             |
| ------------ | ---------------------------- | --------------------------- | -------------------- |
| **FABRIK**   | Fast, stable, no matrix math | Difficult angle constraints | Primary IK solver    |
| **CCD**      | Simple implementation        | Popping, unnatural motion   | Backup/simple chains |
| **Jacobian** | Physically accurate          | Expensive, matrix inversion | Not suitable for web |

**Decision**: FABRIK as primary solver with angle constraints applied during backward-reaching phase.

### Appendix C: File Format Comparison

| Format                  | Pros                       | Cons                | Support Level      |
| ----------------------- | -------------------------- | ------------------- | ------------------ |
| **Lottie JSON**         | Universal, well-documented | Verbose, no rigging | P0 Export          |
| **dotLottie**           | Compressed Lottie          | Same limitations    | P0 Export          |
| **Rive (.riv)**         | Compact, state machines    | Proprietary         | Reference only     |
| **Spine (.json/.skel)** | Game industry standard     | Requires license    | P2 Export          |
| **glTF**                | 3D standard, extensible    | 2D needs extensions | Native format base |

### Appendix D: Supported Platforms

#### Web Browsers

| Browser | Minimum Version | Notes                               |
| ------- | --------------- | ----------------------------------- |
| Chrome  | 90+             | Full support                        |
| Firefox | 90+             | Full support                        |
| Safari  | 15+             | WebGL limitations on older versions |
| Edge    | 90+             | Full support (Chromium-based)       |

#### Desktop (Electron)

| OS      | Minimum Version             |
| ------- | --------------------------- |
| Windows | 10+                         |
| macOS   | 10.15+ (Catalina)           |
| Linux   | Ubuntu 20.04+ or equivalent |

#### Hardware Requirements

| Component | Minimum         | Recommended       |
| --------- | --------------- | ----------------- |
| RAM       | 4GB             | 8GB+              |
| GPU       | WebGL 2 capable | Dedicated GPU     |
| Storage   | 500MB           | 2GB+ for projects |
| Display   | 1280x720        | 1920x1080+        |

---

## Glossary

| Term                | Definition                                                    |
| ------------------- | ------------------------------------------------------------- |
| **Alpha Mask**      | Grayscale image controlling target layer opacity              |
| **Blend Mode**      | Algorithm determining how layers combine visually             |
| **Bone**            | A transform node in a skeletal hierarchy used for animation   |
| **CRDT**            | Conflict-free Replicated Data Type (for future collaboration) |
| **Depth of Field**  | Camera effect simulating focus blur based on distance         |
| **Dope Sheet**      | Timeline view showing keyframes as markers                    |
| **FABRIK**          | Forward And Backward Reaching Inverse Kinematics algorithm    |
| **FBO**             | Frame Buffer Object, for off-screen rendering                 |
| **FK**              | Forward Kinematics, animating bones from root to tip          |
| **Expression**      | JavaScript code that procedurally generates property values   |
| **glTF**            | GL Transmission Format, 3D scene standard                     |
| **Graph Editor**    | Timeline view showing value curves over time                  |
| **IK**              | Inverse Kinematics, solving bone chain from target position   |
| **Lottie**          | JSON-based animation format by Airbnb                         |
| **Morph Target**    | Shape deformation driven by weight value                      |
| **Onion Skinning**  | Ghosted display of previous/next frames                       |
| **Parallax**        | Depth illusion created by layers moving at different speeds   |
| **Plugin**          | User-installed extension adding custom functionality          |
| **Smart Bone**      | Bone that drives corrective shape deformation                 |
| **State Machine**   | Visual logic for interactive animation transitions            |
| **Tessellation**    | Converting curves to triangles for GPU rendering              |
| **Tween**           | Interpolated animation between keyframes                      |
| **Vitruvian Bone**  | Switchable bone configuration for topology changes            |
| **WASM**            | WebAssembly, binary format for web performance                |
| **Weight Painting** | Assigning bone influence to mesh vertices                     |

---

## Document History

| Version | Date          | Author    | Changes                                                                                                            |
| ------- | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| 1.0     | February 2026 | QUAR Team | Initial PRD                                                                                                        |
| 1.1     | February 2026 | QUAR Team | Added Text & Typography, Effects System, Camera Tools, Scripting & Plugins, Undo/Redo Architecture, FLA/XFL Import |

---

_This document is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The Quar Animator software is licensed under MIT._
