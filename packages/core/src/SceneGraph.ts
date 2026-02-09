/**
 * Scene Graph for Quar Animator
 * Manages the hierarchical structure of nodes in the document
 */

import type { Node, GroupNode, Transform, Vector2, Matrix3, Fill, Stroke } from '@quar/types';
import { mat3 } from './math';

// ============================================================================
// Event Types
// ============================================================================

export type SceneGraphEventType =
  | 'nodeAdded'
  | 'nodeRemoved'
  | 'nodeChanged'
  | 'nodeMoved'
  | 'selectionChanged';

export interface SceneGraphEvent {
  type: SceneGraphEventType;
  nodeId?: string;
  parentId?: string;
  previousParentId?: string;
}

type EventCallback = (event: SceneGraphEvent) => void;

// ============================================================================
// Default Values
// ============================================================================

export function createDefaultTransform(): Transform {
  return {
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    anchor: { x: 0.5, y: 0.5 },
    skew: { x: 0, y: 0 },
  };
}

export function createGroupNode(id: string, name: string): GroupNode {
  return {
    id,
    name,
    type: 'group',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  };
}

// ============================================================================
// Scene Graph
// ============================================================================

export class SceneGraph {
  private nodes: Map<string, Node> = new Map();
  private rootNodeIds: string[] = [];
  private worldTransformCache: Map<string, Matrix3> = new Map();
  private listeners: Map<SceneGraphEventType, Set<EventCallback>> = new Map();

  // --------------------------------------------------------------------------
  // Node CRUD Operations
  // --------------------------------------------------------------------------

  addNode(node: Node, parentId?: string): void {
    if (this.nodes.has(node.id)) {
      throw new Error(`Node with id "${node.id}" already exists`);
    }

    this.nodes.set(node.id, node);

    if (parentId) {
      const parent = this.nodes.get(parentId);
      if (!parent) {
        throw new Error(`Parent node "${parentId}" not found`);
      }
      node.parent = parentId;
      parent.children.push(node.id);
    } else {
      node.parent = null;
      this.rootNodeIds.push(node.id);
    }

    this.invalidateWorldTransform(node.id);
    this.emit({ type: 'nodeAdded', nodeId: node.id, parentId });
  }

  removeNode(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Remove all children first (recursively)
    const children = [...node.children];
    for (const childId of children) {
      this.removeNode(childId);
    }

    // Remove from parent's children array
    if (node.parent) {
      const parent = this.nodes.get(node.parent);
      if (parent) {
        const index = parent.children.indexOf(id);
        if (index !== -1) {
          parent.children.splice(index, 1);
        }
      }
    } else {
      // Remove from root nodes
      const index = this.rootNodeIds.indexOf(id);
      if (index !== -1) {
        this.rootNodeIds.splice(index, 1);
      }
    }

    this.nodes.delete(id);
    this.worldTransformCache.delete(id);
    this.emit({ type: 'nodeRemoved', nodeId: id });
  }

  moveNode(id: string, newParentId: string | null, index?: number): void {
    const node = this.nodes.get(id);
    if (!node) return;

    // Prevent circular references: cannot move a node into its own subtree
    if (newParentId && this.isAncestorOf(id, newParentId)) {
      throw new Error(
        `Cannot move node "${id}" to descendant "${newParentId}": would create circular reference`
      );
    }

    const previousParentId = node.parent;

    // Remove from old parent
    if (node.parent) {
      const oldParent = this.nodes.get(node.parent);
      if (oldParent) {
        const oldIndex = oldParent.children.indexOf(id);
        if (oldIndex !== -1) {
          oldParent.children.splice(oldIndex, 1);
        }
      }
    } else {
      const rootIndex = this.rootNodeIds.indexOf(id);
      if (rootIndex !== -1) {
        this.rootNodeIds.splice(rootIndex, 1);
      }
    }

    // Add to new parent
    if (newParentId) {
      const newParent = this.nodes.get(newParentId);
      if (!newParent) {
        throw new Error(`Parent node "${newParentId}" not found`);
      }
      node.parent = newParentId;
      if (index !== undefined) {
        newParent.children.splice(index, 0, id);
      } else {
        newParent.children.push(id);
      }
    } else {
      node.parent = null;
      if (index !== undefined) {
        this.rootNodeIds.splice(index, 0, id);
      } else {
        this.rootNodeIds.push(id);
      }
    }

    this.invalidateWorldTransform(id);
    this.emit({
      type: 'nodeMoved',
      nodeId: id,
      parentId: newParentId ?? undefined,
      previousParentId: previousParentId ?? undefined,
    });
  }

  updateNode(id: string, updates: Partial<Node>): void {
    const node = this.nodes.get(id);
    if (!node) return;

    Object.assign(node, updates);

    if ('transform' in updates) {
      this.invalidateWorldTransform(id);
    }

    this.emit({ type: 'nodeChanged', nodeId: id });
  }

  // --------------------------------------------------------------------------
  // Query Operations
  // --------------------------------------------------------------------------

  getNode<T extends Node = Node>(id: string): T | undefined {
    return this.nodes.get(id) as T | undefined;
  }

  getNodes(): IterableIterator<Node> {
    return this.nodes.values();
  }

  getNodeCount(): number {
    return this.nodes.size;
  }

  getRootNodes(): Node[] {
    return this.rootNodeIds
      .map((id) => this.nodes.get(id))
      .filter((node): node is Node => node !== undefined);
  }

  getChildren(id: string): Node[] {
    const node = this.nodes.get(id);
    if (!node) return [];

    return node.children
      .map((childId) => this.nodes.get(childId))
      .filter((child): child is Node => child !== undefined);
  }

  getParent(id: string): Node | undefined {
    const node = this.nodes.get(id);
    if (!node || !node.parent) return undefined;
    return this.nodes.get(node.parent);
  }

  getAncestors(id: string): Node[] {
    const ancestors: Node[] = [];
    let current = this.getParent(id);

    while (current) {
      ancestors.push(current);
      current = this.getParent(current.id);
    }

    return ancestors;
  }

  getDescendants(id: string): Node[] {
    const descendants: Node[] = [];
    const node = this.nodes.get(id);
    if (!node) return descendants;

    const collectDescendants = (nodeId: string) => {
      const n = this.nodes.get(nodeId);
      if (!n) return;

      for (const childId of n.children) {
        const child = this.nodes.get(childId);
        if (child) {
          descendants.push(child);
          collectDescendants(childId);
        }
      }
    };

    collectDescendants(id);
    return descendants;
  }

  /**
   * Check if ancestorId is an ancestor of nodeId (or is the node itself).
   * Used to prevent circular references when moving nodes.
   */
  private isAncestorOf(ancestorId: string, nodeId: string): boolean {
    let currentId: string | null = nodeId;
    while (currentId) {
      if (currentId === ancestorId) return true;
      const current = this.nodes.get(currentId);
      if (!current) break;
      currentId = current.parent;
    }
    return false;
  }

  // --------------------------------------------------------------------------
  // Transform Operations
  // --------------------------------------------------------------------------

  getWorldTransform(id: string): Matrix3 {
    const cached = this.worldTransformCache.get(id);
    if (cached) return cached;

    const node = this.nodes.get(id);
    if (!node) return mat3.identity();

    const localMatrix = this.computeLocalMatrix(node.transform);

    let worldMatrix: Matrix3;
    if (node.parent) {
      const parentWorld = this.getWorldTransform(node.parent);
      worldMatrix = mat3.multiply(parentWorld, localMatrix);
    } else {
      worldMatrix = localMatrix;
    }

    this.worldTransformCache.set(id, worldMatrix);
    return worldMatrix;
  }

  getWorldPosition(id: string): Vector2 {
    const matrix = this.getWorldTransform(id);
    return { x: matrix.tx, y: matrix.ty };
  }

  /**
   * Get the effective opacity for a node, multiplying through the parent chain.
   * A child inside a group at 50% opacity with its own 80% opacity → 40% effective.
   */
  getEffectiveOpacity(id: string): number {
    const node = this.nodes.get(id);
    if (!node) return 1;
    let opacity = node.opacity;
    let parentId = node.parent;
    while (parentId) {
      const parent = this.nodes.get(parentId);
      if (!parent) break;
      opacity *= parent.opacity;
      parentId = parent.parent;
    }
    return opacity;
  }

  private computeLocalMatrix(transform: Transform): Matrix3 {
    return mat3.compose(transform.position, transform.rotation, transform.scale, transform.anchor);
  }

  private invalidateWorldTransform(id: string): void {
    this.worldTransformCache.delete(id);

    const node = this.nodes.get(id);
    if (node) {
      for (const childId of node.children) {
        this.invalidateWorldTransform(childId);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Traversal
  // --------------------------------------------------------------------------

  traverse(callback: (node: Node, depth: number) => boolean | void): void {
    const visit = (nodeId: string, depth: number): boolean => {
      const node = this.nodes.get(nodeId);
      if (!node) return true;

      const result = callback(node, depth);
      if (result === false) return false;

      for (const childId of node.children) {
        if (!visit(childId, depth + 1)) return false;
      }

      return true;
    };

    for (const rootId of this.rootNodeIds) {
      if (!visit(rootId, 0)) break;
    }
  }

  traverseVisible(callback: (node: Node) => void): void {
    this.traverse((node) => {
      if (node.visible) {
        callback(node);
      }
      return node.visible; // Don't traverse invisible subtrees
    });
  }

  // --------------------------------------------------------------------------
  // Serialization
  // --------------------------------------------------------------------------

  toJSON(): { nodes: Node[]; rootNodeIds: string[] } {
    return {
      nodes: Array.from(this.nodes.values()),
      rootNodeIds: [...this.rootNodeIds],
    };
  }

  fromJSON(data: { nodes: Node[]; rootNodeIds: string[] }): void {
    this.nodes.clear();
    this.rootNodeIds = [];
    this.worldTransformCache.clear();

    // Validate that nodes is an array
    if (!Array.isArray(data.nodes)) {
      console.warn('SceneGraph.fromJSON: data.nodes is not an array, using empty node list');
      data.nodes = [];
    }

    // Validate that rootNodeIds is an array
    if (!Array.isArray(data.rootNodeIds)) {
      console.warn('SceneGraph.fromJSON: data.rootNodeIds is not an array, using empty root list');
      data.rootNodeIds = [];
    }

    for (const node of data.nodes) {
      // Skip nodes without a valid id
      if (!node || typeof node.id !== 'string' || node.id.length === 0) {
        console.warn('SceneGraph.fromJSON: skipping node with missing or invalid id', node);
        continue;
      }
      // Migrate old fill/stroke singular fields to fills/strokes arrays
      this.migrateNodeFillsStrokes(node);
      this.nodes.set(node.id, node);
    }

    this.rootNodeIds = data.rootNodeIds;
  }

  /**
   * Migrate legacy fill/stroke singular fields to fills/strokes arrays.
   * Also ensures all fills/strokes have the `visible` property.
   */
  private migrateNodeFillsStrokes(node: Node): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = node as any;

    // Skip nodes that don't have fill/stroke (e.g. GroupNode, ImageNode)
    if (!('fills' in raw) && !('fill' in raw)) return;

    // Migrate singular fill → fills array
    if ('fill' in raw && !('fills' in raw)) {
      raw.fills = raw.fill ? [{ ...raw.fill, visible: raw.fill.visible ?? true }] : [];
      delete raw.fill;
    }

    // Migrate singular stroke → strokes array
    if ('stroke' in raw && !('strokes' in raw)) {
      raw.strokes = raw.stroke ? [{ ...raw.stroke, visible: raw.stroke.visible ?? true }] : [];
      delete raw.stroke;
    }

    // Ensure all fills have visible property
    if (Array.isArray(raw.fills)) {
      for (const fill of raw.fills as Fill[]) {
        if (fill.visible === undefined) {
          fill.visible = true;
        }
      }
    }

    // Ensure all strokes have visible and align properties
    if (Array.isArray(raw.strokes)) {
      for (const stroke of raw.strokes as Stroke[]) {
        if (stroke.visible === undefined) {
          stroke.visible = true;
        }
        if (stroke.align === undefined) {
          stroke.align = 'center';
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  on(type: SceneGraphEventType, callback: EventCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(callback);

    return () => {
      const set = this.listeners.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.listeners.delete(type);
        }
      }
    };
  }

  private emit(event: SceneGraphEvent): void {
    const callbacks = this.listeners.get(event.type);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(event);
      }
    }
  }
}

// Default export
export const sceneGraph = new SceneGraph();
