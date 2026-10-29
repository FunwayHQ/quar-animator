/**
 * Export Service for Quar Animator
 * Orchestrates PNG and SVG export of selected nodes.
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import type { Node, ArtboardNode, SymbolDefinition, Timeline } from '@quar/types';
import type { VideoExportSources } from '@quar/export';
import { SceneGraph, SelectionManager, WebGLRenderer, ShapeRenderer, mat3 } from '@quar/core';
import { exportNodesToSvg } from '@quar/core';
import { copyScene, drawVideoStills } from '@quar/export';
import { canvasVideoMoments, loadVideoStills } from './videoStills';

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
  // Browsers may begin consuming the download asynchronously after click().
  // Revoking in the same task can leave a zero-byte or failed download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ============================================================================
// PNG Export
// ============================================================================

export interface PngExportOptions extends VideoExportSources {
  multiplier?: number;
  includeBackground?: boolean;
  symbolDefinitions?: SymbolDefinition[];
  /** The timeline in view and its playhead: video layers show that moment of their clips (none without) */
  moment?: { timeline: Timeline; frame: number };
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
  let options: PngExportOptions = {};
  if (typeof multiplierOrOptions === 'object') {
    options = multiplierOrOptions;
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
  const gl = renderer.context;
  let shapeRenderer: ShapeRenderer | null = null;
  let videoFrames: { dispose(): void } | null = null;

  try {
    shapeRenderer = new ShapeRenderer(renderer);

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
    gl.viewport(0, 0, pixelWidth, pixelHeight);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Render against a copy when omitting the artboard background. The live graph
    // must remain intact while image textures load and the PNG is generated.
    let exportGraph = sceneGraph;
    if (artboard && !includeBackground) {
      exportGraph = new SceneGraph();
      exportGraph.fromJSON(structuredClone(sceneGraph.toJSON()));
      exportGraph.updateNode(artboard.id, { fills: [] } as Partial<Node>);
    }

    // A fresh ShapeRenderer has an empty texture cache.
    await shapeRenderer.preloadTextures(nodes, exportGraph);

    const exportNodeIds = nodes.map((n) => n.id);
    // Video layers show the moment of their clips the playhead is at, decoded first
    if (options.moment) {
      const { createExportVideoFrames } = await import('@quar/export');
      const frames = createExportVideoFrames(
        [
          {
            ctx: {
              sceneGraph: exportGraph,
              timeline: options.moment.timeline,
              exportRootIds: exportNodeIds,
              viewportBounds: { x: cx - halfW, y: cy - halfH, width: halfW * 2, height: halfH * 2 },
            },
            frame: options.moment.frame,
          },
        ],
        { width: pixelWidth, height: pixelHeight },
        options
      );
      videoFrames = frames;
      await frames.prepare(0);
      shapeRenderer.setVideoFrames(frames.provider);
    }
    shapeRenderer.render(exportGraph, vpMatrix, new Set(), null, undefined, exportNodeIds);

    const blob = await canvasToBlob(canvas, 'image/png');
    if (blob) {
      downloadBlob(blob, getExportFilename(nodes, 'png'));
    }
  } finally {
    videoFrames?.dispose();
    shapeRenderer?.dispose();
    renderer.dispose();
    // The canvas is ours alone: hand its context back now rather than at
    // garbage collection. Browsers keep only a few alive at once and drop the
    // oldest past that, which can be the editor's own canvas.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
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
 * Export selected nodes as an SVG file. A video layer is a picture of its
 * still: the moment the canvas shows of it now.
 */
export async function exportSelectionAsSvg(
  nodes: Node[],
  sceneGraph: SceneGraph,
  symbolDefinitions?: SymbolDefinition[]
): Promise<void> {
  if (nodes.length === 0) return;

  const stills = await loadVideoStills(canvasVideoMoments(sceneGraph, nodes));
  let scene = sceneGraph;
  let roots = nodes;
  if (stills.size > 0) {
    // On a copy: the stills go in as pictures in the layers' places
    scene = copyScene(sceneGraph);
    drawVideoStills(scene, stills);
    roots = nodes.flatMap((node) => scene.getNode(node.id) ?? []);
  }
  const svgString = exportNodesToSvg(roots, scene, symbolDefinitions);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  downloadBlob(blob, getExportFilename(nodes, 'svg'));
}
