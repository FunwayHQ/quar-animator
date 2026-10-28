// @vitest-environment node
/**
 * Tests for the Google Fonts catalog generator — from saved answers of
 * Google's endpoints, no network.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  buildCatalog,
  checkFontHeader,
  cssUrl,
  fetchFamily,
  filesFromCss,
  formatCatalog,
  getWithRetries,
  mapLimit,
  parseFontFaces,
  parseMetadata,
  rankFamilies,
  reasonToLeaveOut,
  uprightWeights,
} from './google-fonts.mjs';

const fixture = (name: string) => readFileSync(path.join(__dirname, '__fixtures__', name), 'utf8');

const metadataText = fixture('metadata-sample.json');
const robotoCss = fixture('css-roboto.css');
const bebasCss = fixture('css-bebas-neue.css');
const dmSansCss = fixture('css-dm-sans.css');
const browserCss = fixture('css-bebas-neue-browser.css');
const missingFamilyHtml = fixture('css-missing-family.html');

type Answer = { status: number; headers?: Record<string, string>; text: string };
const answer = (text: string, status = 200): Answer => ({ status, headers: {}, text });

/** A getText answering each family's CSS request with what `answers` has for it. */
function fakeCssApi(answers: Record<string, Answer>) {
  return vi.fn(async (url: string) => {
    const family = decodeURIComponent(new URL(url).searchParams.get('family')?.split(':')[0] ?? '');
    return answers[family] ?? answer(missingFamilyHtml, 400);
  });
}

describe('metadata', () => {
  it('reads every family with its category, rank and upright weights', () => {
    const families = parseMetadata(metadataText);
    const roboto = families.find((family) => family.family === 'Roboto');
    expect(families).toHaveLength(8);
    expect(roboto).toEqual({
      family: 'Roboto',
      category: 'sans-serif',
      popularity: 2,
      weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
      openSource: true,
      color: false,
    });
    expect(families.find((family) => family.family === 'Dancing Script')?.category).toBe(
      'handwriting'
    );
  });

  it('leaves out italics, keeps weight 1000 and sorts the weights', () => {
    expect(uprightWeights({ '700i': {}, '1000': {}, '400': {}, '100i': {}, '100': {} })).toEqual([
      100, 400, 1000,
    ]);
    expect(uprightWeights(undefined)).toEqual([]);
    expect(parseMetadata(metadataText).find((f) => f.family === 'DM Sans')?.weights).toContain(
      1000
    );
  });

  it("reads past the )]}' guard Google can put before its JSON", () => {
    expect(parseMetadata(`)]}'\n${metadataText}`)).toEqual(parseMetadata(metadataText));
  });

  it('refuses an answer without a family list', () => {
    expect(() => parseMetadata('{"axisRegistry": []}')).toThrow(/familyMetadataList/);
  });

  it('ranks the usable families by popularity, ties by name', () => {
    const ranked = rankFamilies(parseMetadata(metadataText)).map((family) => family.family);
    // Inter comes with the app; Noto Color Emoji is drawn in colour
    expect(ranked).toEqual([
      'Poppins',
      'Roboto',
      'Lato',
      'DM Sans',
      'Bebas Neue',
      'Dancing Script',
    ]);
  });

  it('says why a family is left out', () => {
    const base = {
      family: 'X',
      category: 'serif',
      popularity: 1,
      weights: [400],
      openSource: true,
      color: false,
    };
    expect(reasonToLeaveOut(base)).toBeNull();
    expect(reasonToLeaveOut({ ...base, family: 'Inter' })).toBe('comes with the app');
    expect(reasonToLeaveOut({ ...base, openSource: false })).toBe('not open source');
    expect(reasonToLeaveOut({ ...base, color: true })).toBe('a colour font');
    expect(reasonToLeaveOut({ ...base, weights: [] })).toBe('no upright styles');
    expect(reasonToLeaveOut({ ...base, category: null })).toBe('no known category');
  });
});

describe('CSS API', () => {
  it('asks for the upright weights of a family', () => {
    expect(cssUrl('Bebas Neue', [400])).toBe(
      'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400'
    );
    expect(cssUrl('M PLUS 1p', [100, 700])).toBe(
      'https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@100;700'
    );
  });

  it('parses @font-face rules', () => {
    expect(parseFontFaces(bebasCss)).toEqual([
      {
        family: 'Bebas Neue',
        style: 'normal',
        weight: '400',
        url: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW4.ttf',
        format: 'truetype',
        unicodeRange: undefined,
      },
    ]);
  });

  it('takes one static TrueType file a weight', () => {
    const files = filesFromCss(robotoCss, 'Roboto');
    expect(Object.keys(files)).toEqual([
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ]);
    expect(new Set(Object.values(files)).size).toBe(9);
    for (const url of Object.values(files)) {
      expect(url).toMatch(/^https:\/\/fonts\.gstatic\.com\/s\/roboto\/v\d+\/[\w-]+\.ttf$/);
    }
  });

  it('keeps only the weights Google serves', () => {
    // Asked for 100…1000: there is no static 1000
    expect(Object.keys(filesFromCss(dmSansCss, 'DM Sans'))).toEqual([
      '100',
      '200',
      '300',
      '400',
      '500',
      '600',
      '700',
      '800',
      '900',
    ]);
  });

  it('ignores italics and other families', () => {
    const italic = bebasCss.replace('font-style: normal', 'font-style: italic');
    expect(filesFromCss(italic, 'Bebas Neue')).toEqual({});
    expect(filesFromCss(bebasCss, 'Roboto')).toEqual({});
  });

  it('refuses what the editor could not use', () => {
    // What a browser gets: WOFF2 split into subsets
    expect(() => filesFromCss(browserCss, 'Bebas Neue')).toThrow(/subsets/);
    const variable = `@font-face {
      font-family: 'Roboto';
      font-style: normal;
      font-weight: 100 900;
      src: url(https://fonts.gstatic.com/s/roboto/v51/abc.ttf) format('truetype');
    }`;
    expect(() => filesFromCss(variable, 'Roboto')).toThrow(/variable/);
    const shared = robotoCss.replace(/KFOMC[\w-]+\.ttf/g, 'same.ttf');
    expect(() => filesFromCss(shared, 'Roboto')).toThrow(/share/);
    const woff2 = bebasCss.replace('.ttf', '.woff2');
    expect(() => filesFromCss(woff2, 'Bebas Neue')).toThrow(/TTF/);
    const elsewhere = bebasCss.replace('fonts.gstatic.com', 'example.com');
    expect(() => filesFromCss(elsewhere, 'Bebas Neue')).toThrow(/gstatic/);
  });

  it('fetches a family, or says why it cannot be used', async () => {
    const family = (name: string, weights = [400]) => ({
      family: name,
      category: 'sans-serif',
      popularity: 1,
      weights,
      openSource: true,
      color: false,
    });
    const getText = fakeCssApi({ 'Bebas Neue': answer(bebasCss), Browser: answer(browserCss) });

    expect(await fetchFamily(family('Bebas Neue'), { getText })).toEqual({
      entry: {
        family: 'Bebas Neue',
        category: 'sans-serif',
        weights: [400],
        files: { 400: 'https://fonts.gstatic.com/s/bebasneue/v16/JTUSjIg69CK48gW7PXooxW4.ttf' },
      },
    });
    expect(getText).toHaveBeenCalledWith(
      'https://fonts.googleapis.com/css2?family=Bebas+Neue:wght@400'
    );
    expect(await fetchFamily(family('Not A Font'), { getText })).toEqual({
      error: 'Not A Font: the CSS API answered 400',
    });
    expect(await fetchFamily(family('Browser'), { getText })).toEqual({
      error: expect.stringMatching(/no upright weights|subsets/) as unknown,
    });
  });
});

describe('requests', () => {
  const noWait = () => Promise.resolve();

  it('tries again after a 5xx or 429, waiting longer each time', async () => {
    const wait = vi.fn(noWait);
    const get = vi
      .fn()
      .mockResolvedValueOnce(answer('', 503))
      .mockResolvedValueOnce(answer('', 429))
      .mockResolvedValueOnce(answer('ok'));
    const response = await getWithRetries('u', { get, wait, baseDelayMs: 100 });
    expect(response.text).toBe('ok');
    expect(wait.mock.calls).toEqual([[100], [200]]);
  });

  it('waits as long as Retry-After asks', async () => {
    const wait = vi.fn(noWait);
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: 429, headers: { 'retry-after': '7' }, text: '' })
      .mockResolvedValueOnce(answer('ok'));
    await getWithRetries('u', { get, wait });
    expect(wait).toHaveBeenCalledWith(7000);
  });

  it('tries again after a network error, and gives up in the end', async () => {
    const get = vi.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(getWithRetries('u', { get, wait: noWait, retries: 2 })).rejects.toThrow(
      'ECONNRESET'
    );
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('does not ask again after a 4xx', async () => {
    const get = vi.fn().mockResolvedValue(answer('', 400));
    expect((await getWithRetries('u', { get, wait: noWait })).status).toBe(400);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('runs at most `limit` tasks at a time and keeps the order', async () => {
    let running = 0;
    let most = 0;
    const results = await mapLimit([5, 1, 4, 2, 3], 2, async (n: number) => {
      running++;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, n));
      running--;
      return n * 10;
    });
    expect(results).toEqual([50, 10, 40, 20, 30]);
    expect(most).toBe(2);
  });
});

describe('catalog', () => {
  const families = parseMetadata(metadataText);
  const files = (slug: string, weights: number[]) =>
    weights
      .map(
        (weight) => `@font-face {
  font-family: '${slug}';
  font-style: normal;
  font-weight: ${weight};
  src: url(https://fonts.gstatic.com/s/${slug.toLowerCase().replace(/ /g, '')}/v1/${weight}.ttf) format('truetype');
}`
      )
      .join('\n');
  const everyone = {
    Poppins: answer(files('Poppins', [400, 700])),
    Roboto: answer(robotoCss),
    Lato: answer(files('Lato', [400])),
    'DM Sans': answer(dmSansCss),
    'Bebas Neue': answer(bebasCss),
    'Dancing Script': answer(files('Dancing Script', [400, 700])),
  };

  it('takes the most popular families, sorted by popularity', async () => {
    const { catalog, skipped } = await buildCatalog(families, {
      count: 3,
      kept: [],
      getText: fakeCssApi(everyone),
    });
    expect(catalog.map((entry) => entry.family)).toEqual(['Poppins', 'Roboto', 'Lato']);
    expect(skipped).toEqual([]);
    expect(catalog[0]).toEqual({
      family: 'Poppins',
      category: 'sans-serif',
      weights: [400, 700],
      files: {
        400: 'https://fonts.gstatic.com/s/poppins/v1/400.ttf',
        700: 'https://fonts.gstatic.com/s/poppins/v1/700.ttf',
      },
    });
  });

  it('keeps the kept families whatever their rank', async () => {
    const { catalog } = await buildCatalog(families, {
      count: 3,
      kept: ['Dancing Script'],
      getText: fakeCssApi(everyone),
    });
    expect(catalog.map((entry) => entry.family)).toEqual(['Poppins', 'Roboto', 'Dancing Script']);
  });

  it('takes the next family in place of one Google does not serve', async () => {
    const { Roboto: _roboto, ...noRoboto } = everyone;
    const { catalog, skipped } = await buildCatalog(families, {
      count: 3,
      kept: [],
      getText: fakeCssApi(noRoboto),
    });
    expect(catalog.map((entry) => entry.family)).toEqual(['Poppins', 'Lato', 'DM Sans']);
    expect(skipped).toEqual(['Roboto: the CSS API answered 400']);
  });

  it('stops when a kept family is gone', async () => {
    await expect(
      buildCatalog(families, { count: 3, kept: ['Comic Relief'], getText: fakeCssApi(everyone) })
    ).rejects.toThrow(/Comic Relief/);
    const { Lato: _lato, ...noLato } = everyone;
    await expect(
      buildCatalog(families, { count: 3, kept: ['Lato'], getText: fakeCssApi(noLato) })
    ).rejects.toThrow(/Lato/);
  });

  it('gives the same catalog every run, whatever order the answers come in', async () => {
    const slowly = fakeCssApi(everyone);
    const shuffled = vi.fn(async (url: string) => {
      await new Promise((resolve) => setTimeout(resolve, url.includes('Poppins') ? 5 : 0));
      return slowly(url);
    });
    const first = await buildCatalog(families, {
      count: 6,
      kept: [],
      getText: fakeCssApi(everyone),
    });
    const second = await buildCatalog(families, {
      count: 6,
      kept: [],
      getText: shuffled,
      concurrency: 6,
    });
    expect(second.catalog).toEqual(first.catalog);
  });

  it('writes the JSON as Prettier formats it', async () => {
    const { catalog } = await buildCatalog(families, {
      count: 2,
      kept: [],
      getText: fakeCssApi(everyone),
    });
    const json = await formatCatalog(catalog, path.join(__dirname, '../src/font/googleFonts.json'));
    expect(JSON.parse(json)).toEqual(catalog);
    expect(json.endsWith('}\n]\n')).toBe(true);
    expect(json).toContain('"weights": [400, 700],');
  });
});

describe('font files', () => {
  /** The start of an sfnt with these tables. */
  const header = (version: number | string, tags: string[]) => {
    const bytes = Buffer.alloc(12 + tags.length * 16);
    if (typeof version === 'number') bytes.writeUInt32BE(version, 0);
    else bytes.write(version, 0, 'latin1');
    bytes.writeUInt16BE(tags.length, 4);
    tags.forEach((tag, i) => bytes.write(tag, 12 + i * 16, 'latin1'));
    return bytes;
  };

  it('tells a static TrueType font from a variable or CFF one', () => {
    expect(checkFontHeader(header(0x00010000, ['GDEF', 'glyf', 'head']))).toBeNull();
    expect(checkFontHeader(header(0x00010000, ['fvar', 'glyf', 'gvar']))).toBe('a variable font');
    expect(checkFontHeader(header('OTTO', ['CFF ']))).toBe('not TrueType (OTTO)');
    expect(checkFontHeader(header(0x00010000, ['glyf']).subarray(0, 20))).toBe(
      'table directory cut short'
    );
    expect(checkFontHeader(Buffer.alloc(4))).toBe('too short to be a font');
  });
});
