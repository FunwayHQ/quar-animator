/**
 * The picture each video layer shows on the canvas now, for the renderer
 * (ShapeRenderer.setVideoFrames): a layer of the timeline in view shows
 * the moment of its clip the playhead is at (nothing outside its clip); one
 * of another timeline (another artboard's, or the page's while an
 * artboard's is in view) or a symbol's shows its clip's first picture, so
 * it's never blank there. The pictures come from the video frame source.
 */

import { timelineScopeOf, type SceneGraph, type VideoFrameProvider } from '@quar/core';
import { videoPosterTime, videoTimeAt } from '@quar/animation';
import { videoFrameAt } from '../../services/videoFrames';

/** Where the canvas is in time: the timeline in view and its playhead. */
export interface CanvasVideoMoment {
  /** The timeline in view: an artboard's id, or null for the page's */
  scope: string | null;
  frame: number;
  frameRate: number;
  playing: boolean;
}

/**
 * The canvas's video frame provider. Asked for every video layer every
 * frame it draws, so it only reads what it's given: the layer's timeline is
 * found through its ancestors, not the whole scene.
 */
export function createCanvasVideoFrames(
  getSceneGraph: () => SceneGraph | null,
  getMoment: () => CanvasVideoMoment,
  frameAt: typeof videoFrameAt = videoFrameAt
): VideoFrameProvider {
  return (node) => {
    const sceneGraph = getSceneGraph();
    if (!sceneGraph) return null;
    const { scope, frame, frameRate, playing } = getMoment();
    // A symbol's layers (drawn through an instance) aren't on the page
    const inView =
      sceneGraph.getNode(node.id) !== undefined && timelineScopeOf(sceneGraph, node.id) === scope;
    if (!inView) return frameAt(node.videoId, videoPosterTime(node.clip), false);
    const seconds = videoTimeAt(node.clip, frame, frameRate);
    return seconds === null ? null : frameAt(node.videoId, seconds, playing);
  };
}
