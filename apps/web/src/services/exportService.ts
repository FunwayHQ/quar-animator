/**
 * Export Service for Quar Animator
 * Orchestrates PNG and SVG export of selected nodes.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import type { Node, ArtboardNode, SymbolDefinition } from '@quar/types';
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

export interface PngExportOptions {
  multiplier?: number;
  includeBackground?: boolean;
  symbolDefinitions?: SymbolDefinition[];
}

/**
 * Export selected nodes as a PNG image with the given size multiplier.
 */
export async function exportSelectionAsPng(
  nodes: Node[],
  sceneGraph: SceneGraph,
  multiplierOrOptions: number | PngExportOptions = 1,
  includeBackground: boolean = true
): Promise<void> {
  // Support both old positional API and new options object
  let multiplier: number;
  let symbolDefs: SymbolDefinition[] | undefined;
  if (typeof multiplierOrOptions === 'object') {
    multiplier = multiplierOrOptions.multiplier ?? 1;
    includeBackground = multiplierOrOptions.includeBackground ?? true;
    symbolDefs = multiplierOrOptions.symbolDefinitions;
  } else {
    multiplier = multiplierOrOptions;
  }

  if (nodes.length === 0) return;

  // Check if we're exporting a single artboard — use its fixed dimensions
  const isArtboardExport = nodes.length === 1 && nodes[0]?.type === 'artboard';
  const artboard = isArtboardExport ? (nodes[0] as ArtboardNode) : null;

  // Compute stroke padding for non-artboard exports
  let strokePadding = 0;
  if (!artboard) {
    for (const node of nodes) {
      const descendants = sceneGraph.getDescendants(node.id);
      const allNodes = [node, ...descendants];
      for (const n of allNodes) {
        if ('strokes' in n && Array.isArray(n.strokes)) {
          for (const s of n.strokes) {
            if (s.visible && s.width > 0) {
              strokePadding = Math.max(strokePadding, s.width / 2);
            }
          }
        }
      }
    }
  }

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
    if (symbolDefs) {
      selectionManager.setSymbolDefinitions(symbolDefs);
    }
    const selBounds = selectionManager.getSelectionBounds(selectedIds, sceneGraph);
    if (!selBounds) return;

    const { rect: boundsRect } = selBounds;
    // Expand bounds by stroke padding
    const expandedWidth = boundsRect.width + strokePadding * 2;
    const expandedHeight = boundsRect.height + strokePadding * 2;
    pixelWidth = Math.ceil(expandedWidth * multiplier);
    pixelHeight = Math.ceil(expandedHeight * multiplier);
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

  // Pass symbol definitions so symbol instances render correctly
  if (symbolDefs && symbolDefs.length > 0) {
    const symMap = new Map<string, SymbolDefinition>();
    for (const s of symbolDefs) symMap.set(s.id, s);
    shapeRenderer.setSymbolDefinitions(symMap);
  }

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

  // Render only the selected nodes and their descendants (not the entire scene).
  // This prevents other root-level nodes from appearing in the export.
  const exportNodeIds = nodes.map((n) => n.id);
  shapeRenderer.render(sceneGraph, vpMatrix, new Set(), null, undefined, exportNodeIds);

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
export function exportSelectionAsSvg(
  nodes: Node[],
  sceneGraph: SceneGraph,
  symbolDefinitions?: SymbolDefinition[]
): void {
  if (nodes.length === 0) return;

  const svgString = exportNodesToSvg(nodes, sceneGraph, symbolDefinitions);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, getExportFilename(nodes, 'svg'));
}
