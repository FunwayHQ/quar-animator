/**
 * PDF Export
 * Pages of a document as vector PDF: each page a part of the world at a
 * frame — an artboard (a slide) or all the artwork — posed as exports pose
 * it and painted as the canvas paints it (see pdfScene). A page is its
 * part's own size: a unit of the document is a CSS pixel, ¾ of a point.
 */

import { mat3, type SceneGraph } from '@quar/core';
import type { Color, Rect, SymbolDefinition, Timeline } from '@quar/types';
import type { ExportProgress } from '../index';
import type { FrameRig } from '../frameRenderer';
import { poseFrame } from '../posedFrame';
import { PdfContent, rgb } from './pdfContent';
import type { TextOutlines } from './pdfGeometry';
import { decodeDocumentImage } from './pdfImages';
import { rendererRasterizer } from './pdfRaster';
import { PdfSceneDrawer, type PdfRasterizer } from './pdfScene';
import { PdfWriter, type DecodedImage } from './pdfWriter';

/** Points to a unit of the document (a CSS pixel: 1/96 inch). */
export const POINTS_PER_UNIT = 72 / 96;

export interface PdfPageSource {
  sceneGraph: SceneGraph;
  timeline: Timeline;
  rig?: FrameRig;
  symbols?: SymbolDefinition[];
  /** Only these layers and what's in them (an artboard); else everything */
  rootIds?: string[];
  /** The part of the world (Y up: x, y its bottom-left) the page shows */
  viewport: Rect;
  frame: number;
  /** Behind everything (the document background) */
  background?: Color | null;
}

export interface PdfExportOptions {
  title?: string;
  /** Glyph outlines (the editor's loaded fonts by default) */
  textOutlines?: TextOutlines;
  /** A document picture as a PDF takes it (read by the browser by default) */
  decodeImage?: (src: string) => Promise<DecodedImage | null>;
  /** Draws what PDF can't (the editor's renderer by default); null draws those layers plainly */
  rasterizer?: ((scene: SceneGraph, symbols?: SymbolDefinition[]) => PdfRasterizer) | null;
  /** Pixels a unit those layers are drawn at */
  rasterScale?: number;
}

/** The PDF of these pages, in order; null when cancelled. */
export async function exportPdf(
  pages: PdfPageSource[],
  options: PdfExportOptions = {},
  onProgress?: (progress: ExportProgress) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob | null> {
  if (pages.length === 0) throw new Error('There are no pages to export.');
  const writer = new PdfWriter();
  const makeRasterizer = options.rasterizer === undefined ? rendererRasterizer : options.rasterizer;

  for (const [index, page] of pages.entries()) {
    if (isCancelled()) return null;
    onProgress?.({
      phase: 'rendering',
      current: index,
      total: pages.length,
      percentage: Math.round((index / pages.length) * 100),
    });

    const { x, y, width, height } = page.viewport;
    const posed = poseFrame(page.sceneGraph, page.timeline, page.rig, page.frame);
    const roots = page.rootIds
      ? page.rootIds.flatMap((id) => posed.getNode(id) ?? [])
      : posed.getRootNodes();

    // The world onto the page, in points
    const base = mat3.create(
      POINTS_PER_UNIT,
      0,
      0,
      POINTS_PER_UNIT,
      -x * POINTS_PER_UNIT,
      -y * POINTS_PER_UNIT
    );
    const content = new PdfContent(base).transform(base);
    const background = page.background;
    if (background && (background.a ?? 1) > 0) {
      const gs = writer.resources.alpha(background.a ?? 1, 1);
      content
        .op(`/${gs} gs ${rgb(background)} rg`)
        .rect(x, y, width, height)
        .op('f');
    }

    const drawer = new PdfSceneDrawer(writer, posed, {
      symbols: page.symbols,
      textOutlines: options.textOutlines,
      decodeImage: options.decodeImage ?? decodeDocumentImage,
      rasterizer: makeRasterizer?.(posed, page.symbols),
      rasterScale: options.rasterScale,
      pageBox: [x - 1, y - 1, x + width + 1, y + height + 1],
    });
    await drawer.draw(content, roots);
    await writer.page(width * POINTS_PER_UNIT, height * POINTS_PER_UNIT, content);
  }

  if (isCancelled()) return null;
  onProgress?.({
    phase: 'finalizing',
    current: pages.length,
    total: pages.length,
    percentage: 100,
  });
  return new Blob([writer.finish({ title: options.title })], { type: 'application/pdf' });
}
