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
