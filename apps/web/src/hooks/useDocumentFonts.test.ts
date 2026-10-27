/**
 * Tests for useDocumentFonts: opening or pasting text in a Google font loads it
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SceneGraph, getFontManager, GOOGLE_FONTS_CATALOG } from '@quar/core';
import { setGoogleFontsConsent } from '../components/common/ConsentBanner';
import { resetDocumentFontsForTests } from '../services/documentFonts';
import { textIn } from '../test/textNode';
import { useDocumentFonts } from './useDocumentFonts';

const urlOf = (family: string, weight: number) =>
  GOOGLE_FONTS_CATALOG.find((entry) => entry.family === family)!.url(weight);

describe('useDocumentFonts', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetDocumentFontsForTests();
    setGoogleFontsConsent(true);
    fetchMock.mockReset().mockResolvedValue({ ok: false, statusText: 'offline' });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    setGoogleFontsConsent(false);
    getFontManager().removeFont('Outfit');
    getFontManager().removeFont('DM Sans');
    vi.unstubAllGlobals();
  });

  it('loads the fonts of the document it opens with', async () => {
    const sg = new SceneGraph();
    sg.addNode(textIn('title', 'Outfit', 800));

    renderHook(() => useDocumentFonts(sg));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(urlOf('Outfit', 800)));
  });

  it('loads the fonts of text added later, once for a batch', async () => {
    const sg = new SceneGraph();
    renderHook(() => useDocumentFonts(sg));
    await Promise.resolve();

    sg.addNode(textIn('a', 'DM Sans', 500));
    sg.addNode(textIn('b', 'DM Sans', 500));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(urlOf('DM Sans', 500)));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
