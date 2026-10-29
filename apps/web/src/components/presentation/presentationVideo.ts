/**
 * Video layers in the presentation: each plays in step with its slide's
 * timeline — the frame the player draws is the moment of its clip shown —
 * decoded by frame readers of the player's own (not the canvas's, which
 * would seek between the two); and the first picture each shows, decoded
 * before the show starts.
 */

import { videoTimeAt } from '@quar/animation';
import type { SceneGraph, VideoFrameImage } from '@quar/core';
import { videoMoments } from '@quar/export';
import type { Node, VideoNode } from '@quar/types';

import type { VideoFrames } from '../../services/videoFrames';

/** A picture to have decoded before the show starts: a video at a moment. */
export interface FirstPicture {
  videoId: string;
  seconds: number;
}

/**
 * The first picture each visible video layer of the slides shows: the one
 * at its slide's start, or — its clip starting later — the clip's first.
 * None for a clip that starts after its slide ends. Each once.
 */
export function firstPictures(
  scene: SceneGraph,
  slides: Array<{ node: Node; frameCount: number }>,
  frameRate: number
): FirstPicture[] {
  const pictures = new Map<string, FirstPicture>();
  for (const slide of slides) {
    const moments = videoMoments(
      [slide.node],
      (id) => scene.getNode(id),
      ({ clip }) =>
        clip.start > slide.frameCount - 1
          ? null
          : videoTimeAt(clip, Math.max(0, clip.start), frameRate)
    );
    for (const { videoId, seconds } of moments) {
      pictures.set(`${videoId}@${seconds}`, { videoId, seconds });
    }
  }
  return [...pictures.values()];
}

/** How the player is drawing: its slide playing on (else held), and whether a picture drawn wasn't its moment's yet. */
export interface VideoDrawing {
  playing: boolean;
  pending: boolean;
}

/**
 * The pictures video layers show in the player's drawings: each layer's at
 * the moment its clip is at in the frame drawn (nothing outside its clip),
 * decoding on ahead while the slide plays. A picture that isn't the
 * moment's own yet (the strip's, or one near it) sets `pending`, so the
 * frame is drawn again once it's in.
 */
export function presentationVideoFrames(
  frames: Pick<VideoFrames, 'pick'>,
  frameRate: number,
  drawing: VideoDrawing
): (node: VideoNode, frame: number) => VideoFrameImage | null {
  return (node, frame) => {
    if (!node.videoId) return null;
    const seconds = videoTimeAt(node.clip, frame, frameRate);
    if (seconds === null) return null;
    const { image, exact } = frames.pick(node.videoId, seconds, drawing.playing);
    if (!exact) drawing.pending = true;
    return image;
  };
}
