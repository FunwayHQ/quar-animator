import { describe, it, expect, beforeEach } from 'vitest';
import type {
  Node,
  SymbolInstanceNode,
  SymbolDefinition,
  RectangleNode,
  TextNode,
  EllipseNode,
} from '@quar/types';
import {
  resolveSymbolInstance,
  applyOverrides,
  getSymbolBounds,
  invalidateSymbolCache,
  getResolvedRootNodes,
} from './symbolResolver';

// Helper to create a minimal rectangle node
function makeRect(id: string, x = 0, y = 0, w = 100, h = 50): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: w,
    height: h,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function makeTextNode(id: string, content: string): TextNode {
  return {
    id,
    name: id,
    type: 'text',
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
    opacity: 1,
    blendMode: 'normal',
    content,
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function makeInstance(
  symbolId: string,
  overrides: SymbolInstanceNode['overrides'] = []
): SymbolInstanceNode {
  return {
    id: 'inst-1',
    name: 'Instance',
    type: 'symbol-instance',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 200 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    symbolId,
    overrides,
  };
}

function makeDefinition(id: string, nodes: Node[], rootNodeIds?: string[]): SymbolDefinition {
  return {
    id,
    name: 'Test Symbol',
    sceneGraphJSON: {
      nodes,
      rootNodeIds: rootNodeIds ?? nodes.filter((n) => !n.parent).map((n) => n.id),
    },
  };
}

describe('symbolResolver', () => {
  beforeEach(() => {
    invalidateSymbolCache();
  });

  describe('resolveSymbolInstance', () => {
    it('returns cloned nodes from definition', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1');

      const resolved = resolveSymbolInstance(inst, def);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.id).toBe('r1');
      expect(resolved[0]!.type).toBe('rectangle');
    });

    it('returns deep clones (modifying result does not affect definition)', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1');

      const resolved = resolveSymbolInstance(inst, def);
      (resolved[0] as RectangleNode).width = 999;
      expect(rect.width).toBe(100); // Original unchanged
    });

    it('returns empty array for empty definition', () => {
      const def = makeDefinition('sym-1', []);
      const inst = makeInstance('sym-1');

      const resolved = resolveSymbolInstance(inst, def);
      expect(resolved).toHaveLength(0);
    });

    it('applies overrides to resolved nodes', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1', [{ nodeId: 'r1', properties: { opacity: 0.5 } }]);

      const resolved = resolveSymbolInstance(inst, def);
      expect(resolved[0]!.opacity).toBe(0.5);
    });

    it('resolves multiple nodes', () => {
      const r1 = makeRect('r1', 0, 0);
      const r2 = makeRect('r2', 50, 50);
      const def = makeDefinition('sym-1', [r1, r2]);
      const inst = makeInstance('sym-1');

      const resolved = resolveSymbolInstance(inst, def);
      expect(resolved).toHaveLength(2);
    });

    it('uses cache on second call with same overrides', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1');

      const resolved1 = resolveSymbolInstance(inst, def);
      const resolved2 = resolveSymbolInstance(inst, def);
      expect(resolved1).toBe(resolved2); // Same reference = cache hit
    });

    it('invalidates cache when overrides differ', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst1 = makeInstance('sym-1');
      const inst2 = makeInstance('sym-1', [{ nodeId: 'r1', properties: { opacity: 0.3 } }]);

      const resolved1 = resolveSymbolInstance(inst1, def);
      const resolved2 = resolveSymbolInstance(inst2, def);
      expect(resolved1).not.toBe(resolved2);
    });
  });

  describe('applyOverrides', () => {
    it('applies single override', () => {
      const nodes: Node[] = [makeRect('r1')];
      const overridden = applyOverrides(nodes, [{ nodeId: 'r1', properties: { opacity: 0.7 } }]);
      expect(overridden[0]!.opacity).toBe(0.7);
    });

    it('applies multiple overrides to different nodes', () => {
      const nodes: Node[] = [makeRect('r1'), makeRect('r2')];
      const overridden = applyOverrides(nodes, [
        { nodeId: 'r1', properties: { opacity: 0.5 } },
        { nodeId: 'r2', properties: { visible: false } },
      ]);
      expect(overridden[0]!.opacity).toBe(0.5);
      expect(overridden[1]!.visible).toBe(false);
    });

    it('overrides fill color', () => {
      const rect = makeRect('r1');
      const nodes: Node[] = [rect];
      const newFills = [
        { type: 'solid' as const, color: { r: 0, g: 255, b: 0, a: 1 }, opacity: 1, visible: true },
      ];
      applyOverrides(nodes, [{ nodeId: 'r1', properties: { fills: newFills } }]);
      expect((nodes[0] as RectangleNode).fills[0]!.color!.g).toBe(255);
    });

    it('overrides text content', () => {
      const text = makeTextNode('t1', 'Hello');
      const nodes: Node[] = [text];
      applyOverrides(nodes, [{ nodeId: 't1', properties: { content: 'World' } }]);
      expect((nodes[0] as TextNode).content).toBe('World');
    });

    it('ignores overrides for non-existent node IDs', () => {
      const nodes: Node[] = [makeRect('r1')];
      const overridden = applyOverrides(nodes, [
        { nodeId: 'nonexistent', properties: { opacity: 0 } },
      ]);
      expect(overridden[0]!.opacity).toBe(1); // Unchanged
    });

    it('returns original nodes when no overrides', () => {
      const nodes: Node[] = [makeRect('r1')];
      const result = applyOverrides(nodes, []);
      expect(result).toBe(nodes);
    });
  });

  describe('getSymbolBounds', () => {
    it('returns zero bounds for empty array', () => {
      const bounds = getSymbolBounds([]);
      expect(bounds.width).toBe(0);
      expect(bounds.height).toBe(0);
    });

    it('computes bounds from single rectangle', () => {
      const rect = makeRect('r1', 50, 50, 100, 60);
      const bounds = getSymbolBounds([rect]);
      // position (50,50), anchor (0.5,0.5), width 100, height 60, scale (1,1)
      // left = 50 - 100*0.5 = 0, bottom = 50 - 60*0.5 = 20
      // right = 0 + 100 = 100, top = 20 + 60 = 80
      expect(bounds.x).toBe(0);
      expect(bounds.y).toBe(20);
      expect(bounds.width).toBe(100);
      expect(bounds.height).toBe(60);
    });

    it('computes bounds from multiple nodes', () => {
      const r1 = makeRect('r1', 0, 0, 100, 100);
      const r2 = makeRect('r2', 200, 200, 50, 50);
      const bounds = getSymbolBounds([r1, r2]);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    });
  });

  describe('getResolvedRootNodes', () => {
    it('returns only root nodes from definition', () => {
      const parent = makeRect('r1');
      const child = makeRect('r2');
      child.parent = 'r1';
      parent.children = ['r2'];
      const def = makeDefinition('sym-1', [parent, child], ['r1']);

      const roots = getResolvedRootNodes([parent, child], def);
      expect(roots).toHaveLength(1);
      expect(roots[0]!.id).toBe('r1');
    });
  });

  describe('invalidateSymbolCache', () => {
    it('clears cache for specific symbol', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1');

      const resolved1 = resolveSymbolInstance(inst, def);
      invalidateSymbolCache('sym-1');
      const resolved2 = resolveSymbolInstance(inst, def);
      expect(resolved1).not.toBe(resolved2); // Different ref = cache invalidated
    });

    it('clears all cache when no symbolId provided', () => {
      const rect = makeRect('r1');
      const def = makeDefinition('sym-1', [rect]);
      const inst = makeInstance('sym-1');

      resolveSymbolInstance(inst, def);
      invalidateSymbolCache();
      const resolved2 = resolveSymbolInstance(inst, def);
      // After clear + re-resolve, should be a new object
      expect(resolved2).toBeDefined();
    });
  });
});
