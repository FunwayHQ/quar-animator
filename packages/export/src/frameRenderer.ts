/**
 * Frame Renderer
 *
 * Renders individual animation frames to offscreen WebGL canvases.
 * Reuses the offscreen rendering pattern from exportService.ts.
 */

import type { Node, Timeline, Color } from '@quar/types';
import type { SceneGraph } from '@quar/core';
import { WebGLRenderer, ShapeRenderer, mat3 } from '@quar/core';
import { evaluateNodeAtFrame, applyAnimatedValues } from '@quar/animation';

// Re-export pure utilities from exportUtils for convenience
export { getFrameCount, generateFrameFilenames } from './exportUtils';

// ============================================================================
// Types
// ============================================================================

export interface FrameRenderOptions {
  width: number;
  height: number;
  multiplier?: number;
  backgroundColor?: Color | null; // null = transparent
}

export interface FrameRenderContext {
  sceneGraph: SceneGraph;
  timeline: Timeline;
}

export interface FrameRendererHandle {
  /** Render a single frame and return the canvas */
  renderFrame(ctx: FrameRenderContext, frame: number): HTMLCanvasElement;
  /** Render a frame and return a PNG blob */
  renderFrameAsBlob(ctx: FrameRenderContext, frame: number): Promise<Blob | null>;
  /** Clean up GPU resources */
  dispose(): void;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a reusable frame renderer for multi-frame export.
 *
 * Allocates an offscreen WebGL canvas once and reuses it for every frame.
 */
export function createFrameRenderer(options: FrameRenderOptions): FrameRendererHandle {
  const { width, height, multiplier = 1, backgroundColor = null } = options;

  const pixelW = Math.ceil(width * multiplier);
  const pixelH = Math.ceil(height * multiplier);

  const canvas = document.createElement('canvas');
  canvas.width = pixelW;
  canvas.height = pixelH;

  const renderer = new WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
    alpha: true,
  });

  const shapeRenderer = new ShapeRenderer(renderer);

  // Build orthographic VP matrix
  const halfW = width / 2;
  const halfH = height / 2;
  const projection = mat3.create(1 / halfW, 0, 0, 1 / halfH, 0, 0);
  const view = mat3.create(1, 0, 0, 1, -width / 2, -height / 2);
  const vpMatrix = mat3.multiply(projection, view);

  const gl = renderer.context;

  function renderFrame(ctx: FrameRenderContext, frame: number): HTMLCanvasElement {
    const { sceneGraph, timeline } = ctx;

    // Snapshot animated nodes before mutation so we can restore them after rendering
    const snapshots = new Map<string, Record<string, unknown>>();
    for (const track of timeline.tracks) {
      const node = sceneGraph.getNode(track.nodeId);
      if (node && !snapshots.has(track.nodeId)) {
        snapshots.set(track.nodeId, structuredClone(node));
      }
    }

    try {
      // Apply animation at the given frame to all animated nodes
      for (const track of timeline.tracks) {
        const node = sceneGraph.getNode(track.nodeId);
        if (!node) continue;

        const animatedValues = evaluateNodeAtFrame(timeline, track.nodeId, frame);
        if (animatedValues.size > 0) {
          const updatedNode = applyAnimatedValues(node, animatedValues);
          sceneGraph.updateNode(track.nodeId, updatedNode as Partial<Node>);
        }
      }

      // Set viewport and clear
      gl.viewport(0, 0, pixelW, pixelH);

      if (backgroundColor) {
        gl.clearColor(
          backgroundColor.r / 255,
          backgroundColor.g / 255,
          backgroundColor.b / 255,
          backgroundColor.a
        );
      } else {
        gl.clearColor(0, 0, 0, 0);
      }
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Render scene
      shapeRenderer.render(sceneGraph, vpMatrix);
    } finally {
      // Restore original node state after rendering
      for (const [nodeId, snapshot] of snapshots) {
        sceneGraph.updateNode(nodeId, snapshot as Partial<Node>);
      }
    }

    return canvas;
  }

  function renderFrameAsBlob(ctx: FrameRenderContext, frame: number): Promise<Blob | null> {
    renderFrame(ctx, frame);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
  }

  function dispose(): void {
    shapeRenderer.dispose();
    renderer.dispose();
  }

  return { renderFrame, renderFrameAsBlob, dispose };
}
