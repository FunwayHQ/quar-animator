/**
 * The picture each video layer shows on the canvas now, for the renderer
 * (ShapeRenderer.setVideoFrames): a layer of the timeline in view shows
 * the moment of its clip the playhead is at (nothing outside its clip); one
 * of another timeline (another artboard's, or the page's while an
 * artboard's is in view) shows its clip's first picture, so it's never
 * blank there. A layer with no video, or a clip mended to nothing (a
 * damaged file), shows nothing. The pictures come from the video frame
 * source.
 */

import type { SceneGraph, VideoFrameProvider } from '@quar/core';
import { videoPosterTime, videoTimeAt } from '@quar/animation';
import { videoFrameAt } from '../../services/videoFrames';
import { layerScope } from '../../stores/videoSounds';

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
    if (!sceneGraph || !node.videoId || !(node.clip.duration > 0)) return null;
    const { scope, frame, frameRate, playing } = getMoment();
    // A layer not on the page (drawn from elsewhere) has no timeline in view
    const inView =
      sceneGraph.getNode(node.id) !== undefined && layerScope(sceneGraph, node.id) === scope;
    if (!inView) return frameAt(node.videoId, videoPosterTime(node.clip), false);
    const seconds = videoTimeAt(node.clip, frame, frameRate);
    return seconds === null ? null : frameAt(node.videoId, seconds, playing);
  };
}
