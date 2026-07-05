/**
 * Tests for FontManager — loading-promise cleanup on failure (F032)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('opentype.js', () => ({
  default: { parse: vi.fn(() => ({ mock: 'font' })) },
}));

import { FontManager } from './FontManager';

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
