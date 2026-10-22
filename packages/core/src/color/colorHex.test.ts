import { describe, it, expect } from 'vitest';
import { colorToHex, hexToColor, hexToRgbNormalized, parseHexColor, rgbToHex } from './colorHex';

describe('colorToHex / rgbToHex (F070)', () => {
  it('writes #RRGGBB in upper case, leaving alpha out', () => {
    expect(colorToHex({ r: 255, g: 128, b: 0, a: 0.5 })).toBe('#FF8000');
    expect(colorToHex({ r: 0, g: 0, b: 0, a: 1 })).toBe('#000000');
    expect(rgbToHex(10, 171, 205)).toBe('#0AABCD');
  });

  it('rounds and clamps channels animation carries out of range', () => {
    expect(colorToHex({ r: 300, g: -5, b: 127.5, a: 1 })).toBe('#FF0080');
    expect(rgbToHex(255.4, 0.4, 254.6)).toBe('#FF00FF');
    expect(rgbToHex(NaN, Infinity, -Infinity)).toBe('#00FF00');
  });

  it('round-trips every valid color through hexToColor', () => {
    for (const color of [
      { r: 0, g: 0, b: 0, a: 1 },
      { r: 255, g: 255, b: 255, a: 1 },
      { r: 18, g: 52, b: 86, a: 1 },
      { r: 171, g: 205, b: 239, a: 1 },
    ]) {
      expect(hexToColor(colorToHex(color))).toEqual(color);
    }
  });
});

describe('hexToColor (F070)', () => {
  it('reads #RRGGBB, with or without the #, in either case', () => {
    expect(hexToColor('#FF8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(hexToColor('ff8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(hexToColor('#aBcDeF')).toEqual({ r: 171, g: 205, b: 239, a: 1 });
  });

  it('takes nothing else — not even a half-typed short form', () => {
    for (const text of [
      '#ABC',
      '#ABCD',
      '#ABCDE',
      '#ABCDEF0',
      '#ABCDEF00',
      '#GGGGGG',
      '',
      '#',
      ' #ABCDEF',
    ]) {
      expect(hexToColor(text)).toBeNull();
    }
  });
});

describe('parseHexColor (F070)', () => {
  it('reads the short, long and alpha forms', () => {
    expect(parseHexColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseHexColor('#abc8')).toEqual({ r: 170, g: 187, b: 204, a: 136 / 255 });
    expect(parseHexColor('#FF8000')).toEqual({ r: 255, g: 128, b: 0, a: 1 });
    expect(parseHexColor('ff800080')).toEqual({ r: 255, g: 128, b: 0, a: 128 / 255 });
  });

  it('turns down what isn’t hex instead of making NaN channels', () => {
    for (const text of ['#ggg', '#12345', '#1x2y3z', '#', 'red', '#ff00ff0']) {
      expect(parseHexColor(text)).toBeNull();
    }
  });
});

describe('hexToRgbNormalized (F070)', () => {
  it('gives the channels as 0–1', () => {
    expect(hexToRgbNormalized('#FF0000')).toEqual([1, 0, 0]);
    expect(hexToRgbNormalized('#0f0')).toEqual([0, 1, 0]);
    expect(hexToRgbNormalized('#808080')[0]).toBeCloseTo(128 / 255);
  });

  it('falls back (to white unless told otherwise) for what isn’t hex', () => {
    expect(hexToRgbNormalized('not a color')).toEqual([1, 1, 1]);
    expect(hexToRgbNormalized('#zzzzzz', [0.5, 0.5, 0.5])).toEqual([0.5, 0.5, 0.5]);
  });
});
