/**
 * SelectionManager for Quar Animator
 * Calculates bounding boxes for selected nodes
 */

import type { Node, Rect } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { SelectionBounds } from './types';
import { rect } from '../math';
import { getPolygonBounds } from '../path/pathUtils';

// ============================================================================
// SelectionManager Class
// ============================================================================

export class SelectionManager {
  // --------------------------------------------------------------------------
  // Selection Bounds Calculation
  // --------------------------------------------------------------------------

  /**
   * Get the combined bounding box for all selected nodes
   * @param selectedIds Set of selected node IDs
   * @param sceneGraph The scene graph containing the nodes
   * @returns SelectionBounds or null if no valid selection
   */
  getSelectionBounds(selectedIds: Set<string>, sceneGraph: SceneGraph): SelectionBounds | null {
    if (selectedIds.size === 0) {
      return null;
    }

    const bounds: Rect[] = [];

    for (const id of selectedIds) {
      const node = sceneGraph.getNode(id);
      if (node && node.visible) {
        const nodeBounds = this.getNodeBounds(node);
        if (nodeBounds) {
          bounds.push(nodeBounds);
        }
      }
    }

    if (bounds.length === 0) {
      return null;
    }

    const unionRect = this.unionBounds(bounds);
    return {
      rect: unionRect,
      center: rect.center(unionRect),
    };
  }

  // --------------------------------------------------------------------------
  // Node Bounds Calculation
  // --------------------------------------------------------------------------

  /**
   * Get the axis-aligned bounding box of a node in world space
   * @param node The node to calculate bounds for
   * @returns Rect or null if bounds cannot be calculated
   */
  getNodeBounds(node: Node): Rect | null {
    const transform = node.transform;
    const pos = transform.position;

    switch (node.type) {
      case 'rectangle': {
        const rectNode = node as any;
        const halfWidth = rectNode.width / 2;
        const halfHeight = rectNode.height / 2;
        return {
          x: pos.x - halfWidth,
          y: pos.y - halfHeight,
          width: rectNode.width,
          height: rectNode.height,
        };
      }

      case 'ellipse': {
        const ellipseNode = node as any;
        return {
          x: pos.x - ellipseNode.radiusX,
          y: pos.y - ellipseNode.radiusY,
          width: ellipseNode.radiusX * 2,
          height: ellipseNode.radiusY * 2,
        };
      }

      case 'polygon': {
        const polygonNode = node as any;
        // Calculate precise bounds from actual polygon vertices
        const scaleX = transform.scale?.x ?? 1;
        const scaleY = transform.scale?.y ?? 1;
        const bounds = getPolygonBounds(
          pos.x,
          pos.y,
          polygonNode.radius,
          polygonNode.sides,
          scaleX,
          scaleY,
          polygonNode.innerRadius
        );
        return bounds;
      }

      case 'path': {
        const pathNode = node as any;
        if (!pathNode.points || pathNode.points.length === 0) {
          return null;
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const p of pathNode.points) {
          minX = Math.min(minX, p.position.x);
          minY = Math.min(minY, p.position.y);
          maxX = Math.max(maxX, p.position.x);
          maxY = Math.max(maxY, p.position.y);
        }

        return {
          x: minX + pos.x,
          y: minY + pos.y,
          width: maxX - minX,
          height: maxY - minY,
        };
      }

      case 'group': {
        // Groups don't have intrinsic bounds
        return null;
      }

      default:
        return null;
    }
  }

  // --------------------------------------------------------------------------
  // Bounds Utilities
  // --------------------------------------------------------------------------

  /**
   * Combine multiple rectangles into a single bounding rectangle
   * @param rects Array of rectangles to combine
   * @returns Single rectangle containing all input rectangles
   */
  unionBounds(rects: Rect[]): Rect {
    if (rects.length === 0) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    const firstRect = rects[0];
    if (rects.length === 1 || !firstRect) {
      return firstRect ? { ...firstRect } : { x: 0, y: 0, width: 0, height: 0 };
    }

    let result = firstRect;
    for (let i = 1; i < rects.length; i++) {
      const currentRect = rects[i];
      if (currentRect) {
        result = rect.union(result, currentRect);
      }
    }

    return result;
  }
}
