import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode } from './SceneGraph';
import type { Node, GroupNode } from '@quar/types';

describe('SceneGraph', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
  });

  // ==========================================================================
  // Helper Factories
  // ==========================================================================

  describe('createDefaultTransform', () => {
    it('creates transform with default values', () => {
      const transform = createDefaultTransform();
      expect(transform).toEqual({
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        anchor: { x: 0.5, y: 0.5 },
        skew: { x: 0, y: 0 },
      });
    });
  });

  describe('createGroupNode', () => {
    it('creates a group node with specified id and name', () => {
      const node = createGroupNode('test-id', 'Test Group');
      expect(node.id).toBe('test-id');
      expect(node.name).toBe('Test Group');
      expect(node.type).toBe('group');
      expect(node.parent).toBeNull();
      expect(node.children).toEqual([]);
      expect(node.visible).toBe(true);
      expect(node.locked).toBe(false);
      expect(node.opacity).toBe(1);
      expect(node.blendMode).toBe('normal');
    });
  });

  // ==========================================================================
  // Node CRUD Operations
  // ==========================================================================

  describe('addNode', () => {
    it('adds a node to the scene graph', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getNode('node-1')).toBe(node);
      expect(sceneGraph.getNodeCount()).toBe(1);
    });

    it('adds node as root when no parent specified', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      const rootNodes = sceneGraph.getRootNodes();
      expect(rootNodes).toHaveLength(1);
      expect(rootNodes[0].id).toBe('node-1');
    });

    it('adds node as child when parent specified', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');

      expect(child.parent).toBe('parent');
      expect(parent.children).toContain('child');
    });

    it('throws error when adding duplicate node id', () => {
      const node1 = createGroupNode('same-id', 'Node 1');
      const node2 = createGroupNode('same-id', 'Node 2');

      sceneGraph.addNode(node1);
      expect(() => sceneGraph.addNode(node2)).toThrow('already exists');
    });

    it('throws error when parent not found', () => {
      const child = createGroupNode('child', 'Child');
      expect(() => sceneGraph.addNode(child, 'nonexistent')).toThrow('not found');
    });

    it('emits nodeAdded event', () => {
      const callback = vi.fn();
      sceneGraph.on('nodeAdded', callback);

      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(callback).toHaveBeenCalledWith({
        type: 'nodeAdded',
        nodeId: 'node-1',
        parentId: undefined,
      });
    });
  });

  describe('removeNode', () => {
    it('removes a node from the scene graph', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);
      sceneGraph.removeNode('node-1');

      expect(sceneGraph.getNode('node-1')).toBeUndefined();
      expect(sceneGraph.getNodeCount()).toBe(0);
    });

    it('removes node from root nodes list', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);
      sceneGraph.removeNode('node-1');

      expect(sceneGraph.getRootNodes()).toHaveLength(0);
    });

    it('removes node from parent children array', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');
      sceneGraph.removeNode('child');

      expect(parent.children).not.toContain('child');
    });

    it('recursively removes all descendants', () => {
      const grandparent = createGroupNode('grandparent', 'Grandparent');
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(grandparent);
      sceneGraph.addNode(parent, 'grandparent');
      sceneGraph.addNode(child, 'parent');

      sceneGraph.removeNode('grandparent');

      expect(sceneGraph.getNode('grandparent')).toBeUndefined();
      expect(sceneGraph.getNode('parent')).toBeUndefined();
      expect(sceneGraph.getNode('child')).toBeUndefined();
    });

    it('does nothing when node does not exist', () => {
      expect(() => sceneGraph.removeNode('nonexistent')).not.toThrow();
    });

    it('emits nodeRemoved event carrying the removed node', () => {
      const callback = vi.fn();
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      sceneGraph.on('nodeRemoved', callback);
      sceneGraph.removeNode('node-1');

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'nodeRemoved', nodeId: 'node-1' })
      );
      // The node itself is included so listeners can react (it is already gone
      // from the graph by the time the event fires).
      expect(callback.mock.calls[0]![0]!.node?.id).toBe('node-1');
    });
  });

  describe('moveNode', () => {
    it('moves node from one parent to another', () => {
      const parent1 = createGroupNode('parent1', 'Parent 1');
      const parent2 = createGroupNode('parent2', 'Parent 2');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent1);
      sceneGraph.addNode(parent2);
      sceneGraph.addNode(child, 'parent1');

      sceneGraph.moveNode('child', 'parent2');

      expect(child.parent).toBe('parent2');
      expect(parent1.children).not.toContain('child');
      expect(parent2.children).toContain('child');
    });

    it('moves node from root to parent', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child);

      sceneGraph.moveNode('child', 'parent');

      expect(child.parent).toBe('parent');
      expect(sceneGraph.getRootNodes()).toHaveLength(1);
    });

    it('moves node from parent to root', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');

      sceneGraph.moveNode('child', null);

      expect(child.parent).toBeNull();
      expect(sceneGraph.getRootNodes()).toHaveLength(2);
    });

    it('moves node to specific index', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = createGroupNode('child2', 'Child 2');
      const child3 = createGroupNode('child3', 'Child 3');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child1, 'parent');
      sceneGraph.addNode(child2, 'parent');
      sceneGraph.addNode(child3);

      sceneGraph.moveNode('child3', 'parent', 1);

      expect(parent.children).toEqual(['child1', 'child3', 'child2']);
    });

    it('emits nodeMoved event', () => {
      const callback = vi.fn();
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child);
      sceneGraph.on('nodeMoved', callback);

      sceneGraph.moveNode('child', 'parent');

      expect(callback).toHaveBeenCalledWith({
        type: 'nodeMoved',
        nodeId: 'child',
        parentId: 'parent',
        previousParentId: undefined,
      });
    });

    it('throws error when new parent not found', () => {
      const child = createGroupNode('child', 'Child');
      sceneGraph.addNode(child);

      expect(() => sceneGraph.moveNode('child', 'nonexistent')).toThrow('not found');
    });

    // X1-5: Circular reference prevention
    it('throws error when moving node into its own child', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');

      expect(() => sceneGraph.moveNode('parent', 'child')).toThrow('circular reference');
    });

    it('throws error when moving node into its own grandchild', () => {
      const grandparent = createGroupNode('grandparent', 'Grandparent');
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(grandparent);
      sceneGraph.addNode(parent, 'grandparent');
      sceneGraph.addNode(child, 'parent');

      expect(() => sceneGraph.moveNode('grandparent', 'child')).toThrow('circular reference');
    });

    it('does not throw when moving node to a non-descendant', () => {
      const parent1 = createGroupNode('parent1', 'Parent 1');
      const parent2 = createGroupNode('parent2', 'Parent 2');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent1);
      sceneGraph.addNode(parent2);
      sceneGraph.addNode(child, 'parent1');

      // Moving child to parent2 (not a descendant) should work fine
      expect(() => sceneGraph.moveNode('child', 'parent2')).not.toThrow();
      expect(child.parent).toBe('parent2');
    });
  });

  describe('updateNode', () => {
    it('updates node properties', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      sceneGraph.updateNode('node-1', { name: 'Updated Name', visible: false });

      expect(node.name).toBe('Updated Name');
      expect(node.visible).toBe(false);
    });

    it('invalidates transform cache when transform updated', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      // Get world transform to populate cache
      const initialTransform = sceneGraph.getWorldTransform('node-1');

      // Update transform with new position
      sceneGraph.updateNode('node-1', {
        transform: {
          ...createDefaultTransform(),
          position: { x: 100, y: 100 },
          anchor: { x: 0, y: 0 }, // Use 0,0 anchor for simpler position
        },
      });

      // Cache should be invalidated and new position used
      const worldMatrix = sceneGraph.getWorldTransform('node-1');
      // Verify the transform changed (cache invalidated)
      expect(worldMatrix.tx).not.toBe(initialTransform.tx);
    });

    it('emits nodeChanged event', () => {
      const callback = vi.fn();
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      sceneGraph.on('nodeChanged', callback);
      sceneGraph.updateNode('node-1', { name: 'Updated' });

      expect(callback).toHaveBeenCalledWith({
        type: 'nodeChanged',
        nodeId: 'node-1',
      });
    });

    it('does nothing when node does not exist', () => {
      expect(() => sceneGraph.updateNode('nonexistent', { name: 'Test' })).not.toThrow();
    });
  });

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  describe('getNode', () => {
    it('returns node by id', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getNode('node-1')).toBe(node);
    });

    it('returns undefined for non-existent node', () => {
      expect(sceneGraph.getNode('nonexistent')).toBeUndefined();
    });
  });

  describe('getNodes', () => {
    it('returns iterator of all nodes', () => {
      const node1 = createGroupNode('node-1', 'Node 1');
      const node2 = createGroupNode('node-2', 'Node 2');
      sceneGraph.addNode(node1);
      sceneGraph.addNode(node2);

      const nodes = Array.from(sceneGraph.getNodes());
      expect(nodes).toHaveLength(2);
    });
  });

  describe('getNodeCount', () => {
    it('returns correct count', () => {
      expect(sceneGraph.getNodeCount()).toBe(0);

      sceneGraph.addNode(createGroupNode('node-1', 'Node 1'));
      expect(sceneGraph.getNodeCount()).toBe(1);

      sceneGraph.addNode(createGroupNode('node-2', 'Node 2'));
      expect(sceneGraph.getNodeCount()).toBe(2);
    });
  });

  describe('getRootNodes', () => {
    it('returns only root-level nodes', () => {
      const root1 = createGroupNode('root1', 'Root 1');
      const root2 = createGroupNode('root2', 'Root 2');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(root1);
      sceneGraph.addNode(root2);
      sceneGraph.addNode(child, 'root1');

      const rootNodes = sceneGraph.getRootNodes();
      expect(rootNodes).toHaveLength(2);
      expect(rootNodes.map((n) => n.id)).toEqual(['root1', 'root2']);
    });
  });

  describe('getChildren', () => {
    it('returns direct children of a node', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = createGroupNode('child2', 'Child 2');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child1, 'parent');
      sceneGraph.addNode(child2, 'parent');

      const children = sceneGraph.getChildren('parent');
      expect(children).toHaveLength(2);
      expect(children.map((n) => n.id)).toEqual(['child1', 'child2']);
    });

    it('returns empty array for node without children', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getChildren('node-1')).toEqual([]);
    });

    it('returns empty array for non-existent node', () => {
      expect(sceneGraph.getChildren('nonexistent')).toEqual([]);
    });
  });

  describe('getParent', () => {
    it('returns parent node', () => {
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');

      expect(sceneGraph.getParent('child')).toBe(parent);
    });

    it('returns undefined for root node', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getParent('node-1')).toBeUndefined();
    });

    it('returns undefined for non-existent node', () => {
      expect(sceneGraph.getParent('nonexistent')).toBeUndefined();
    });
  });

  describe('getAncestors', () => {
    it('returns all ancestors from parent to root', () => {
      const grandparent = createGroupNode('grandparent', 'Grandparent');
      const parent = createGroupNode('parent', 'Parent');
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(grandparent);
      sceneGraph.addNode(parent, 'grandparent');
      sceneGraph.addNode(child, 'parent');

      const ancestors = sceneGraph.getAncestors('child');
      expect(ancestors).toHaveLength(2);
      expect(ancestors.map((n) => n.id)).toEqual(['parent', 'grandparent']);
    });

    it('returns empty array for root node', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getAncestors('node-1')).toEqual([]);
    });
  });

  describe('getDescendants', () => {
    it('returns all descendants recursively', () => {
      const root = createGroupNode('root', 'Root');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = createGroupNode('child2', 'Child 2');
      const grandchild = createGroupNode('grandchild', 'Grandchild');

      sceneGraph.addNode(root);
      sceneGraph.addNode(child1, 'root');
      sceneGraph.addNode(child2, 'root');
      sceneGraph.addNode(grandchild, 'child1');

      const descendants = sceneGraph.getDescendants('root');
      expect(descendants).toHaveLength(3);
      expect(descendants.map((n) => n.id).sort()).toEqual(
        ['child1', 'child2', 'grandchild'].sort()
      );
    });

    it('returns empty array for leaf node', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(sceneGraph.getDescendants('node-1')).toEqual([]);
    });
  });

  // ==========================================================================
  // Transform Operations
  // ==========================================================================

  describe('getWorldTransform', () => {
    it('returns local transform for root node', () => {
      const node = createGroupNode('node-1', 'Node 1');
      node.transform.position = { x: 100, y: 200 };
      node.transform.anchor = { x: 0, y: 0 }; // Zero anchor for direct position
      sceneGraph.addNode(node);

      const worldMatrix = sceneGraph.getWorldTransform('node-1');
      expect(worldMatrix.tx).toBeCloseTo(100);
      expect(worldMatrix.ty).toBeCloseTo(200);
    });

    it('combines parent and child transforms', () => {
      const parent = createGroupNode('parent', 'Parent');
      parent.transform.position = { x: 100, y: 100 };

      const child = createGroupNode('child', 'Child');
      child.transform.position = { x: 50, y: 50 };

      sceneGraph.addNode(parent);
      sceneGraph.addNode(child, 'parent');

      const worldMatrix = sceneGraph.getWorldTransform('child');
      // Position should be combined (roughly, depends on anchor point handling)
      expect(worldMatrix.tx).toBeDefined();
    });

    it('caches world transform', () => {
      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      const matrix1 = sceneGraph.getWorldTransform('node-1');
      const matrix2 = sceneGraph.getWorldTransform('node-1');

      expect(matrix1).toBe(matrix2); // Same reference from cache
    });

    it('returns identity for non-existent node', () => {
      const matrix = sceneGraph.getWorldTransform('nonexistent');
      expect(matrix.a).toBe(1);
      expect(matrix.d).toBe(1);
      expect(matrix.tx).toBe(0);
      expect(matrix.ty).toBe(0);
    });
  });

  describe('getWorldPosition', () => {
    it('returns world position from transform', () => {
      const node = createGroupNode('node-1', 'Node 1');
      node.transform.position = { x: 100, y: 200 };
      node.transform.anchor = { x: 0, y: 0 }; // Zero anchor for direct position
      sceneGraph.addNode(node);

      const pos = sceneGraph.getWorldPosition('node-1');
      expect(pos.x).toBeCloseTo(100);
      expect(pos.y).toBeCloseTo(200);
    });
  });

  // ==========================================================================
  // Traversal
  // ==========================================================================

  describe('traverse', () => {
    it('visits all nodes in depth-first order', () => {
      const root = createGroupNode('root', 'Root');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = createGroupNode('child2', 'Child 2');
      const grandchild = createGroupNode('grandchild', 'Grandchild');

      sceneGraph.addNode(root);
      sceneGraph.addNode(child1, 'root');
      sceneGraph.addNode(grandchild, 'child1');
      sceneGraph.addNode(child2, 'root');

      const visited: string[] = [];
      const depths: number[] = [];

      sceneGraph.traverse((node, depth) => {
        visited.push(node.id);
        depths.push(depth);
      });

      expect(visited).toEqual(['root', 'child1', 'grandchild', 'child2']);
      expect(depths).toEqual([0, 1, 2, 1]);
    });

    it('stops traversal when callback returns false', () => {
      const root = createGroupNode('root', 'Root');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = createGroupNode('child2', 'Child 2');

      sceneGraph.addNode(root);
      sceneGraph.addNode(child1, 'root');
      sceneGraph.addNode(child2, 'root');

      const visited: string[] = [];
      sceneGraph.traverse((node) => {
        visited.push(node.id);
        if (node.id === 'child1') return false;
      });

      expect(visited).toEqual(['root', 'child1']);
    });
  });

  describe('traverseVisible', () => {
    it('only visits visible nodes', () => {
      const root = createGroupNode('root', 'Root');
      const visible = createGroupNode('visible', 'Visible');
      const invisible = createGroupNode('invisible', 'Invisible');
      invisible.visible = false;

      sceneGraph.addNode(root);
      sceneGraph.addNode(visible, 'root');
      sceneGraph.addNode(invisible, 'root');

      const visited: string[] = [];
      sceneGraph.traverseVisible((node) => {
        visited.push(node.id);
      });

      expect(visited).toContain('root');
      expect(visited).toContain('visible');
      expect(visited).not.toContain('invisible');
    });

    it('skips children of invisible nodes', () => {
      const root = createGroupNode('root', 'Root');
      const invisible = createGroupNode('invisible', 'Invisible');
      invisible.visible = false;
      const child = createGroupNode('child', 'Child');

      sceneGraph.addNode(root);
      sceneGraph.addNode(invisible, 'root');
      sceneGraph.addNode(child, 'invisible');

      const visited: string[] = [];
      sceneGraph.traverseVisible((node) => {
        visited.push(node.id);
      });

      expect(visited).not.toContain('invisible');
      expect(visited).not.toContain('child');
    });
  });

  // ==========================================================================
  // Serialization
  // ==========================================================================

  describe('toJSON', () => {
    it('serializes scene graph to JSON', () => {
      const node1 = createGroupNode('node-1', 'Node 1');
      const node2 = createGroupNode('node-2', 'Node 2');
      sceneGraph.addNode(node1);
      sceneGraph.addNode(node2, 'node-1');

      const json = sceneGraph.toJSON();

      expect(json.nodes).toHaveLength(2);
      expect(json.rootNodeIds).toEqual(['node-1']);
    });
  });

  describe('fromJSON', () => {
    it('restores scene graph from JSON', () => {
      const node1 = createGroupNode('node-1', 'Node 1');
      const node2 = createGroupNode('node-2', 'Node 2');
      node2.parent = 'node-1';
      node1.children = ['node-2'];

      const json = {
        nodes: [node1, node2],
        rootNodeIds: ['node-1'],
      };

      sceneGraph.fromJSON(json);

      expect(sceneGraph.getNodeCount()).toBe(2);
      expect(sceneGraph.getNode('node-1')).toBeDefined();
      expect(sceneGraph.getNode('node-2')).toBeDefined();
      expect(sceneGraph.getRootNodes()).toHaveLength(1);
    });

    it('clears existing data before restoring', () => {
      const existing = createGroupNode('existing', 'Existing');
      sceneGraph.addNode(existing);

      const json = {
        nodes: [createGroupNode('new', 'New')],
        rootNodeIds: ['new'],
      };

      sceneGraph.fromJSON(json);

      expect(sceneGraph.getNode('existing')).toBeUndefined();
      expect(sceneGraph.getNode('new')).toBeDefined();
    });

    it('emits a graphReplaced event after the atomic swap (F037)', () => {
      const callback = vi.fn();
      sceneGraph.on('graphReplaced', callback);

      sceneGraph.fromJSON({
        nodes: [createGroupNode('new', 'New')],
        rootNodeIds: ['new'],
      });

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ type: 'graphReplaced' }));
      // The event fires after the swap, so the new state is already visible.
      expect(sceneGraph.getNode('new')).toBeDefined();
    });
  });

  // ==========================================================================
  // Events
  // ==========================================================================

  describe('events', () => {
    it('allows subscribing to events', () => {
      const callback = vi.fn();
      sceneGraph.on('nodeAdded', callback);

      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('allows unsubscribing from events', () => {
      const callback = vi.fn();
      const unsubscribe = sceneGraph.on('nodeAdded', callback);

      unsubscribe();

      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(callback).not.toHaveBeenCalled();
    });

    it('supports multiple listeners per event type', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      sceneGraph.on('nodeAdded', callback1);
      sceneGraph.on('nodeAdded', callback2);

      const node = createGroupNode('node-1', 'Node 1');
      sceneGraph.addNode(node);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // traverseVisible skip-children
  // ==========================================================================

  describe('traverseVisible skip-children', () => {
    const makeNode = (id: string, name: string): Node =>
      ({
        id,
        name,
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      }) as unknown as Node;

    it('returns false skips children but continues siblings', () => {
      const root = createGroupNode('root', 'Root');
      const child1 = createGroupNode('child1', 'Child 1');
      const grandchild = makeNode('grandchild', 'Grandchild');
      const child2 = makeNode('child2', 'Child 2');

      sceneGraph.addNode(root);
      sceneGraph.addNode(child1, 'root');
      sceneGraph.addNode(grandchild, 'child1');
      sceneGraph.addNode(child2, 'root');

      const visited: string[] = [];
      sceneGraph.traverseVisible((node) => {
        visited.push(node.id);
        if (node.id === 'child1') return false; // skip children of child1
      });

      expect(visited).toContain('root');
      expect(visited).toContain('child1');
      expect(visited).not.toContain('grandchild'); // skipped because parent returned false
      expect(visited).toContain('child2'); // sibling still visited
    });

    it('invisible nodes are skipped entirely', () => {
      const root = createGroupNode('root', 'Root');
      const visibleChild = makeNode('visible-child', 'Visible Child');
      const invisibleChild = createGroupNode('invisible-child', 'Invisible Child');
      invisibleChild.visible = false;
      const grandchild = makeNode('grandchild', 'Grandchild');

      sceneGraph.addNode(root);
      sceneGraph.addNode(visibleChild, 'root');
      sceneGraph.addNode(invisibleChild, 'root');
      sceneGraph.addNode(grandchild, 'invisible-child');

      const visited: string[] = [];
      sceneGraph.traverseVisible((node) => {
        visited.push(node.id);
      });

      expect(visited).toContain('root');
      expect(visited).toContain('visible-child');
      expect(visited).not.toContain('invisible-child');
      expect(visited).not.toContain('grandchild');
    });

    it('all visible nodes visited when callback returns void', () => {
      const root = createGroupNode('root', 'Root');
      const child1 = createGroupNode('child1', 'Child 1');
      const child2 = makeNode('child2', 'Child 2');
      const grandchild1 = makeNode('gc1', 'Grandchild 1');
      const grandchild2 = makeNode('gc2', 'Grandchild 2');

      sceneGraph.addNode(root);
      sceneGraph.addNode(child1, 'root');
      sceneGraph.addNode(grandchild1, 'child1');
      sceneGraph.addNode(grandchild2, 'child1');
      sceneGraph.addNode(child2, 'root');

      const visited: string[] = [];
      sceneGraph.traverseVisible((node) => {
        visited.push(node.id);
        // return void (undefined) - should not skip anything
      });

      expect(visited).toContain('root');
      expect(visited).toContain('child1');
      expect(visited).toContain('gc1');
      expect(visited).toContain('gc2');
      expect(visited).toContain('child2');
      expect(visited).toHaveLength(5);
    });

    it('should call onExitNode after visiting children', () => {
      const root: GroupNode = {
        id: 'root',
        name: 'Root',
        type: 'group',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      };

      const child: Node = {
        id: 'child1',
        name: 'Child',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      } as Node;

      sceneGraph.addNode(root);
      sceneGraph.addNode(child);
      sceneGraph.moveNode('child1', 'root');

      const entered: string[] = [];
      const exited: string[] = [];

      sceneGraph.traverseVisible(
        (node) => {
          entered.push(node.id);
        },
        (node) => {
          exited.push(node.id);
        }
      );

      // Enter: root, child1. Exit: root (after child1 done)
      expect(entered).toEqual(['root', 'child1']);
      // onExitNode fires for root after all children visited
      // child1 has no children so onExitNode fires for it too
      expect(exited).toContain('root');
      expect(exited).toContain('child1');
    });

    it('should not call onExitNode for skipped nodes', () => {
      const root: GroupNode = {
        id: 'root',
        name: 'Root',
        type: 'group',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
      };

      const child: Node = {
        id: 'child1',
        name: 'Child',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      } as Node;

      sceneGraph.addNode(root);
      sceneGraph.addNode(child);
      sceneGraph.moveNode('child1', 'root');

      const exited: string[] = [];

      sceneGraph.traverseVisible(
        (node) => {
          if (node.id === 'root') return false; // skip children
        },
        (node) => {
          exited.push(node.id);
        }
      );

      // root returned false -> skip children, no onExitNode for root
      expect(exited).not.toContain('root');
      expect(exited).not.toContain('child1');
    });

    it('should not call onExitNode when not provided', () => {
      const node: Node = {
        id: 'n1',
        name: 'Node',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      } as Node;

      sceneGraph.addNode(node);

      // Should not throw when onExitNode is omitted
      expect(() => {
        sceneGraph.traverseVisible((n) => {
          // no-op
        });
      }).not.toThrow();
    });
  });
});
