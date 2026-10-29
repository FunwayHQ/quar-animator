/**
 * Reading video files with mediabunny (the export's muxer, which demuxes
 * and decodes too), loaded only when a video is first read: it isn't part
 * of the editor's first load. A GIF is read by a decoder of its own
 * (gifMedia.ts) behind the same shapes: a track, and sinks drawing its
 * pictures into canvases.
 */

import type { CanvasSinkOptions, Input, InputVideoTrack, WrappedCanvas } from 'mediabunny';
import { GIF_TYPE } from './gif';
import { openGifMedia } from './gifMedia';

export type Mediabunny = typeof import('mediabunny');

export function loadMediabunny(): Promise<Mediabunny> {
  return import('mediabunny');
}

/** A video file opened for reading (any container mediabunny knows); dispose it when done. */
export async function openMedia(file: Blob): Promise<{ mb: Mediabunny; input: Input }> {
  const mb = await loadMediabunny();
  return { mb, input: new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS }) };
}

/** A file's video track, or an error saying there's none (a file that was probed has one). */
export async function videoTrackOf(input: Input): Promise<InputVideoTrack> {
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The file has no video track.');
  return track;
}

/** What's asked of a video's track: its pictures' size, where they are in its time, whether they may be transparent. */
export type VideoTrackInfo = Pick<
  InputVideoTrack,
  | 'getDisplayWidth'
  | 'getDisplayHeight'
  | 'getFirstTimestamp'
  | 'computeDuration'
  | 'canBeTransparent'
>;

/**
 * Draws a video's pictures into canvases, as mediabunny's CanvasSink does:
 * the picture showing at a moment (none before the first), on from a
 * moment, or at each of many; a pool's canvases drawn over in turn.
 */
export interface FrameSink {
  getCanvas(timestamp: number): Promise<WrappedCanvas | null>;
  canvases(
    startTimestamp?: number,
    endTimestamp?: number
  ): AsyncGenerator<WrappedCanvas, void, unknown>;
  canvasesAtTimestamps(
    timestamps: Iterable<number>
  ): AsyncGenerator<WrappedCanvas | null, void, unknown>;
}

export type FrameSinkOptions = Pick<CanvasSinkOptions, 'width' | 'height' | 'alpha' | 'poolSize'>;

/** A video file opened to decode its pictures; dispose it when done. */
export interface VideoMedia {
  track: VideoTrackInfo;
  /** Draws its pictures (at the size asked, its shape kept where only one side is) */
  canvasSink(options: FrameSinkOptions): FrameSink;
  dispose(): void;
}

/**
 * A video file opened to decode its pictures: a GIF (by its type) with
 * the GIF decoder, any other through mediabunny — an error where it has
 * no pictures to decode.
 */
export async function openVideoMedia(file: Blob): Promise<VideoMedia> {
  if (file.type === GIF_TYPE) return openGifMedia(file);
  const { mb, input } = await openMedia(file);
  try {
    const track = await videoTrackOf(input);
    return {
      track,
      canvasSink: (options) => new mb.CanvasSink(track, options),
      dispose: () => input.dispose(),
    };
  } catch (error) {
    input.dispose();
    throw error;
  }
}
