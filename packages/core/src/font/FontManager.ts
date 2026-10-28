/**
 * FontManager for Quar Animator
 * Central font loading, parsing, and caching via opentype.js
 * Supports weight-aware caching (family:weight keys) and Google Fonts catalog.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/require-await */
import opentype from 'opentype.js';
import googleFonts from './googleFonts.json';

export interface FontInfo {
  family: string;
  source: 'bundled' | 'google' | 'local';
}

/** Google Fonts' categories, as the Fonts API names them */
export type GoogleFontCategory = 'sans-serif' | 'serif' | 'display' | 'handwriting' | 'monospace';

/** Google Font catalog entry */
export interface GoogleFontEntry {
  family: string;
  category: GoogleFontCategory;
  /** The static upright weights it has, ascending */
  weights: number[];
  /** The gstatic TTF URL of the weight it has nearest to `weight` */
  url: (weight: number) => string;
}

/** Build a cache key from family + weight */
function fontCacheKey(family: string, weight: number = 400): string {
  return `${family}:${weight}`;
}

/** Fetch a font file and parse it. */
async function fetchFont(url: string): Promise<opentype.Font> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);
  const buffer = await response.arrayBuffer();
  return opentype.parse(buffer);
}

export class FontManager {
  private fontCache: Map<string, opentype.Font> = new Map();
  /** Counts changes to the loaded fonts (see `generation`). */
  private changes = 0;
  private loadingPromises: Map<string, Promise<opentype.Font>> = new Map();
  private availableFonts: Map<string, FontInfo> = new Map();

  /**
   * Load a font from an ArrayBuffer (local upload or bundled).
   */
  async loadFontFromBuffer(
    buffer: ArrayBuffer,
    family: string,
    source: 'bundled' | 'local' = 'local',
    weight: number = 400
  ): Promise<opentype.Font> {
    const key = fontCacheKey(family, weight);
    const existing = this.fontCache.get(key);
    if (existing) return existing;

    const loading = this.loadingPromises.get(key);
    if (loading) return loading;

    // Parsing is synchronous, so the font is cached before anyone else can ask
    // for it: there is nothing in flight to record in loadingPromises.
    const font = opentype.parse(buffer);
    this.fontCache.set(key, font);
    this.changes++;
    this.availableFonts.set(family, { family, source });
    return font;
  }

  /**
   * Load a font from a URL (Google Fonts or other remote source).
   * Requires consent check to be done by caller.
   */
  async loadFontFromUrl(
    url: string,
    family: string,
    source: 'google' | 'bundled' = 'google',
    weight: number = 400
  ): Promise<opentype.Font> {
    const key = fontCacheKey(family, weight);
    const existing = this.fontCache.get(key);
    if (existing) return existing;

    const loading = this.loadingPromises.get(key);
    if (loading) return loading;

    return this.download(key, url, family, source);
  }

  /**
   * Load a Google Font by family and weight from the catalog.
   * Returns null if the font is not in the catalog.
   * Uses per-weight TTF URLs from the catalog directly.
   */
  async loadGoogleFont(family: string, weight: number = 400): Promise<opentype.Font | null> {
    const entry = findGoogleFont(family);
    if (!entry) return null;
    // Snap to closest available weight
    const closestWeight = nearestWeight(entry.weights, weight);

    const key = fontCacheKey(family, closestWeight);
    const existing = this.fontCache.get(key);
    if (existing) return existing;

    const loading = this.loadingPromises.get(key);
    if (loading) return loading;

    return this.download(key, entry.url(closestWeight), family, 'google');
  }

  /**
   * Download and parse a font, caching it under `key` unless removeFont or
   * dispose dropped the download meanwhile: then the caller still gets the
   * font, but it isn't added back.
   */
  private download(
    key: string,
    url: string,
    family: string,
    source: FontInfo['source']
  ): Promise<opentype.Font> {
    const promise = fetchFont(url).then((font) => {
      if (this.loadingPromises.get(key) === promise) {
        this.fontCache.set(key, font);
        this.changes++;
        this.availableFonts.set(family, { family, source });
      }
      return font;
    });

    this.loadingPromises.set(key, promise);
    // Clear the in-flight entry on BOTH settle paths so a failed load doesn't
    // leave a rejected promise cached (which would make the font unloadable for
    // the session) — but only this download's entry: after removeFont a new
    // load of the same font may have taken the key. The `.catch` swallows only
    // the derived cleanup promise; the promise returned to the caller still
    // rejects.
    void promise
      .catch(() => {})
      .finally(() => {
        if (this.loadingPromises.get(key) === promise) this.loadingPromises.delete(key);
      });
    return promise;
  }

  /**
   * Get a cached font by family name and optional weight.
   * Falls back to: exact key → family:400 → any weight of same family → null
   */
  getFont(family: string, weight: number = 400): opentype.Font | null {
    // Exact match
    const exact = this.fontCache.get(fontCacheKey(family, weight));
    if (exact) return exact;
    // Fallback to 400
    if (weight !== 400) {
      const regular = this.fontCache.get(fontCacheKey(family, 400));
      if (regular) return regular;
    }
    // Fallback to any weight of this family
    for (const [key, font] of this.fontCache) {
      if (key.startsWith(family + ':')) return font;
    }
    return null;
  }

  /**
   * Goes up whenever a font is loaded or removed: what a fallback stood in for
   * may be here now, so text drawn before can be drawn again with it.
   */
  get generation(): number {
    return this.changes;
  }

  /**
   * Get a font or return the first available fallback.
   */
  getFontOrFallback(family: string, weight: number = 400): opentype.Font | null {
    const font = this.getFont(family, weight);
    if (font) return font;
    // Return any cached font as fallback
    for (const f of this.fontCache.values()) {
      return f;
    }
    return null;
  }

  /**
   * Check if a font is loaded (any weight).
   */
  hasFont(family: string): boolean {
    for (const key of this.fontCache.keys()) {
      if (key.startsWith(family + ':')) return true;
    }
    return false;
  }

  /**
   * Check if a specific family:weight is loaded.
   */
  hasFontWeight(family: string, weight: number): boolean {
    return this.fontCache.has(fontCacheKey(family, weight));
  }

  /**
   * Check if a font is currently loading.
   */
  isLoading(family: string, weight?: number): boolean {
    if (weight !== undefined) {
      return this.loadingPromises.has(fontCacheKey(family, weight));
    }
    for (const key of this.loadingPromises.keys()) {
      if (key.startsWith(family + ':')) return true;
    }
    return false;
  }

  /**
   * Get all available (loaded) font families.
   */
  getAvailableFonts(): FontInfo[] {
    return Array.from(this.availableFonts.values());
  }

  /**
   * Get loaded font family names (deduplicated).
   */
  getLoadedFamilies(): string[] {
    const families = new Set<string>();
    for (const key of this.fontCache.keys()) {
      families.add(key.split(':')[0]!);
    }
    return Array.from(families);
  }

  /**
   * Get loaded weights for a specific family.
   */
  getLoadedWeights(family: string): number[] {
    const weights: number[] = [];
    for (const key of this.fontCache.keys()) {
      if (key.startsWith(family + ':')) {
        const w = parseInt(key.split(':')[1]!, 10);
        if (!isNaN(w)) weights.push(w);
      }
    }
    return weights.sort((a, b) => a - b);
  }

  /**
   * Remove a specific font from cache, along with any of its weights still
   * downloading (they finish without being added).
   */
  removeFont(family: string): void {
    // Remove all weights
    for (const key of [...this.fontCache.keys()]) {
      if (key.startsWith(family + ':')) {
        this.fontCache.delete(key);
        this.changes++;
      }
    }
    for (const key of [...this.loadingPromises.keys()]) {
      if (key.startsWith(family + ':')) this.loadingPromises.delete(key);
    }
    this.availableFonts.delete(family);
  }

  /**
   * Dispose all fonts and clear caches.
   */
  dispose(): void {
    this.fontCache.clear();
    this.changes++;
    this.loadingPromises.clear();
    this.availableFonts.clear();
  }
}

/** Singleton FontManager instance */
let globalFontManager: FontManager | null = null;

export function getFontManager(): FontManager {
  if (!globalFontManager) {
    globalFontManager = new FontManager();
  }
  return globalFontManager;
}

/** Web-safe font families (available on most systems) */
export const WEB_SAFE_FONTS = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Trebuchet MS',
  'Impact',
  'Comic Sans MS',
  'Tahoma',
  'Palatino',
  'Garamond',
] as const;

/** The weight of `weights` nearest to `weight`: the lighter of two as near, 400 for a non-number. */
export function nearestWeight(weights: readonly number[], weight: number): number {
  const wanted = Number.isFinite(weight) ? weight : 400;
  let best = weights[0] ?? 400;
  for (const candidate of weights) {
    if (Math.abs(candidate - wanted) < Math.abs(best - wanted)) best = candidate;
  }
  return best;
}

/** An entry of googleFonts.json, written by scripts/google-fonts.mjs */
interface GoogleFontRecord {
  family: string;
  category: string;
  weights: number[];
  files: Record<string, string>;
}

const CATEGORIES: readonly GoogleFontCategory[] = [
  'sans-serif',
  'serif',
  'display',
  'handwriting',
  'monospace',
];

function catalogEntry(record: GoogleFontRecord): GoogleFontEntry {
  const weights = [...record.weights];
  const files = record.files;
  const category = CATEGORIES.find((known) => known === record.category) ?? 'sans-serif';
  return {
    family: record.family,
    category,
    weights,
    url: (weight) => files[String(nearestWeight(weights, weight))] ?? '',
  };
}

/**
 * Google Fonts catalog: the most popular families, most popular first, with
 * the static TTF of each weight (googleFonts.json, generated by
 * `pnpm --filter @quar/core fonts:catalog`; see README.md beside it).
 */
export const GOOGLE_FONTS_CATALOG: GoogleFontEntry[] = (googleFonts as GoogleFontRecord[]).map(
  catalogEntry
);

const catalogByFamily = new Map(GOOGLE_FONTS_CATALOG.map((entry) => [entry.family, entry]));

/** The catalog's entry for a family, if Google Fonts has it. */
export function findGoogleFont(family: string): GoogleFontEntry | undefined {
  return catalogByFamily.get(family);
}
