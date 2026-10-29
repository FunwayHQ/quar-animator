/**
 * Panels' edits as undo steps: the scene graph that records them, and
 * pushUndoStep joining the step an edit's code pushed already.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { Node, RectangleNode } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';
import { undoableSceneGraph } from './useUndoableEdits';

const store = () => useEditorStore.getState();

function rect(id: string): RectangleNode {
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
  };
}

/** The code running now has run: the next edit is another's. */
const nextTask = () => Promise.resolve();

describe('pushUndoStep', () => {
  let sg: SceneGraph;

  beforeEach(async () => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
    await nextTask();
  });

  it('joins the step the code making the edit pushed, and pushes for the next', async () => {
    store().pushUndo(sg);
    store().pushUndoStep(sg);
    store().pushUndoStep(sg);
    expect(store().undoStack).toHaveLength(1);

    await nextTask();
    store().pushUndoStep(sg);
    expect(store().undoStack).toHaveLength(2);
  });

  it('joins the step of the undo group open', async () => {
    const group = store().beginUndoGroup();
    store().pushUndoStep(sg);
    await nextTask();
    store().pushUndoStep(sg);
    store().pushUndo(sg);
    store().endUndoGroup(group);
    expect(store().undoStack).toHaveLength(1);
    expect(group.open).toBe(false);
  });
});

describe('undoableSceneGraph', () => {
  let sg: SceneGraph;

  beforeEach(async () => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
    sg.addNode(rect('a'));
    await nextTask();
  });

  it('records an undo step before it changes the scene, one for an edit', () => {
    const edits = undoableSceneGraph(sg);
    edits.updateNode('a', { opacity: 0.5 } as Partial<Node>);
    edits.addNode(rect('b'));
    edits.moveNode('b', null, 0);
    expect(store().undoStack).toHaveLength(1);

    store().undo(sg);
    expect(sg.getNode('a')?.opacity).toBe(1);
    expect(sg.getNode('b')).toBeUndefined();
  });

  it('reads the scene, listens and loads one without recording', () => {
    const edits = undoableSceneGraph(sg);
    expect(edits.getNode('a')?.id).toBe('a');
    expect(edits.getRootNodes()).toHaveLength(1);
    expect(edits).toBeInstanceOf(SceneGraph);
    let changes = 0;
    const off = edits.on('nodeChanged', () => changes++);
    sg.updateNode('a', { opacity: 0.2 } as Partial<Node>);
    off();
    expect(changes).toBe(1);
    edits.fromJSON(sg.toJSON());
    expect(store().canUndo).toBe(false);
  });
});
