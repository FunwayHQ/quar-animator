/**
 * Tests for FontManager — loading-promise cleanup on failure (F032)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import opentype from 'opentype.js';

vi.mock('opentype.js', () => ({
  default: { parse: vi.fn(() => ({ mock: 'font' })) },
}));

import { FontManager, getFontManager, GOOGLE_FONTS_CATALOG } from './FontManager';

// Flush pending microtasks + macrotasks so the .finally cleanup runs.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('FontManager loading-promise cleanup (F032)', () => {
  let fm: FontManager;

  beforeEach(() => {
    fm = new FontManager();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('re-fetches after a failed loadFontFromUrl (stale rejected promise cleared)', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fm.loadFontFromUrl('u', 'Roboto', 'google', 400)).rejects.toThrow();
    await flush();
    // The in-flight entry was cleared, so the font is not stuck "loading".
    expect(fm.isLoading('Roboto', 400)).toBe(false);

    // A second attempt re-fetches and now succeeds.
    const font = await fm.loadFontFromUrl('u', 'Roboto', 'google', 400);
    expect(font).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after a failed loadGoogleFont', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, statusText: 'Not Found' })
      .mockResolvedValueOnce({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fm.loadGoogleFont('Roboto', 400)).rejects.toThrow();
    await flush();

    const font = await fm.loadGoogleFont('Roboto', 400);
    expect(font).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('FontManager cache and lookup behavior', () => {
  let fm: FontManager;
  const parseMock = opentype.parse as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fm = new FontManager();
    parseMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caches fonts by family and weight and exposes loaded metadata', async () => {
    const buffer = new ArrayBuffer(8);
    const regular = await fm.loadFontFromBuffer(buffer, 'Roboto', 'local', 400);
    const cached = await fm.loadFontFromBuffer(buffer, 'Roboto', 'bundled', 400);
    const bold = await fm.loadFontFromBuffer(buffer, 'Roboto', 'bundled', 700);

    expect(cached).toBe(regular);
    expect(bold).not.toBe(regular); // each weight is parsed and cached independently
    expect(parseMock).toHaveBeenCalledTimes(2);
    expect(fm.hasFont('Roboto')).toBe(true);
    expect(fm.hasFontWeight('Roboto', 400)).toBe(true);
    expect(fm.hasFontWeight('Roboto', 700)).toBe(true);
    expect(fm.getLoadedFamilies()).toEqual(['Roboto']);
    expect(fm.getLoadedWeights('Roboto')).toEqual([400, 700]);
    expect(fm.getAvailableFonts()).toEqual([{ family: 'Roboto', source: 'bundled' }]);
  });

  it('uses exact, regular, then family-weight fallbacks for font lookup', async () => {
    const buffer = new ArrayBuffer(8);
    const regular = await fm.loadFontFromBuffer(buffer, 'Roboto', 'local', 400);
    const fallbackFamilyFont = await fm.loadFontFromBuffer(buffer, 'Lato', 'local', 600);

    expect(fm.getFont('Roboto', 400)).toBe(regular);
    expect(fm.getFont('Roboto', 700)).toBe(regular);
    expect(fm.getFont('Lato', 700)).toBe(fallbackFamilyFont);
    expect(fm.getFont('Missing')).toBeNull();
    expect(fm.getFontOrFallback('Missing')).toBe(regular);
  });

  it('deduplicates concurrent URL loads and reports loading state', async () => {
    let resolveFetch!: (response: { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = fm.loadFontFromUrl('/font.ttf', 'Inter');
    const second = fm.loadFontFromUrl('/font.ttf', 'Inter');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fm.isLoading('Inter')).toBe(true);
    resolveFetch({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

    await expect(first).resolves.toBe(await second);
    await flush();
    expect(fm.isLoading('Inter')).toBe(false);
    expect(fm.getAvailableFonts()).toEqual([{ family: 'Inter', source: 'google' }]);
  });

  it('returns null for unknown Google fonts and removes or disposes cached fonts', async () => {
    expect(await fm.loadGoogleFont('Not a Google Font')).toBeNull();
    await fm.loadFontFromBuffer(new ArrayBuffer(8), 'Inter', 'local', 400);
    await fm.loadFontFromBuffer(new ArrayBuffer(8), 'Inter', 'local', 700);

    fm.removeFont('Inter');

    expect(fm.hasFont('Inter')).toBe(false);
    expect(fm.getAvailableFonts()).toEqual([]);

    await fm.loadFontFromBuffer(new ArrayBuffer(8), 'Roboto', 'local');
    fm.dispose();

    expect(fm.getLoadedFamilies()).toEqual([]);
    expect(fm.getAvailableFonts()).toEqual([]);
  });

  it('loads the nearest catalog weight and falls back to regular URLs for unsupported weights', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', fetchMock);

    const font = await fm.loadGoogleFont('Roboto', 600);

    expect(font).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      GOOGLE_FONTS_CATALOG.find((entry) => entry.family === 'Roboto')!.url(500)
    );
    expect(fm.getLoadedWeights('Roboto')).toEqual([500]);
    expect(fm.getAvailableFonts()).toEqual([{ family: 'Roboto', source: 'google' }]);

    for (const entry of GOOGLE_FONTS_CATALOG) {
      expect(entry.weights.length).toBeGreaterThan(0);
      expect(
        entry.weights.every((weight) => entry.url(weight).startsWith('https://fonts.gstatic.com/'))
      ).toBe(true);
      expect(entry.url(999)).toBe(entry.url(400));
    }
  });

  it('provides a stable singleton font manager', () => {
    expect(getFontManager()).toBe(getFontManager());
  });
});
