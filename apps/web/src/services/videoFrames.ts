/**
 * Video Frames
 * The pictures of the document's videos, decoded from their files
 * (services/videoFiles) as the canvas asks for them: the exact frame when
 * it's decoded, meanwhile the nearest one decoded or the video's strip
 * still, whichever is nearer the moment, decoding ahead while it plays and
 * seeking when the playhead jumps (frame sources from @quar/export: one for
 * each moment the layers showing a video are at).
 */

import { createVideoFrameSource, stillIndexAt } from '@quar/export';
import type { FramePick, VideoFrameSource } from '@quar/export';
import type { VideoFrameImage } from '@quar/core';
import type { VideoStrip } from '@quar/types';

import { useEditorStore } from '../stores/editorStore';
import { onVideoFileLetGo, videoFile } from './videoFiles';

/**
 * A frame source of a video, and the moment last asked of it. Each layer
 * showing a video at a moment of its own (one playing it, another showing
 * its first picture on another timeline) is read by a reader of its own,
 * so none of them seeks back and forth between the moments.
 */
interface Reader {
  /** Keys its pictures apart from other readers' */
  serial: number;
  source: VideoFrameSource;
  at: number;
  /** When it was last asked, in ms */
  used: number;
}

/** Each video's readers, and the file they decode */
const decoders = new Map<string, { file: Blob; readers: Reader[] }>();

/** Readers of one video, at most */
const MAX_READERS = 3;
/** A moment this near the one a reader was last asked for goes on with it, in seconds */
const READER_SPAN = 1;
/** A reader not asked of for this long goes (the first one stays), in ms */
const READER_IDLE = 3000;
let nextSerial = 1;

/** The readers asked of in this drawing of the canvas, which asks once for each layer */
const askedThisPass = new Set<Reader>();

function markAsked(reader: Reader): void {
  if (askedThisPass.size === 0) queueMicrotask(() => askedThisPass.clear());
  askedThisPass.add(reader);
}

function newReader(file: Blob): Reader {
  const source = createVideoFrameSource(file);
  // A video that can't be opened shows its strip: nothing to report on every frame
  source.ready.catch(() => {});
  return { serial: nextSerial++, source, at: Number.NaN, used: 0 };
}

/**
 * The reader to ask for a moment of a video: one at that moment already,
 * else the nearest nearby that no other layer has asked this time, else any
 * free one (the playhead jumped), else a new one.
 */
function readerFor(videoId: string, seconds: number): Reader | null {
  const file = videoFile(videoId);
  // Another file in its place (a project opened again): decoded afresh
  let decoder = decoders.get(videoId);
  if (decoder && decoder.file !== file) {
    releaseVideoFrames(videoId);
    decoder = undefined;
  }
  if (!file) return null;
  if (!decoder) {
    decoder = { file, readers: [] };
    decoders.set(videoId, decoder);
  }
  const now = Date.now();
  decoder.readers = decoder.readers.filter((reader, index) => {
    const idle = index > 0 && now - reader.used > READER_IDLE;
    if (idle) reader.source.dispose();
    return !idle;
  });
  const { readers } = decoder;
  const distance = (reader: Reader) => Math.abs(reader.at - seconds);
  const nearest = (among: Reader[]) =>
    among.reduce<Reader | undefined>(
      (best, reader) => (!best || distance(reader) < distance(best) ? reader : best),
      undefined
    );
  const free = readers.filter((reader) => !askedThisPass.has(reader));
  let reader =
    readers.find((candidate) => distance(candidate) < 1e-6) ??
    nearest(free.filter((candidate) => distance(candidate) <= READER_SPAN)) ??
    free.reduce<Reader | undefined>(
      (oldest, candidate) => (!oldest || candidate.used < oldest.used ? candidate : oldest),
      undefined
    );
  if (!reader && readers.length < MAX_READERS) {
    reader = newReader(file);
    readers.push(reader);
  }
  reader ??= nearest(readers);
  if (!reader) return null;
  reader.at = seconds;
  reader.used = now;
  markAsked(reader);
  return reader;
}

/** Each video's strip stills, loaded as pictures the first time they're wanted */
const strips = new Map<
  string,
  { strip: VideoStrip; loaded: Map<number, HTMLImageElement>; asked: Set<number> }
>();

/** How far either side of the still wanted a loaded one is looked for */
const STILL_REACH = 8;

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

const decodedImage = (videoId: string, reader: Reader, pick: FramePick): VideoFrameImage => ({
  source: pick.frame.canvas,
  key: `${videoId}:r${reader.serial}:${pick.frame.key}`,
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
  const reader = readerFor(videoId, seconds);
  const decoded = reader?.source.frameAt(seconds, playing) ?? null;
  if (reader && decoded && decoded.distance === 0) return decodedImage(videoId, reader, decoded);
  const still = stillAt(videoId, seconds);
  if (still && (!decoded || still.distance < decoded.distance)) {
    return { source: still.image, key: `${videoId}:still${still.index}` };
  }
  return reader && decoded ? decodedImage(videoId, reader, decoded) : null;
}

/** Stop decoding a video and let go of its decoded frames (it's gone from the document). */
export function releaseVideoFrames(videoId: string): void {
  for (const reader of decoders.get(videoId)?.readers ?? []) reader.source.dispose();
  decoders.delete(videoId);
  strips.delete(videoId);
}

// A video whose file the document lets go (a project closed) is decoded no more
onVideoFileLetGo(releaseVideoFrames);
