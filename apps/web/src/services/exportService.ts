/**
 * Export Service for Quar Animator
 * Orchestrates PNG and SVG export of selected nodes.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import type { Node, ArtboardNode } from '@quar/types';
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
  multiplier: number = 1,
  includeBackground: boolean = true
): Promise<void> {
  if (nodes.length === 0) return;

  // Check if we're exporting a single artboard — use its fixed dimensions
  const isArtboardExport = nodes.length === 1 && nodes[0].type === 'artboard';
  const artboard = isArtboardExport ? (nodes[0] as ArtboardNode) : null;

  let pixelWidth: number;
  let pixelHeight: number;
  let cx: number;
  let cy: number;

  if (artboard) {
    // Artboard export: use artboard dimensions
    pixelWidth = Math.ceil(artboard.width * multiplier);
    pixelHeight = Math.ceil(artboard.height * multiplier);
    cx = artboard.transform.position.x;
    cy = artboard.transform.position.y;
  } else {
    // Compute bounds of selected nodes
    const selectionManager = new SelectionManager();
    const selectedIds = new Set(nodes.map((n) => n.id));
    const selBounds = selectionManager.getSelectionBounds(selectedIds, sceneGraph);
    if (!selBounds) return;

    const { rect: boundsRect } = selBounds;
    pixelWidth = Math.ceil(boundsRect.width * multiplier);
    pixelHeight = Math.ceil(boundsRect.height * multiplier);
    cx = boundsRect.x + boundsRect.width / 2;
    cy = boundsRect.y + boundsRect.height / 2;
  }

  if (pixelWidth <= 0 || pixelHeight <= 0) return;

  const halfW = (artboard ? artboard.width : pixelWidth / multiplier) / 2;
  const halfH = (artboard ? artboard.height : pixelHeight / multiplier) / 2;

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
  const projection = mat3.create(1 / halfW, 0, 0, 1 / halfH, 0, 0);
  const view = mat3.create(1, 0, 0, 1, -cx, -cy);
  const vpMatrix = mat3.multiply(projection, view);

  // Clear
  const gl = renderer.context;
  gl.viewport(0, 0, pixelWidth, pixelHeight);

  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // When exporting artboard without background, temporarily clear artboard fills
  // so render() skips the background rectangle but still renders children
  let savedFills: import('@quar/types').Fill[] | null = null;
  if (artboard && !includeBackground) {
    savedFills = artboard.fills;
    sceneGraph.updateNode(artboard.id, { fills: [] } as Partial<Node>);
  }

  // Render all visible nodes using the full render pipeline.
  // The VP matrix is set to show only the export bounds, so off-screen nodes
  // are naturally clipped. Using render() instead of renderNode() ensures:
  // - Recursive traversal into groups and artboard children
  // - Correct world transforms (renderNode uses local transforms only)
  // - Boolean groups, effects, blend modes, skinned meshes all work
  shapeRenderer.render(sceneGraph, vpMatrix);

  // Restore artboard fills if they were temporarily removed
  if (artboard && savedFills !== null) {
    sceneGraph.updateNode(artboard.id, { fills: savedFills } as Partial<Node>);
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
