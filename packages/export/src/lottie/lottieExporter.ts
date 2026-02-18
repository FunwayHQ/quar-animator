/**
 * Lottie Exporter
 *
 * Top-level orchestrator that wires scene graph traversal → Lottie JSON.
 */

import type { Node, Timeline } from '@quar/types';
import type { LottieAnimation, LottieLayer } from './lottieTypes';
import { nodeToLottieLayer } from './lottieConverter';

// ============================================================================
// Types
// ============================================================================

export interface LottieExportOptions {
  width: number;
  height: number;
  startFrame?: number;
  endFrame?: number;
  frameRate?: number;
  name?: string;
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
  options: LottieExportOptions
): LottieAnimation {
  const {
    width,
    height,
    startFrame = 0,
    endFrame = timeline.duration,
    frameRate = timeline.frameRate,
    name = 'Quar Animation',
  } = options;

  const duration = endFrame - startFrame;
  const canvasH = height;

  // Convert nodes to layers (reverse order for Lottie render order)
  const layers: LottieLayer[] = [];
  let layerIdx = 0;

  // Walk in reverse so bottom-most Quar node becomes first Lottie layer
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node.visible) continue;

    const layer = nodeToLottieLayer(node, timeline, layerIdx, canvasH, duration);
    if (layer) {
      layers.push(layer);
      layerIdx++;
    }
  }

  return {
    v: '5.7.4',
    fr: frameRate,
    ip: startFrame,
    op: endFrame,
    w: width,
    h: height,
    nm: name,
    ddd: 0,
    assets: [],
    layers,
  };
}

/**
 * Export to a downloadable Lottie JSON Blob.
 */
export function exportLottieBlob(
  nodes: Node[],
  timeline: Timeline,
  options: LottieExportOptions
): Blob {
  const animation = exportToLottieJson(nodes, timeline, options);
  const json = JSON.stringify(animation, null, 2);
  return new Blob([json], { type: 'application/json' });
}

// ============================================================================
// Analysis Helpers
// ============================================================================

/** Supported node types for Lottie export */
const SUPPORTED_TYPES = new Set(['rectangle', 'ellipse', 'path', 'polygon', 'group']);

/**
 * Count supported and unsupported nodes for an export summary.
 */
export function analyzeLottieExport(nodes: Node[]): {
  supportedCount: number;
  unsupportedCount: number;
  unsupportedTypes: string[];
  animatedTrackCount: number;
} {
  let supportedCount = 0;
  let unsupportedCount = 0;
  const unsupportedTypeSet = new Set<string>();

  for (const node of nodes) {
    if (SUPPORTED_TYPES.has(node.type)) {
      supportedCount++;
    } else {
      unsupportedCount++;
      unsupportedTypeSet.add(node.type);
    }
  }

  return {
    supportedCount,
    unsupportedCount,
    unsupportedTypes: Array.from(unsupportedTypeSet),
    animatedTrackCount: 0, // Populated by caller with timeline.tracks.length
  };
}
