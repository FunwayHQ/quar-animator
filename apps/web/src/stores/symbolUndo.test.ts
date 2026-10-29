/**
 * Undoing Delete Symbol brings back the symbol as well as its instances
 * (the library isn't in undo snapshots: the step holds what it removed).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

function rect(id: string, x: number): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y: 0 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 10,
    height: 10,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

/** Make a symbol of a new rectangle; returns the symbol's and its instance's ids. */
function symbolOf(sg: SceneGraph, id: string, x: number) {
  sg.addNode(rect(id, x));
  store().setSelection([id]);
  const symbolId = store().createSymbol(sg)!;
  const instanceId = [...store().selectedNodeIds][0]!;
  return { symbolId, instanceId };
}

const instances = (sg: SceneGraph) =>
  sg
    .getRootNodes()
    .filter((node) => node.type === 'symbol-instance')
    .map((node) => node.id);

describe('Delete Symbol and undo', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
  });

  it('brings the symbol back with its instances, and redo deletes them again', () => {
    const { symbolId, instanceId } = symbolOf(sg, 'r1', 0);
    const definition = structuredClone(store().symbols[0]);

    store().deleteSymbol(symbolId, sg);
    expect(store().symbols).toHaveLength(0);
    expect(instances(sg)).toEqual([]);

    store().undo(sg);
    expect(store().symbols).toEqual([definition]);
    expect(instances(sg)).toEqual([instanceId]);

    store().redo(sg);
    expect(store().symbols).toHaveLength(0);
    expect(instances(sg)).toEqual([]);

    store().undo(sg);
    expect(store().symbols.map((symbol) => symbol.id)).toEqual([symbolId]);
    expect(instances(sg)).toEqual([instanceId]);
  });

  it('puts the symbol back in its place in the library', () => {
    const first = symbolOf(sg, 'r1', 0).symbolId;
    const second = symbolOf(sg, 'r2', 50).symbolId;
    const third = symbolOf(sg, 'r3', 100).symbolId;

    store().deleteSymbol(second, sg);
    expect(store().symbols.map((symbol) => symbol.id)).toEqual([first, third]);
    store().undo(sg);
    expect(store().symbols.map((symbol) => symbol.id)).toEqual([first, second, third]);
  });

  it('keeps a symbol deleted when the step before it is undone after a redo of both', () => {
    const { symbolId } = symbolOf(sg, 'r1', 0);
    store().pushUndo(sg);
    sg.addNode(rect('r2', 50));
    store().deleteSymbol(symbolId, sg);

    // Undo the delete, then the rectangle: the symbol stays (it was there then)
    store().undo(sg);
    store().undo(sg);
    expect(store().symbols.map((symbol) => symbol.id)).toEqual([symbolId]);
    // Redo both: deleted again
    store().redo(sg);
    store().redo(sg);
    expect(store().symbols).toHaveLength(0);
  });
});
