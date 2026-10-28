/**
 * Tests for documentFonts: a document's Google fonts load when it opens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Node, SymbolDefinition } from '@quar/types';
import { getFontManager, GOOGLE_FONTS_CATALOG } from '@quar/core';
import {
  documentFontFamilies,
  fontFamiliesUsed,
  fontsToLoad,
  googleFontsUsed,
  loadDocumentFonts,
  resetDocumentFontsForTests,
} from './documentFonts';
import { textIn } from '../test/textNode';
import { useEditorStore } from '../stores/editorStore';
import type { PageData } from '../stores/editorStore';

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

describe('fontFamiliesUsed', () => {
  it('lists every family the text is set in, Google or not, each once', () => {
    expect(
      fontFamiliesUsed([
        [textIn('a', 'Outfit'), textIn('b', 'Arial'), textIn('c', 'Outfit', 700)],
        [textIn('d', 'Inter')],
      ])
    ).toEqual(['Outfit', 'Arial', 'Inter']);
  });
});

describe('documentFontFamilies', () => {
  afterEach(() => {
    useEditorStore.setState({ symbols: [] });
  });

  it("takes the page shown live, the document's other pages and its symbols", () => {
    const page = (id: string, nodes: Node[]) =>
      ({
        id,
        name: id,
        sceneGraphJSON: { nodes, rootNodeIds: nodes.map((n) => n.id) },
      }) as PageData;
    const { pages, activePageId } = useEditorStore.getState();
    const symbol: SymbolDefinition = {
      id: 's',
      name: 'Badge',
      sceneGraphJSON: { nodes: [textIn('in-symbol', 'Lobster')], rootNodeIds: ['in-symbol'] },
    };
    useEditorStore.setState({
      pages: [
        page(activePageId, [textIn('stale', 'Stale Font')]),
        page('p2', [textIn('x', 'Lato')]),
      ],
      symbols: [symbol],
    });

    // The page shown comes from its scene, not its stored copy
    expect(documentFontFamilies([textIn('live', 'Roboto')])).toEqual(['Roboto', 'Lato', 'Lobster']);
    useEditorStore.setState({ pages });
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

  it('lists, without asking, the fonts still to load when Google Fonts are allowed', () => {
    const fm = getFontManager();
    vi.spyOn(fm, 'hasFontWeight').mockImplementation((_family, weight) => weight === 400);
    const uses = [
      { family: 'Outfit', weight: 800 },
      { family: 'Outfit', weight: 400 },
    ];

    expect(fontsToLoad(uses, true)).toEqual([{ family: 'Outfit', weight: 800 }]);
    // Not allowed: nothing to wait for (and nobody asked)
    expect(fontsToLoad(uses, false)).toEqual([]);
    vi.restoreAllMocks();
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
