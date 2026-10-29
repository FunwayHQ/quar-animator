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

// The question Google Fonts are asked with, answered by each test
const confirmMock = vi.hoisted(() => vi.fn<[], Promise<boolean>>());
vi.mock('../components/common/PromptDialog', () => ({ confirmDialog: confirmMock }));

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

  it('loads the open document’s fonts as soon as Google Fonts are turned on, after a no', async () => {
    setGoogleFontsConsent(false);
    // The question asked as the document opens: Cancel
    confirmMock.mockResolvedValueOnce(false);
    const sg = new SceneGraph();
    sg.addNode(textIn('title', 'Outfit', 800));
    renderHook(() => useDocumentFonts(sg));
    await waitFor(() => expect(confirmMock).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();

    // Help › Use Google Fonts: nothing reloaded, no text added
    setGoogleFontsConsent(true);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(urlOf('Outfit', 800)));
    expect(confirmMock).toHaveBeenCalledTimes(1);
  });
});
