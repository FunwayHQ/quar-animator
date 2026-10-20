import { describe, it, expect, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { Node } from '@quar/types';
import { bindLayersToBones, bindableLayers } from './bindToBones';

const transform = () => ({
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0, y: 0 },
  skew: { x: 0, y: 0 },
});

const base = (id: string, type: string): Node =>
  ({
    id,
    name: id,
    type,
    parent: null,
    children: [],
    transform: transform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  }) as unknown as Node;

const rect = (id: string) =>
  ({ ...base(id, 'rectangle'), width: 100, height: 40, cornerRadius: 0 }) as unknown as Node;
const bone = (id: string) =>
  ({
    ...base(id, 'bone'),
    length: 50,
    boneStyle: 'octahedral',
    boneColor: '#fff',
  }) as unknown as Node;

function scene(): SceneGraph {
  const graph = new SceneGraph();
  graph.addNode(rect('rect'));
  graph.addNode(base('group', 'group'));
  graph.addNode(rect('inner'), 'group');
  graph.addNode(base('nested', 'group'), 'group');
  graph.addNode(bone('b1'));
  graph.addNode(bone('b2'), 'b1');
  return graph;
}

describe('bindLayersToBones', () => {
  it('binds a shape with its bending mesh, to every bone in the scene', () => {
    const graph = scene();
    const mesh = new Float32Array([0, 0, 10, 0, 10, 10]);
    const bind = vi.fn();
    bindLayersToBones(graph, ['rect'], () => ({ vertices: mesh, bendMesh: true }), bind);
    expect(bind).toHaveBeenCalledWith(graph, 'rect', ['b1', 'b2'], mesh, { bendMesh: true });
  });

  it("binds a group's shapes and images, one by one", () => {
    const graph = scene();
    const bind = vi.fn();
    const getBindVertices = vi.fn(() => null);
    bindLayersToBones(graph, new Set(['group']), getBindVertices, bind);
    expect(getBindVertices).toHaveBeenCalledWith(expect.objectContaining({ id: 'inner' }));
    expect(bind.mock.calls.map((call) => call[1])).toEqual(['inner']);
    expect(bind.mock.calls[0]![3]).toBeUndefined();
  });

  it('does nothing without bones', () => {
    const graph = new SceneGraph();
    graph.addNode(rect('rect'));
    const bind = vi.fn();
    bindLayersToBones(graph, ['rect'], () => null, bind);
    expect(bind).not.toHaveBeenCalled();
  });

  it('skips layers that cannot be bound', () => {
    const graph = scene();
    const bind = vi.fn();
    bindLayersToBones(graph, ['b1', 'missing'], () => null, bind);
    expect(bind).not.toHaveBeenCalled();
    expect(bindableLayers(graph, graph.getNode('nested')!)).toEqual([]);
  });
});
