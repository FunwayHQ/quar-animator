/**
 * Video clip store actions: a video layer's clip moved along its timeline,
 * its linked sound with it, and that sound unlinked to be a sound of its
 * own; each an undoable step.
 */

import { movedVideoClip } from '@quar/animation';
import type { EditorStore, SceneGraphLike } from './editorStore';
import { unlinkedSoundClip, withLinkedSoundAt } from './videoSounds';

export interface VideoClipActions {
  /**
   * Move a video layer's clip to start on `frame` (a whole frame, not before
   * the first), its linked sound with it. An undoable step, unless
   * `undoable` is false: a drag records one as it begins.
   */
  moveVideoClip: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    frame: number,
    undoable?: boolean
  ) => void;
  /** Make a video's sound clip a sound of its own: it no longer moves with the video. Undoable. */
  unlinkSoundClip: (sceneGraph: SceneGraphLike, clipId: string) => void;
}

export function createVideoClipActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): VideoClipActions {
  return {
    moveVideoClip: (sceneGraph, nodeId, frame, undoable = true) => {
      const node = sceneGraph.getNode(nodeId);
      if (node?.type !== 'video') return;
      const clip = movedVideoClip(node.clip, frame);
      if (clip === node.clip) return;
      if (undoable) get().pushUndo(sceneGraph);
      sceneGraph.updateNode(nodeId, { clip });
      set({ timeline: withLinkedSoundAt(get().timeline, nodeId, clip), isDirty: true });
    },
    unlinkSoundClip: (sceneGraph, clipId) =>
      get().updateSoundClip(sceneGraph, clipId, unlinkedSoundClip),
  };
}
