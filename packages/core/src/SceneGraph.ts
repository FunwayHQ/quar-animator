/**
 * Scene Graph for Quar Animator
 * Manages the hierarchical structure of nodes in the document
 */

import type {
  Node,
  GroupNode,
  Transform,
  Vector2,
  Matrix3,
} from '@quar/types';
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

  private computeLocalMatrix(transform: Transform): Matrix3 {
    return mat3.compose(
      transform.position,
      transform.rotation,
      transform.scale,
      transform.anchor
    );
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

    for (const node of data.nodes) {
      this.nodes.set(node.id, node);
    }

    this.rootNodeIds = data.rootNodeIds;
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
      this.listeners.get(type)?.delete(callback);
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
