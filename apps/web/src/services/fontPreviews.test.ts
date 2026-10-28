/**
 * Tests for fontPreviews: family names shown in their own font, from
 * Google's tiny `text=` subsets, only once Google Fonts are allowed
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fontPreviewFamily,
  PREVIEW_BATCH_SIZE,
  PREVIEW_DELAY_MS,
  previewAlias,
  previewCssUrl,
  previewFaces,
  requestFontPreviews,
  resetFontPreviewsForTests,
  subscribeFontPreviews,
} from './fontPreviews';
import { GOOGLE_FONTS_CATALOG } from '@quar/core';
import { GOOGLE_FONTS_CONSENT_KEY } from '../components/common/ConsentBanner';

/** What the CSS API answers a browser for `text=` previews of these families. */
function previewCss(families: string[]): string {
  return families
    .map(
      (family, i) => `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/l/font?kit=kit${i}&skey=k&v=v1) format('woff2');
  unicode-range: U+20, U+61-7a;
}`
    )
    .join('\n');
}

const faces: Array<{ family: string; source: string }> = [];
const fontsAdd = vi.fn();
const fetchMock = vi.fn();

class FakeFontFace {
  constructor(
    public family: string,
    public source: string
  ) {
    faces.push({ family, source });
  }
  load() {
    return Promise.resolve(this);
  }
}

/** Let the batch timer fire and the requests it makes settle. */
async function settle() {
  await vi.advanceTimersByTimeAsync(PREVIEW_DELAY_MS + 1);
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('fontPreviews', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetFontPreviewsForTests();
    localStorage.clear();
    faces.length = 0;
    fontsAdd.mockReset();
    fetchMock.mockReset().mockImplementation(async (url: string) => {
      const families = new URL(url).searchParams
        .getAll('family')
        .map((param) => param.split(':')[0] ?? '');
      return { ok: true, text: async () => previewCss(families) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('FontFace', FakeFontFace);
    Object.defineProperty(document, 'fonts', {
      value: { add: fontsAdd },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, 'fonts');
  });

  it('asks Google nothing until Google Fonts are allowed', async () => {
    requestFontPreviews(['Roboto', 'Lobster']);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fontPreviewFamily('Roboto')).toBeNull();

    localStorage.setItem(GOOGLE_FONTS_CONSENT_KEY, 'true');
    requestFontPreviews(['Roboto']);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('asks for the families together, with just the letters of their names', async () => {
    const changed = vi.fn();
    const unsubscribe = subscribeFontPreviews(changed);

    requestFontPreviews(['Roboto', 'Lobster', 'Open Sans'], true);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(previewCssUrl(['Roboto', 'Lobster', 'Open Sans']));
    expect(url).toContain(
      'family=Roboto:wght@400&family=Lobster:wght@400&family=Open+Sans:wght@400'
    );
    expect(new URL(url).searchParams.get('text')).toBe(' LORSabenoprst');
    expect(init.referrerPolicy).toBe('no-referrer');

    // Each under an alias of its own, never as the family itself
    expect(faces.map((face) => face.family)).toEqual([
      previewAlias('Roboto'),
      previewAlias('Lobster'),
      previewAlias('Open Sans'),
    ]);
    expect(faces[0]?.source).toBe('url("https://fonts.gstatic.com/l/font?kit=kit0&skey=k&v=v1")');
    expect(fontsAdd).toHaveBeenCalledTimes(3);
    expect(fontPreviewFamily('Lobster')).toBe('"Quar Preview Lobster"');
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('asks for each family once a session', async () => {
    requestFontPreviews(['Roboto'], true);
    await settle();
    requestFontPreviews(['Roboto'], true);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it(`asks ${PREVIEW_BATCH_SIZE} at a time`, async () => {
    const families = GOOGLE_FONTS_CATALOG.slice(0, PREVIEW_BATCH_SIZE + 3).map((e) => e.family);
    requestFontPreviews(families, true);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const counts = fetchMock.mock.calls.map(
      ([url]) => new URL(url as string).searchParams.getAll('family').length
    );
    expect(counts).toEqual([PREVIEW_BATCH_SIZE, 3]);
  });

  it('shows Inter in the font the app has, and skips families Google does not have', async () => {
    requestFontPreviews(['Inter', 'My Own Font', 'Arial'], true);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(fontPreviewFamily('Inter')).toBe("'Inter'");
    expect(fontPreviewFamily('My Own Font')).toBeNull();
  });

  it('leaves the names in the interface font when Google cannot be reached', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    requestFontPreviews(['Roboto'], true);
    await settle();
    expect(fontPreviewFamily('Roboto')).toBeNull();
    // Not asked again and again
    requestFontPreviews(['Roboto'], true);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does nothing where fonts cannot be added', async () => {
    Reflect.deleteProperty(document, 'fonts');
    requestFontPreviews(['Roboto'], true);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('takes only fonts.gstatic.com files from an answer', () => {
    const css = `${previewCss(['Roboto'])}
@font-face { font-family: 'Lobster'; src: url(https://example.com/lobster.woff2); }`;
    expect([...previewFaces(css)]).toEqual([
      ['Roboto', 'https://fonts.gstatic.com/l/font?kit=kit0&skey=k&v=v1'],
    ]);
  });
});
