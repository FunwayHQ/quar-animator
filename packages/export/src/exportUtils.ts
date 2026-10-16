/**
 * Export Utilities
 *
 * Pure utility functions used across export modules.
 * No DOM or WebGL dependencies.
 */

/**
 * Get the number of frames in a range (inclusive).
 */
export function getFrameCount(startFrame: number, endFrame: number): number {
  return Math.max(0, endFrame - startFrame + 1);
}

export interface PlaybackTiming {
  /** The timeline's frame rate. */
  frameRate: number;
  startFrame: number;
  endFrame: number;
  /** Frames per second in the output (default: the timeline's). */
  fps?: number;
  /** Playback speed: 2 plays twice as fast, 0.5 at half speed. */
  speed?: number;
}

/**
 * The output frame rate (at most `maxFps`) and the timeline frame — possibly
 * between two — each output frame shows when the range plays at `speed`.
 * A lower rate keeps the duration with fewer frames; rates that don't divide
 * the timeline's show the in-between moments.
 */
export function sampleTimeline(
  options: PlaybackTiming,
  maxFps = Infinity
): { fps: number; frames: number[] } {
  const { startFrame, endFrame } = options;
  const rate = Math.max(1, options.frameRate);
  const fps = Math.min(maxFps, Math.max(1, options.fps ?? rate));
  const speed = options.speed !== undefined && options.speed > 0 ? options.speed : 1;
  const seconds = getFrameCount(startFrame, endFrame) / rate / speed;
  const count = Math.max(1, Math.round(seconds * fps));
  const step = (rate * speed) / fps;
  return {
    fps,
    frames: Array.from({ length: count }, (_, k) => Math.min(endFrame, startFrame + k * step)),
  };
}

/**
 * Generate filenames for a frame sequence.
 *
 * Pattern supports {N} placeholder for frame number (zero-padded).
 */
export function generateFrameFilenames(
  pattern: string,
  startFrame: number,
  endFrame: number,
  extension: string
): string[] {
  const count = getFrameCount(startFrame, endFrame);
  const padLength = String(endFrame).length;
  const names: string[] = [];

  for (let i = 0; i < count; i++) {
    const frame = startFrame + i;
    const paddedFrame = String(frame).padStart(padLength, '0');
    const base = pattern.includes('{N}')
      ? pattern.replace('{N}', paddedFrame)
      : count > 1
        ? `${pattern}_${paddedFrame}`
        : pattern;
    const filename = base + '.' + extension;
    names.push(filename);
  }

  return names;
}
