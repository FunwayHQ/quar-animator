/**
 * The picture each video layer shows on the canvas now, for the renderer
 * (ShapeRenderer.setVideoFrames): a layer of the timeline in view shows
 * the moment of its clip the playhead is at (nothing outside its clip); one
 * of another timeline (another artboard's, or the page's while an
 * artboard's is in view) shows its clip's first picture, so it's never
 * blank there. A layer with no video, or a clip mended to nothing (a
 * damaged file), shows nothing. The pictures come from the video frame
 * source. And whether a selection is all video layers showing nothing now
 * (its box is drawn faintly).
 */

import type { SceneGraph, VideoFrameProvider } from '@quar/core';
import { videoPosterTime, videoTimeAt } from '@quar/animation';
import type { VideoNode } from '@quar/types';
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
 * The moment of its video a layer shows now (null: nothing), and whether
 * it's of the timeline in view (else it's the clip's first, standing still).
 * Its timeline is found through its ancestors, not the whole scene.
 */
function shownMoment(
  sceneGraph: Pick<SceneGraph, 'getNode'>,
  node: VideoNode,
  { scope, frame, frameRate }: Omit<CanvasVideoMoment, 'playing'>
): { seconds: number; inView: boolean } | null {
  if (!node.videoId || !(node.clip.duration > 0)) return null;
  // A layer not on the page (drawn from elsewhere) has no timeline in view
  const inView =
    sceneGraph.getNode(node.id) !== undefined && layerScope(sceneGraph, node.id) === scope;
  if (!inView) return { seconds: videoPosterTime(node.clip), inView };
  const seconds = videoTimeAt(node.clip, frame, frameRate);
  return seconds === null ? null : { seconds, inView };
}

/**
 * The canvas's video frame provider. Asked for every video layer every
 * frame it draws, so it only reads what it's given.
 */
export function createCanvasVideoFrames(
  getSceneGraph: () => SceneGraph | null,
  getMoment: () => CanvasVideoMoment,
  frameAt: typeof videoFrameAt = videoFrameAt
): VideoFrameProvider {
  return (node) => {
    const sceneGraph = getSceneGraph();
    if (!sceneGraph) return null;
    const moment = getMoment();
    const shown = shownMoment(sceneGraph, node, moment);
    if (!shown) return null;
    return frameAt(node.videoId, shown.seconds, shown.inView && moment.playing);
  };
}

/**
 * Whether the layers selected are all video layers showing nothing now:
 * outside their clips (and not holding their last frames) in the timeline
 * in view. Their box is drawn faintly, as the layers aren't to be seen.
 */
export function selectionShowsNothing(
  sceneGraph: Pick<SceneGraph, 'getNode'>,
  ids: Iterable<string>,
  moment: Omit<CanvasVideoMoment, 'playing'>
): boolean {
  let any = false;
  for (const id of ids) {
    const node = sceneGraph.getNode(id);
    if (node?.type !== 'video' || !node.videoId) return false;
    if (shownMoment(sceneGraph, node, moment) !== null) return false;
    any = true;
  }
  return any;
}
