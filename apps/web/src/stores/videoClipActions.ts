/**
 * Video clip store actions: a video layer's clip changed — moved along its
 * timeline, trimmed, sped up or slowed down, looped, holding its last
 * frame — its linked sound kept where it is, the layer's timeline long
 * enough to play it to its end; and that sound unlinked to be a sound of
 * its own. Each an undoable step.
 */

import {
  movedVideoClip,
  scopeDuration,
  videoClipEndFrame,
  withScopeDuration,
} from '@quar/animation';
import type { VideoClip } from '@quar/types';
import type { EditorStore, SceneGraphLike } from './editorStore';
import { layerScope, unlinkedSoundClip, withLinkedSoundAt } from './videoSounds';

export interface VideoClipActions {
  /**
   * Change a video layer's clip (trim it, set its speed, loop or hold), its
   * linked sound put where it now is, and the timeline its layer plays on
   * lengthened to play it to its end (holding its last frame doesn't). An
   * undoable step, unless `undoable` is false: a drag records one as it
   * begins. A drag doesn't lengthen the timeline as it goes (`fitTimeline`
   * false), which would change the frame under the pointer: it does as it
   * ends, with fitTimelineToVideoClip.
   */
  updateVideoClip: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    change: (clip: VideoClip) => VideoClip,
    undoable?: boolean,
    fitTimeline?: boolean
  ) => void;
  /**
   * Move a video layer's clip to start on `frame` (a whole frame, not before
   * the first), its linked sound with it. An undoable step, unless
   * `undoable` is false: a drag records one as it begins. It doesn't
   * lengthen the timeline: a drag does as it ends.
   */
  moveVideoClip: (
    sceneGraph: SceneGraphLike,
    nodeId: string,
    frame: number,
    undoable?: boolean
  ) => void;
  /**
   * Lengthen the timeline a video layer plays on to play its clip to its
   * end (never shortened). Part of the change before it: no undo step.
   */
  fitTimelineToVideoClip: (sceneGraph: SceneGraphLike, nodeId: string) => void;
  /** Make a video's sound clip a sound of its own: it no longer moves with the video. Undoable. */
  unlinkSoundClip: (sceneGraph: SceneGraphLike, clipId: string) => void;
}

export function createVideoClipActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): VideoClipActions {
  return {
    updateVideoClip: (sceneGraph, nodeId, change, undoable = true, fitTimeline = true) => {
      const node = sceneGraph.getNode(nodeId);
      if (node?.type !== 'video') return;
      const clip = change(node.clip);
      if (clip === node.clip) return;
      if (undoable) get().pushUndo(sceneGraph);
      sceneGraph.updateNode(nodeId, { clip });
      set({ timeline: withLinkedSoundAt(get().timeline, nodeId, clip), isDirty: true });
      if (fitTimeline) get().fitTimelineToVideoClip(sceneGraph, nodeId);
    },
    moveVideoClip: (sceneGraph, nodeId, frame, undoable = true) =>
      get().updateVideoClip(
        sceneGraph,
        nodeId,
        (clip) => movedVideoClip(clip, frame),
        undoable,
        false
      ),
    fitTimelineToVideoClip: (sceneGraph, nodeId) => {
      const node = sceneGraph.getNode(nodeId);
      if (node?.type !== 'video') return;
      const state = get();
      const needed = Math.ceil(videoClipEndFrame(node.clip, state.frameRate) - 1e-6);
      const scope = layerScope(sceneGraph, nodeId);
      if (scope === state.timelineScope) {
        if (needed > state.timelineDuration) state.setTimelineDuration(needed);
      } else if (needed > scopeDuration(state.timeline, scope)) {
        set({ timeline: withScopeDuration(state.timeline, scope, needed), isDirty: true });
      }
    },
    unlinkSoundClip: (sceneGraph, clipId) =>
      get().updateSoundClip(sceneGraph, clipId, unlinkedSoundClip),
  };
}
