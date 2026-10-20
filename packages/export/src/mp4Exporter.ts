/** Render an animation range and encode it as an H.264 MP4 video. */

import type { Color } from '@quar/types';
import { DEFAULT_DOCUMENT_BACKGROUND } from '@quar/core';
import type { FrameRenderContext } from './frameRenderer';
import { createFrameRenderer, getFrameCount, getFrameRenderRoots } from './frameRenderer';
import { sampleTimeline, type PlaybackTiming } from './exportUtils';
import type { ExportProgress } from './index';

/** `fps` (default: the timeline's) and `speed` set the video's frame rate and pace. */
export interface Mp4ExportOptions extends PlaybackTiming {
  width: number;
  height: number;
  /** What shows where nothing is drawn: the document background. */
  backgroundColor?: Color;
}

export async function exportMp4(
  ctx: FrameRenderContext,
  options: Mp4ExportOptions,
  onProgress?: (progress: ExportProgress) => void,
  isCancelled: () => boolean = () => false
): Promise<Blob | null> {
  const { width, height, startFrame, endFrame } = options;
  if (getFrameCount(startFrame, endFrame) === 0) {
    throw new Error('Choose a valid frame range to export.');
  }
  if (width < 1 || height < 1) throw new Error('Export width and height must be at least 1 pixel.');
  if (width % 2 !== 0 || height % 2 !== 0) {
    throw new Error('MP4 export requires even width and height values for H.264 encoding.');
  }

  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, canEncodeVideo } =
    await import('mediabunny');
  const { fps, frames } = sampleTimeline(options);
  const frameCount = frames.length;
  const quality = new Quality('high');
  const supported = await canEncodeVideo('avc', { width, height, frameRate: fps, quality });
  if (!supported) {
    throw new Error(
      'This browser or device does not support H.264 MP4 encoding. Try a browser with WebCodecs AVC support.'
    );
  }

  // Video has no transparency: the frames sit on the document background
  const backgroundColor: Color = {
    ...(options.backgroundColor ?? DEFAULT_DOCUMENT_BACKGROUND),
    a: 1,
  };
  const renderer = createFrameRenderer({ width, height, backgroundColor });
  let output: InstanceType<typeof Output> | null = null;
  let source: InstanceType<typeof CanvasSource> | null = null;
  let finalized = false;

  try {
    await renderer.preloadTextures(getFrameRenderRoots(ctx), ctx.sceneGraph);
    if (isCancelled()) return null;

    const canvas = renderer.renderFrame(ctx, frames[0]!);
    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    source = new CanvasSource(canvas, { codec: 'avc', quality });
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
    if (!buffer) throw new Error('The MP4 encoder finished without producing a video file.');
    onProgress?.({ phase: 'finalizing', current: frameCount, total: frameCount, percentage: 100 });
    return new Blob([buffer], { type: 'video/mp4' });
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
