/**
 * Mock for opentype.js in test environment.
 * opentype.js fails to load in JSDOM due to Object.defineProperty on frozen exports.
 */
import { vi } from 'vitest';

const mockFont = {
  unitsPerEm: 1000,
  ascender: 800,
  descender: -200,
  getPath: vi.fn().mockReturnValue({
    commands: [],
  }),
  charToGlyph: vi.fn().mockReturnValue({
    advanceWidth: 500,
    path: { commands: [] },
    getPath: vi.fn().mockReturnValue({ commands: [] }),
  }),
  stringToGlyphs: vi.fn().mockReturnValue([]),
  getKerningValue: vi.fn().mockReturnValue(0),
  forEachGlyph: vi.fn(),
};

export const parse = vi.fn().mockReturnValue(mockFont);
export const load = vi.fn();
export const loadSync = vi.fn();

export default {
  parse,
  load,
  loadSync,
  Font: vi.fn(),
  Glyph: vi.fn(),
  Path: vi.fn(),
};
