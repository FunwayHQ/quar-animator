/**
 * PDF Raster
 * The editor's renderer drawing one layer, for the parts of a PDF only it
 * can draw: a layer blur, a bent or adjusted picture, the silhouette a drop
 * shadow is blurred from. Each picture gets a renderer of its own size.
 */

import { createTimeline } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { SymbolDefinition } from '@quar/types';
import { createFrameRenderer } from '../frameRenderer';
import type { PdfRasterizer } from './pdfScene';

/** A posed scene's layers drawn by the renderer (nothing more is posed: it's posed already). */
export function rendererRasterizer(scene: SceneGraph, symbols?: SymbolDefinition[]): PdfRasterizer {
  const still = createTimeline();
  return {
    async render(nodeId, rect, scale, withEffects) {
      const node = scene.getNode(nodeId);
      if (!node) return null;
      const width = Math.max(1, Math.round(rect.width * scale));
      const height = Math.max(1, Math.round(rect.height * scale));
      const renderer = createFrameRenderer({ width, height, backgroundColor: null });
      const saved = { effects: node.effects, blendMode: node.blendMode };
      try {
        // The PDF blends it; and a shadow's silhouette is the layer without its effects
        scene.updateNode(
          nodeId,
          withEffects ? { blendMode: 'normal' } : { blendMode: 'normal', effects: [] }
        );
        await renderer.preloadTextures([scene.getNode(nodeId) ?? node], scene, symbols);
        const drawn = renderer.renderFrame(
          {
            sceneGraph: scene,
            timeline: still,
            exportRootIds: [nodeId],
            viewportBounds: rect,
            symbols,
          },
          0
        );
        const copy = document.createElement('canvas');
        copy.width = width;
        copy.height = height;
        const context = copy.getContext('2d');
        if (!context) return null;
        context.drawImage(drawn, 0, 0);
        return { width, height, data: context.getImageData(0, 0, width, height).data };
      } finally {
        scene.updateNode(nodeId, saved);
        renderer.dispose();
      }
    },
  };
}
