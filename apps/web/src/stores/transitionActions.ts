/**
 * Slide transition store actions: the transition into an artboard's slide
 * (how it comes on after the one before when the page's artboards play as
 * slides), set or taken off, or one slide's put on every slide of the page,
 * each an undoable step. It's kept on the artboard's timeline entry, so undo,
 * saving and copying an artboard take it along.
 */

import { scopeTransition, withScopeTransition, withSlidesTransition } from '@quar/animation';
import { artboardsInOrder } from '@quar/core';
import type { SlideTransition } from '@quar/types';
import type { EditorStore, SceneGraphLike } from './editorStore';

export interface TransitionActions {
  /** Set the transition into an artboard's slide, or take it off (null). Undoable. */
  setSlideTransition: (
    sceneGraph: SceneGraphLike,
    artboardId: string,
    transition: SlideTransition | null
  ) => void;
  /** Put an artboard's transition (or none) on every artboard at the top of the page. Undoable. */
  applyTransitionToAllSlides: (sceneGraph: SceneGraphLike, artboardId: string) => void;
}

const same = (a: SlideTransition | null, b: SlideTransition | null) =>
  JSON.stringify(a) === JSON.stringify(b);

export function createTransitionActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): TransitionActions {
  return {
    setSlideTransition: (sceneGraph, artboardId, transition) => {
      if (same(scopeTransition(get().timeline, artboardId), transition)) return;
      get().pushUndo(sceneGraph);
      set((state) => ({
        timeline: withScopeTransition(state.timeline, artboardId, transition),
        isDirty: true,
      }));
    },
    applyTransitionToAllSlides: (sceneGraph, artboardId) => {
      const { timeline } = get();
      const transition = scopeTransition(timeline, artboardId);
      const slides = artboardsInOrder(sceneGraph).map((node) => node.id);
      if (slides.every((id) => same(scopeTransition(timeline, id), transition))) return;
      get().pushUndo(sceneGraph);
      set((state) => ({
        timeline: withSlidesTransition(state.timeline, slides, transition),
        isDirty: true,
      }));
    },
  };
}
