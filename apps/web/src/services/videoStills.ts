/**
 * Video Stills
 * The stills the exports that can't play video (Lottie, SVG, PDF) show of
 * the document's video layers: each layer's picture at the moment it's at,
 * decoded from its video's file (services/videoFiles) — or, where there's
 * no file or it won't decode, its strip's nearest still.
 */

import { videoStillsAt } from '@quar/export';
import type { VideoMoment, VideoStillLoader } from '@quar/export';

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
