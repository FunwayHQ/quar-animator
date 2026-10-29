/**
 * Video Frames
 * What the renderer draws a video layer with: the picture it shows now,
 * given by whoever decodes the video (the app's frame source on the canvas,
 * an export's prepared frames) — the renderer neither decodes nor keeps
 * time.
 */

import type { VideoNode } from '@quar/types';

/** A video layer's picture at the moment it shows. */
export interface VideoFrameImage {
  /** Anything WebGL can upload: a canvas, an ImageBitmap, a VideoFrame */
  source: TexImageSource;
  /** Changes whenever the picture does: a new key uploads the texture again */
  key: string | number;
}

/**
 * The picture each video layer shows now: null where it shows nothing
 * (outside its clip), or while nothing of it is decoded yet.
 */
export type VideoFrameProvider = (node: VideoNode) => VideoFrameImage | null;
