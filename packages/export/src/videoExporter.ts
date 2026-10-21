/**
 * Render an animation range and encode it as video: H.264 in MP4, or VP9
 * (VP8 where VP9 can't be encoded) in WebM — which can keep transparency.
 */

import type { Color } from '@quar/types';
import { DEFAULT_DOCUMENT_BACKGROUND } from '@quar/core';
import type { FrameRenderContext } from './frameRenderer';
import { createFrameRenderer, getFrameCount, getFrameRenderRoots } from './frameRenderer';
import { sampleTimeline, type PlaybackTiming } from './exportUtils';
import type { ExportProgress } from './index';

export type VideoFormat = 'mp4' | 'webm';

/** `fps` (default: the timeline's) and `speed` set the video's frame rate and pace. */
export interface VideoExportOptions extends PlaybackTiming {
  width: number;
  height: number;
  /** What shows where nothing is drawn: the document background. */
  backgroundColor?: Color;
  /** WebM only: nothing behind the artwork, kept as the video's alpha. */
  transparent?: boolean;
}

export type Mp4ExportOptions = Omit<VideoExportOptions, 'transparent'>;

type ProgressCallback = (progress: ExportProgress) => void;

export function exportMp4(
  ctx: FrameRenderContext,
  options: Mp4ExportOptions,
  onProgress?: ProgressCallback,
  isCancelled?: () => boolean
): Promise<Blob | null> {
  return exportVideo('mp4', ctx, options, onProgress, isCancelled);
}

export function exportWebm(
  ctx: FrameRenderContext,
  options: VideoExportOptions,
  onProgress?: ProgressCallback,
  isCancelled?: () => boolean
): Promise<Blob | null> {
  return exportVideo('webm', ctx, options, onProgress, isCancelled);
}

export async function exportVideo(
  format: VideoFormat,
  ctx: FrameRenderContext,
  options: VideoExportOptions,
  onProgress?: ProgressCallback,
  isCancelled: () => boolean = () => false
): Promise<Blob | null> {
  const { width, height, startFrame, endFrame } = options;
  if (getFrameCount(startFrame, endFrame) === 0) {
    throw new Error('Choose a valid frame range to export.');
  }
  if (width < 1 || height < 1) throw new Error('Export width and height must be at least 1 pixel.');
  if (format === 'mp4' && (width % 2 !== 0 || height % 2 !== 0)) {
    throw new Error('MP4 export requires even width and height values for H.264 encoding.');
  }

  const {
    BufferTarget,
    CanvasSource,
    Mp4OutputFormat,
    WebMOutputFormat,
    Output,
    Quality,
    canEncodeVideo,
    getFirstEncodableVideoCodec,
  } = await import('mediabunny');
  const { fps, frames } = sampleTimeline(options);
  const frameCount = frames.length;
  const quality = new Quality('high');
  const codecOptions = { width, height, frameRate: fps, quality };
  const codec =
    format === 'mp4'
      ? (await canEncodeVideo('avc', codecOptions))
        ? 'avc'
        : null
      : await getFirstEncodableVideoCodec(['vp9', 'vp8'], codecOptions);
  if (!codec) {
    throw new Error(
      format === 'mp4'
        ? 'This browser or device does not support H.264 MP4 encoding. Try a browser with WebCodecs AVC support.'
        : 'This browser or device can’t encode WebM video (VP9 or VP8). Try a browser with WebCodecs VP9 support.'
    );
  }

  // A transparent WebM keeps the empty canvas as its alpha; otherwise the
  // frames sit on the document background
  const transparent = format === 'webm' && options.transparent === true;
  const backgroundColor: Color | null = transparent
    ? null
    : { ...(options.backgroundColor ?? DEFAULT_DOCUMENT_BACKGROUND), a: 1 };
  const renderer = createFrameRenderer({ width, height, backgroundColor });
  let output: InstanceType<typeof Output> | null = null;
  let source: InstanceType<typeof CanvasSource> | null = null;
  let finalized = false;

  try {
    await renderer.preloadTextures(getFrameRenderRoots(ctx), ctx.sceneGraph, ctx.symbols);
    if (isCancelled()) return null;

    const canvas = renderer.renderFrame(ctx, frames[0]!);
    const target = new BufferTarget();
    output = new Output({
      format:
        format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
      target,
    });
    source = new CanvasSource(canvas, {
      codec,
      quality,
      alpha: transparent ? 'keep' : 'discard',
    });
    output.addVideoTrack(source, { frameRate: fps });
    await output.start();

    for (let i = 0; i < frameCount; i++) {
      if (isCancelled()) {
        source.close();
        await output.cancel();
        return null;
      }
      if (i > 0) renderer.renderFrame(ctx, frames[i]!);
      await source.add(i / fps, 1 / fps);
      onProgress?.({
        phase: 'rendering',
        current: i + 1,
        total: frameCount,
        percentage: Math.round(((i + 1) / frameCount) * 90),
      });
      await yieldToBrowser();
    }

    source.close();
    if (isCancelled()) {
      await output.cancel();
      return null;
    }
    onProgress?.({ phase: 'finalizing', current: frameCount, total: frameCount, percentage: 95 });
    await output.finalize();
    finalized = true;
    const buffer = target.buffer;
    if (!buffer) {
      throw new Error(
        `The ${format === 'mp4' ? 'MP4' : 'WebM'} encoder finished without producing a video file.`
      );
    }
    onProgress?.({ phase: 'finalizing', current: frameCount, total: frameCount, percentage: 100 });
    return new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
  } catch (error) {
    if (output && !finalized && (output.state === 'pending' || output.state === 'started')) {
      await output.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    source?.close();
    renderer.dispose();
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
