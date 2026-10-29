/**
 * Video Frames
 * The pictures of the document's videos, decoded from their files
 * (services/videoFiles) as the canvas asks for them: the exact frame when
 * it's decoded, meanwhile the nearest one decoded or the video's strip
 * still, whichever is nearer the moment, decoding ahead while it plays and
 * seeking when the playhead jumps (a frame source per video, from
 * @quar/export).
 */

import { createVideoFrameSource, stillIndexAt } from '@quar/export';
import type { FramePick, VideoFrameSource } from '@quar/export';
import type { VideoFrameImage } from '@quar/core';
import type { VideoStrip } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { onVideoFileLetGo, videoFile } from './videoFiles';

/** Each video's frame source, and the file it decodes */
const decoders = new Map<string, { file: Blob; source: VideoFrameSource }>();

/** Each video's strip stills, loaded as pictures the first time they're wanted */
const strips = new Map<
  string,
  { strip: VideoStrip; loaded: Map<number, HTMLImageElement>; asked: Set<number> }
>();

/** How far either side of the still wanted a loaded one is looked for */
const STILL_REACH = 8;

function sourceFor(videoId: string): VideoFrameSource | null {
  const file = videoFile(videoId);
  let decoder = decoders.get(videoId);
  // Another file in its place (a project opened again): decoded afresh
  if (decoder && decoder.file !== file) {
    decoder.source.dispose();
    decoders.delete(videoId);
    decoder = undefined;
  }
  if (!decoder && file) {
    decoder = { file, source: createVideoFrameSource(file) };
    // A video that can't be opened shows its strip: nothing to report on every frame
    decoder.source.ready.catch(() => {});
    decoders.set(videoId, decoder);
  }
  return decoder?.source ?? null;
}

/** The loaded still of a video's strip nearest a moment, loading the one there. */
function stillAt(
  videoId: string,
  seconds: number
): { image: HTMLImageElement; index: number; distance: number } | null {
  const strip = useEditorStore.getState().videos.find((video) => video.id === videoId)?.strip;
  if (!strip || strip.frames.length === 0) return null;
  let stills = strips.get(videoId);
  if (!stills || stills.strip !== strip) {
    stills = { strip, loaded: new Map(), asked: new Set() };
    strips.set(videoId, stills);
  }
  const index = stillIndexAt(strip, seconds);
  if (!stills.asked.has(index)) {
    stills.asked.add(index);
    const image = new Image();
    image.decoding = 'async';
    const loaded = stills.loaded;
    image.onload = () => loaded.set(index, image);
    image.src = strip.frames[index] ?? '';
  }
  for (let reach = 0; reach <= STILL_REACH; reach++) {
    for (const at of reach === 0 ? [index] : [index - reach, index + reach]) {
      const image = stills.loaded.get(at);
      if (image) return { image, index: at, distance: Math.abs(at / strip.rate - seconds) };
    }
  }
  return null;
}

const decodedImage = (videoId: string, pick: FramePick): VideoFrameImage => ({
  source: pick.frame.canvas,
  key: `${videoId}:${pick.frame.key}`,
});

/**
 * The picture of a video at `seconds`, as far as it's decoded (null while
 * nothing of it is). Asking for a moment not decoded yet starts decoding
 * it; the canvas, drawing every animation frame, shows it when it comes.
 * `playing` says the moments asked for run on, so it can decode ahead.
 */
export function videoFrameAt(
  videoId: string,
  seconds: number,
  playing = false
): VideoFrameImage | null {
  const decoded = sourceFor(videoId)?.frameAt(seconds, playing) ?? null;
  if (decoded && decoded.distance === 0) return decodedImage(videoId, decoded);
  const still = stillAt(videoId, seconds);
  if (still && (!decoded || still.distance < decoded.distance)) {
    return { source: still.image, key: `${videoId}:still${still.index}` };
  }
  return decoded ? decodedImage(videoId, decoded) : null;
}

/** Stop decoding a video and let go of its decoded frames (it's gone from the document). */
export function releaseVideoFrames(videoId: string): void {
  decoders.get(videoId)?.source.dispose();
  decoders.delete(videoId);
  strips.delete(videoId);
}

// A video whose file the document lets go (a project closed) is decoded no more
onVideoFileLetGo(releaseVideoFrames);
