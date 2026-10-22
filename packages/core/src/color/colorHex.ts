/**
 * Colors as hex text ('#RRGGBB'), one way for the whole app (F070).
 *
 * Channels run 0–255, but animation can take them past either end or between
 * whole numbers (an overshooting ease, a tween halfway through), so each one
 * is rounded and clamped before it is written: the text is always a valid
 * '#RRGGBB'.
 */

import type { Color } from '@quar/types';

/** A channel as a whole number 0–255 (NaN counts as 0). */
function channelByte(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.round(Math.min(255, Math.max(0, value)));
}

function channelHex(value: number): string {
  return channelByte(value).toString(16).padStart(2, '0');
}

/** '#RRGGBB', upper case, from 0–255 channels. */
export function rgbToHex(r: number, g: number, b: number): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`.toUpperCase();
}

/** A color as '#RRGGBB', upper case; its alpha is left out. */
export function colorToHex(color: Pick<Color, 'r' | 'g' | 'b'>): string {
  return rgbToHex(color.r, color.g, color.b);
}

/** Six hex digits, or eight with alpha, as a color. */
function colorFromDigits(digits: string): Color {
  const byte = (at: number) => parseInt(digits.slice(at, at + 2), 16);
  return { r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) / 255 : 1 };
}

/**
 * '#RRGGBB' (the '#' optional, either case) as an opaque color; null for
 * anything else. Strict on purpose: color fields read it as it is typed, and
 * a half-typed '#ABC' must not turn into '#AABBCC'.
 */
export function hexToColor(hex: string): Color | null {
  const digits = hex.replace(/^#/, '');
  return /^[0-9a-f]{6}$/i.test(digits) ? colorFromDigits(digits) : null;
}

/**
 * Any hex color CSS knows — '#RGB', '#RGBA', '#RRGGBB' or '#RRGGBBAA', the
 * '#' optional — as a color; null if it isn't one. For colors read from
 * files, such as SVG.
 */
export function parseHexColor(hex: string): Color | null {
  const digits = hex.replace(/^#/, '');
  if (!/^[0-9a-f]+$/i.test(digits)) return null;
  if (digits.length === 3 || digits.length === 4) {
    return colorFromDigits([...digits].map((digit) => digit + digit).join(''));
  }
  return digits.length === 6 || digits.length === 8 ? colorFromDigits(digits) : null;
}

/**
 * A hex color's red, green and blue as 0–1, as shaders take them; `fallback`
 * (white) if it isn't a hex color.
 */
export function hexToRgbNormalized(
  hex: string,
  fallback: [number, number, number] = [1, 1, 1]
): [number, number, number] {
  const color = parseHexColor(hex);
  return color ? [color.r / 255, color.g / 255, color.b / 255] : fallback;
}
