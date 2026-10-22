/**
 * SelectionManager for Quar Animator
 * Calculates bounding boxes for selected nodes
 */

import type { Node, Rect, SymbolDefinition, SymbolInstanceNode } from '@quar/types';
import type { SceneGraph } from '../SceneGraph';
import type { SelectionBounds } from './types';
import { rect, mat3 } from '../math';
import { getSymbolBounds } from '../symbols/symbolResolver';
import { getNodeLocalBounds, transformBoundsToWorld } from './localBounds';

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
    const localBounds = getNodeLocalBounds(node);
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
    const localBounds = getNodeLocalBounds(node);
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
        const localBounds = getNodeLocalBounds(node);
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
        const localBounds = getNodeLocalBounds(node);
        if (localBounds) {
          out.push(transformBoundsToWorld(localBounds, worldTransform));
        }
      } else {
        // Root artboard: use getNodeBounds (excludes anchor from transform to
        // avoid double-counting since getNodeLocalBounds already applies anchor)
        const nodeBounds = this.getNodeBounds(node);
        if (nodeBounds) {
          out.push(nodeBounds);
        }
      }
      return;
    }
    if (node.type === 'symbol-instance') {
      this.collectSymbolInstanceBounds(node, sceneGraph, out);
      return;
    }
    if (node.type === 'group') {
      const descendants = sceneGraph.getDescendants(node.id);
      for (const desc of descendants) {
        if (!desc.visible) continue;
        // An instance has no layers of its own: what it draws comes from its symbol
        if (desc.type === 'symbol-instance') {
          this.collectSymbolInstanceBounds(desc, sceneGraph, out);
          continue;
        }
        const worldTransform = sceneGraph.getWorldTransform(desc.id);
        const localBounds = getNodeLocalBounds(desc);
        if (localBounds) {
          out.push(transformBoundsToWorld(localBounds, worldTransform));
        }
      }
    } else if (node.parent) {
      // Nested node: use world transform so position is correctly mapped
      const worldTransform = sceneGraph.getWorldTransform(node.id);
      const localBounds = getNodeLocalBounds(node);
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
   * Collect the bounds of what a symbol instance draws: its symbol's artwork
   * (it has no scene graph children), placed through the instance's own
   * transform and those of the groups it sits in.
   */
  private collectSymbolInstanceBounds(
    inst: SymbolInstanceNode,
    sceneGraph: SceneGraph,
    out: Rect[]
  ): void {
    const def = this.symbolDefinitions.find((d) => d.id === inst.symbolId);
    if (!def || def.sceneGraphJSON.nodes.length === 0) return;
    const symBounds = getSymbolBounds(def.sceneGraphJSON.nodes);
    if (symBounds.width > 0 && symBounds.height > 0) {
      const worldMatrix = inst.parent
        ? sceneGraph.getWorldTransform(inst.id)
        : mat3.compose(inst.transform.position, inst.transform.rotation, inst.transform.scale);
      out.push(transformBoundsToWorld(symBounds, worldMatrix));
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
