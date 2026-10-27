/**
 * Tests for documentFonts: a document's Google fonts load when it opens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Node, SymbolDefinition } from '@quar/types';
import { getFontManager, GOOGLE_FONTS_CATALOG } from '@quar/core';
import { googleFontsUsed, loadDocumentFonts, resetDocumentFontsForTests } from './documentFonts';
import { textIn } from '../test/textNode';

const urlOf = (family: string, weight: number) =>
  GOOGLE_FONTS_CATALOG.find((entry) => entry.family === family)!.url(weight);

describe('googleFontsUsed', () => {
  it('lists each catalog family and weight once, in symbols too, and skips other fonts', () => {
    const symbol: SymbolDefinition = {
      id: 's',
      name: 'Badge',
      sceneGraphJSON: { nodes: [textIn('in-symbol', 'DM Sans', 500)], rootNodeIds: ['in-symbol'] },
    };
    const nodes: Node[] = [
      textIn('a', 'Outfit', 800),
      textIn('b', 'Outfit', 800),
      textIn('c', 'Outfit', 400),
      textIn('d', 'Inter', 700),
      textIn('e', 'My Own Font'),
    ];

    expect(googleFontsUsed(nodes, [symbol])).toEqual([
      { family: 'Outfit', weight: 800 },
      { family: 'Outfit', weight: 400 },
      { family: 'DM Sans', weight: 500 },
    ]);
  });
});

describe('loadDocumentFonts', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetDocumentFontsForTests();
    fetchMock.mockReset().mockResolvedValue({ ok: false, statusText: 'offline' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    getFontManager().removeFont('Outfit');
    vi.unstubAllGlobals();
  });

  it('asks, then fetches each font the document uses', async () => {
    const allow = vi.fn().mockResolvedValue(true);

    await loadDocumentFonts(
      [
        { family: 'Outfit', weight: 800 },
        { family: 'Outfit', weight: 400 },
      ],
      allow
    );

    expect(allow).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(urlOf('Outfit', 800));
    expect(fetchMock).toHaveBeenCalledWith(urlOf('Outfit', 400));
  });

  it('fetches nothing when Google Fonts are declined, and asks no more that session', async () => {
    const allow = vi.fn().mockResolvedValue(false);

    expect(await loadDocumentFonts([{ family: 'Outfit', weight: 800 }], allow)).toBe(0);
    expect(await loadDocumentFonts([{ family: 'Outfit', weight: 700 }], allow)).toBe(0);

    expect(allow).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks nothing when the fonts are loaded already', async () => {
    const fm = getFontManager();
    vi.spyOn(fm, 'hasFontWeight').mockReturnValue(true);
    const allow = vi.fn().mockResolvedValue(true);

    expect(await loadDocumentFonts([{ family: 'Outfit', weight: 800 }], allow)).toBe(0);
    expect(allow).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
