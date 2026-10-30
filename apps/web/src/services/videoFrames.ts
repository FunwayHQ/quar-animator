/**
 * Video Frames
 * The pictures of the document's videos, decoded from their files
 * (services/videoFiles) as the canvas asks for them: the exact frame when
 * it's decoded, meanwhile the nearest one decoded or the video's strip
 * still, whichever is nearer the moment, decoding ahead while it plays and
 * seeking when the playhead jumps (frame sources from @quar/export: one for
 * each moment the layers showing a video are at). The canvas has one set
 * of them; the presentation player another of its own (createVideoFrames),
 * so neither seeks the other's readers to its moments.
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

/** Readers of one video, at most */
const MAX_READERS = 3;
/** A moment this near the one a reader was last asked for goes on with it, in seconds */
const READER_SPAN = 1;
/** A reader not asked of for this long goes (the first one stays), in ms */
const READER_IDLE = 3000;
/** A video none of whose readers is asked of for this long has them all go, in ms */
const VIDEO_IDLE = 10_000;
/** How far either side of the still wanted a loaded one is looked for */
const STILL_REACH = 8;
/** How often waiting for a frame looks whether it's decoded, in ms */
const DECODED_POLL = 30;
let nextSerial = 1;

/** A video's picture at a moment, and whether it's that moment's (else the nearest there is, for now). */
export interface VideoFramePick {
  image: VideoFrameImage | null;
  exact: boolean;
}

export interface VideoFrames {
  /**
   * The picture of a video at `seconds`, as far as it's decoded (null while
   * nothing of it is). Asking for a moment not decoded yet starts decoding
   * it; whoever draws every animation frame shows it when it comes.
   * `playing` says the moments asked for run on, so it can decode ahead.
   */
  frameAt(videoId: string, seconds: number, playing?: boolean): VideoFrameImage | null;
  /** The same, saying whether it's the exact picture yet. */
  pick(videoId: string, seconds: number, playing?: boolean): VideoFramePick;
  /**
   * Decodes the picture at `seconds` ahead of its showing: true once it's
   * in, false when it can't be (no file, a video that won't open) or isn't
   * within `timeout` ms.
   */
  decode(videoId: string, seconds: number, timeout: number): Promise<boolean>;
  /** Stop decoding a video and let go of its decoded frames (it's gone from the document). */
  release(videoId: string): void;
  /** Stop decoding every video. */
  dispose(): void;
}

function newReader(file: Blob): Reader {
  const source = createVideoFrameSource(file);
  // A video that can't be opened shows its strip: nothing to report on every frame
  source.ready.catch(() => {});
  return { serial: nextSerial++, source, at: Number.NaN, used: 0 };
}

/** A set of readers and strip stills of the document's videos. */
export function createVideoFrames(): VideoFrames {
  /** Each video's readers, and the file they decode */
  const decoders = new Map<string, { file: Blob; readers: Reader[] }>();
  /** The readers asked of in this drawing, which asks once for each layer */
  const askedThisPass = new Set<Reader>();
  /** Each video's strip stills, loaded as pictures the first time they're wanted */
  const strips = new Map<
    string,
    { strip: VideoStrip; loaded: Map<number, HTMLImageElement>; asked: Set<number> }
  >();

  function markAsked(reader: Reader): void {
    if (askedThisPass.size === 0) queueMicrotask(() => askedThisPass.clear());
    askedThisPass.add(reader);
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
      release(videoId);
      decoder = undefined;
    }
    if (!file) return null;
    if (!decoder) {
      decoder = { file, readers: [] };
      decoders.set(videoId, decoder);
    }
    const now = Date.now();
    // Other videos nobody's drawn for a while (their layers deleted, or
    // hidden) let their decoders go: each holds a decoder and its pictures
    for (const [otherId, other] of decoders) {
      if (otherId !== videoId && other.readers.every((r) => now - r.used > VIDEO_IDLE)) {
        for (const reader of other.readers) reader.source.dispose();
        decoders.delete(otherId);
      }
    }
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

  function pick(videoId: string, seconds: number, playing = false): VideoFramePick {
    const reader = readerFor(videoId, seconds);
    const decoded = reader?.source.frameAt(seconds, playing) ?? null;
    if (reader && decoded && decoded.distance === 0) {
      return { image: decodedImage(videoId, reader, decoded), exact: true };
    }
    const still = stillAt(videoId, seconds);
    if (still && (!decoded || still.distance < decoded.distance)) {
      return {
        image: { source: still.image, key: `${videoId}:still${still.index}` },
        exact: false,
      };
    }
    return {
      image: reader && decoded ? decodedImage(videoId, reader, decoded) : null,
      exact: false,
    };
  }

  function decode(videoId: string, seconds: number, timeout: number): Promise<boolean> {
    const reader = readerFor(videoId, seconds);
    if (!reader) return Promise.resolve(false);
    const until = Date.now() + Math.max(0, timeout);
    return new Promise((resolve) => {
      const look = () => {
        // Kept from going idle while it's waited for
        reader.used = Date.now();
        if (reader.source.frameAt(seconds)?.distance === 0) resolve(true);
        else if (Date.now() >= until) resolve(false);
        else setTimeout(look, DECODED_POLL);
      };
      reader.source.ready.then(look, () => resolve(false));
    });
  }

  function release(videoId: string): void {
    for (const reader of decoders.get(videoId)?.readers ?? []) reader.source.dispose();
    decoders.delete(videoId);
    strips.delete(videoId);
  }

  return {
    pick,
    frameAt: (videoId, seconds, playing) => pick(videoId, seconds, playing).image,
    decode,
    release,
    dispose() {
      for (const videoId of [...decoders.keys()]) release(videoId);
      strips.clear();
    },
  };
}

/** The canvas's */
const canvasFrames = createVideoFrames();

/** The picture of a video at `seconds` for the canvas, as far as it's decoded (see VideoFrames.frameAt). */
export function videoFrameAt(
  videoId: string,
  seconds: number,
  playing = false
): VideoFrameImage | null {
  return canvasFrames.frameAt(videoId, seconds, playing);
}

/** Stop decoding a video for the canvas and let go of its decoded frames (it's gone from the document). */
export function releaseVideoFrames(videoId: string): void {
  canvasFrames.release(videoId);
}

// A video whose file the document lets go (a project closed) is decoded no more
onVideoFileLetGo(releaseVideoFrames);
