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

  it('undoes a dynamic chain’s settings, a slider drag in one step', () => {
    addArm(sg);
    store().createDynamicChain(sg, 'b1');
    const chain = () => store().dynamicChains[0]!;
    const stiffness = chain().stiffness;
    const steps = store().undoStack.length;

    const group = store().beginUndoGroup();
    for (const v of [0.2, 0.3, 0.4]) {
      store().updateDynamicChainSettings(chain().id, { stiffness: v }, sg);
    }
    store().endUndoGroup(group);
    expect(chain().stiffness).toBe(0.4);
    expect(store().undoStack).toHaveLength(steps + 1);

    store().undo(sg);
    expect(chain().stiffness).toBe(stiffness);
    store().redo(sg);
    expect(chain().stiffness).toBe(0.4);
  });

  it('undoes a Smart Bone’s range', () => {
    addArm(sg);
    store().createSmartBoneAction(sg, 'b2');
    const driver = () => store().smartBoneActions[0]!.driver;
    const { rangeMin, rangeMax } = driver();

    store().updateSmartBoneDriver(store().smartBoneActions[0]!.id, { rangeMin: -45 }, sg);
    store().updateSmartBoneDriver(store().smartBoneActions[0]!.id, { rangeMax: 135 }, sg);
    expect([driver().rangeMin, driver().rangeMax]).toEqual([-45, 135]);

    store().undo(sg);
    expect([driver().rangeMin, driver().rangeMax]).toEqual([-45, rangeMax]);
    store().undo(sg);
    expect([driver().rangeMin, driver().rangeMax]).toEqual([rangeMin, rangeMax]);
  });

  it('undoes the Global Wind, and leaves it alone when undoing other edits', () => {
    const before = { ...store().globalWind };
    store().setGlobalWind({ strength: 120, enabled: true }, sg);
    expect(store().globalWind.strength).toBe(120);

    // Another edit after it: undoing that one keeps the wind
    store().pushUndo(sg);
    sg.addNode(rect('r1'));
    store().undo(sg);
    expect(store().globalWind.strength).toBe(120);

    store().undo(sg);
    expect(store().globalWind).toEqual(before);
    store().redo(sg);
    expect(store().globalWind).toEqual({ ...before, strength: 120, enabled: true });
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

  describe('ending a morph recording', () => {
    function recording() {
      addArm(sg);
      sg.updateNode('b2', { transform: { ...sg.getNode('b2')!.transform, rotation: 15 } });
      store().createSmartBoneAction(sg, 'b2');
      const actionId = store().smartBoneActions[0]!.id;
      store().addMorphTarget(sg, actionId, 90);
      const targetId = store().smartBoneActions[0]!.targets[0]!.id;
      store().setActiveTool('pen');
      store().startSmartBoneRecording(actionId, targetId, sg);
      expect(sg.getNode('b2')!.transform.rotation).toBe(90);
      return { actionId, targetId };
    }

    it('gives the bone back its rotation when the action is removed', () => {
      const { actionId } = recording();
      store().removeSmartBoneAction(sg, actionId);
      expect(sg.getNode('b2')!.transform.rotation).toBe(15);
      expect(store().smartBoneRecordingActionId).toBeNull();
      expect(store().activeTool).toBe('pen');
    });

    it('gives the bone back its rotation when the target is removed', () => {
      const { actionId, targetId } = recording();
      store().removeMorphTarget(sg, actionId, targetId);
      expect(sg.getNode('b2')!.transform.rotation).toBe(15);
      expect(store().smartBoneRecordingTargetId).toBeNull();
    });

    it('cancels on undo', () => {
      recording();
      store().undo(sg);
      expect(store().smartBoneRecordingActionId).toBeNull();
      expect(sg.getNode('b2')!.transform.rotation).toBe(15);
    });

    it('can hand over to another tool', () => {
      recording();
      store().stopSmartBoneRecording(sg, { nextTool: 'brush' });
      expect(store().activeTool).toBe('brush');
      expect(sg.getNode('b2')!.transform.rotation).toBe(15);
    });

    it('ends with the project', () => {
      recording();
      store().resetProject();
      expect(store().smartBoneRecordingActionId).toBeNull();
    });
  });
});
