/**
 * Export Service for Quar Animator
 * Orchestrates PNG and SVG export of selected nodes.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import type { Node } from '@quar/types';
import type { SceneGraph } from '@quar/core';
import { SelectionManager, WebGLRenderer, ShapeRenderer, mat3 } from '@quar/core';
import { exportNodesToSvg } from '@quar/core';

// ============================================================================
// Filename Generation
// ============================================================================

export function getExportFilename(nodes: Node[], extension: string): string {
  if (nodes.length === 1) {
    const name = sanitizeFilename(nodes[0]?.name || 'untitled');
    return `${name}.${extension}`;
  }
  return `selection-${nodes.length}-items.${extension}`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'untitled';
}

// ============================================================================
// Download Helper
// ============================================================================

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================================
// PNG Export
// ============================================================================

/**
 * Export selected nodes as a PNG image with the given size multiplier.
 */
export async function exportSelectionAsPng(
  nodes: Node[],
  sceneGraph: SceneGraph,
  multiplier: number = 1
): Promise<void> {
  if (nodes.length === 0) return;

  // Compute bounds of selected nodes
  const selectionManager = new SelectionManager();
  const selectedIds = new Set(nodes.map((n) => n.id));
  const selBounds = selectionManager.getSelectionBounds(selectedIds, sceneGraph);
  if (!selBounds) return;

  const { rect: boundsRect } = selBounds;
  const pixelWidth = Math.ceil(boundsRect.width * multiplier);
  const pixelHeight = Math.ceil(boundsRect.height * multiplier);

  if (pixelWidth <= 0 || pixelHeight <= 0) return;

  // Create offscreen canvas + WebGL context
  const canvas = document.createElement('canvas');
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;

  const renderer = new WebGLRenderer({
    canvas,
    preserveDrawingBuffer: true,
    alpha: true,
  });

  const shapeRenderer = new ShapeRenderer(renderer);

  // Build orthographic VP matrix that maps world bounds → clip space
  // The camera maps [minX..maxX] → [-1..1] and [minY..maxY] → [-1..1]
  const halfW = boundsRect.width / 2;
  const halfH = boundsRect.height / 2;
  const cx = boundsRect.x + halfW;
  const cy = boundsRect.y + halfH;

  // Projection: scale to NDC
  const projection = mat3.create(1 / halfW, 0, 0, 1 / halfH, 0, 0);
  // View: translate center to origin
  const view = mat3.create(1, 0, 0, 1, -cx, -cy);
  const vpMatrix = mat3.multiply(projection, view);

  // Clear to transparent
  const gl = renderer.context;
  gl.viewport(0, 0, pixelWidth, pixelHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Render each node
  for (const node of nodes) {
    if (!node.visible) continue;
    shapeRenderer.renderNode(node, vpMatrix);
  }

  // Convert to PNG blob and download
  const blob = await canvasToBlob(canvas, 'image/png');
  if (blob) {
    downloadBlob(blob, getExportFilename(nodes, 'png'));
  }

  // Cleanup
  shapeRenderer.dispose();
  renderer.dispose();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type);
  });
}

// ============================================================================
// SVG Export
// ============================================================================

/**
 * Export selected nodes as an SVG file.
 */
export function exportSelectionAsSvg(nodes: Node[], sceneGraph: SceneGraph): void {
  if (nodes.length === 0) return;

  const svgString = exportNodesToSvg(nodes, sceneGraph);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, getExportFilename(nodes, 'svg'));
}
