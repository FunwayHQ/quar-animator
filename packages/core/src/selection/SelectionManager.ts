/**
 * SelectionManager for Quar Animator
 * Calculates bounding boxes for selected nodes
 */

import type {
  Node,
  ImageNode,
  TextNode,
  Rect,
  Matrix3,
  SymbolDefinition,
  SymbolInstanceNode,
} from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { SelectionBounds } from './types';
import { rect, mat3 } from '../math';
import { getPolygonBounds, getPathBounds } from '../path/pathUtils';
import { getTextBounds } from '../font/textMetrics';
import { getSymbolBounds } from '../symbols/symbolResolver';

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
  /** Symbol definitions for computing symbol-instance bounds */
  private symbolDefinitions: SymbolDefinition[] = [];

  /** Set symbol definitions for symbol-instance bounds computation */
  setSymbolDefinitions(defs: SymbolDefinition[]): void {
    this.symbolDefinitions = defs;
  }

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

      // Groups and symbol instances: compute bounds from descendants using world transforms
      if (node.type === 'group' || node.type === 'symbol-instance') {
        const bounds = this.getGroupBounds(node, sceneGraph);
        if (!bounds) return null;
        return { bounds, rotation: 0 };
      }

      // For nested nodes (children of groups), the node's transform.position
      // is relative to the parent, so we must include the parent's world transform.
      let nodeBounds: Rect | null;
      let rotationCenter: { x: number; y: number };

      if (node.parent) {
        const localBounds = this.getLocalBounds(node);
        if (!localBounds) return null;
        const parentWorld = sceneGraph.getWorldTransform(node.parent);
        // Compose child's local transform WITHOUT rotation (overlay applies rotation visually)
        const localNoRot = mat3.compose(node.transform.position, 0, node.transform.scale);
        const worldNoRot = mat3.multiply(parentWorld, localNoRot);
        nodeBounds = transformBoundsToWorld(localBounds, worldNoRot);
        rotationCenter = mat3.transformPoint(parentWorld, node.transform.position);
      } else {
        nodeBounds = this.getNodeBoundsUnrotated(node);
        rotationCenter = node.transform.position;
      }
      if (!nodeBounds) return null;

      return {
        bounds: {
          rect: nodeBounds,
          center: rotationCenter,
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
    if (node.type === 'artboard') {
      // Artboard uses its own dimensions, not descendant bounds
      if (node.parent) {
        // Nested artboard: use full world transform
        const worldTransform = sceneGraph.getWorldTransform(node.id);
        const localBounds = this.getLocalBounds(node);
        if (localBounds) {
          out.push(transformBoundsToWorld(localBounds, worldTransform));
        }
      } else {
        // Root artboard: use getNodeBounds (excludes anchor from transform to
        // avoid double-counting since getLocalBounds already applies anchor)
        const nodeBounds = this.getNodeBounds(node);
        if (nodeBounds) {
          out.push(nodeBounds);
        }
      }
      return;
    }
    if (node.type === 'symbol-instance') {
      // Symbol instances have virtual children from definition — compute bounds from definition nodes
      const inst = node as SymbolInstanceNode;
      const def = this.symbolDefinitions.find((d) => d.id === inst.symbolId);
      if (def && def.sceneGraphJSON.nodes.length > 0) {
        const symBounds = getSymbolBounds(def.sceneGraphJSON.nodes as Node[]);
        if (symBounds.width > 0 && symBounds.height > 0) {
          const worldMatrix = node.parent
            ? sceneGraph.getWorldTransform(node.id)
            : mat3.compose(node.transform.position, node.transform.rotation, node.transform.scale);
          out.push(transformBoundsToWorld(symBounds, worldMatrix));
        }
      }
      return;
    }
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
    } else if (node.parent) {
      // Nested node: use world transform so position is correctly mapped
      const worldTransform = sceneGraph.getWorldTransform(node.id);
      const localBounds = this.getLocalBounds(node);
      if (localBounds) {
        out.push(transformBoundsToWorld(localBounds, worldTransform));
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
      case 'text': {
        const textNode = node;
        const rawBounds = getTextBounds(
          textNode.content,
          textNode.fontFamily,
          textNode.fontSize,
          textNode.lineHeight,
          textNode.letterSpacing,
          textNode.textAlign
        );
        const anchor = node.transform.anchor;
        // For non-zero anchors, center geometry like rectangles
        if (anchor.x !== 0 || anchor.y !== 0) {
          return {
            x: -rawBounds.width * anchor.x,
            y: -rawBounds.height * anchor.y,
            width: rawBounds.width,
            height: rawBounds.height,
          };
        }
        return rawBounds;
      }
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
