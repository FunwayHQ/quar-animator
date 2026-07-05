/**
 * FontManager for Quar Animator
 * Central font loading, parsing, and caching via opentype.js
 * Supports weight-aware caching (family:weight keys) and Google Fonts catalog.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/require-await */
import opentype from 'opentype.js';

export interface FontInfo {
  family: string;
  source: 'bundled' | 'google' | 'local';
}

/** Google Font catalog entry */
export interface GoogleFontEntry {
  family: string;
  weights: number[];
  /** Returns the gstatic TTF URL for a given weight */
  url: (weight: number) => string;
}

/** Build a cache key from family + weight */
function fontCacheKey(family: string, weight: number = 400): string {
  return `${family}:${weight}`;
}

export class FontManager {
  private fontCache: Map<string, opentype.Font> = new Map();
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

    const promise = (() => {
      const font = opentype.parse(buffer);
      this.fontCache.set(key, font);
      this.availableFonts.set(family, { family, source });
      this.loadingPromises.delete(key);
      return font;
    })();

    this.loadingPromises.set(key, Promise.resolve(promise));
    return promise;
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

    const promise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const font = opentype.parse(buffer);
      this.fontCache.set(key, font);
      this.availableFonts.set(family, { family, source });
      return font;
    })();

    this.loadingPromises.set(key, promise);
    // Clear the in-flight entry on BOTH settle paths so a failed load doesn't
    // leave a rejected promise cached (which would make the font unloadable for
    // the session). The `.catch` swallows only the derived cleanup promise; the
    // original `promise` returned to the caller still rejects.
    void promise.catch(() => {}).finally(() => this.loadingPromises.delete(key));
    return promise;
  }

  /**
   * Load a Google Font by family and weight from the catalog.
   * Returns null if the font is not in the catalog.
   * Uses per-weight TTF URLs from the catalog directly.
   */
  async loadGoogleFont(family: string, weight: number = 400): Promise<opentype.Font | null> {
    const entry = GOOGLE_FONTS_CATALOG.find((e) => e.family === family);
    if (!entry) return null;
    // Snap to closest available weight
    const closestWeight = entry.weights.reduce((prev, curr) =>
      Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev
    );

    const key = fontCacheKey(family, closestWeight);
    const existing = this.fontCache.get(key);
    if (existing) return existing;

    const loading = this.loadingPromises.get(key);
    if (loading) return loading;

    const promise = (async () => {
      const url = entry.url(closestWeight);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const font = opentype.parse(buffer);
      this.fontCache.set(key, font);
      this.availableFonts.set(family, { family, source: 'google' });
      return font;
    })();

    this.loadingPromises.set(key, promise);
    // Clear the in-flight entry on both settle paths (see loadFontFromUrl).
    void promise.catch(() => {}).finally(() => this.loadingPromises.delete(key));
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
   * Remove a specific font from cache.
   */
  removeFont(family: string): void {
    // Remove all weights
    for (const key of [...this.fontCache.keys()]) {
      if (key.startsWith(family + ':')) {
        this.fontCache.delete(key);
        this.loadingPromises.delete(key);
      }
    }
    this.availableFonts.delete(family);
  }

  /**
   * Dispose all fonts and clear caches.
   */
  dispose(): void {
    this.fontCache.clear();
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

/**
 * Google Fonts catalog — curated popular fonts with per-weight TTF URLs.
 * URLs sourced from Google Fonts CSS2 API (static TTF format).
 */
export const GOOGLE_FONTS_CATALOG: GoogleFontEntry[] = [
  {
    family: 'Roboto',
    weights: [100, 300, 400, 500, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbGmT.ttf',
        300: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuaabWmT.ttf',
        400: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbWmT.ttf',
        500: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWub2bWmT.ttf',
        700: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuYjammT.ttf',
        900: 'https://fonts.gstatic.com/s/roboto/v50/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWuZtammT.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Open Sans',
    weights: [300, 400, 500, 600, 700, 800],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsiH0C4n.ttf',
        400: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C4n.ttf',
        500: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjr0C4n.ttf',
        600: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsgH1y4n.ttf',
        700: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsg-1y4n.ttf',
        800: 'https://fonts.gstatic.com/s/opensans/v44/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgshZ1y4n.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Lato',
    weights: [100, 300, 400, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/lato/v25/S6u8w4BMUTPHh30wWw.ttf',
        300: 'https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh7USew8.ttf',
        400: 'https://fonts.gstatic.com/s/lato/v25/S6uyw4BMUTPHvxk.ttf',
        700: 'https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh6UVew8.ttf',
        900: 'https://fonts.gstatic.com/s/lato/v25/S6u9w4BMUTPHh50Xew8.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Montserrat',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Uw-.ttf',
        200: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvr6Ew-.ttf',
        300: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCs16Ew-.ttf',
        400: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-.ttf',
        500: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtZ6Ew-.ttf',
        600: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCu170w-.ttf',
        700: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCuM70w-.ttf',
        800: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvr70w-.ttf',
        900: 'https://fonts.gstatic.com/s/montserrat/v31/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCvC70w-.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Poppins',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/poppins/v24/pxiGyp8kv8JHgFVrLPTedw.ttf',
        200: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLFj_V1s.ttf',
        300: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLDz8V1s.ttf',
        400: 'https://fonts.gstatic.com/s/poppins/v24/pxiEyp8kv8JHgFVrFJA.ttf',
        500: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLGT9V1s.ttf',
        600: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLEj6V1s.ttf',
        700: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLCz7V1s.ttf',
        800: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLDD4V1s.ttf',
        900: 'https://fonts.gstatic.com/s/poppins/v24/pxiByp8kv8JHgFVrLBT5V1s.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Oswald',
    weights: [200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        200: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs13FvgUE.ttf',
        300: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs169vgUE.ttf',
        400: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1_FvgUE.ttf',
        500: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs18NvgUE.ttf',
        600: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1y9ogUE.ttf',
        700: 'https://fonts.gstatic.com/s/oswald/v57/TK3_WkUHHAIjg75cFRf3bXL8LICs1xZogUE.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Raleway',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVvao4CP.ttf',
        200: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVtaooCP.ttf',
        300: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVuEooCP.ttf',
        400: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVvaooCP.ttf',
        500: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVvoooCP.ttf',
        600: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVsEpYCP.ttf',
        700: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVs9pYCP.ttf',
        800: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVtapYCP.ttf',
        900: 'https://fonts.gstatic.com/s/raleway/v37/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVtzpYCP.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Nunito',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        200: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDDshRTM.ttf',
        300: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDOUhRTM.ttf',
        400: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTM.ttf',
        500: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDIkhRTM.ttf',
        600: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDGUmRTM.ttf',
        700: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDFwmRTM.ttf',
        800: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDDsmRTM.ttf',
        900: 'https://fonts.gstatic.com/s/nunito/v32/XRXI3I6Li01BKofiOc5wtlZ2di8HDBImRTM.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Playfair Display',
    weights: [400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf',
        500: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKd3vUDQ.ttf',
        600: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKebukDQ.ttf',
        700: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKeiukDQ.ttf',
        800: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKfFukDQ.ttf',
        900: 'https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKfsukDQ.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Merriweather',
    weights: [300, 400, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/merriweather/v33/u-4D0qyriQwlOrhSvowK_l5UcA6zuSYEqOzpPe3HOZJ5eX1WtLaQwmYiScCmDxhtNOKl8yDrgCcqEw.ttf',
        400: 'https://fonts.gstatic.com/s/merriweather/v33/u-4D0qyriQwlOrhSvowK_l5UcA6zuSYEqOzpPe3HOZJ5eX1WtLaQwmYiScCmDxhtNOKl8yDr3icqEw.ttf',
        700: 'https://fonts.gstatic.com/s/merriweather/v33/u-4D0qyriQwlOrhSvowK_l5UcA6zuSYEqOzpPe3HOZJ5eX1WtLaQwmYiScCmDxhtNOKl8yDrOSAqEw.ttf',
        900: 'https://fonts.gstatic.com/s/merriweather/v33/u-4D0qyriQwlOrhSvowK_l5UcA6zuSYEqOzpPe3HOZJ5eX1WtLaQwmYiScCmDxhtNOKl8yDrdyAqEw.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Source Sans 3',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        200: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kw461EN.ttf',
        300: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kzm61EN.ttf',
        400: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky461EN.ttf',
        500: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8KyK61EN.ttf',
        600: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kxm7FEN.ttf',
        700: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kxf7FEN.ttf',
        800: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Kw47FEN.ttf',
        900: 'https://fonts.gstatic.com/s/sourcesans3/v19/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8KwR7FEN.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'PT Sans',
    weights: [400, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/ptsans/v18/jizaRExUiTo99u79P0U.ttf',
        700: 'https://fonts.gstatic.com/s/ptsans/v18/jizfRExUiTo99u79B_mh4Ok.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Rubik',
    weights: [300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-WYi1UA.ttf',
        400: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-B4i1UA.ttf',
        500: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-NYi1UA.ttf',
        600: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-2Y-1UA.ttf',
        700: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-4I-1UA.ttf',
        800: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-h4-1UA.ttf',
        900: 'https://fonts.gstatic.com/s/rubik/v31/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-ro-1UA.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Work Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nWNig.ttf',
        200: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K8nXNig.ttf',
        300: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32KxfXNig.ttf',
        400: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXNig.ttf',
        500: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K3vXNig.ttf',
        600: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K5fQNig.ttf',
        700: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K67QNig.ttf',
        800: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K8nQNig.ttf',
        900: 'https://fonts.gstatic.com/s/worksans/v24/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K-DQNig.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Fira Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/firasans/v18/va9C4kDNxMZdWfMOD5Vn9IjO.ttf',
        200: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnWKnuQQ.ttf',
        300: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnPKruQQ.ttf',
        400: 'https://fonts.gstatic.com/s/firasans/v18/va9E4kDNxMZdWfMOD5VfkA.ttf',
        500: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnZKvuQQ.ttf',
        600: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnSKzuQQ.ttf',
        700: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnLK3uQQ.ttf',
        800: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnMK7uQQ.ttf',
        900: 'https://fonts.gstatic.com/s/firasans/v18/va9B4kDNxMZdWfMOD5VnFK_uQQ.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Noto Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9At9d.ttf',
        200: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyB9A99d.ttf',
        300: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyCjA99d.ttf',
        400: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf',
        500: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyDPA99d.ttf',
        600: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAjBN9d.ttf',
        700: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf',
        800: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyB9BN9d.ttf',
        900: 'https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyBUBN9d.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Ubuntu',
    weights: [300, 400, 500, 700],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/ubuntu/v21/4iCv6KVjbNBYlgoC1CzTtw.ttf',
        400: 'https://fonts.gstatic.com/s/ubuntu/v21/4iCs6KVjbNBYlgo6eA.ttf',
        500: 'https://fonts.gstatic.com/s/ubuntu/v21/4iCv6KVjbNBYlgoCjC3Ttw.ttf',
        700: 'https://fonts.gstatic.com/s/ubuntu/v21/4iCv6KVjbNBYlgoCxCvTtw.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Quicksand',
    weights: [300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkKEo18E.ttf',
        400: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkP8o18E.ttf',
        500: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkM0o18E.ttf',
        600: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkCEv18E.ttf',
        700: 'https://fonts.gstatic.com/s/quicksand/v37/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkBgv18E.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Cabin',
    weights: [400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/cabin/v35/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkV2EL7E.ttf',
        500: 'https://fonts.gstatic.com/s/cabin/v35/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkW-EL7E.ttf',
        600: 'https://fonts.gstatic.com/s/cabin/v35/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkYODL7E.ttf',
        700: 'https://fonts.gstatic.com/s/cabin/v35/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkbqDL7E.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Inconsolata',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        200: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7LppwU8aRo.ttf',
        300: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp9s8aRo.ttf',
        400: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp4U8aRo.ttf',
        500: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp7c8aRo.ttf',
        600: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp1s7aRo.ttf',
        700: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp2I7aRo.ttf',
        800: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7LppwU7aRo.ttf',
        900: 'https://fonts.gstatic.com/s/inconsolata/v37/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lppyw7aRo.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Libre Baskerville',
    weights: [400, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/librebaskerville/v24/kmKUZrc3Hgbbcjq75U4uslyuy4kn0olVQ-LglH6T17uj8Q4SCQ.ttf',
        700: 'https://fonts.gstatic.com/s/librebaskerville/v24/kmKUZrc3Hgbbcjq75U4uslyuy4kn0olVQ-LglH6T17ujFgkSCQ.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Karla',
    weights: [200, 300, 400, 500, 600, 700, 800],
    url: (w) => {
      const map: Record<number, string> = {
        200: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDeJqqFA.ttf',
        300: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDppqqFA.ttf',
        400: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTD-JqqFA.ttf',
        500: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDypqqFA.ttf',
        600: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDJp2qFA.ttf',
        700: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDH52qFA.ttf',
        800: 'https://fonts.gstatic.com/s/karla/v33/qkBIXvYC6trAT55ZBi1ueQVIjQTDeJ2qFA.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Josefin Sans',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_DjRXME.ttf',
        200: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_LjQXME.ttf',
        300: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_GbQXME.ttf',
        400: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_DjQXME.ttf',
        500: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_ArQXME.ttf',
        600: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_ObXXME.ttf',
        700: 'https://fonts.gstatic.com/s/josefinsans/v34/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_N_XXME.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Archivo',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTNDJp8A.ttf',
        200: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTtDNp8A.ttf',
        300: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTajNp8A.ttf',
        400: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTNDNp8A.ttf',
        500: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTBjNp8A.ttf',
        600: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTT6jRp8A.ttf',
        700: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTT0zRp8A.ttf',
        800: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTtDRp8A.ttf',
        900: 'https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTnTRp8A.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'DM Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAop1hTg.ttf',
        200: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAIpxhTg.ttf',
        300: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwA_JxhTg.ttf',
        400: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAopxhTg.ttf',
        500: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAkJxhTg.ttf',
        600: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAfJthTg.ttf',
        700: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwARZthTg.ttf',
        800: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAIpthTg.ttf',
        900: 'https://fonts.gstatic.com/s/dmsans/v17/rP2tp2ywxg089UriI5-g4vlH9VoD8CmcqZG40F9JadbnoEwAC5thTg.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Space Grotesk',
    weights: [300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj62UUsj.ttf',
        400: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oUUsj.ttf',
        500: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7aUUsj.ttf',
        600: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj42Vksj.ttf',
        700: 'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Bitter',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8fbeCL8.ttf',
        200: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8XbfCL8.ttf',
        300: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8ajfCL8.ttf',
        400: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8fbfCL8.ttf',
        500: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8cTfCL8.ttf',
        600: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8SjYCL8.ttf',
        700: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8RHYCL8.ttf',
        800: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8XbYCL8.ttf',
        900: 'https://fonts.gstatic.com/s/bitter/v40/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8V_YCL8.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Crimson Text',
    weights: [400, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/crimsontext/v19/wlp2gwHKFkZgtmSR3NB0oRJvaA.ttf',
        600: 'https://fonts.gstatic.com/s/crimsontext/v19/wlppgwHKFkZgtmSR3NB0oRJXsCx2Cw.ttf',
        700: 'https://fonts.gstatic.com/s/crimsontext/v19/wlppgwHKFkZgtmSR3NB0oRJX1C12Cw.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'IBM Plex Mono',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6pfjptAgt5VM-kVkqdyU8n3kwq0g.ttf',
        200: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3uAL8lc.ttf',
        300: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3oQI8lc.ttf',
        400: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf',
        500: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3twJ8lc.ttf',
        600: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3vAO8lc.ttf',
        700: 'https://fonts.gstatic.com/s/ibmplexmono/v20/-F6qfjptAgt5VM-kVkqdyU8n3pQP8lc.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'IBM Plex Sans',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6lhzAA.ttf',
        200: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDallzAA.ttf',
        300: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDtFlzAA.ttf',
        400: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf',
        500: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD2FlzAA.ttf',
        600: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDNF5zAA.ttf',
        700: 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSDDV5zAA.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
];
