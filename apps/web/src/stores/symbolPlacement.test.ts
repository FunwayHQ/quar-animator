/**
 * Placing a symbol from the Symbols panel: in the middle of the canvas view,
 * into the artboard there if any, selected, one undo step.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SceneGraph, createDefaultTransform, createGroupNode } from '@quar/core';
import type { ArtboardNode, SymbolDefinition } from '@quar/types';
import { useEditorStore } from './editorStore';
import { setCanvasViewCenter } from '../services/canvasView';

const store = () => useEditorStore.getState();

const badge: SymbolDefinition = {
  id: 'badge',
  name: 'Badge',
  sceneGraphJSON: {
    nodes: [{ ...createGroupNode('disc', 'Disc'), parent: null }],
    rootNodeIds: ['disc'],
  },
};

function artboard(id: string, x: number, y: number): ArtboardNode {
  return {
    ...createGroupNode(id, id),
    type: 'artboard',
    width: 400,
    height: 300,
    fills: [],
    transform: { ...createDefaultTransform(), position: { x, y }, anchor: { x: 0, y: 0 } },
  } as unknown as ArtboardNode;
}

/** The instance just placed (it's selected), and where it is on the canvas. */
function placed(sg: SceneGraph) {
  const [id] = [...store().selectedNodeIds];
  const node = id ? sg.getNode(id) : undefined;
  const world = id ? sg.getWorldTransform(id) : undefined;
  return { node, at: world && { x: world.tx, y: world.ty } };
}

describe('placing a symbol instance', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    useEditorStore.setState({ symbols: [structuredClone(badge)] });
    sg = new SceneGraph();
  });
  afterEach(() => setCanvasViewCenter(null));

  it('puts it in the middle of the canvas view, selected', () => {
    setCanvasViewCenter(() => ({ x: 900, y: -250 }));

    store().placeSymbolInstance(sg, 'badge');

    const { node, at } = placed(sg);
    expect(node?.type).toBe('symbol-instance');
    expect(node?.parent).toBeNull();
    expect(at).toEqual({ x: 900, y: -250 });
  });

  it('puts it into the artboard there, keeping its place on the canvas', () => {
    sg.addNode(artboard('board', 100, 50));
    setCanvasViewCenter(() => ({ x: 300, y: 200 }));

    store().placeSymbolInstance(sg, 'badge');

    const { node, at } = placed(sg);
    expect(node?.parent).toBe('board');
    expect(at?.x).toBeCloseTo(300);
    expect(at?.y).toBeCloseTo(200);
  });

  it('is one undo step', () => {
    sg.addNode(artboard('board', 100, 50));
    setCanvasViewCenter(() => ({ x: 300, y: 200 }));
    const steps = store().undoStack.length;

    store().placeSymbolInstance(sg, 'badge');
    expect(store().undoStack.length).toBe(steps + 1);

    store().undo(sg);
    expect(sg.getNode('board')?.children).toEqual([]);
    expect(sg.getRootNodes().map((node) => node.id)).toEqual(['board']);
  });

  it('without a canvas, puts it at the origin', () => {
    store().placeSymbolInstance(sg, 'badge');

    expect(placed(sg).at).toEqual({ x: 0, y: 0 });
  });
});
