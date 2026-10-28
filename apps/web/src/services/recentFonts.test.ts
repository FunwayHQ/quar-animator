/**
 * Tests for recentFonts: the families picked lately, kept in this browser
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { addRecentFont, getRecentFonts, MAX_RECENT_FONTS, RECENT_FONTS_KEY } from './recentFonts';

describe('recentFonts', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the newest first, each family once', () => {
    addRecentFont('Roboto');
    addRecentFont('Lato');
    addRecentFont('Roboto');
    expect(getRecentFonts()).toEqual(['Roboto', 'Lato']);
  });

  it(`keeps the last ${MAX_RECENT_FONTS}`, () => {
    for (const family of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) addRecentFont(family);
    expect(getRecentFonts()).toEqual(['H', 'G', 'F', 'E', 'D', 'C']);
  });

  it('ignores what is stored if it is not a list of names', () => {
    localStorage.setItem(RECENT_FONTS_KEY, '{"family":"Roboto"}');
    expect(getRecentFonts()).toEqual([]);
    localStorage.setItem(RECENT_FONTS_KEY, 'not json');
    expect(getRecentFonts()).toEqual([]);
    localStorage.setItem(RECENT_FONTS_KEY, JSON.stringify(['Lato', 7, '', null, 'x'.repeat(300)]));
    expect(getRecentFonts()).toEqual(['Lato']);
  });

  it('carries on without storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => addRecentFont('Roboto')).not.toThrow();
    expect(getRecentFonts()).toEqual([]);
  });
});
