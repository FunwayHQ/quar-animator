/**
 * Local Bounds for Quar Animator
 * The box a node's own geometry covers in its own space, and that box carried
 * through a transform. Shared by selection bounds and symbol bounds, so both
 * measure a shape the same way.
 */

import type { Node, Rect, Matrix3 } from '@quar/types';
import { rect, mat3 } from '../math';
import { getPolygonBounds, getPathBounds } from '../path/pathUtils';
import { getTextLocalBounds } from '../font/textPlacement';

/**
 * Transform a local-space AABB through a world matrix and return the new AABB.
 * Transforms all 4 corners, then computes the axis-aligned bounding box.
 */
export function transformBoundsToWorld(localBounds: Rect, worldMatrix: Matrix3): Rect {
  const { x, y, width, height } = localBounds;
  const corners = [
    mat3.transformPoint(worldMatrix, { x, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y: y + height }),
    mat3.transformPoint(worldMatrix, { x, y: y + height }),
  ];

  let minX = corners[0]!.x;
  let minY = corners[0]!.y;
  let maxX = corners[0]!.x;
  let maxY = corners[0]!.y;
  for (let i = 1; i < 4; i++) {
    if (corners[i]!.x < minX) minX = corners[i]!.x;
    if (corners[i]!.y < minY) minY = corners[i]!.y;
    if (corners[i]!.x > maxX) maxX = corners[i]!.x;
    if (corners[i]!.y > maxY) maxY = corners[i]!.y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Get the local-space AABB for a node's geometry (no transform applied).
 * Null for nodes with no geometry of their own: groups, symbol instances,
 * IK targets.
 */
export function getNodeLocalBounds(node: Node): Rect | null {
  switch (node.type) {
    case 'rectangle': {
      const anchor = node.transform.anchor;
      return {
        x: -node.width * anchor.x,
        y: -node.height * anchor.y,
        width: node.width,
        height: node.height,
      };
    }
    case 'ellipse':
      return {
        x: -node.radiusX,
        y: -node.radiusY,
        width: node.radiusX * 2,
        height: node.radiusY * 2,
      };
    case 'polygon':
      return getPolygonBounds(0, 0, node.radius, node.sides, 1, 1, node.innerRadius);
    case 'path': {
      const primaryBounds = getPathBounds(node.points, node.closed);
      if (!primaryBounds) return null;
      if (!node.subpaths || node.subpaths.length === 0) return primaryBounds;

      // Include subpaths in bounds calculation
      let allBounds = primaryBounds;
      for (const sp of node.subpaths) {
        const spBounds = getPathBounds(sp, true);
        if (spBounds) allBounds = rect.union(allBounds, spBounds);
      }
      return allBounds;
    }
    case 'text':
      return getTextLocalBounds(node);
    case 'image': {
      const imgNode = node;
      const anchor = node.transform.anchor;
      const x0 = -imgNode.width * anchor.x;
      const y0 = -imgNode.height * anchor.y;
      const x1 = x0 + imgNode.width;
      const y1 = y0 + imgNode.height;

      // Account for vertex offsets [BL, BR, TL, TR]
      const vo = imgNode.vertexOffsets;
      if (vo) {
        const blX = x0 + (vo[0]?.x ?? 0),
          blY = y0 + (vo[0]?.y ?? 0);
        const brX = x1 + (vo[1]?.x ?? 0),
          brY = y0 + (vo[1]?.y ?? 0);
        const tlX = x0 + (vo[2]?.x ?? 0),
          tlY = y1 + (vo[2]?.y ?? 0);
        const trX = x1 + (vo[3]?.x ?? 0),
          trY = y1 + (vo[3]?.y ?? 0);
        const minX = Math.min(blX, brX, tlX, trX);
        const minY = Math.min(blY, brY, tlY, trY);
        const maxX = Math.max(blX, brX, tlX, trX);
        const maxY = Math.max(blY, brY, tlY, trY);
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      }

      return {
        x: x0,
        y: y0,
        width: imgNode.width,
        height: imgNode.height,
      };
    }
    case 'video': {
      const anchor = node.transform.anchor;
      return {
        x: -node.width * anchor.x,
        y: -node.height * anchor.y,
        width: node.width,
        height: node.height,
      };
    }
    case 'bone': {
      // Bone anchor is (0,0), extends along +X for length
      const halfH = Math.max(node.length * 0.15, 4);
      return { x: 0, y: -halfH, width: node.length, height: halfH * 2 };
    }
    case 'artboard': {
      const anchor = node.transform.anchor;
      return {
        x: -node.width * anchor.x,
        y: -node.height * anchor.y,
        width: node.width,
        height: node.height,
      };
    }
    case 'symbol-instance':
      return null; // No own geometry — bounds computed from resolved children
    default:
      return null;
  }
}
