/**
 * Video Frames
 * The pictures of the document's videos, decoded from their files
 * (services/videoFiles) as the canvas asks for them: the exact frame when
 * it's decoded, meanwhile the nearest one decoded or the video's strip
 * still, decoding ahead while it plays and seeking when the playhead jumps.
 *
 * (Step 1 foundation: the canvas draws through `videoFrameAt`; the decoding
 * behind it comes with the import.)
 */

import type { VideoFrameImage } from '@quar/core';

/**
 * The picture of a video at `seconds`, as far as it's decoded (null while
 * nothing of it is). Asking for a moment not decoded yet starts decoding
 * it; the canvas, drawing every animation frame, shows it when it comes.
 * `playing` says the moments asked for run on, so it can decode ahead.
 */
export function videoFrameAt(
  _videoId: string,
  _seconds: number,
  _playing = false
): VideoFrameImage | null {
  return null;
}

/** Stop decoding a video and let go of its decoded frames (it's gone from the document). */
export function releaseVideoFrames(_videoId: string): void {}
