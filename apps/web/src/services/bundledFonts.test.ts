/**
 * Tests for bundledFonts: Inter, every weight and script, from the app
 */

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SymbolDefinition } from '@quar/types';
import { getFontManager } from '@quar/core';
import {
  BUNDLED_WEIGHTS,
  bundledWeight,
  bundledWeightsUsed,
  isBundledFamily,
  loadBundledFont,
} from './bundledFonts';
import { textIn } from '../test/textNode';

const APP = join(__dirname, '..', '..');
const shipped = (weight: number) =>
  join(APP, 'src', 'assets', 'fonts', 'inter', `inter-${weight}.woff`);
const latinPart = (weight: number) =>
  join(APP, 'node_modules', '@fontsource', 'inter', 'files', `inter-latin-${weight}-normal.woff`);

function bytes(path: string): ArrayBuffer {
  const file = readFileSync(path);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

// The real opentype.js (the tests' own stands in for it): the files themselves are checked
const opentype = createRequire(join(APP, '..', '..', 'packages', 'core', 'package.json'))(
  'opentype.js'
) as typeof import('opentype.js');
const parsed = (path: string) => opentype.parse(bytes(path));

/** Each glyph's place and outline, laid out as text is */
function laidOut(font: import('opentype.js').Font, text: string) {
  const glyphs = font.stringToGlyphs(text);
  let x = 0;
  return glyphs.map((glyph, i) => {
    const placed = [x, glyph.getPath(x, 0, font.unitsPerEm).toPathData(2)];
    x += glyph.advanceWidth ?? 0;
    const next = glyphs[i + 1];
    if (next) x += font.getKerningValue(glyph, next);
    return placed;
  });
}

describe('the Inter shipped', () => {
  it.each(BUNDLED_WEIGHTS)('has Cyrillic, Greek and Vietnamese letters at %i', (weight) => {
    const font = parsed(shipped(weight));
    const missing = [...'Привет, мир — Ёё Її Ґґ Ўў Ελληνικά Tiếng Việt Łódź Ğğ'].filter(
      (letter) => letter.trim() && font.charToGlyphIndex(letter) === 0
    );
    expect(missing).toEqual([]);
    // As the Latin part alone had none of them
    expect(parsed(latinPart(weight)).charToGlyphIndex('Ж')).toBe(0);
  });

  it.each([400, 700, 800])('lays Latin text out as its Latin part alone does at %i', (weight) => {
    const font = parsed(shipped(weight));
    const part = parsed(latinPart(weight));
    for (const text of [
      'The quick brown fox jumps over the lazy dog',
      'AV Ta WAVE To fi fl ffi 0123456789 — “quotes” #tags',
    ]) {
      expect(laidOut(font, text)).toEqual(laidOut(part, text));
    }
  });
});

describe('bundledWeight', () => {
  it('snaps to the weight shipped closest', () => {
    expect(bundledWeight(800)).toBe(800);
    expect(bundledWeight(640)).toBe(600);
    expect(bundledWeight(1000)).toBe(900);
    expect(bundledWeight(Number.NaN)).toBe(400);
  });
});

describe('bundledWeightsUsed', () => {
  it("lists the weights of Inter the text is set in, symbols' too, each once", () => {
    const symbol: SymbolDefinition = {
      id: 's',
      name: 'Badge',
      sceneGraphJSON: { nodes: [textIn('in-symbol', 'Inter', 300)], rootNodeIds: ['in-symbol'] },
    };
    const nodes = [
      textIn('a', 'Inter', 800),
      textIn('b', 'Inter', 800),
      textIn('c', 'Inter', 500),
      textIn('d', 'Outfit', 600),
    ];
    expect(bundledWeightsUsed(nodes, [symbol])).toEqual([800, 500, 300]);
    expect(isBundledFamily('Inter')).toBe(true);
    expect(isBundledFamily('Inter Tight')).toBe(false);
  });
});

describe('loadBundledFont', () => {
  const fm = getFontManager();
  const fetchMock = vi.fn();

  beforeEach(() => {
    // The app's own file, as the browser fetches it
    fetchMock.mockReset().mockImplementation((url: string) => {
      const weight = /inter-(\d+)\.woff/.exec(url)?.[1];
      return Promise.resolve({
        ok: true,
        arrayBuffer: () => Promise.resolve(bytes(shipped(Number(weight)))),
      });
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the weight shipped closest, once', async () => {
    fm.removeFont('Inter');
    await loadBundledFont(820);
    await loadBundledFont(800);

    expect(fm.hasFontWeight('Inter', 800)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/inter-800\.woff$/);
  });
});
