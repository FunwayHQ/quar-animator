/**
 * Frame Renderer
 *
 * Renders individual animation frames to offscreen WebGL canvases.
 * Reuses the offscreen rendering pattern from exportService.ts.
 */

import type {
  Node,
  Timeline,
  Color,
  DynamicChain,
  DynamicChainState,
  IKChain,
  SmartBoneAction,
  SymbolDefinition,
  WindSettings,
} from '@quar/types';
import type { SceneGraph } from '@quar/core';
import { WebGLRenderer, ShapeRenderer, mat3 } from '@quar/core';
import { evaluateTimelineAtFrame, applyAnimatedValues } from '@quar/animation';
import {
  evaluateDynamicChainsAtFrame,
  evaluateIKChains,
  evaluateSmartBones,
  resetDynamicChainStates,
  type DynamicChainClock,
  type DynamicChainSceneGraph,
} from '@quar/rigging';

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

/** The rig evaluated on top of the keyframes, in the editor's order. */
export interface FrameRig {
  ikChains?: IKChain[];
  dynamicChains?: DynamicChain[];
  smartBoneActions?: SmartBoneAction[];
  wind?: WindSettings;
  /** Timeline frame rate — physics advances 1/frameRate seconds per frame. */
  frameRate: number;
}

export interface FrameRenderContext {
  sceneGraph: SceneGraph;
  timeline: Timeline;
  /** IK, physics and Smart Bones, so exports pose rigs like the editor does. */
  rig?: FrameRig;
  /** Restrict frame rendering to these scene-graph roots and their descendants. */
  exportRootIds?: string[];
  /** World-space rectangle mapped to the full output canvas. */
  viewportBounds?: { x: number; y: number; width: number; height: number };
  /** Definitions symbol instances are drawn from (without them, instances draw nothing). */
  symbols?: SymbolDefinition[];
}

export interface FrameRendererHandle {
  /**
   * Pre-load image textures so they render correctly, those inside the
   * symbols' definitions too. Must be awaited before renderFrame.
   */
  preloadTextures(
    nodes: Node[],
    sceneGraph: SceneGraph,
    symbols?: SymbolDefinition[]
  ): Promise<void>;
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
  // Bones are rig helpers, not artwork
  shapeRenderer.setDrawRigHelpers(false);
  // The definitions last handed to the shape renderer
  let symbols: SymbolDefinition[] | undefined;

  // Physics state carries from one frame to the next; it restarts whenever a
  // pass goes back in time (GIF renders every frame twice), so every pass of
  // an export simulates the same motion
  const dynamicStates = new Map<string, DynamicChainState>();
  const dynamicClock: DynamicChainClock = { lastFrame: null };

  const gl = renderer.context;

  function renderFrame(ctx: FrameRenderContext, frame: number): HTMLCanvasElement {
    const { sceneGraph, timeline } = ctx;
    applySymbols(ctx.symbols);
    const bounds = ctx.viewportBounds ?? { x: 0, y: 0, width, height };
    const halfW = bounds.width / 2;
    const halfH = bounds.height / 2;
    const projection = mat3.create(1 / halfW, 0, 0, 1 / halfH, 0, 0);
    const view = mat3.create(1, 0, 0, 1, -(bounds.x + halfW), -(bounds.y + halfH));
    const vpMatrix = mat3.multiply(projection, view);

    // Snapshot animated nodes (and bones a rig poses) so they can be restored
    const rig = ctx.rig;
    const posesBones =
      !!rig && ((rig.ikChains?.length ?? 0) > 0 || (rig.dynamicChains?.length ?? 0) > 0);
    const snapshots = new Map<string, Record<string, unknown>>();
    const snapshot = (node: Node | undefined) => {
      if (node && !snapshots.has(node.id)) {
        snapshots.set(node.id, structuredClone(node) as unknown as Record<string, unknown>);
      }
    };
    for (const track of timeline.tracks) snapshot(sceneGraph.getNode(track.nodeId));
    if (posesBones) {
      sceneGraph.traverse((node) => {
        if (node.type === 'bone') snapshot(node);
      });
    }

    try {
      // Apply animation at the given frame to all animated nodes (one pass
      // over the tracks; each node updated once)
      for (const [nodeId, animatedValues] of evaluateTimelineAtFrame(timeline, frame)) {
        const node = sceneGraph.getNode(nodeId);
        if (!node) continue;
        sceneGraph.updateNode(nodeId, applyAnimatedValues(node, animatedValues) as Partial<Node>);
      }

      const morphOffsets = rig ? poseRig(sceneGraph, rig, frame) : undefined;

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
      shapeRenderer.render(sceneGraph, vpMatrix, new Set(), null, morphOffsets, ctx.exportRootIds);
    } finally {
      // Restore original node state after rendering
      for (const [nodeId, snapshot] of snapshots) {
        sceneGraph.updateNode(nodeId, snapshot as Partial<Node>);
      }
    }

    return canvas;
  }

  /**
   * IK, then physics, then Smart Bones — the editor's order. Returns the
   * Smart Bone morphs to render with.
   */
  function poseRig(
    sceneGraph: SceneGraph,
    rig: FrameRig,
    frame: number
  ): Map<string, Float32Array> | undefined {
    if (rig.ikChains && rig.ikChains.length > 0) evaluateIKChains(rig.ikChains, sceneGraph);

    const chains = rig.dynamicChains ?? [];
    if (chains.some((chain) => chain.enabled)) {
      // Each frame renders once per pass: the same frame again is a new pass
      if (dynamicClock.lastFrame === frame) {
        resetDynamicChainStates(dynamicStates);
        dynamicClock.lastFrame = null;
      }
      evaluateDynamicChainsAtFrame(
        chains,
        dynamicStates,
        // Bones are the only nodes the physics reads; the rest of the graph is untouched
        sceneGraph as unknown as DynamicChainSceneGraph,
        frame,
        rig.frameRate,
        rig.wind,
        dynamicClock
      );
    }

    const actions = rig.smartBoneActions ?? [];
    if (actions.length === 0) return undefined;
    const vertexCounts = new Map<string, number>();
    sceneGraph.traverse((node) => {
      const skin = (node as { skinData?: { vertexCount: number } }).skinData;
      if (skin) vertexCounts.set(node.id, skin.vertexCount);
    });
    const morphs = evaluateSmartBones(actions, sceneGraph, vertexCounts);
    return morphs.size > 0 ? morphs : undefined;
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
    // The canvas is ours alone: hand its context back now rather than at
    // garbage collection, since browsers keep only a few alive at once
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  /** Hand the shape renderer these symbol definitions, if they're new. */
  function applySymbols(next: SymbolDefinition[] | undefined): void {
    if (next === symbols) return;
    symbols = next;
    shapeRenderer.setSymbolDefinitions(new Map((symbols ?? []).map((s) => [s.id, s])));
  }

  async function preloadTextures(
    nodes: Node[],
    sceneGraph: SceneGraph,
    preloadSymbols?: SymbolDefinition[]
  ): Promise<void> {
    if (preloadSymbols) applySymbols(preloadSymbols);
    await shapeRenderer.preloadTextures(nodes, sceneGraph);
  }

  return { preloadTextures, renderFrame, renderFrameAsBlob, dispose };
}

/** Return the roots whose image textures are needed for a frame export. */
export function getFrameRenderRoots(ctx: FrameRenderContext): Node[] {
  if (!ctx.exportRootIds) return ctx.sceneGraph.getRootNodes();
  return ctx.exportRootIds
    .map((id) => ctx.sceneGraph.getNode(id))
    .filter((node): node is Node => node !== undefined && node !== null);
}
