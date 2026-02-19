# Introduction

## Why This Book Exists

Open a graphic editor — Figma, Photoshop, Animate, Blender — and try to imagine how it works. Click a rectangle tool, drag on the canvas, and a shape appears. Resize it. Change its color. Group it with another shape. Undo. Redo. Export to PNG.

Each of those actions touches dozens of interconnected systems: a scene graph that tracks every object and its hierarchy, a rendering pipeline that converts vector math into pixels, a transform system that handles rotation around arbitrary pivot points, a serializer that can freeze the entire document to disk and bring it back. And that's before you get to visual effects, boolean operations, or GPU shaders.

Most programmers never learn how these systems work — not because they're impossibly hard, but because nobody explains them in sequence. University courses teach isolated algorithms. Open-source editors have millions of lines of code with decades of accumulated complexity. Tutorial projects stop at "draw a rectangle on a canvas element" and wave their hands at the rest.

This book closes that gap. It teaches you how to build a real graphic editor — not a toy, not a demo, but a production application — by walking through every system in the order we actually built it.

## The Project Behind the Book

Everything in this book comes from the development of Quar Animator, an open-source, web-native 2D graphic editor. We built it from an empty directory to a deployed application over multiple development sprints. By the end:

- **Thousands of tests** across dozens of test files, all passing
- **Multiple packages** in a TypeScript monorepo (core engine, export pipeline, type definitions, UI components, web application)
- **Drawing and editing tools** (selection, direct selection, pen, brush, eraser, rectangle, ellipse, polygon, star, text, artboard, hand)
- **WebGL shader programs** (flat color, gradient, texture, blur, blend, shadow, composite)
- **Visual effects** with drop shadows, layer blur, and 16 blend modes via multi-pass FBO compositing
- **Boolean operations**: non-destructive union, subtract, intersect, exclude
- **SVG import/export** with full path parsing, compound paths, and clipboard interop
- **Multiple export formats**: per-element PNG and SVG with configurable resolution
- **A binary file format** with image buffer extraction, migration chain across three format versions, and backward-compatible loading

None of this was designed in advance as a textbook exercise. We solved real problems, hit real bugs, and made real architectural decisions under real constraints. This book is a reconstruction of that process, organized so you can follow it from start to finish.

## What You Will Learn

This book covers the major systems that make up a graphic editor, in roughly the order you need to build them:

**Foundation.** How to structure a large creative application as a monorepo. How to design a scene graph — the tree data structure at the heart of every graphic editor. How coordinate systems work (screen space, world space, local space) and why getting them right early saves you months of debugging later. How to set up state management that works for an editor, which has very different needs than a typical web application.

**Rendering.** How to set up a WebGL 2 rendering pipeline from scratch — no Three.js, no Pixi, no framework. How to tessellate vector paths into triangles for the GPU. How strokes work (they're much harder than fills). How to render gradients, textures, and multi-contour shapes with holes. How to implement visual effects like drop shadows and blur using framebuffer objects and multi-pass rendering.

**Interaction.** How to build an extensible tool system where every tool shares a common interface. How selection works — hit testing, marquee selection, transform handles, resize, rotate. How the Pen tool's state machine manages Bezier curve creation. How undo/redo works using scene graph snapshots. How Figma-style group scoping works (double-click to enter, Escape to exit).

**Text & Typography.** How to load fonts with opentype.js and convert glyph outlines to vector paths. How to build inline text editing. How to convert live text to editable path outlines.

**Boolean Operations & SVG.** How non-destructive boolean operations preserve source shapes while rendering computed results. How to parse and generate SVG for ecosystem interoperability.

**Export.** How to design a binary file format with versioned migration. How to export individual elements as PNG or SVG at multiple resolutions.

**Lessons.** Every WebGL state leak we hit. Every React performance trap we fell into. How to write thousands of tests for visual software. Which architectural decisions paid off and which ones we'd reconsider.

## What You Won't Find Here

This is not a book about computer graphics theory. We won't derive the Bezier curve equation from first principles or prove the correctness of the earcut triangulation algorithm. When we use a mathematical concept, we'll explain what it does and why we need it, then show you how to implement it. If you want the proofs, we'll point you to the right references.

This is not a book about React, TypeScript, or WebGL in isolation. We assume you can read TypeScript, have used React, and understand that WebGL draws triangles. We won't explain what a `useEffect` hook is or how `gl.bindBuffer` works at the API level. We will explain why we chose certain patterns and where the standard tutorials lead you astray in an editor context.

This is not a book about building a specific product. Quar Animator is a 2D animation tool, but the systems we cover — scene graphs, transform pipelines, tool systems, undo/redo, selection, rendering — are the same systems you'd build for a vector illustration app, a diagramming tool, a level editor, a presentation builder, or any other application where users manipulate visual objects on a canvas.

## How This Book Is Organized

The book follows the order we actually built things, which turns out to be the order you _need_ to build things. You can't test a tool without a renderer. You can't test a renderer without a scene graph. You can't test a scene graph without a coordinate system. The dependency chain dictates the sequence.

**Part I (Chapters 1–5): Foundation** sets up the monorepo, the editor shell UI, the scene graph, the camera and coordinate system, and the state management store. By the end, you have an empty canvas that pans and zooms.

**Part II (Chapters 6–10): Rendering** builds the WebGL pipeline from context creation through shape rendering, grid drawing, texture display, and multi-pass effects. By the end, you can display any shape with fills, strokes, gradients, shadows, and blend modes.

**Part III (Chapters 11–18): Interaction** implements the tool system, all the drawing tools, selection and transform, direct path editing, group scoping, and undo/redo. By the end, you can draw, edit, and organize shapes.

**Part IV (Chapters 19–22): Properties & Panels** wires up the properties panel, layer panel, toolbar, and menu bar. By the end, the editor chrome is fully functional.

**Part V (Chapters 23–24): Text & Typography** adds text rendering through the opentype.js font pipeline and text-to-path conversion.

**Part VI (Chapters 25–26): Boolean Operations & SVG** adds non-destructive boolean operations and SVG import/export for ecosystem interoperability.

**Part VII (Chapters 27–29): Pages, Symbols & Organization** adds multi-page projects, Figma-style reusable symbols with instances and overrides, and artboards.

**Part VIII (Chapters 30–31): Export & File Format** designs the binary project format and implements per-element PNG and SVG export.

**Part IX (Chapters 32–35): Editor Polish** covers keyboard shortcuts, rulers and guides, context menus, and drag-and-drop import.

**Part X (Chapters 36–39): Lessons Learned** is a retrospective on WebGL pitfalls, React in real-time applications, testing strategies, and architecture decisions.

Each chapter is self-contained enough to read on its own, but they build on each other. If you're building along, follow the sequence. If you're looking up a specific system, jump straight to the relevant chapter — we'll note any dependencies at the top.

## How to Read the Code

Code samples in this book are TypeScript. They're extracted from the actual codebase, sometimes simplified for clarity but never fabricated. When a code sample is simplified, we'll say so and tell you where to find the complete version.

We use a few conventions:

```typescript
// This is a complete, runnable function
export function screenToWorld(screenX: number, screenY: number, camera: Camera): Vector2 {
  return {
    x: (screenX - camera.panX) / camera.zoom,
    y: (screenY - camera.panY) / camera.zoom,
  };
}
```

When we show a long file, we'll include the important parts and mark omissions:

```typescript
export class ShapeRenderer {
  private gl: WebGL2RenderingContext;
  private tessellationCache: Map<string, TessellationCacheEntry>;

  // ... constructor, shader setup ...

  render(sceneGraph: SceneGraph, vpMatrix: Float32Array): void {
    sceneGraph.traverseVisible((node) => {
      this.renderNode(node, vpMatrix);
      return true; // continue traversal
    });
  }

  // ... 400 more lines of rendering methods ...
}
```

File paths are shown relative to the monorepo root:

```
packages/core/src/rendering/ShapeRenderer.ts
apps/web/src/stores/editorStore.ts
packages/core/src/path/pathUtils.ts
```

Test examples use Vitest syntax, which is nearly identical to Jest:

```typescript
describe('Camera', () => {
  it('converts screen coordinates to world coordinates', () => {
    const camera = new Camera();
    camera.zoom = 2;
    camera.panX = 100;

    const world = camera.screenToWorld(200, 150);

    expect(world.x).toBe(50);
    expect(world.y).toBe(75);
  });
});
```

## Prerequisites

To get the most out of this book, you should be comfortable with:

- **TypeScript**: interfaces, generics, union types, type narrowing. You don't need to be an expert — we use straightforward TypeScript throughout, not clever type gymnastics.
- **React**: functional components, hooks (`useState`, `useEffect`, `useRef`, `useMemo`), context. We use Zustand for state management, which we'll introduce when we need it.
- **Basic linear algebra**: what a vector is, what a matrix multiply does, what "transform" means. If you know that a 2D point is an (x, y) pair and that you can multiply a matrix by a vector to move/rotate/scale it, you know enough. We'll build up the specific math as we go.
- **JavaScript/browser APIs**: `requestAnimationFrame`, `PointerEvent`, `ResizeObserver`, `Blob`, `ArrayBuffer`. We'll explain the less common ones when they appear.

You do _not_ need prior experience with:

- WebGL or GPU programming (we start from `getContext('webgl2')`)
- Binary file formats
- Computational geometry (tessellation, boolean operations, path fitting)

We teach all of these from the ground up.

## Setting Up

If you want to build along, here's what you need:

```bash
# Node.js 18+ and pnpm
npm install -g pnpm

# Clone the starter (or create from scratch — Chapter 1 walks through it)
git clone https://github.com/FunwayHQ/quar-animator.git
cd quar-animator

# Install dependencies
pnpm install

# Start the dev server
pnpm dev

# Run tests
pnpm test
```

The development environment is:

- **Node.js 18+** for the build toolchain
- **pnpm** for monorepo workspace management
- **Vite** for development server and production builds
- **Vitest** for testing (with JSDOM for DOM simulation)
- **TypeScript 5+** with strict mode enabled
- **React 18+** for the UI layer
- **A modern browser** with WebGL 2 support (Chrome, Firefox, Edge, Safari 15+)

No native dependencies, no WASM compilation step, no Docker. `pnpm install` and `pnpm dev` gets you running.

## Let's Build

The best way to learn how a graphic editor works is to build one. Not to read about one, not to study the source code of an existing one, but to start from nothing and add one system at a time, watching how each piece changes what's possible.

After Chapter 5, you'll have a canvas that pans and zooms with a scene graph that can hold any kind of node.

After Chapter 10, you'll be rendering shapes with fills, strokes, gradients, shadows, and blend modes at 60fps.

After Chapter 18, you'll have a full drawing application with tools, selection, transform, groups, and undo.

After Chapter 26, you'll have text rendering, boolean operations, and SVG import/export.

After Chapter 31, you'll have a binary file format and per-element export in multiple formats.

Each chapter adds something you can see and interact with. There's no long slog through theory before you get to draw your first shape. We build vertical slices — each one small enough to finish, visible enough to be satisfying, and foundational enough that the next slice builds on it.

Turn the page. We're starting with a blank directory and a `pnpm init`.
