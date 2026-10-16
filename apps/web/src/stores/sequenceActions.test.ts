/**
 * Tests for the Animation Sequence store actions (live-linked numbered steps).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { deserializeProject, serializeProject } from '../services/projectSerializer';

function makeRect(id: string, x = 0, opacity = 1): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity,
    blendMode: 'normal',
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

const store = () => useEditorStore.getState();

function managedKeyframes(nodeId?: string) {
  return store()
    .timeline.tracks.filter((track) => !nodeId || track.nodeId === nodeId)
    .flatMap((track) =>
      track.keyframes
        .filter((kf) => kf.sequenceStepId !== undefined)
        .map((kf) => ({ property: track.property, time: kf.time, step: kf.sequenceStepId }))
    );
}

describe('Animation Sequence actions', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
    sg.addNode(makeRect('a', 0));
    sg.addNode(makeRect('b', 200));
    sg.addNode(makeRect('c', 400));
  });

  it('appends steps that render into tagged timeline keyframes', () => {
    const [first] = store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    const [second] = store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });

    expect(store().animationSequence.steps.map((step) => step.id)).toEqual([first, second]);
    expect(managedKeyframes()).toEqual([
      { property: 'opacity', time: 0, step: first },
      { property: 'opacity', time: 24, step: first },
      { property: 'opacity', time: 24, step: second },
      { property: 'opacity', time: 48, step: second },
    ]);
    expect(store().animationSequence.restPoses.a).toMatchObject({ opacity: 1 });
    expect(store().isDirty).toBe(true);
    // The playhead (frame 0) shows both objects hidden before their entrance
    expect(sg.getNode('a')!.opacity).toBe(0);
    expect(sg.getNode('b')!.opacity).toBe(0);
  });

  it('starts further selected objects with the first one, staggered', () => {
    store().addSequenceSteps(sg, ['a', 'b', 'c'], 'pop-in', { duration: 20, staggerFrames: 5 });
    expect(
      store().animationSequence.steps.map(({ nodeId, trigger, delay }) => [nodeId, trigger, delay])
    ).toEqual([
      ['a', 'afterPrevious', 0],
      ['b', 'withPrevious', 5],
      ['c', 'withPrevious', 5],
    ]);
  });

  it('skips objects the preset cannot animate', () => {
    expect(store().addSequenceSteps(sg, ['a'], 'typewriter', { duration: 24 })).toEqual([]);
    expect(store().animationSequence.steps).toEqual([]);
    expect(store().canUndo).toBe(false);
  });

  it('re-renders the timeline when a step changes', () => {
    const [first] = store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    const [second] = store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });
    store().updateSequenceStep(sg, first!, { duration: 40 });
    expect(managedKeyframes('b').map((kf) => kf.time)).toEqual([40, 64]);

    store().updateSequenceStep(sg, second!, { trigger: 'with', targetStepId: first });
    expect(managedKeyframes('b').map((kf) => kf.time)).toEqual([0, 24]);
  });

  it('removes a step, its keyframes, and resets the object to its rest pose', () => {
    const [first] = store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24, trigger: 'after' });
    expect(sg.getNode('a')!.opacity).toBe(0);

    store().removeSequenceStep(sg, first!);
    expect(managedKeyframes('a')).toEqual([]);
    expect(sg.getNode('a')!.opacity).toBe(1);
    // The remaining step moves up to the start
    expect(managedKeyframes('b').map((kf) => kf.time)).toEqual([0, 24]);
    expect(Object.keys(store().animationSequence.restPoses)).toEqual(['b']);
  });

  it('reorders steps and re-renders their timing', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 10 });
    store().moveSequenceStep(sg, 1, 0);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['b', 'a']);
    expect(managedKeyframes('a').map((kf) => kf.time)).toEqual([10, 34]);
  });

  it('undoes and redoes sequence edits together with the timeline', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['b'], 'shake', { duration: 24 });

    store().undo(sg);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['a']);
    expect(managedKeyframes('b')).toEqual([]);

    store().redo(sg);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['a', 'b']);
    expect(managedKeyframes('b').length).toBeGreaterThan(0);
  });

  it('keeps a separate sequence per page', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    const firstPage = store().activePageId;

    store().addPage(sg);
    expect(store().animationSequence.steps).toEqual([]);

    store().switchPage(firstPage, sg);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['a']);
  });

  it('drops the steps of deleted objects and re-times the rest', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });
    useEditorStore.setState({ selectedNodeIds: new Set(['a']) });

    store().deleteSelection(sg);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['b']);
    expect(managedKeyframes('b').map((kf) => kf.time)).toEqual([0, 24]);
  });

  it('removes an object’s steps with Delete Animation', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });

    store().deleteLayerAnimation(sg, ['a']);
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['b']);
    expect(managedKeyframes('a')).toEqual([]);
    expect(sg.getNode('a')!.opacity).toBe(1);
  });

  it('is inactive while a symbol is being edited', () => {
    useEditorStore.setState({ editingSymbolId: 'sym1' });
    expect(store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 })).toEqual([]);
    expect(store().animationSequence.steps).toEqual([]);
  });

  it('saves and loads the sequence with the project', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    const saved = structuredClone(store().animationSequence);
    const data = serializeProject('Test', sg, {
      ...store(),
      pages: store().pages,
      activePageId: store().activePageId,
    });
    expect(data.pages[0]!.animationSequence).toEqual(saved);

    store().resetProject();
    const loaded = new SceneGraph();
    deserializeProject(data, loaded, (state) => useEditorStore.setState(state));
    expect(store().animationSequence).toEqual(saved);
    expect(store().pages[0]!.animationSequence).toEqual(saved);
  });

  it('loads older projects without a sequence as an empty one', () => {
    const data = serializeProject('Old', sg, { ...store() });
    for (const page of data.pages) delete page.animationSequence;
    deserializeProject(data, new SceneGraph(), (state) => useEditorStore.setState(state));
    expect(store().animationSequence).toEqual({ steps: [], restPoses: {} });
  });
});
