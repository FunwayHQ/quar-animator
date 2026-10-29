/**
 * Tests for the Animation Sequence store actions (live-linked numbered steps).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph } from '@quar/core';
import type { RectangleNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { noteSequenceShown } from './sequenceActions';
import {
  deserializeProject,
  deserializeProjectFromBinary,
  serializeProject,
  serializeProjectToBinary,
} from '../services/projectSerializer';

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

  it('keeps properties the sequence does not animate where the user moved them', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    const node = sg.getNode('a')!;
    sg.updateNode('a', { transform: { ...node.transform, position: { x: 75, y: 0 } } });

    store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });
    expect(sg.getNode('a')!.transform.position.x).toBe(75);
  });

  describe('sequence keyframes are read-only outside the sequence', () => {
    const opacityKeyframes = () =>
      store()
        .timeline.tracks.find((track) => track.nodeId === 'a' && track.property === 'opacity')!
        .keyframes.map(({ time, value, easing, sequenceStepId }) => ({
          time,
          value,
          easing,
          managed: sequenceStepId !== undefined,
        }));
    const keyframeMap = () => {
      const map = new Map<string, { nodeId: string; property: string }>();
      for (const track of store().timeline.tracks) {
        for (const kf of track.keyframes)
          map.set(kf.id, { nodeId: track.nodeId, property: track.property });
      }
      return map;
    };
    const managedId = () =>
      store().timeline.tracks.find((track) => track.property === 'opacity')!.keyframes[1]!.id;

    beforeEach(() => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    });

    it('refuses value, easing, tangent and removal edits', () => {
      const before = opacityKeyframes();
      store().updateKeyframeValue('a', 'opacity', 24, 0.2);
      store().addKeyframeAtFrame('a', 'opacity', 24, 0.3);
      store().setKeyframeEasing('a', 'opacity', managedId(), 'easeInQuad');
      store().setKeyframeTangents('a', 'opacity', 0, { x: 1, y: 0 }, { x: 1, y: 0 }, 'free');
      store().removeKeyframeAtFrame('a', 'opacity', 0);
      store().updateKeyframeTimeAndValueById('a', 'opacity', managedId(), 40, 0.5);
      store().updateKeyframeTimeAndValue('a', 'opacity', 24, 40, 0.5);
      expect(opacityKeyframes()).toEqual(before);
    });

    it('moves and deletes only the user’s own keyframes', () => {
      store().addKeyframeAtFrame('a', 'opacity', 60, 0.5);
      const ownId = store()
        .timeline.tracks.find((track) => track.property === 'opacity')!
        .keyframes.find((kf) => kf.time === 60)!.id;
      store().setSelectedKeyframeIds([managedId(), ownId]);

      store().moveSelectedKeyframes(keyframeMap(), 6, sg);
      expect(opacityKeyframes().map((kf) => kf.time)).toEqual([0, 24, 66]);

      store().setSelectedKeyframeIds([managedId(), ownId]);
      store().removeSelectedKeyframes(keyframeMap(), sg);
      expect(opacityKeyframes().map((kf) => [kf.time, kf.managed])).toEqual([
        [0, true],
        [24, true],
      ]);
    });

    it('won’t move a keyframe onto a sequence keyframe', () => {
      store().addKeyframeAtFrame('a', 'opacity', 30, 0.5);
      const ownId = store()
        .timeline.tracks.find((track) => track.property === 'opacity')!
        .keyframes.find((kf) => kf.time === 30)!.id;
      store().setSelectedKeyframeIds([ownId]);
      store().moveSelectedKeyframes(keyframeMap(), -6, sg);
      store().updateKeyframeTimeAndValueById('a', 'opacity', ownId, 0, 0.5);
      expect(opacityKeyframes().map((kf) => kf.time)).toEqual([0, 24, 30]);
    });
  });

  it('reveals a step: opens the window, focuses the step and selects its object', () => {
    const [, second] = [
      ...store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 }),
      ...store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 }),
    ];
    store().revealSequenceStep(second!);
    expect(store().sequenceWindowOpen).toBe(true);
    expect(store().focusedSequenceStepId).toBe(second);
    expect([...store().selectedNodeIds]).toEqual(['b']);
    useEditorStore.setState({ sequenceWindowOpen: false, focusedSequenceStepId: null });
  });

  describe('editing a sequenced object moves its animation', () => {
    const node = (id: string) => sg.getNode(id)!;
    const move = (id: string, changes: { x?: number; y?: number }) => {
      const t = node(id).transform;
      sg.updateNode(id, {
        transform: {
          ...t,
          position: { x: changes.x ?? t.position.x, y: changes.y ?? t.position.y },
        },
      });
    };
    const shown = () => {
      const state = store();
      return [state.timeline, state.currentFrame] as const;
    };
    const pose = (id: string) => store().animationSequence.restPoses[id]!;
    const lastKeyframeValue = (id: string, property: string) =>
      store()
        .timeline.tracks.find((track) => track.nodeId === id && track.property === property)!
        .keyframes.at(-1)!.value;

    it('shifts the rest pose of an animated property by the edit', () => {
      store().addSequenceSteps(sg, ['a'], 'rise-in', { duration: 24 });
      useEditorStore.setState({ currentFrame: 24 }); // rise finished: y at rest (0)
      const [timeline] = shown();
      move('a', { y: 50 });

      expect(store().absorbSequenceEdits(sg, timeline, 24)).toBe(true);
      expect(pose('a')['transform.position.y']).toBe(50);
      // The rise now ends where the object was moved to
      expect(lastKeyframeValue('a', 'transform.position.y')).toBe(50);
    });

    it('applies a mid-animation edit as an offset', () => {
      store().addSequenceSteps(sg, ['a'], 'rise-in', { duration: 24 });
      const [timeline] = shown();
      // At frame 0 the object is at the start of its rise (offset below rest)
      const startY = node('a').transform.position.y;
      move('a', { y: startY + 10 });
      store().absorbSequenceEdits(sg, timeline, 0);
      expect(pose('a')['transform.position.y']).toBeCloseTo(10);
    });

    it('scales the rest pose by the ratio of a scale edit', () => {
      store().addSequenceSteps(sg, ['a'], 'pop-in', { duration: 20 });
      useEditorStore.setState({ currentFrame: 20 });
      const [timeline] = shown();
      const t = node('a').transform;
      sg.updateNode('a', { transform: { ...t, scale: { x: 2, y: 2 } } });
      store().absorbSequenceEdits(sg, timeline, 20);
      expect(pose('a')['transform.scale.x']).toBeCloseTo(2);
    });

    it('takes the live value for properties nothing animates', () => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
      const [timeline, frame] = shown();
      move('a', { x: 120 });
      store().absorbSequenceEdits(sg, timeline, frame);
      expect(pose('a')['transform.position.x']).toBe(120);
    });

    it('leaves properties animated by the user’s own keyframes alone', () => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
      store().addKeyframeAtFrame('a', 'transform.rotation', 0, 0);
      store().addKeyframeAtFrame('a', 'transform.rotation', 30, 90);
      const [timeline, frame] = shown();
      const t = node('a').transform;
      sg.updateNode('a', { transform: { ...t, rotation: 45 } });
      expect(store().absorbSequenceEdits(sg, timeline, frame)).toBe(false);
      expect(pose('a')['transform.rotation']).toBe(0);
    });

    it('keeps a move made just before editing the sequence', () => {
      store().addSequenceSteps(sg, ['a'], 'rise-in', { duration: 24 });
      useEditorStore.setState({ currentFrame: 24 });
      move('a', { y: 40 });
      store().addSequenceSteps(sg, ['b'], 'fade-in', { duration: 24 });
      expect(pose('a')['transform.position.y']).toBe(40);
      expect(node('a').transform.position.y).toBe(40);
    });

    it('flushes against what was last shown, unless the sequence was replaced since', () => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
      const state = store();
      noteSequenceShown(state.timeline, state.currentFrame, state.animationSequence);
      move('a', { x: 77 });
      expect(store().flushSequenceEdits(sg)).toBe(true);
      expect(pose('a')['transform.position.x']).toBe(77);

      // After undo the sequence object differs from what was shown: no flush
      store().undo(sg);
      move('a', { x: 5 });
      expect(store().flushSequenceEdits(sg)).toBe(false);
    });
  });

  describe('clip steps from the user’s own keyframes', () => {
    const ownKeyframes = (nodeId: string) =>
      store()
        .timeline.tracks.filter((track) => track.nodeId === nodeId)
        .flatMap((track) =>
          track.keyframes
            .filter((kf) => kf.sequenceStepId === undefined)
            .map((kf) => [track.property, kf.time, kf.value])
        );
    const stepKeyframes = (stepId: string) =>
      store().timeline.tracks.flatMap((track) =>
        track.keyframes
          .filter((kf) => kf.sequenceStepId === stepId)
          .map((kf) => [track.property, kf.time, kf.value])
      );

    beforeEach(() => {
      // A hand-made move of "c" from x 400 to 600 over frames 40–70
      store().addKeyframeAtFrame('c', 'transform.position.x', 40, 400);
      store().addKeyframeAtFrame('c', 'transform.position.x', 70, 600);
    });

    it('turns them into a step that starts where they were', () => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
      const [clipId] = store().addClipSteps(sg, ['c']);

      const step = store().animationSequence.steps[1]!;
      expect(step).toMatchObject({
        id: clipId,
        nodeId: 'c',
        trigger: 'afterPrevious',
        delay: 16,
        duration: 30,
      });
      expect(ownKeyframes('c')).toEqual([]);
      expect(stepKeyframes(clipId!)).toEqual([
        ['transform.position.x', 40, 400],
        ['transform.position.x', 70, 600],
      ]);
      expect(store().animationSequence.restPoses.c!['transform.position.x']).toBe(400);
    });

    it('starts with an earlier step when the keyframes begin during it', () => {
      store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 60 }); // frames 0–60
      const [clipId] = store().addClipSteps(sg, ['c']);
      expect(store().animationSequence.steps[1]).toMatchObject({
        trigger: 'withPrevious',
        delay: 40,
      });
      expect(stepKeyframes(clipId!).map(([, time]) => time)).toEqual([40, 70]);
    });

    it('can then be retimed like any step', () => {
      const [clipId] = store().addClipSteps(sg, ['c']);
      store().updateSequenceStep(sg, clipId!, { delay: 0, duration: 15 });
      expect(stepKeyframes(clipId!).map(([, time]) => time)).toEqual([0, 15]);
    });

    it('skips objects without keyframes of their own', () => {
      expect(store().addClipSteps(sg, ['a', 'b'])).toEqual([]);
      expect(store().canUndo).toBe(false);
    });

    it('keeps the clip’s keyframes as the user’s own when the step is removed', () => {
      const [clipId] = store().addClipSteps(sg, ['c']);
      store().updateSequenceStep(sg, clipId!, { delay: 10 });
      store().removeSequenceStep(sg, clipId!);
      expect(store().animationSequence.steps).toEqual([]);
      expect(ownKeyframes('c')).toEqual([
        ['transform.position.x', 10, 400],
        ['transform.position.x', 40, 600],
      ]);

      store().undo(sg);
      expect(store().animationSequence.steps.map((step) => step.id)).toEqual([clipId]);
      expect(ownKeyframes('c')).toEqual([]);
    });
  });

  it('opens and closes the sequence window', () => {
    expect(store().sequenceWindowOpen).toBe(false);
    store().toggleSequenceWindow();
    expect(store().sequenceWindowOpen).toBe(true);
    store().setSequenceWindowOpen(false);
    expect(store().sequenceWindowOpen).toBe(false);
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

  it('round-trips presets, clips and their keyframes through a binary .quar file', () => {
    store().addSequenceSteps(sg, ['a'], 'fade-in', { duration: 24 });
    store().addKeyframeAtFrame('c', 'transform.position.x', 40, 400);
    store().addKeyframeAtFrame('c', 'transform.position.x', 70, 600);
    store().addClipSteps(sg, ['c']);
    store().addPage(sg); // a second page with its own (empty) sequence
    const firstPage = store().pages[0]!.id;
    store().switchPage(firstPage, sg);
    const savedSequence = structuredClone(store().animationSequence);
    const savedTimeline = structuredClone(store().timeline);

    const binary = serializeProjectToBinary('Round trip', sg, {
      ...store(),
      pages: store().pages,
      activePageId: store().activePageId,
    });
    store().resetProject();
    const loaded = new SceneGraph();
    deserializeProjectFromBinary(binary, loaded, (state) => useEditorStore.setState(state));

    expect(store().animationSequence).toEqual(savedSequence);
    expect(store().animationSequence.steps[1]!.clip).toBeDefined();
    // Compiled, tagged keyframes come back too, so playback and export need no recompile
    expect(store().timeline.tracks).toEqual(savedTimeline.tracks);
    expect(store().pages.map((page) => page.animationSequence.steps.length)).toEqual([2, 0]);

    // And the loaded sequence stays editable
    store().updateSequenceStep(loaded, store().animationSequence.steps[1]!.id, { delay: 0 });
    expect(store().animationSequence.steps[1]!.delay).toBe(0);
  });

  it('loads older projects without a sequence as an empty one', () => {
    const data = serializeProject('Old', sg, { ...store() });
    for (const page of data.pages) delete page.animationSequence;
    deserializeProject(data, new SceneGraph(), (state) => useEditorStore.setState(state));
    expect(store().animationSequence).toEqual({ steps: [], restPoses: {} });
  });
});
