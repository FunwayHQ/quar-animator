#!/usr/bin/env node
/**
 * Google Fonts catalog generator
 *
 * Writes src/font/googleFonts.json, the Google families the editor offers:
 * the most popular ones (by Google Fonts' own ranking) with the static,
 * upright TrueType file of each weight. The editor draws text from font files
 * with opentype.js, which wants static TTFs, not variable ones.
 *
 *   pnpm --filter @quar/core fonts:catalog [--count 300] [--concurrency 4] [--verify]
 *
 * Where it reads from (no API key needed):
 * - https://fonts.google.com/metadata/fonts — every family, with its
 *   category, popularity rank and the styles it has.
 * - https://fonts.googleapis.com/css2?family=Name:wght@400;700 — asked with
 *   no User-Agent, the CSS API answers with TrueType URLs, one static
 *   instance per weight (a browser's User-Agent gets WOFF2 subsets instead).
 *
 * The output is sorted by popularity (ties by name) and formatted with the
 * repo's Prettier settings, so a re-run only changes what Google changed.
 * --verify also reads the first bytes of every file to check it is a static
 * TrueType font (no `fvar` table): slower, and not needed for a refresh.
 */

import { request } from 'node:https';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const METADATA_URL = 'https://fonts.google.com/metadata/fonts';
export const CSS_API_URL = 'https://fonts.googleapis.com/css2';
export const FILE_HOST = 'https://fonts.gstatic.com/';
export const DEFAULT_COUNT = 300;
export const DEFAULT_CONCURRENCY = 4;

/**
 * The families the editor offered before the catalog was generated. Documents
 * use them, so they stay whatever their rank.
 */
export const KEPT_FAMILIES = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Oswald',
  'Raleway',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'Source Sans 3',
  'PT Sans',
  'Rubik',
  'Work Sans',
  'Fira Sans',
  'Noto Sans',
  'Ubuntu',
  'Quicksand',
  'Cabin',
  'Inconsolata',
  'Libre Baskerville',
  'Karla',
  'Josefin Sans',
  'Archivo',
  'DM Sans',
  'Outfit',
  'Space Grotesk',
  'Bitter',
  'Crimson Text',
  'IBM Plex Mono',
  'IBM Plex Sans',
];

/** Families left out by name, and why. */
export const EXCLUDED_FAMILIES = {
  // Its text would otherwise ask to use Google Fonts, or load from Google
  // what the app already has
  Inter: 'comes with the app',
};

/** Google's category names, as the editor keys them (the Fonts API's own slugs). */
const CATEGORIES = {
  'Sans Serif': 'sans-serif',
  Serif: 'serif',
  Display: 'display',
  Handwriting: 'handwriting',
  Monospace: 'monospace',
};

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

/**
 * @typedef {object} FamilyMetadata
 * @property {string} family
 * @property {string | null} category  sans-serif | serif | display | handwriting | monospace
 * @property {number} popularity  Google's rank: 1 is the most used
 * @property {number[]} weights  the upright weights it lists, ascending
 * @property {boolean} openSource
 * @property {boolean} color  drawn in colour (COLR/SVG): opentype.js draws outlines only
 */

/** The upright weights of a metadata `fonts` map ("400", "700i", …), ascending. */
export function uprightWeights(fonts) {
  return Object.keys(fonts ?? {})
    .filter((style) => /^\d+$/.test(style))
    .map(Number)
    .filter((weight) => weight >= 1 && weight <= 1000)
    .sort((a, b) => a - b);
}

/**
 * Read the metadata endpoint's answer (which may start with the `)]}'` guard
 * Google puts before JSON). @returns {FamilyMetadata[]}
 */
export function parseMetadata(text) {
  const json = JSON.parse(text.replace(/^\)\]\}'[^\n]*\n?/, ''));
  const list = json?.familyMetadataList;
  if (!Array.isArray(list)) throw new Error('The metadata has no familyMetadataList');
  return list
    .filter((entry) => typeof entry?.family === 'string')
    .map((entry) => ({
      family: entry.family,
      category: CATEGORIES[entry.category] ?? null,
      popularity: Number.isFinite(entry.popularity) ? entry.popularity : Infinity,
      weights: uprightWeights(entry.fonts),
      openSource: entry.isOpenSource !== false,
      color: Array.isArray(entry.colorCapabilities) && entry.colorCapabilities.length > 0,
    }));
}

/** Why a family can't be in the catalog, or null when it can. */
export function reasonToLeaveOut(family, excluded = EXCLUDED_FAMILIES) {
  if (Object.hasOwn(excluded, family.family)) return excluded[family.family];
  if (!family.openSource) return 'not open source';
  if (family.color) return 'a colour font';
  if (family.weights.length === 0) return 'no upright styles';
  if (!family.category) return 'no known category';
  return null;
}

const byPopularity = (a, b) =>
  a.popularity - b.popularity || (a.family < b.family ? -1 : a.family > b.family ? 1 : 0);

/** The families that can be in the catalog, most popular first. */
export function rankFamilies(families, excluded = EXCLUDED_FAMILIES) {
  return families
    .filter((family) => reasonToLeaveOut(family, excluded) === null)
    .sort(byPopularity);
}

// ---------------------------------------------------------------------------
// CSS API
// ---------------------------------------------------------------------------

/** The CSS API request for these upright weights of a family. */
export function cssUrl(family, weights) {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  return `${CSS_API_URL}?family=${name}:wght@${weights.join(';')}`;
}

/**
 * The @font-face rules of a CSS API answer.
 * @returns {{ family?: string, style: string, weight?: string, url?: string, format?: string, unicodeRange?: string }[]}
 */
export function parseFontFaces(css) {
  const faces = [];
  for (const [, body = ''] of css.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
    const property = (name) => {
      const match = body.match(new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+);`));
      return match?.[1]?.trim();
    };
    const src = property('src') ?? '';
    faces.push({
      family: property('font-family')?.replace(/^['"]|['"]$/g, ''),
      style: property('font-style') ?? 'normal',
      weight: property('font-weight'),
      url: src.match(/url\(\s*['"]?([^'")\s]+)['"]?\s*\)/)?.[1],
      format: src.match(/format\(\s*['"]?([^'")]+)['"]?\s*\)/)?.[1],
      unicodeRange: property('unicode-range'),
    });
  }
  return faces;
}

/**
 * The file of each weight a CSS API answer gives for a family: upright,
 * static (one weight per face, a file of its own each) TrueType files on
 * fonts.gstatic.com. Throws when the answer isn't like that (a variable font,
 * WOFF2, a file split into subsets), since the editor couldn't use it.
 * @returns {Record<string, string>} weight → URL
 */
export function filesFromCss(css, family) {
  /** @type {Record<string, string>} */
  const files = {};
  const owners = new Map();
  for (const face of parseFontFaces(css)) {
    if (face.family !== family || face.style !== 'normal') continue;
    if (!face.weight || !/^\d+$/.test(face.weight)) {
      throw new Error(`${family}: a variable face (font-weight ${face.weight ?? 'missing'})`);
    }
    if (face.unicodeRange) throw new Error(`${family}: split into subsets, not one file a weight`);
    const url = face.url ?? '';
    if (!url.startsWith(FILE_HOST) || !url.endsWith('.ttf')) {
      throw new Error(`${family} ${face.weight}: not a fonts.gstatic.com TTF (${url || 'no URL'})`);
    }
    if (face.format && face.format !== 'truetype') {
      throw new Error(`${family} ${face.weight}: ${face.format}, not TrueType`);
    }
    if (files[face.weight] && files[face.weight] !== url) {
      throw new Error(`${family} ${face.weight}: more than one file`);
    }
    const owner = owners.get(url);
    if (owner && owner !== face.weight) {
      throw new Error(`${family}: weights ${owner} and ${face.weight} share a (variable) file`);
    }
    owners.set(url, face.weight);
    files[face.weight] = url;
  }
  return sortedFiles(files);
}

/** A weight → URL map with its weights in ascending order. */
function sortedFiles(files) {
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => Number(a) - Number(b)));
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * @typedef {object} Response
 * @property {number} status
 * @property {Record<string, string | string[] | undefined>} headers
 * @property {string} text
 */

/**
 * GET a URL with no User-Agent (the CSS API then answers with TrueType) and
 * no compression. With `maxBytes`, stops reading after that many bytes.
 * @returns {Promise<Response & { bytes: Buffer }>}
 */
export function httpGet(url, { headers = {}, maxBytes = Infinity, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'GET', headers }, (res) => {
      const chunks = [];
      let length = 0;
      const finish = () => {
        const bytes = Buffer.concat(chunks);
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          text: bytes.toString('utf8'),
          bytes,
        });
      };
      res.on('data', (chunk) => {
        chunks.push(chunk);
        length += chunk.length;
        if (length >= maxBytes) {
          res.destroy();
          finish();
        }
      });
      res.on('end', finish);
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out: ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Milliseconds a Retry-After header asks to wait, if it does. */
function retryAfterMs(headers) {
  const value = Number(headers?.['retry-after']);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, 120) * 1000 : null;
}

/**
 * GET with retries: network errors, 429 and 5xx are tried again after an
 * exponential backoff (or the Retry-After asked for). Other answers, errors
 * included, come back as they are.
 */
export async function getWithRetries(
  url,
  { get = httpGet, retries = 4, baseDelayMs = 1000, wait = sleep, ...options } = {}
) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await get(url, options);
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= retries) return response;
      await wait(retryAfterMs(response.headers) ?? baseDelayMs * 2 ** attempt);
    } catch (error) {
      if (attempt >= retries) throw error;
      await wait(baseDelayMs * 2 ** attempt);
    }
  }
}

/** Run `task` over `items`, at most `limit` at a time; the results keep the items' order. */
export async function mapLimit(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

/**
 * @typedef {object} CatalogEntry
 * @property {string} family
 * @property {string} category
 * @property {number[]} weights
 * @property {Record<string, string>} files  weight → static TTF URL
 */

/**
 * The files Google serves for a family's weights, or an error saying why it
 * can't be used.
 * @returns {Promise<{ entry: CatalogEntry } | { error: string }>}
 */
export async function fetchFamily(family, { getText = getWithRetries } = {}) {
  try {
    const response = await getText(cssUrl(family.family, family.weights));
    if (response.status !== 200) {
      return { error: `${family.family}: the CSS API answered ${response.status}` };
    }
    const files = filesFromCss(response.text, family.family);
    const weights = Object.keys(files).map(Number);
    if (weights.length === 0) return { error: `${family.family}: no upright weights served` };
    return { entry: { family: family.family, category: family.category, weights, files } };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The catalog: every `kept` family, and the most popular others Google serves
 * usable files for (one it doesn't is skipped and the next taken) up to
 * `count` families in all. Sorted by popularity.
 */
export async function buildCatalog(
  families,
  {
    count = DEFAULT_COUNT,
    kept = KEPT_FAMILIES,
    excluded = EXCLUDED_FAMILIES,
    concurrency = DEFAULT_CONCURRENCY,
    getText = getWithRetries,
    log = () => {},
  } = {}
) {
  const ranked = rankFamilies(families, excluded);
  const keptNames = new Set(kept);
  const missing = kept.filter((name) => !ranked.some((family) => family.family === name));
  if (missing.length > 0) throw new Error(`Kept families not offered: ${missing.join(', ')}`);

  /** @type {Map<string, CatalogEntry>} */
  const entries = new Map();
  const skipped = [];
  const fetchAll = async (batch) => {
    const results = await mapLimit(batch, concurrency, (family) =>
      fetchFamily(family, { getText })
    );
    for (const result of results) {
      if ('entry' in result) entries.set(result.entry.family, result.entry);
      else skipped.push(result.error);
    }
    log(`… ${entries.size} families`);
  };

  await fetchAll(ranked.filter((family) => keptNames.has(family.family)));
  const lost = kept.filter((name) => !entries.has(name));
  if (lost.length > 0) {
    throw new Error(
      `Kept families Google doesn't serve: ${lost.join(', ')}\n${skipped.join('\n')}`
    );
  }

  // The most popular others, then whoever replaces those Google didn't serve
  const others = ranked.filter((family) => !keptNames.has(family.family));
  let next = 0;
  while (entries.size < count && next < others.length) {
    const batch = others.slice(next, next + (count - entries.size));
    next += batch.length;
    await fetchAll(batch);
  }

  const rank = new Map(ranked.map((family, index) => [family.family, index]));
  const catalog = [...entries.values()].sort(
    (a, b) => (rank.get(a.family) ?? 0) - (rank.get(b.family) ?? 0)
  );
  return { catalog, skipped };
}

/**
 * Whether the start of a font file is a static TrueType font: TrueType
 * outlines (not CFF) and no `fvar` table.
 * @returns {string | null} what's wrong, or null
 */
export function checkFontHeader(bytes) {
  if (bytes.length < 12) return 'too short to be a font';
  const version = bytes.readUInt32BE(0);
  if (version !== 0x00010000 && bytes.toString('latin1', 0, 4) !== 'true') {
    return `not TrueType (${bytes.toString('latin1', 0, 4)})`;
  }
  const tables = bytes.readUInt16BE(4);
  if (bytes.length < 12 + tables * 16) return 'table directory cut short';
  for (let i = 0; i < tables; i++) {
    if (bytes.toString('latin1', 12 + i * 16, 16 + i * 16) === 'fvar') return 'a variable font';
  }
  return null;
}

/** Read the start of every file of the catalog; resolves to the problems found. */
export async function verifyCatalog(
  catalog,
  { concurrency = DEFAULT_CONCURRENCY, get = getWithRetries } = {}
) {
  const files = catalog.flatMap((entry) =>
    Object.entries(entry.files).map(([weight, url]) => ({
      label: `${entry.family} ${weight}`,
      url,
    }))
  );
  const problems = await mapLimit(files, concurrency, async ({ label, url }) => {
    const response = await get(url, { headers: { Range: 'bytes=0-1023' }, maxBytes: 1024 });
    if (response.status !== 200 && response.status !== 206) return `${label}: ${response.status}`;
    const problem = checkFontHeader(response.bytes);
    return problem ? `${label}: ${problem}` : null;
  });
  return problems.filter((problem) => problem !== null);
}

/** The catalog as the committed JSON: formatted as Prettier would (the commit hook runs it). */
export async function formatCatalog(catalog, filePath) {
  const text = `${JSON.stringify(catalog, null, 2)}\n`;
  try {
    const prettier = await import('prettier');
    const config = (await prettier.resolveConfig(filePath)) ?? {};
    return await prettier.format(text, { ...config, filepath: filePath });
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const options = {
    count: DEFAULT_COUNT,
    concurrency: DEFAULT_CONCURRENCY,
    verify: false,
    out: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/font/googleFonts.json'),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--verify') options.verify = true;
    else if (arg === '--count') options.count = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else if (arg === '--out') options.out = path.resolve(String(argv[++i]));
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!(options.count > 0) || !(options.concurrency > 0))
    throw new Error('Bad --count/--concurrency');
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Reading ${METADATA_URL}`);
  const metadata = await getWithRetries(METADATA_URL);
  if (metadata.status !== 200) throw new Error(`The metadata answered ${metadata.status}`);
  const families = parseMetadata(metadata.text);
  console.log(
    `${families.length} families listed; asking the CSS API for the top ${options.count}`
  );

  const { catalog, skipped } = await buildCatalog(families, {
    count: options.count,
    concurrency: options.concurrency,
    log: (line) => console.log(line),
  });
  for (const reason of skipped) console.warn(`skipped ${reason}`);

  if (options.verify) {
    console.log('Checking every file is a static TrueType font…');
    const problems = await verifyCatalog(catalog, { concurrency: options.concurrency });
    if (problems.length > 0) throw new Error(`Unusable files:\n${problems.join('\n')}`);
  }

  const json = await formatCatalog(catalog, options.out);
  await writeFile(options.out, json);
  const weights = catalog.reduce((sum, entry) => sum + entry.weights.length, 0);
  console.log(
    `Wrote ${path.relative(process.cwd(), options.out)}: ${catalog.length} families, ${weights} weights, ${json.length} bytes`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
