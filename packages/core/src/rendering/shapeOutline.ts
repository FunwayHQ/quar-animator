/**
 * Shape outlines as the renderer tessellates them, and as bindings number
 * their vertices — shared with exports that deform shapes the way the
 * editor does.
 */

import type { Node, SkinData } from '@quar/types';
import {
  applyCornerRadius,
  createEllipsePath,
  createPolygonPath,
  createRectanglePath,
  createStarPath,
  tessellatePathToVertices,
} from '../path/pathUtils';
import { BEND_MESH_CELL_SIZE, bendMeshOutline, subdivideOutline } from './bendMesh';

/** Tessellation tolerances the renderer uses (world units). */
export const DEFAULT_TESSELLATION_TOLERANCE = 1.0;
export const ELLIPSE_TESSELLATION_TOLERANCE = 0.5;

export interface OutlineVertices {
  /** Vertex positions (xy pairs) in the shape's local space */
  vertices: Float32Array;
  closed: boolean;
}

/**
 * A single-contour shape's outline as the renderer tessellates it, or null
 * for other layers (compound paths, text, images, groups…).
 */
export function shapeOutline(node: Node): OutlineVertices | null {
  switch (node.type) {
    case 'rectangle':
      return {
        vertices: tessellatePathToVertices(
          createRectanglePath(
            -node.width * node.transform.anchor.x,
            -node.height * node.transform.anchor.y,
            node.width,
            node.height,
            node.cornerRadius
          ),
          true,
          DEFAULT_TESSELLATION_TOLERANCE
        ),
        closed: true,
      };
    case 'ellipse':
      return {
        vertices: tessellatePathToVertices(
          createEllipsePath(0, 0, node.radiusX, node.radiusY),
          true,
          ELLIPSE_TESSELLATION_TOLERANCE
        ),
        closed: true,
      };
    case 'polygon': {
      const pathPoints =
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
        vertices: tessellatePathToVertices(pathPoints, true, DEFAULT_TESSELLATION_TOLERANCE),
        closed: true,
      };
    }
    case 'path': {
      if (node.points.length < 2) return null;
      if (node.subpaths && node.subpaths.length > 0 && node.closed) return null;
      return {
        vertices: tessellatePathToVertices(
          applyCornerRadius(node.points, node.closed),
          node.closed,
          DEFAULT_TESSELLATION_TOLERANCE
        ),
        closed: node.closed,
      };
    }
    default:
      return null;
  }
}

/**
 * A bound shape's outline numbered as its binding numbers vertices: a
 * bending mesh's subdivided outline (its first vertices), else the
 * tessellation itself. Null for layers without a single outline.
 */
export function boundOutline(node: Node): OutlineVertices | null {
  const outline = shapeOutline(node);
  if (!outline) return null;
  if (!(node as { skinData?: SkinData }).skinData?.bendMesh) return outline;
  return {
    vertices: outline.closed
      ? bendMeshOutline(outline.vertices).ring
      : subdivideOutline(outline.vertices, false, BEND_MESH_CELL_SIZE),
    closed: outline.closed,
  };
}
