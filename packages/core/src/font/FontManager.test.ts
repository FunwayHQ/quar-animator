/**
 * Tests for FontManager — loading-promise cleanup on failure (F032)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import opentype from 'opentype.js';

vi.mock('opentype.js', () => ({
  default: { parse: vi.fn(() => ({ mock: 'font' })) },
}));

import {
  FontManager,
  getFontManager,
  GOOGLE_FONTS_CATALOG,
  findGoogleFont,
  nearestWeight,
} from './FontManager';
import googleFonts from './googleFonts.json';

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

  it('counts each font loaded or removed, so text drawn with a fallback can be redrawn', async () => {
    const buffer = new ArrayBuffer(8);
    const start = fm.generation;
    await fm.loadFontFromBuffer(buffer, 'Roboto', 'local', 400);
    expect(fm.generation).toBe(start + 1);
    await fm.loadFontFromBuffer(buffer, 'Roboto', 'local', 400); // already loaded
    expect(fm.generation).toBe(start + 1);
    fm.removeFont('Roboto');
    expect(fm.generation).toBeGreaterThan(start + 1);
  });

  it('does not report a font read from a file as still loading (F178)', async () => {
    await fm.loadFontFromBuffer(new ArrayBuffer(8), 'MyFont');
    await flush();

    expect(fm.hasFont('MyFont')).toBe(true);
    expect(fm.isLoading('MyFont')).toBe(false);
    expect(fm.isLoading('MyFont', 400)).toBe(false);
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

  describe('removing a font while it downloads (F179)', () => {
    type FontResponse = { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> };
    const fontResponse: FontResponse = { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };

    /** fetch that hangs until the test answers each request in turn. */
    function deferredFetch() {
      const pending: ((response: FontResponse) => void)[] = [];
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<FontResponse>((resolve) => pending.push(resolve)))
      );
      return pending;
    }

    it('keeps a removed URL font out when its download finishes', async () => {
      const pending = deferredFetch();
      const load = fm.loadFontFromUrl('/x.ttf', 'X', 'google', 400);
      fm.removeFont('X');
      expect(fm.isLoading('X')).toBe(false);

      pending[0]!(fontResponse);
      await load;
      await flush();

      expect(fm.hasFont('X')).toBe(false);
      expect(fm.getAvailableFonts().every((f) => f.family !== 'X')).toBe(true);
      expect(fm.isLoading('X')).toBe(false);
    });

    it('keeps a removed Google font out when its download finishes', async () => {
      const pending = deferredFetch();
      const load = fm.loadGoogleFont('Roboto', 400);
      fm.removeFont('Roboto');

      pending[0]!(fontResponse);
      await load;
      await flush();

      expect(fm.hasFont('Roboto')).toBe(false);
      expect(fm.getAvailableFonts()).toEqual([]);
    });

    it('keeps a font out when the manager is disposed during its download', async () => {
      const pending = deferredFetch();
      const load = fm.loadFontFromUrl('/x.ttf', 'X', 'google', 400);
      fm.dispose();

      pending[0]!(fontResponse);
      await load;

      expect(fm.hasFont('X')).toBe(false);
      expect(fm.getAvailableFonts()).toEqual([]);
    });

    it('lets a load started after the removal finish and stay loading meanwhile', async () => {
      const pending = deferredFetch();
      const stale = fm.loadFontFromUrl('/x.ttf', 'X', 'google', 400);
      fm.removeFont('X');
      const fresh = fm.loadFontFromUrl('/x.ttf', 'X', 'google', 400);
      expect(fresh).not.toBe(stale);

      // The removed download finishing must not clear the new one's entry.
      pending[0]!(fontResponse);
      await stale;
      await flush();
      expect(fm.isLoading('X', 400)).toBe(true);
      expect(fm.hasFont('X')).toBe(false);

      pending[1]!(fontResponse);
      const font = await fresh;
      expect(fm.getFont('X')).toBe(font);
      await flush();
      expect(fm.isLoading('X')).toBe(false);
    });
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

  it('loads the nearest catalog weight', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', fetchMock);
    // Lato has 100, 300, 400, 700 and 900: 600 is nearest 700
    const lato = findGoogleFont('Lato');
    expect(lato?.weights).toEqual([100, 300, 400, 700, 900]);

    const font = await fm.loadGoogleFont('Lato', 600);

    expect(font).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(lato?.url(700));
    expect(fm.getLoadedWeights('Lato')).toEqual([700]);
    expect(fm.getAvailableFonts()).toEqual([{ family: 'Lato', source: 'google' }]);
  });

  it('gives every weight of the catalog its own file, and the nearest for others', () => {
    for (const entry of GOOGLE_FONTS_CATALOG) {
      expect(entry.weights.length).toBeGreaterThan(0);
      for (const weight of entry.weights) {
        expect(entry.url(weight)).toMatch(/^https:\/\/fonts\.gstatic\.com\/.+\.ttf$/);
      }
      expect(new Set(entry.weights.map((weight) => entry.url(weight))).size).toBe(
        entry.weights.length
      );
      expect(entry.url(999)).toBe(entry.url(entry.weights[entry.weights.length - 1]!));
      expect(entry.url(-5)).toBe(entry.url(entry.weights[0]!));
    }
    // Bebas Neue has 400 alone: every weight is that file
    const bebas = findGoogleFont('Bebas Neue');
    expect(bebas?.weights).toEqual([400]);
    expect(bebas?.url(700)).toBe(bebas?.url(400));
  });

  it('builds the catalog from googleFonts.json, in its order, with categories', () => {
    expect(GOOGLE_FONTS_CATALOG.map((entry) => entry.family)).toEqual(
      googleFonts.map((record) => record.family)
    );
    const roboto = findGoogleFont('Roboto');
    const record = googleFonts.find((entry) => entry.family === 'Roboto');
    expect(roboto?.category).toBe('sans-serif');
    expect(roboto?.weights).toEqual(record?.weights);
    expect(roboto?.url(400)).toBe((record?.files as Record<string, string> | undefined)?.['400']);
    expect(findGoogleFont('Playfair Display')?.category).toBe('serif');
    expect(findGoogleFont('Dancing Script')?.category).toBe('handwriting');
    expect(findGoogleFont('Roboto Mono')?.category).toBe('monospace');
    expect(findGoogleFont('Lobster')?.category).toBe('display');
    expect(findGoogleFont('Inter')).toBeUndefined();
    expect(findGoogleFont('Not a Google Font')).toBeUndefined();
  });

  it('offers Outfit at every weight, from its own files', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    vi.stubGlobal('fetch', fetchMock);
    const outfit = GOOGLE_FONTS_CATALOG.find((entry) => entry.family === 'Outfit');

    expect(outfit?.weights).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
    expect(new Set(outfit?.weights.map((weight) => outfit.url(weight))).size).toBe(9);
    await fm.loadGoogleFont('Outfit', 800);
    expect(fetchMock).toHaveBeenCalledWith(outfit?.url(800));
    expect(outfit?.url(800)).toContain('/s/outfit/');
  });

  it('provides a stable singleton font manager', () => {
    expect(getFontManager()).toBe(getFontManager());
  });
});

describe('nearestWeight', () => {
  it('picks the weight nearest to the one asked for', () => {
    expect(nearestWeight([100, 300, 400, 700, 900], 600)).toBe(700);
    expect(nearestWeight([100, 300, 400, 700, 900], 350)).toBe(300);
    expect(nearestWeight([400], 900)).toBe(400);
    expect(nearestWeight([300, 700], 1000)).toBe(700);
  });

  it('takes the lighter of two as near', () => {
    expect(nearestWeight([400, 600], 500)).toBe(400);
    expect(nearestWeight([100, 300], 200)).toBe(100);
  });

  it('reads a non-number as 400, and falls back to 400 with no weights', () => {
    expect(nearestWeight([100, 400, 900], NaN)).toBe(400);
    expect(nearestWeight([], 700)).toBe(400);
  });
});
