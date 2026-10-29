/**
 * Keyframe edits on the timeline are undo steps: deleting, pasting, moving
 * and re-easing keyframes — and a drag is one step, however far it goes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

/** Every keyframe's id, time and easing, track by track. */
const keyframes = () =>
  store().timeline.tracks.map((track) => ({
    nodeId: track.nodeId,
    property: track.property,
    keyframes: track.keyframes.map((kf) => [kf.time, kf.value, kf.easing]),
  }));

const keyframeMap = () => {
  const map = new Map<string, { nodeId: string; property: string }>();
  for (const track of store().timeline.tracks) {
    for (const kf of track.keyframes) {
      map.set(kf.id, { nodeId: track.nodeId, property: track.property });
    }
  }
  return map;
};

const opacityIds = () =>
  store()
    .timeline.tracks.find((track) => track.nodeId === 'sq' && track.property === 'opacity')!
    .keyframes.map((kf) => kf.id);

describe('keyframe edits and undo', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    store().clearHistory();
    sg = new SceneGraph();
    store().addKeyframeAtFrame('sq', 'opacity', 0, 1);
    store().addKeyframeAtFrame('sq', 'opacity', 30, 0.2);
    store().addKeyframeAtFrame('sq', 'transform.position.x', 0, 10);
  });

  it('undoes and redoes deleting keyframes', () => {
    const before = keyframes();
    store().setSelectedKeyframeIds([opacityIds()[1]!]);
    store().removeSelectedKeyframes(keyframeMap(), sg);
    const after = keyframes();
    expect(after).not.toEqual(before);

    store().undo(sg);
    expect(keyframes()).toEqual(before);
    store().redo(sg);
    expect(keyframes()).toEqual(after);
  });

  it('undoes re-easing the selected keyframes as one step', () => {
    const before = keyframes();
    store().setSelectedKeyframeIds(opacityIds());
    store().setSelectedKeyframesEasing('easeInOutCubic', sg);
    const after = keyframes();
    expect(after[0]!.keyframes.map((kf) => kf[2])).toEqual(['easeInOutCubic', 'easeInOutCubic']);
    expect(store().undoStack).toHaveLength(1);

    store().undo(sg);
    expect(keyframes()).toEqual(before);
    store().redo(sg);
    expect(keyframes()).toEqual(after);
  });

  it('undoes pasting keyframes', () => {
    store().setSelectedKeyframeIds(opacityIds());
    store().copySelectedKeyframes(keyframeMap());
    const before = keyframes();
    store().pasteKeyframes('other', 50, sg);
    expect(keyframes()).toHaveLength(before.length + 1);

    store().undo(sg);
    expect(keyframes()).toEqual(before);
  });

  it('undoes moving keyframes', () => {
    const before = keyframes();
    store().setSelectedKeyframeIds(opacityIds());
    store().moveSelectedKeyframes(keyframeMap(), 5, sg);
    expect(keyframes()[0]!.keyframes.map((kf) => kf[0])).toEqual([5, 35]);

    store().undo(sg);
    expect(keyframes()).toEqual(before);
  });

  it('makes a drag one step: the moves made in an undo group', () => {
    const before = keyframes();
    store().setSelectedKeyframeIds(opacityIds());
    const group = store().beginUndoGroup();
    store().moveSelectedKeyframes(keyframeMap(), 2, sg);
    store().moveSelectedKeyframes(keyframeMap(), 2, sg);
    store().moveSelectedKeyframes(keyframeMap(), 2, sg);
    store().endUndoGroup(group);
    expect(keyframes()[0]!.keyframes.map((kf) => kf[0])).toEqual([6, 36]);
    expect(store().undoStack).toHaveLength(1);

    store().undo(sg);
    expect(keyframes()).toEqual(before);
    expect(store().canUndo).toBe(false);
  });

  it('starts a new step once the group has ended, or after an undo', () => {
    store().setSelectedKeyframeIds(opacityIds());
    store().beginUndoGroup();
    store().moveSelectedKeyframes(keyframeMap(), 1, sg);
    store().endUndoGroup();
    store().moveSelectedKeyframes(keyframeMap(), 1, sg);
    expect(store().undoStack).toHaveLength(2);

    // An undo in the middle of a group: the next change is a step again
    const group = store().beginUndoGroup();
    store().moveSelectedKeyframes(keyframeMap(), 1, sg);
    store().undo(sg);
    store().moveSelectedKeyframes(keyframeMap(), 1, sg);
    store().endUndoGroup(group);
    expect(store().undoStack).toHaveLength(3);
  });

  it('pushes no step for edits refused or with nothing to do', () => {
    store().setSelectedKeyframeIds([]);
    store().removeSelectedKeyframes(keyframeMap(), sg);
    store().moveSelectedKeyframes(keyframeMap(), 3, sg);
    store().setSelectedKeyframesEasing('easeInQuad', sg);
    store().pasteKeyframes('sq', 10, sg);
    expect(store().canUndo).toBe(false);
  });
});
