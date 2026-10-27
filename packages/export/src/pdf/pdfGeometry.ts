/**
 * PDF Geometry
 * Each layer's outline as the canvas builds it, kept as curves: the same
 * rectangles, ellipses, polygons and stars, corner-rounded paths, drawn-on
 * strokes and glyph outlines the renderer tessellates, in the layer's own
 * space, with the boxes its gradients are spread over.
 */

import {
  DEFAULT_TESSELLATION_TOLERANCE,
  ELLIPSE_TESSELLATION_TOLERANCE,
  applyCornerRadius,
  computeBounds,
  createEllipsePath,
  createPolygonPath,
  createRectanglePath,
  createStarPath,
  generateStrokeOutlineVertices,
  getFontManager,
  getTextBox,
  getTextNodeBounds,
  getVisibleTextContent,
  tessellatePathToVertices,
  textToSubpaths,
  trimPathToProgress,
} from '@quar/core';
import type { Fill, Node, PathPoint, Stroke, TextNode, Vector2 } from '@quar/types';
import type { Contour } from './pdfContent';

/** A text layer's glyph outlines in its own space (the anchor applied), or null without its font. */
export type TextOutlines = (node: TextNode) => PathPoint[][] | null;

/** Outlines laid out with the fonts the editor has loaded, as the renderer does. */
export const editorTextOutlines: TextOutlines = (node) => {
  const content = getVisibleTextContent(node);
  if (!content) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- opentype.js font
  const font = getFontManager().getFontOrFallback(node.fontFamily, node.fontWeight);
  if (!font) return null;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- opentype.js font
  const { subpaths } = textToSubpaths(content, font, node.fontSize, {
    textAlign: node.textAlign,
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    width: getTextBox(node)?.width,
    alignmentText: node.content,
  });
  // The full text sets the anchor, so a typewriter reveal types in place
  const { x: ax, y: ay } = node.transform.anchor;
  if (ax === 0 && ay === 0) return subpaths;
  const bounds = getTextNodeBounds(node);
  const dx = -(bounds.x + bounds.width * ax);
  const dy = -(bounds.y + bounds.height * ay);
  return subpaths.map((subpath) =>
    subpath.map((point) => ({
      ...point,
      position: { x: point.position.x + dx, y: point.position.y + dy },
    }))
  );
};

export interface ShapeGeometry {
  /** What's filled, together, by `fillRule` */
  contours: Contour[];
  fillRule: 'nonzero' | 'evenodd';
  /** Empty when the shape isn't filled (an open path, a stroke being drawn on) */
  fills: Fill[];
  /** Each stroked contour by contour */
  strokes: Stroke[];
  /** Where a rectangle's or an ellipse's dashes start (SVG's start) */
  dashStart?: Vector2;
  /** How finely the renderer flattens it (for the boxes gradients are spread over) */
  tolerance: number;
}

/** A box as [minX, minY, maxX, maxY]. */
export type Box = [number, number, number, number];

/** The geometry a layer fills and strokes, or null for one that has none of its own. */
export function shapeGeometry(
  node: Node,
  textOutlines: TextOutlines = editorTextOutlines
): ShapeGeometry | null {
  switch (node.type) {
    case 'rectangle': {
      const left = -node.width * node.transform.anchor.x;
      const bottom = -node.height * node.transform.anchor.y;
      return {
        contours: [
          {
            points: createRectanglePath(left, bottom, node.width, node.height, node.cornerRadius),
            closed: true,
          },
        ],
        fillRule: 'nonzero',
        fills: node.fills,
        strokes: node.strokes,
        // SVG runs round a rectangle from its top-left corner (past its rounding)
        dashStart: { x: left + Math.max(0, node.cornerRadius[3] ?? 0), y: bottom + node.height },
        tolerance: DEFAULT_TESSELLATION_TOLERANCE,
      };
    }
    case 'ellipse':
      return {
        contours: [{ points: createEllipsePath(0, 0, node.radiusX, node.radiusY), closed: true }],
        fillRule: 'nonzero',
        fills: node.fills,
        strokes: node.strokes,
        // …and round an ellipse from its rightmost point
        dashStart: { x: node.radiusX, y: 0 },
        tolerance: ELLIPSE_TESSELLATION_TOLERANCE,
      };
    case 'polygon': {
      const points =
        node.innerRadius !== undefined
          ? createStarPath(
              0,
              0,
              node.radius,
              node.innerRadius,
              node.sides,
              undefined,
              node.cornerRadius
            )
          : createPolygonPath(0, 0, node.radius, node.sides, undefined, node.cornerRadius);
      return {
        contours: [{ points, closed: true }],
        fillRule: 'nonzero',
        fills: node.fills,
        strokes: node.strokes,
        tolerance: DEFAULT_TESSELLATION_TOLERANCE,
      };
    }
    case 'path': {
      if (node.points.length < 2) return null;
      const fillRule = node.fillRule ?? 'nonzero';
      // Drawing on: each contour's stroke trimmed to the progress, open, unfilled
      if (node.strokeProgress !== undefined && node.strokeProgress < 1) {
        const progress = Math.max(0, Math.min(1, node.strokeProgress));
        if (progress <= 0) return null;
        const contours = [node.points, ...(node.subpaths ?? [])]
          .map((points) => trimPathToProgress(points, node.closed, progress))
          .filter((points) => points.length >= 2)
          .map((points) => ({ points: applyCornerRadius(points, false), closed: false }));
        return {
          contours,
          fillRule,
          fills: [],
          strokes: node.strokes,
          tolerance: DEFAULT_TESSELLATION_TOLERANCE,
        };
      }
      // A compound path: every contour closed, filled together
      if (node.subpaths && node.subpaths.length > 0 && node.closed) {
        return {
          contours: [node.points, ...node.subpaths].map((points) => ({
            points: applyCornerRadius(points, true),
            closed: true,
          })),
          fillRule,
          fills: node.fills,
          strokes: node.strokes,
          tolerance: DEFAULT_TESSELLATION_TOLERANCE,
        };
      }
      // One contour (an open path's further contours aren't drawn)
      return {
        contours: [{ points: applyCornerRadius(node.points, node.closed), closed: node.closed }],
        fillRule,
        fills: node.closed ? node.fills : [],
        strokes: node.strokes,
        tolerance: DEFAULT_TESSELLATION_TOLERANCE,
      };
    }
    case 'text': {
      const subpaths = textOutlines(node);
      if (!subpaths || subpaths.length === 0) return null;
      return {
        contours: subpaths.map((points) => ({ points, closed: true })),
        // Glyphs filled by the nonzero rule, as fonts are
        fillRule: 'nonzero',
        fills: node.fills,
        strokes: node.strokes,
        tolerance: DEFAULT_TESSELLATION_TOLERANCE,
      };
    }
    default:
      return null;
  }
}

/** A contour flattened as the renderer flattens it. */
export function flatten(contour: Contour, tolerance: number): Float32Array {
  return tessellatePathToVertices(contour.points, contour.closed, tolerance);
}

/** The box a fill's gradient spreads over: the flattened outline's. */
export function fillBox(geometry: Pick<ShapeGeometry, 'contours' | 'tolerance'>): Box | null {
  let box: Box | null = null;
  for (const contour of geometry.contours) {
    const vertices = flatten(contour, geometry.tolerance);
    if (vertices.length < 2) continue;
    box = unionBox(box, computeBounds(vertices));
  }
  return box;
}

/** The box a stroke's gradient spreads over: the stroke's own outline's, as the renderer widens it. */
export function strokeBox(vertices: Float32Array, stroke: Stroke, closed: boolean): Box | null {
  const outline = strokeOutline(vertices, stroke, closed);
  return outline.length >= 6 ? computeBounds(outline) : null;
}

/** A stroke widened into the polygon the renderer fills. */
export function strokeOutline(
  vertices: Float32Array,
  stroke: Stroke,
  closed: boolean
): Float32Array {
  return generateStrokeOutlineVertices(
    vertices,
    vertices.length / 2,
    stroke.width,
    closed,
    stroke.align ?? 'center',
    stroke.widthProfile
  );
}

export function unionBox(a: Box | null, b: Box): Box {
  if (!a) return b;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** A contour reversed: its points the other way round, each one's handles swapped. */
function reversed(points: PathPoint[]): PathPoint[] {
  return [...points]
    .reverse()
    .map((point) => ({ ...point, handleIn: point.handleOut, handleOut: point.handleIn }));
}

/**
 * A closed contour run clockwise on screen (negative signed area, Y up) from
 * the point nearest `start`, as the canvas runs a rectangle's or an
 * ellipse's dashes.
 */
export function clockwiseContour(points: PathPoint[], start: Vector2): PathPoint[] {
  if (points.length < 3) return points;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!.position;
    const q = points[(i + 1) % points.length]!.position;
    area += p.x * q.y - q.x * p.y;
  }
  const run = area > 0 ? reversed(points) : points;
  let nearest = 0;
  let nearestDistance = Infinity;
  run.forEach((point, i) => {
    const distance = Math.hypot(point.position.x - start.x, point.position.y - start.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = i;
    }
  });
  return [...run.slice(nearest), ...run.slice(0, nearest)];
}
