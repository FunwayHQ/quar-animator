/**
 * The transition into a slide: set, taken off and put on every slide, undoably.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { createTimeline, scopeTransition, slideTransition } from '@quar/animation';
import { useEditorStore } from './editorStore';

const store = () => useEditorStore.getState();

function artboard(id: string) {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    clipContent: true,
  } as never;
}

describe('slide transitions in the store', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    sg = new SceneGraph();
    for (const id of ['third', 'second', 'first']) sg.addNode(artboard(id));
    useEditorStore.setState({
      timeline: createTimeline({ duration: 120, artboards: { second: { duration: 60 } } }),
    });
  });

  it('sets the transition into a slide in one undoable step', () => {
    const steps = store().undoStack.length;
    const push = slideTransition('push');
    store().setSlideTransition(sg, 'second', push);
    expect(scopeTransition(store().timeline, 'second')).toEqual(push);
    // Its length stays its own
    expect(store().timeline.artboards?.second?.duration).toBe(60);
    expect(store().undoStack.length).toBe(steps + 1);
    expect(store().isDirty).toBe(true);
    // The same again is no step
    store().setSlideTransition(sg, 'second', { ...push });
    expect(store().undoStack.length).toBe(steps + 1);

    store().undo(sg);
    expect(scopeTransition(store().timeline, 'second')).toBeNull();
    store().redo(sg);
    expect(scopeTransition(store().timeline, 'second')).toEqual(push);
  });

  it('takes it off again (None)', () => {
    store().setSlideTransition(sg, 'second', slideTransition('fade'));
    store().setSlideTransition(sg, 'second', null);
    expect(scopeTransition(store().timeline, 'second')).toBeNull();
    expect(store().timeline.artboards?.second).toEqual({ duration: 60 });
  });

  it('puts one slide’s transition on every slide of the page, in one step', () => {
    const wipe = { ...slideTransition('wipe'), direction: 'up' as const, duration: 0.8 };
    store().setSlideTransition(sg, 'third', wipe);
    const steps = store().undoStack.length;
    store().applyTransitionToAllSlides(sg, 'third');
    for (const id of ['first', 'second', 'third']) {
      expect(scopeTransition(store().timeline, id)).toEqual(wipe);
    }
    expect(store().undoStack.length).toBe(steps + 1);
    // Already on all: nothing to do
    store().applyTransitionToAllSlides(sg, 'second');
    expect(store().undoStack.length).toBe(steps + 1);

    // None on every one, from a slide with none
    store().setSlideTransition(sg, 'first', null);
    store().applyTransitionToAllSlides(sg, 'first');
    for (const id of ['first', 'second', 'third']) {
      expect(scopeTransition(store().timeline, id)).toBeNull();
    }
    store().undo(sg);
    expect(scopeTransition(store().timeline, 'second')).toEqual(wipe);
  });
});
