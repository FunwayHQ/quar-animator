/**
 * Video Stills
 * The stills the exports that can't play video (Lottie, SVG, PDF) show of
 * the document's video layers: each layer's picture at the moment it's at,
 * decoded from its video's file (services/videoFiles) — or, where there's
 * no file or it won't decode, its strip's nearest still.
 */

import type { SceneGraph } from '@quar/core';
import { videoMoments, videoStillsAt } from '@quar/export';
import type { VideoMoment, VideoStillLoader } from '@quar/export';
import type { Node } from '@quar/types';

import { shownMoment } from '../components/canvas/canvasVideoFrames';
import { useEditorStore } from '../stores/editorStore';
import { videoFile } from './videoFiles';

/** The stills' longest side at most, in pixels (a video smaller stays its own size) */
const STILL_SIZE = 1920;

export const loadVideoStills: VideoStillLoader = async (moments) => {
  const stills = new Map<string, string>();
  const byVideo = new Map<string, VideoMoment[]>();
  for (const moment of moments) {
    byVideo.set(moment.videoId, [...(byVideo.get(moment.videoId) ?? []), moment]);
  }
  const { videos } = useEditorStore.getState();
  for (const [videoId, asked] of byVideo) {
    const video = videos.find((entry) => entry.id === videoId);
    if (!video) continue;
    // Each moment decoded once, however many layers show it
    const seconds = [...new Set(asked.map((moment) => moment.seconds))];
    const found = await videoStillsAt(
      { file: videoFile(videoId), strip: video.strip, hasAlpha: video.hasAlpha },
      seconds,
      { maxSize: STILL_SIZE }
    );
    for (const moment of asked) {
      const still = found[seconds.indexOf(moment.seconds)];
      if (still) stills.set(moment.nodeId, still);
    }
  }
  return stills;
};

/**
 * The moment each video layer among `nodes` (and in them) shows on the
 * canvas now — of the timeline in view, its playhead's (none outside its
 * clip); of another timeline, its clip's first — for an export of what's
 * on the canvas (Export Selection as SVG).
 */
export function canvasVideoMoments(sceneGraph: SceneGraph, nodes: Node[]): VideoMoment[] {
  const { timelineScope, currentFrame, frameRate } = useEditorStore.getState();
  const moment = { scope: timelineScope, frame: currentFrame, frameRate };
  return videoMoments(
    nodes,
    (id) => sceneGraph.getNode(id),
    (node) => shownMoment(sceneGraph, node, moment)?.seconds ?? null
  );
}
