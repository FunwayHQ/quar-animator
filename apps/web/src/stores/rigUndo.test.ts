/**
 * Undo and rigging: rigging is kept for the whole project while each page has
 * its own undo history, so undo must only touch this page's rigging — and
 * rigging edits must be undoable themselves.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createBoneNode } from '@quar/rigging';
import type { RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

function rect(id: string): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
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

/** Two chained bones: b1 at the origin, b2 at its tip. */
function addArm(sg: SceneGraph) {
  sg.addNode(createBoneNode('b1', 'Upper', { x: 0, y: 0 }, 100));
  sg.addNode(createBoneNode('b2', 'Lower', { x: 100, y: 0 }, 80), 'b1');
}

describe('undo and rigging', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
  });

  it('keeps another page’s rigging when undoing on this page', () => {
    const pageOne = store().activePageId;
    store().pushUndo(sg);
    sg.addNode(rect('r1'));

    store().addPage(sg);
    addArm(sg);
    store().createIKChain(sg, 'b2');
    store().createDynamicChain(sg, 'b1');
    expect(store().ikChains).toHaveLength(1);

    store().switchPage(pageOne, sg);
    store().undo(sg);
    expect(sg.getNode('r1')).toBeUndefined();
    // Page two's arm is still rigged
    expect(store().ikChains).toHaveLength(1);
    expect(store().dynamicChains).toHaveLength(1);
  });

  it('still undoes rigging made on this page', () => {
    addArm(sg);
    store().createIKChain(sg, 'b2');
    expect(store().ikChains).toHaveLength(1);
    store().undo(sg);
    expect(store().ikChains).toHaveLength(0);
  });

  it('makes rigging edits undoable', () => {
    addArm(sg);
    store().createIKChain(sg, 'b2');
    const chainId = store().ikChains[0]!.id;
    store().setIKChainEnabled(sg, chainId, false);
    store().undo(sg);
    expect(store().ikChains[0]!.enabled).toBe(true);

    store().createDynamicChain(sg, 'b1');
    store().undo(sg);
    expect(store().dynamicChains).toHaveLength(0);

    store().createSmartBoneAction(sg, 'b2');
    store().undo(sg);
    expect(store().smartBoneActions).toHaveLength(0);

    store().createVitruvianController(sg, 'Hands');
    store().undo(sg);
    expect(store().vitruvianControllers).toHaveLength(0);
  });

  it('marks enable toggles as unsaved changes', () => {
    addArm(sg);
    store().createIKChain(sg, 'b2');
    useEditorStore.setState({ isDirty: false });
    store().setIKChainEnabled(sg, store().ikChains[0]!.id, false);
    expect(store().isDirty).toBe(true);
  });

  it('undoes a whole morph recording in one step', () => {
    addArm(sg);
    store().createSmartBoneAction(sg, 'b2');
    const actionId = store().smartBoneActions[0]!.id;
    store().addMorphTarget(sg, actionId, 90);
    const targetId = store().smartBoneActions[0]!.targets[0]!.id;

    store().startSmartBoneRecording(actionId, targetId, sg);
    expect(sg.getNode('b2')!.transform.rotation).toBe(90);
    store().saveMorphTargetOffsets(actionId, targetId, {
      mesh: [{ vertexIndex: 0, dx: 5, dy: 0 }],
    });
    store().stopSmartBoneRecording(sg);
    expect(sg.getNode('b2')!.transform.rotation).toBe(0);

    store().undo(sg);
    const target = store().smartBoneActions[0]!.targets[0]!;
    expect(target.offsets).toEqual({});
    expect(sg.getNode('b2')!.transform.rotation).toBe(0);
  });
});
