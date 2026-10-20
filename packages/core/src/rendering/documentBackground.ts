/**
 * Document Background for Quar Animator
 * The color behind everything on the canvas, and the grid drawn on it.
 */

import type { Color } from '@quar/types';
import type { GridConfig } from './Grid';

/** The canvas color a new document starts with (#1A1A1A). */
export const DEFAULT_DOCUMENT_BACKGROUND: Color = { r: 26, g: 26, b: 26, a: 1 };

/** A color as WebGL takes it: each channel 0–1. */
export function toGlColor(color: Color): [number, number, number, number] {
  return [color.r / 255, color.g / 255, color.b / 255, color.a];
}

/**
 * Grid line colors that read on a background: a step, two and four lighter
 * on a dark one (the default grid on #1A1A1A), darker on a light one.
 */
export function gridColorsFor(
  background: Color
): Pick<GridConfig, 'minorColor' | 'majorColor' | 'axisColor'> {
  const [r, g, b] = toGlColor(background);
  const light = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5;
  const step = (amount: number): [number, number, number, number] => {
    const toward = light ? 0 : 1;
    const mix = (channel: number) => channel + (toward - channel) * amount;
    return [mix(r), mix(g), mix(b), 1];
  };
  return { minorColor: step(0.054), majorColor: step(0.109), axisColor: step(0.22) };
}
