/**
 * Render an animation range and encode it as video: H.264 in MP4, or VP9
 * (VP8 where VP9 can't be encoded) in WebM — which can keep transparency.
 * The sounds on the timeline go with it: AAC (or Opus) in MP4, Opus in WebM.
 */

import type { Color, Sound } from '@quar/types';
import { DEFAULT_DOCUMENT_BACKGROUND } from '@quar/core';
import type { FrameRenderContext, FrameSlide } from './frameRenderer';
import { createFrameRenderer, framePlan, getFrameCount, preloadShots } from './frameRenderer';
import type { PlaybackTiming } from './exportUtils';
import {
  SOUNDTRACK_RATE,
  mixSoundtrack,
  slideSoundtrackParts,
  soundtrackPlays,
} from './soundtrack';
import { createShotRenderer } from './slideTransition';
import { hasTransitions } from './exportUtils';
import type { SoundDecoder, SoundtrackPart } from './soundtrack';
import { createExportVideoFrames, type VideoExportSources } from './video/exportFrames';
import type { ExportProgress } from './index';

export type VideoFormat = 'mp4' | 'webm';

/**
 * `fps` (default: the timeline's) and `speed` set the video's frame rate and
 * pace; video layers show their exact frames, decoded from `videoFile`.
 */
export interface VideoExportOptions extends PlaybackTiming, VideoExportSources {
  width: number;
  height: number;
  /** What shows where nothing is drawn: the document background. */
  backgroundColor?: Color;
  /** WebM only: nothing behind the artwork, kept as the video's alpha. */
  transparent?: boolean;
  /**
   * One video of these slides, each its whole timeline (the range is then
   * theirs), with the transitions into them between
   */
  slides?: FrameSlide[];
  /** The document's sounds: the video has the sound of the clips it plays (none without) */
  sounds?: readonly Sound[];
  /**
   * Decodes a sound, or gives its rendition at a clip's speed (the editor
   * has them made); they're decoded and made here otherwise
   */
  decodeSound?: SoundDecoder;
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
  if (!options.slides?.length && getFrameCount(startFrame, endFrame) === 0) {
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
    AudioBufferSource,
    canEncodeVideo,
    getFirstEncodableAudioCodec,
    getFirstEncodableVideoCodec,
  } = await import('mediabunny');
  const { fps, shots } = framePlan(ctx, options);
  const frameCount = shots.length;
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
  // Each frame's video pictures, decoded before it's drawn
  const videoFrames = createExportVideoFrames(shots, { width, height }, options);
  const renderer = createFrameRenderer({
    width,
    height,
    backgroundColor,
    videoFrames: videoFrames.provider,
  });
  let output: InstanceType<typeof Output> | null = null;
  let source: InstanceType<typeof CanvasSource> | null = null;
  let finalized = false;

  try {
    await preloadShots(renderer, shots);
    if (isCancelled()) return null;

    // The clips each stretch of the video plays: the range's, or each slide's from where it starts
    const parts: SoundtrackPart[] = options.slides?.length
      ? slideSoundtrackParts(options.slides, shots, fps)
      : [{ clips: ctx.timeline?.sounds, at: 0, startFrame, endFrame }];
    const soundtrack = options.sounds?.length
      ? await mixSoundtrack(
          soundtrackPlays(parts, options.frameRate, options.speed),
          options.sounds,
          frameCount / fps,
          options.decodeSound
        )
      : null;
    // Mixing takes a moment: it may have been called off meanwhile
    if (soundtrack && isCancelled()) return null;
    const audioCodec = soundtrack
      ? await getFirstEncodableAudioCodec(format === 'mp4' ? ['aac', 'opus'] : ['opus', 'vorbis'], {
          numberOfChannels: 2,
          sampleRate: SOUNDTRACK_RATE,
          quality,
        })
      : null;
    if (soundtrack && !audioCodec) {
      throw new Error(
        'This browser can’t encode the video’s sound. Turn Sound off to export the video without it.'
      );
    }

    // Transitions are drawn on a canvas of their own: then every frame is, the video's one source
    const draw = createShotRenderer(renderer, {
      background: backgroundColor,
      fixed: hasTransitions(shots),
    });
    await videoFrames.prepare(0);
    const canvas = draw.render(shots[0]!);
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
    const audio =
      soundtrack && audioCodec ? new AudioBufferSource({ codec: audioCodec, quality }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    if (audio && soundtrack) {
      await audio.add(soundtrack);
      audio.close();
    }

    for (let i = 0; i < frameCount; i++) {
      if (i > 0) await videoFrames.prepare(i);
      if (isCancelled()) {
        source.close();
        await output.cancel();
        return null;
      }
      if (i > 0) draw.render(shots[i]!);
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
    videoFrames.dispose();
    source?.close();
    renderer.dispose();
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
