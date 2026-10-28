/**
 * Lottie Exporter
 *
 * Top-level orchestrator that wires scene graph traversal → Lottie JSON.
 */

import type { SceneGraph } from '@quar/core';
import type { FrameRig } from '../frameRenderer';
import { bakeSkinnedOutlines } from './lottieSkinning';
import type { Node, Timeline } from '@quar/types';
import type { LottieAnimation, LottieAsset, LottieLayer } from './lottieTypes';
import type { LottieConvertContext } from './lottieConverter';
import { buildLayers } from './lottieLayers';
import { editorTextOutlines, type TextOutlineProvider } from './lottieText';

// ============================================================================
// Types
// ============================================================================

export interface LottieExportOptions {
  width: number;
  height: number;
  startFrame?: number;
  /** Inclusive final frame, matching Quar's timeline/export range controls. */
  endFrame?: number;
  frameRate?: number;
  name?: string;
  /** Glyph outlines for text; defaults to the editor's loaded fonts. */
  textOutlines?: TextOutlineProvider;
  /**
   * The scene and rig, to bake shapes bound to bones as animated paths
   * (Lottie has no skinning). Without them, bound shapes export unbent.
   */
  skinning?: { sceneGraph: SceneGraph; rig?: FrameRig };
}

// ============================================================================
// Main Export Functions
// ============================================================================

/**
 * Export scene graph nodes and timeline to a Lottie JSON animation object.
 *
 * Walks root nodes in reverse order (Lottie renders bottom-to-top like Quar).
 * Unsupported node types are silently skipped.
 */
export function exportToLottieJson(
  nodes: Node[],
  timeline: Timeline,
  options: LottieExportOptions,
  nodeResolver?: (id: string) => Node | undefined
): LottieAnimation {
  const {
    width,
    height,
    startFrame = 0,
    endFrame = Math.max(0, timeline.duration - 1),
    frameRate = timeline.frameRate,
    name = 'Quar Animation',
  } = options;

  // Quar export ranges are inclusive. Lottie `op` is exclusive.
  const duration = endFrame - startFrame + 1;
  const canvasH = height;

  // Without a resolver, children are found among the given nodes
  const resolver = nodeResolver ?? buildNodeResolver(nodes);
  // A node whose parent was given too is drawn inside it, not as a layer of
  // its own — so the nodes can be every node of the scene, not just its roots
  const given = new Set(nodes.map((node) => node.id));
  const topLevel = nodes.filter((node) => node.parent === null || !given.has(node.parent));
  const context: LottieConvertContext = {
    textOutlines: options.textOutlines ?? editorTextOutlines,
    ...(options.skinning
      ? {
          skinnedPaths: bakeSkinnedOutlines(
            options.skinning.sceneGraph,
            timeline,
            options.skinning.rig,
            startFrame,
            endFrame
          ).paths,
        }
      : {}),
  };

  // Convert nodes to layers (Lottie lists the top layer first)
  const assets: LottieAsset[] = [];
  const layers: LottieLayer[] = buildLayers(
    topLevel,
    { originX: 0, originY: canvasH },
    {
      timeline,
      resolver,
      convert: context,
      startFrame,
      duration,
      // Room for content well outside the visible canvas
      precompSize: Math.max(width, height) * 4,
      assets,
      imageAssets: new Map(),
    }
  );

  return {
    v: '5.7.4',
    fr: frameRate,
    ip: startFrame,
    op: endFrame + 1,
    w: width,
    h: height,
    nm: name,
    ddd: 0,
    assets,
    layers,
  };
}

/**
 * Export to a downloadable Lottie JSON Blob.
 */
export function exportLottieBlob(
  nodes: Node[],
  timeline: Timeline,
  options: LottieExportOptions,
  nodeResolver?: (id: string) => Node | undefined
): Blob {
  const animation = exportToLottieJson(nodes, timeline, options, nodeResolver);
  const json = JSON.stringify(animation, null, 2);
  return new Blob([json], { type: 'application/json' });
}

/**
 * Build a node resolver from a flat array of nodes. It finds only the nodes
 * given (children are stored by id), so pass every node a group's children
 * might be looked up in.
 */
function buildNodeResolver(nodes: Node[]): (id: string) => Node | undefined {
  const map = new Map<string, Node>();
  const addNode = (node: Node) => {
    map.set(node.id, node);
  };
  for (const node of nodes) {
    addNode(node);
  }
  return (id: string) => map.get(id);
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/** Supported node types for Lottie export */
const SUPPORTED_TYPES = new Set([
  'rectangle',
  'ellipse',
  'path',
  'polygon',
  'group',
  'artboard',
  'text',
  'image',
]);

/**
 * Count supported and unsupported nodes for an export summary.
 */
export function analyzeLottieExport(
  nodes: Node[],
  nodeResolver?: (id: string) => Node | undefined
): {
  supportedCount: number;
  unsupportedCount: number;
  unsupportedTypes: string[];
  animatedTrackCount: number;
  /** Images bound to bones: Lottie can't warp them, so they export unbent */
  unbentImageCount: number;
  /** Layers with effects (shadows, blurs): this export writes none, so they go without */
  effectNodeCount: number;
  /** The kinds of effect left out (drop-shadow, inner-shadow, layer-blur) */
  droppedEffects: string[];
  /** Layers in a blend mode other than normal: they export as normal */
  blendModeNodeCount: number;
} {
  let supportedCount = 0;
  let unsupportedCount = 0;
  let unbentImageCount = 0;
  let effectNodeCount = 0;
  let blendModeNodeCount = 0;
  const unsupportedTypeSet = new Set<string>();
  const droppedEffectSet = new Set<string>();

  const visit = (node: Node) => {
    if (!node.visible) return;
    if (node.type === 'image' && node.skinData) unbentImageCount++;
    const effects = (node.effects ?? []).filter((effect) => effect.visible);
    if (effects.length > 0) {
      effectNodeCount++;
      for (const effect of effects) droppedEffectSet.add(effect.type);
    }
    if (node.blendMode && node.blendMode !== 'normal') blendModeNodeCount++;
    if (SUPPORTED_TYPES.has(node.type)) {
      supportedCount++;
    } else {
      unsupportedCount++;
      unsupportedTypeSet.add(node.type);
    }

    if ((node.type === 'group' || node.type === 'artboard') && nodeResolver) {
      for (const childId of node.children) {
        const child = nodeResolver(childId);
        if (child) visit(child);
      }
    }
  };

  for (const node of nodes) visit(node);

  return {
    supportedCount,
    unsupportedCount,
    unsupportedTypes: Array.from(unsupportedTypeSet),
    animatedTrackCount: 0, // Populated by caller with timeline.tracks.length
    unbentImageCount,
    effectNodeCount,
    droppedEffects: Array.from(droppedEffectSet),
    blendModeNodeCount,
  };
}
