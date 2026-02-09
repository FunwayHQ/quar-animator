/**
 * SelectionManager for Quar Animator
 * Calculates bounding boxes for selected nodes
 */

import type { Node, Rect, Matrix3 } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { SelectionBounds } from './types';
import { rect, mat3 } from '../math';
import { getPolygonBounds, getPathBounds } from '../path/pathUtils';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Transform a local-space AABB through a world matrix and return the new AABB.
 * Transforms all 4 corners, then computes the axis-aligned bounding box.
 */
function transformBoundsToWorld(localBounds: Rect, worldMatrix: Matrix3): Rect {
  const { x, y, width, height } = localBounds;
  const corners = [
    mat3.transformPoint(worldMatrix, { x, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y }),
    mat3.transformPoint(worldMatrix, { x: x + width, y: y + height }),
    mat3.transformPoint(worldMatrix, { x, y: y + height }),
  ];

  let minX = corners[0].x;
  let minY = corners[0].y;
  let maxX = corners[0].x;
  let maxY = corners[0].y;
  for (let i = 1; i < 4; i++) {
    if (corners[i].x < minX) minX = corners[i].x;
    if (corners[i].y < minY) minY = corners[i].y;
    if (corners[i].x > maxX) maxX = corners[i].x;
    if (corners[i].y > maxY) maxY = corners[i].y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

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
        this.collectNodeBounds(node, sceneGraph, bounds);
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
    const localBounds = this.getLocalBounds(node);
    if (!localBounds) return null;

    const transform = node.transform;
    const worldMatrix = mat3.compose(transform.position, transform.rotation, transform.scale);

    return transformBoundsToWorld(localBounds, worldMatrix);
  }

  /**
   * Get un-rotated bounds of a node (position + scale, no rotation).
   * Used for the visual selection overlay which applies rotation separately.
   */
  getNodeBoundsUnrotated(node: Node): Rect | null {
    const transform = node.transform;
    const localBounds = this.getLocalBounds(node);
    if (!localBounds) return null;

    // Compose WITHOUT rotation — overlay handles rotation visually
    const worldMatrix = mat3.compose(transform.position, 0, transform.scale);

    return transformBoundsToWorld(localBounds, worldMatrix);
  }

  /**
   * Get selection bounds without rotation (for visual overlay).
   * For single selection, returns un-rotated bounds + rotation angle.
   * For multi selection, returns rotation-aware AABB + rotation 0.
   */
  getSelectionBoundsForDisplay(
    selectedIds: Set<string>,
    sceneGraph: SceneGraph
  ): { bounds: SelectionBounds; rotation: number } | null {
    if (selectedIds.size === 0) return null;

    if (selectedIds.size === 1) {
      const nodeId = [...selectedIds][0]!;
      const node = sceneGraph.getNode(nodeId);
      if (!node || !node.visible) return null;

      // Groups: compute bounds from descendants using world transforms
      if (node.type === 'group') {
        const bounds = this.getGroupBounds(node, sceneGraph);
        if (!bounds) return null;
        return { bounds, rotation: 0 };
      }

      const nodeBounds = this.getNodeBoundsUnrotated(node);
      if (!nodeBounds) return null;

      return {
        bounds: {
          rect: nodeBounds,
          center: rect.center(nodeBounds),
        },
        rotation: node.transform.rotation,
      };
    }

    // Multi-selection: use AABB (rotation-aware), no visual rotation
    const bounds = this.getSelectionBounds(selectedIds, sceneGraph);
    if (!bounds) return null;
    return { bounds, rotation: 0 };
  }

  // --------------------------------------------------------------------------
  // Group Bounds
  // --------------------------------------------------------------------------

  /**
   * Collect bounds for a node. For groups, recurse into descendants.
   * Uses world-transform-based AABB for all leaf nodes.
   */
  private collectNodeBounds(node: Node, sceneGraph: SceneGraph, out: Rect[]): void {
    if (node.type === 'group') {
      const descendants = sceneGraph.getDescendants(node.id);
      for (const desc of descendants) {
        if (!desc.visible) continue;
        const worldTransform = sceneGraph.getWorldTransform(desc.id);
        const localBounds = this.getLocalBounds(desc);
        if (localBounds) {
          out.push(transformBoundsToWorld(localBounds, worldTransform));
        }
      }
    } else {
      const nodeBounds = this.getNodeBounds(node);
      if (nodeBounds) {
        out.push(nodeBounds);
      }
    }
  }

  /**
   * Get combined bounds for a group node from its descendants (world-space AABB).
   */
  private getGroupBounds(groupNode: Node, sceneGraph: SceneGraph): SelectionBounds | null {
    const rects: Rect[] = [];
    this.collectNodeBounds(groupNode, sceneGraph, rects);
    if (rects.length === 0) return null;
    const unionRect = this.unionBounds(rects);
    return { rect: unionRect, center: rect.center(unionRect) };
  }

  // --------------------------------------------------------------------------
  // Local Bounds (shared helper)
  // --------------------------------------------------------------------------

  /**
   * Get the local-space AABB for a node's geometry (no transform applied).
   */
  private getLocalBounds(node: Node): Rect | null {
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
        const allBounds = [primaryBounds];
        for (const sp of node.subpaths) {
          const spBounds = getPathBounds(sp, true);
          if (spBounds) allBounds.push(spBounds);
        }
        return allBounds.length === 1 ? primaryBounds : this.unionBounds(allBounds);
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
