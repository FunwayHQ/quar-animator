import { describe, it, expect, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { Node } from '@quar/types';
import { DeformedBoundsCache, selectedDeformedBounds } from './deformedBounds';
import type { Bounds } from './deformedBounds';

function makeRect(id: string, skinned: boolean): Node {
  return {
    id,
    name: id,
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
    ...(skinned ? { skinData: { boneIds: ['b'] } } : {}),
  } as unknown as Node;
}

function makeGroup(id: string): Node {
  return {
    id,
    name: id,
    type: 'group',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  } as unknown as Node;
}

describe('selectedDeformedBounds', () => {
  it('measures selected skinned layers, and groups by their skinned layers', () => {
    const sg = new SceneGraph();
    sg.addNode(makeRect('mesh', true));
    sg.addNode(makeRect('plain', false));
    sg.addNode(makeGroup('group'));
    sg.addNode(makeRect('arm', true), 'group');
    sg.addNode(makeRect('leg', true), 'group');
    const measured: Record<string, Bounds> = {
      mesh: { x: 0, y: 0, width: 5, height: 5 },
      arm: { x: 10, y: 10, width: 10, height: 5 },
      leg: { x: 15, y: 0, width: 10, height: 10 },
    };

    const { bounds, complete } = selectedDeformedBounds(
      new Set(['mesh', 'plain', 'group']),
      sg,
      (node) => measured[node.id] ?? null
    );

    expect(complete).toBe(true);
    expect(bounds.get('mesh')).toEqual(measured.mesh);
    expect(bounds.has('plain')).toBe(false);
    expect(bounds.get('group')).toEqual({ x: 10, y: 0, width: 15, height: 15 });
  });

  it("isn't complete while a mesh has nothing to measure yet", () => {
    const sg = new SceneGraph();
    sg.addNode(makeRect('mesh', true));
    const { bounds, complete } = selectedDeformedBounds(new Set(['mesh']), sg, () => null);
    expect(complete).toBe(false);
    expect(bounds.size).toBe(0);
  });
});

describe('DeformedBoundsCache (F161)', () => {
  function setup() {
    const sg = new SceneGraph();
    sg.addNode(makeRect('mesh', true));
    const measure = vi.fn(() => ({ x: 0, y: 0, width: 5, height: 5 }) as Bounds | null);
    const cache = new DeformedBoundsCache();
    const get = (version: number, selection: ReadonlySet<string>) =>
      cache.get(version, selection, () => selectedDeformedBounds(selection, sg, measure));
    return { measure, get };
  }

  it("doesn't skin the mesh again while neither the scene nor the selection changes", () => {
    const { measure, get } = setup();
    const selection = new Set(['mesh']);

    const first = get(1, selection);
    const second = get(1, selection);

    expect(measure).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('measures again when the scene changes, or the selection does', () => {
    const { measure, get } = setup();
    const selection = new Set(['mesh']);

    get(1, selection);
    get(2, selection);
    expect(measure).toHaveBeenCalledTimes(2);

    get(2, new Set(['mesh']));
    expect(measure).toHaveBeenCalledTimes(3);
  });

  it('tries again next time when a mesh had nothing to measure', () => {
    const { measure, get } = setup();
    const selection = new Set(['mesh']);
    measure.mockReturnValueOnce(null);

    expect(get(1, selection).size).toBe(0);
    expect(get(1, selection).get('mesh')).toEqual({ x: 0, y: 0, width: 5, height: 5 });
    get(1, selection);
    expect(measure).toHaveBeenCalledTimes(2);
  });
});
