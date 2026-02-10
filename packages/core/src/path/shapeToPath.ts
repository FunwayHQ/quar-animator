/**
 * Shape-to-PathPoints conversion for Quar Animator
 * Extracts the outline of any shape node as PathPoint arrays.
 */

import type { Node, PathPoint } from '@quar/types';
import {
  createRectanglePath,
  createEllipsePath,
  createPolygonPath,
  createStarPath,
} from './pathUtils';
import { clonePathPoint } from './pathUtils';

export interface ShapeOutline {
  /** Primary contour */
  points: PathPoint[];
  /** Additional contours (holes / disjoint) */
  subpaths?: PathPoint[][];
  closed: boolean;
}

/**
 * Extract the outline path points from any shape node.
 * Does NOT handle TextNode (use convertTextToPath for that).
 *
 * Rectangle: 4+ corner points (with bezier arcs for rounded corners)
 * Ellipse: 4 smooth points (KAPPA-based circular arcs)
 * Polygon/Star: regular polygon or star path points
 * Path: cloned points + subpaths
 */
export function getShapeOutlinePoints(node: Node): ShapeOutline | null {
  switch (node.type) {
    case 'rectangle': {
      // createRectanglePath takes x,y as top-left; center at origin → x=-w/2, y=-h/2
      const points = createRectanglePath(
        -node.width / 2,
        -node.height / 2,
        node.width,
        node.height,
        node.cornerRadius
      );
      return { points, closed: true };
    }

    case 'ellipse': {
      const points = createEllipsePath(0, 0, node.radiusX, node.radiusY);
      return { points, closed: true };
    }

    case 'polygon': {
      if (node.innerRadius !== undefined && node.innerRadius > 0) {
        const points = createStarPath(
          0,
          0,
          node.radius,
          node.innerRadius,
          node.sides,
          -Math.PI / 2,
          node.cornerRadius
        );
        return { points, closed: true };
      }
      const points = createPolygonPath(
        0,
        0,
        node.radius,
        node.sides,
        -Math.PI / 2,
        node.cornerRadius
      );
      return { points, closed: true };
    }

    case 'path': {
      const points = node.points.map(clonePathPoint);
      const subpaths = node.subpaths?.map((sp) => sp.map(clonePathPoint));
      return { points, subpaths, closed: node.closed };
    }

    default:
      return null;
  }
}
