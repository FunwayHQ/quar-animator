/**
 * Eraser Tool for Quar Animator
 *
 * Stroke mode: accumulates a freehand stroke, then boolean-subtracts
 * that outline from every overlapping visible/unlocked shape.
 * Point mode: deletes individual path points that the eraser touches.
 * Supports undo via onTransformStart.
 */

import type {
  CanvasPointerEvent,
  Node,
  PathNode,
  PathPoint,
  Vector2,
  Fill,
  Stroke,
} from '@quar/types';
import { BaseTool, type ToolContext } from './BaseTool';
import { vec2, mat3 } from '../math';
import { tessellatePathToVertices, createPolygonPath } from '../path/pathUtils';
import { generateBrushOutline, cornerPoint } from '../path/brushOutline';
import {
  nodeToPolygon,
  performBoolean,
  polygonToContours,
  createBooleanResultNode,
} from '../boolean/booleanOps';
import type { MultiPolygon, Ring } from 'polygon-clipping';

// ============================================================================
// Types
// ============================================================================

export type EraserMode = 'stroke' | 'point';

export interface EraserToolOptions {
  /** Eraser size in pixels (default: 10) */
  size: number;
  /** Eraser mode: 'stroke' boolean-subtracts, 'point' deletes individual points */
  mode: EraserMode;
}

// ============================================================================
// EraserTool Class
// ============================================================================

export class EraserTool extends BaseTool {
  readonly type = 'eraser' as const;
  readonly cursor = 'crosshair';

  private options: EraserToolOptions = {
    size: 10,
    mode: 'stroke',
  };

  private isErasing: boolean = false;
  private undoPushed: boolean = false;

  /** Accumulated world-space positions for the stroke outline (stroke mode) */
  private strokePoints: Vector2[] = [];

  /** Minimum distance between samples (in world units) */
  private static MIN_POINT_DIST = 2;

  constructor(context: ToolContext) {
    super(context);
  }

  // --------------------------------------------------------------------------
  // Options
  // --------------------------------------------------------------------------

  getOptions(): Readonly<EraserToolOptions> {
    return { ...this.options };
  }

  setOptions(options: Partial<EraserToolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  setSize(size: number): void {
    this.options.size = Math.max(1, Math.min(100, size));
  }

  setMode(mode: EraserMode): void {
    this.options.mode = mode;
  }

  // --------------------------------------------------------------------------
  // Pointer Events
  // --------------------------------------------------------------------------

  onPointerDown(event: CanvasPointerEvent): void {
    if (event.button !== 0) return;

    this.isErasing = true;
    this.undoPushed = false;
    this.state.isDragging = true;
    this.state.startWorldPos = { ...event.worldPosition };

    if (this.options.mode === 'stroke') {
      this.strokePoints = [{ ...event.worldPosition }];
    } else {
      this.erasePoints(event.worldPosition, this.options.size / this.context.camera.zoom);
    }
  }

  onPointerMove(event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    if (this.options.mode === 'stroke') {
      const minDist = Math.max(
        EraserTool.MIN_POINT_DIST,
        (this.options.size * 0.1) / this.context.camera.zoom
      );
      const last = this.strokePoints[this.strokePoints.length - 1]!;
      if (vec2.distance(last, event.worldPosition) >= minDist) {
        this.strokePoints.push({ ...event.worldPosition });
      }
    } else {
      this.erasePoints(event.worldPosition, this.options.size / this.context.camera.zoom);
    }
  }

  onPointerUp(_event: CanvasPointerEvent): void {
    if (!this.isErasing) return;

    if (this.options.mode === 'stroke') {
      this.finalizeStrokeErase();
    }

    this.isErasing = false;
    this.strokePoints = [];
    this.undoPushed = false;
    this.resetState();
  }

  // --------------------------------------------------------------------------
  // Keyboard Events
  // --------------------------------------------------------------------------

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === '[') {
      this.setSize(this.options.size - 5);
    } else if (event.key === ']') {
      this.setSize(this.options.size + 5);
    }
  }

  // --------------------------------------------------------------------------
  // Preview
  // --------------------------------------------------------------------------

  getPreviewNode(): PathNode | null {
    if (this.options.mode !== 'stroke' || !this.isErasing || this.strokePoints.length === 0) {
      return null;
    }

    const outline = this.generateEraserOutline();
    if (!outline || outline.length < 3) return null;

    return {
      id: '__eraser-preview__',
      name: 'Eraser Preview',
      type: 'path',
      parent: null,
      children: [],
      transform: {
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0, y: 0 },
        skew: { x: 0, y: 0 },
      },
      visible: true,
      locked: false,
      opacity: 0.3,
      blendMode: 'normal',
      points: outline,
      closed: true,
      fills: [{ type: 'solid', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
      strokes: [],
    };
  }

  // --------------------------------------------------------------------------
  // Stroke Erase Logic (Boolean Subtraction)
  // --------------------------------------------------------------------------

  /**
   * Push undo once per erase gesture (on first actual mutation).
   */
  private ensureUndo(): void {
    if (!this.undoPushed) {
      this.context.onTransformStart?.();
      this.undoPushed = true;
    }
  }

  /**
   * Generate a closed outline from the accumulated stroke points.
   * For single-click (< 2 points), creates a circle fallback.
   */
  private generateEraserOutline(): PathPoint[] | null {
    const eraserRadius = this.options.size / this.context.camera.zoom;

    if (this.strokePoints.length < 2) {
      // Single-click: create a circle
      const center = this.strokePoints[0];
      if (!center) return null;
      const circlePoints = createPolygonPath(center.x, center.y, eraserRadius, 24);
      return circlePoints;
    }

    // Convert Vector2[] → corner PathPoint[] (spine)
    const spine = this.strokePoints.map((p) => cornerPoint(p));

    // Build uniform widths array: diameter (generateBrushOutline halves internally)
    const diameter = 2 * eraserRadius;
    const widths = Array(spine.length).fill(diameter) as number[];

    return generateBrushOutline(spine, widths);
  }

  /**
   * Build a polygon-clipping MultiPolygon from the eraser outline.
   */
  private buildEraserMultiPolygon(outline: PathPoint[]): MultiPolygon | null {
    const flat = tessellatePathToVertices(outline, true, 1.0);
    if (flat.length < 6) return null; // Need at least 3 vertices

    const ring: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) {
      ring.push([flat[i]!, flat[i + 1]!]);
    }

    // Ensure closure for polygon-clipping
    if (ring.length >= 3) {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      if (Math.abs(first[0] - last[0]) > 1e-10 || Math.abs(first[1] - last[1]) > 1e-10) {
        ring.push([first[0], first[1]]);
      }
    }

    return [[ring as Ring]];
  }

  /**
   * Compute AABB from the eraser outline for quick rejection.
   */
  private computeOutlineAABB(outline: PathPoint[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const pt of outline) {
      if (pt.position.x < minX) minX = pt.position.x;
      if (pt.position.x > maxX) maxX = pt.position.x;
      if (pt.position.y < minY) minY = pt.position.y;
      if (pt.position.y > maxY) maxY = pt.position.y;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Compute AABB of a node in world space for quick rejection.
   */
  private computeNodeWorldAABB(
    node: Node,
    worldMatrix: import('@quar/types').Matrix3
  ): { minX: number; minY: number; maxX: number; maxY: number } | null {
    // Get local-space corners based on node type
    let corners: Vector2[];

    if (node.type === 'rectangle') {
      const hw = node.width / 2;
      const hh = node.height / 2;
      corners = [
        { x: -hw, y: -hh },
        { x: hw, y: -hh },
        { x: hw, y: hh },
        { x: -hw, y: hh },
      ];
    } else if (node.type === 'ellipse') {
      const n = node;
      corners = [
        { x: -n.radiusX, y: -n.radiusY },
        { x: n.radiusX, y: -n.radiusY },
        { x: n.radiusX, y: n.radiusY },
        { x: -n.radiusX, y: n.radiusY },
      ];
    } else if (node.type === 'polygon') {
      const n = node;
      corners = [
        { x: -n.radius, y: -n.radius },
        { x: n.radius, y: -n.radius },
        { x: n.radius, y: n.radius },
        { x: -n.radius, y: n.radius },
      ];
    } else if (node.type === 'path') {
      const pathNode = node;
      if (pathNode.points.length === 0) return null;
      let pMinX = Infinity,
        pMaxX = -Infinity,
        pMinY = Infinity,
        pMaxY = -Infinity;
      for (const pt of pathNode.points) {
        if (pt.position.x < pMinX) pMinX = pt.position.x;
        if (pt.position.x > pMaxX) pMaxX = pt.position.x;
        if (pt.position.y < pMinY) pMinY = pt.position.y;
        if (pt.position.y > pMaxY) pMaxY = pt.position.y;
      }
      corners = [
        { x: pMinX, y: pMinY },
        { x: pMaxX, y: pMinY },
        { x: pMaxX, y: pMaxY },
        { x: pMinX, y: pMaxY },
      ];
    } else {
      return null;
    }

    // Transform to world space
    const worldCorners = corners.map((c) => mat3.transformPoint(worldMatrix, c));
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const c of worldCorners) {
      if (c.x < minX) minX = c.x;
      if (c.x > maxX) maxX = c.x;
      if (c.y < minY) minY = c.y;
      if (c.y > maxY) maxY = c.y;
    }
    return { minX, minY, maxX, maxY };
  }

  /**
   * Finalize the stroke-mode erase: generate outline, boolean-subtract from all overlapping shapes.
   */
  private finalizeStrokeErase(): void {
    const outline = this.generateEraserOutline();
    if (!outline || outline.length < 3) return;

    const eraserPoly = this.buildEraserMultiPolygon(outline);
    if (!eraserPoly) return;

    const eraserAABB = this.computeOutlineAABB(outline);

    // Collect candidate nodes (don't modify during traversal)
    const candidates: Array<{
      node: Node;
      parentId: string | null;
      index: number;
    }> = [];

    this.context.sceneGraph.traverseVisible((node) => {
      // Skip unsupported types
      if (
        node.type !== 'path' &&
        node.type !== 'rectangle' &&
        node.type !== 'ellipse' &&
        node.type !== 'polygon'
      ) {
        return; // continue traversal
      }

      // Skip locked nodes
      if (node.locked) return;

      // Skip open paths (nodeToPolygon returns null for them anyway)
      if (node.type === 'path' && !node.closed) return;

      // Figure out sibling index
      const parentId = node.parent;
      let index = 0;
      if (parentId) {
        const parent = this.context.sceneGraph.getNode(parentId);
        if (parent) {
          index = parent.children.indexOf(node.id);
        }
      } else {
        const roots = this.context.sceneGraph.getRootNodes();
        index = roots.findIndex((n) => n.id === node.id);
      }

      candidates.push({ node, parentId, index });
    });

    // Process each candidate
    const oldToNew = new Map<string, string>();
    const removedIds = new Set<string>();

    for (const { node, parentId, index } of candidates) {
      const worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);

      // AABB quick rejection
      const nodeAABB = this.computeNodeWorldAABB(node, worldMatrix);
      if (nodeAABB) {
        if (
          eraserAABB.maxX < nodeAABB.minX ||
          eraserAABB.minX > nodeAABB.maxX ||
          eraserAABB.maxY < nodeAABB.minY ||
          eraserAABB.minY > nodeAABB.maxY
        ) {
          continue; // No overlap
        }
      }

      // Convert node to polygon
      const shapePoly = nodeToPolygon(node, worldMatrix);
      if (!shapePoly) continue;

      // Boolean subtract
      let result: MultiPolygon;
      try {
        result = performBoolean(shapePoly, eraserPoly, 'subtract');
      } catch {
        continue; // polygon-clipping can throw on degenerate input
      }

      // Check if result is empty → remove node
      if (!result || result.length === 0) {
        this.ensureUndo();
        removedIds.add(node.id);
        this.context.sceneGraph.removeNode(node.id);
        continue;
      }

      // Convert result to contours
      const contours = polygonToContours(result);
      if (contours.length === 0) {
        this.ensureUndo();
        removedIds.add(node.id);
        this.context.sceneGraph.removeNode(node.id);
        continue;
      }

      // Check if the result is identical to the input (no actual subtraction happened)
      // Compare vertex counts as a quick heuristic
      const originalPoly = polygonToContours(shapePoly);
      const origVertexCount = originalPoly.reduce((sum, c) => sum + c.length, 0);
      const resultVertexCount = contours.reduce((sum, c) => sum + c.length, 0);
      if (resultVertexCount === origVertexCount) {
        // Check if vertices are actually the same
        let same = true;
        let oi = 0;
        for (const contour of contours) {
          for (const pt of contour) {
            if (oi >= origVertexCount) {
              same = false;
              break;
            }
            const origContours = originalPoly;
            let flatIdx = 0;
            let found = false;
            for (const oc of origContours) {
              for (const op of oc) {
                if (flatIdx === oi) {
                  if (
                    Math.abs(pt.position.x - op.position.x) > 0.01 ||
                    Math.abs(pt.position.y - op.position.y) > 0.01
                  ) {
                    same = false;
                  }
                  found = true;
                  break;
                }
                flatIdx++;
              }
              if (found) break;
            }
            oi++;
          }
          if (!same) break;
        }
        if (same) continue; // No change
      }

      // Get fills/strokes from original node
      const fills: Fill[] = 'fills' in node ? (node as { fills: Fill[] }).fills : [];
      const strokes: Stroke[] = 'strokes' in node ? (node as { strokes: Stroke[] }).strokes : [];

      // Create result node
      const resultNode = createBooleanResultNode(
        contours,
        fills,
        strokes,
        node.name,
        this.context.generateId
      );
      if (!resultNode) {
        this.ensureUndo();
        this.context.sceneGraph.removeNode(node.id);
        continue;
      }

      // Copy opacity and blendMode from original
      resultNode.opacity = node.opacity;
      resultNode.blendMode = node.blendMode ?? 'normal';

      // If node had a parent, convert world-space position to parent-local
      if (parentId) {
        const parentWorld = this.context.sceneGraph.getWorldTransform(parentId);
        const invParent = mat3.invert(parentWorld);
        if (invParent) {
          const localPos = mat3.transformPoint(invParent, resultNode.transform.position);
          resultNode.transform.position = localPos;
        }
      }

      this.ensureUndo();

      // Remove old node and add new one at the same position
      this.context.sceneGraph.removeNode(node.id);
      this.context.sceneGraph.addNode(resultNode, parentId ?? undefined);

      // Move to correct index position if needed
      if (index >= 0) {
        this.context.sceneGraph.moveNode(resultNode.id, parentId, index);
      }

      oldToNew.set(node.id, resultNode.id);
    }

    // Update selection: map old selected IDs to new replacement IDs, remove erased ones
    if (oldToNew.size > 0 || removedIds.size > 0) {
      const selectedIds = this.context.getSelectedIds();
      const newSelection: string[] = [];
      let changed = false;
      for (const id of selectedIds) {
        const newId = oldToNew.get(id);
        if (newId) {
          newSelection.push(newId);
          changed = true;
        } else if (removedIds.has(id)) {
          // Node was fully erased
          changed = true;
        } else {
          newSelection.push(id);
        }
      }
      if (changed) {
        this.context.setSelectedIds(newSelection);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Point Erase Logic (unchanged)
  // --------------------------------------------------------------------------

  /**
   * Point eraser mode: delete individual points from path nodes.
   * Uses world transforms for correct point positioning.
   */
  private erasePoints(worldPos: Vector2, radius: number): void {
    const pathsToUpdate: Map<string, PathNode> = new Map();
    const pathsToRemove: string[] = [];

    this.context.sceneGraph.traverse((node) => {
      if (node.type !== 'path') return;

      const pathNode = node;
      const worldMatrix = this.context.sceneGraph.getWorldTransform(node.id);

      // Check each point in the path
      const pointsToKeep: number[] = [];
      for (let i = 0; i < pathNode.points.length; i++) {
        const point = pathNode.points[i]!;
        const worldPoint = mat3.transformPoint(worldMatrix, point.position);
        const distance = vec2.distance(worldPoint, worldPos);
        if (distance > radius) {
          pointsToKeep.push(i);
        }
      }

      if (pointsToKeep.length < pathNode.points.length) {
        if (pointsToKeep.length < 2) {
          pathsToRemove.push(pathNode.id);
        } else {
          const newPoints = pointsToKeep.map((i) => pathNode.points[i]!);
          pathsToUpdate.set(pathNode.id, {
            ...pathNode,
            points: newPoints,
            closed: pathNode.closed && pointsToKeep.length === pathNode.points.length,
          });
        }
      }
    });

    if (pathsToRemove.length > 0 || pathsToUpdate.size > 0) {
      this.ensureUndo();
    }

    for (const nodeId of pathsToRemove) {
      this.context.sceneGraph.removeNode(nodeId);
    }

    for (const [nodeId, updatedNode] of pathsToUpdate) {
      this.context.sceneGraph.updateNode(nodeId, {
        points: updatedNode.points,
        closed: updatedNode.closed,
      });
    }

    // Clear selection if any erased nodes were affected
    const selectedIds = this.context.getSelectedIds();
    const newSelection = [...selectedIds].filter((id) => !pathsToRemove.includes(id));
    if (newSelection.length !== selectedIds.size) {
      this.context.setSelectedIds(newSelection);
    }
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  onDeactivate(): void {
    if (this.isErasing) {
      this.isErasing = false;
      this.strokePoints = [];
      this.undoPushed = false;
      this.resetState();
    }
  }
}
