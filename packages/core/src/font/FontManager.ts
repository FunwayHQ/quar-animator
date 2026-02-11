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
      this.loadingPromises.delete(key);
      return font;
    })();

    this.loadingPromises.set(key, promise);
    return promise;
  }

  /**
   * Load a Google Font by family and weight from the catalog.
   * Returns null if the font is not in the catalog.
   */
  async loadGoogleFont(family: string, weight: number = 400): Promise<opentype.Font | null> {
    const entry = GOOGLE_FONTS_CATALOG.find((e) => e.family === family);
    if (!entry) return null;
    // Snap to closest available weight
    const closestWeight = entry.weights.reduce((prev, curr) =>
      Math.abs(curr - weight) < Math.abs(prev - weight) ? curr : prev
    );
    const url = entry.url(closestWeight);
    return this.loadFontFromUrl(url, family, 'google', closestWeight);
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
 * Google Fonts catalog — curated popular fonts with gstatic TTF URLs.
 * URLs use the well-known gstatic CDN pattern.
 */
export const GOOGLE_FONTS_CATALOG: GoogleFontEntry[] = [
  {
    family: 'Roboto',
    weights: [100, 300, 400, 500, 700, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/roboto/v47/KFOMCnqEu92Fr1ME7kSn66aGLdTylUAMQXC89YmC2DPNWubEbGmT.ttf`,
  },
  {
    family: 'Open Sans',
    weights: [300, 400, 500, 600, 700, 800],
    url: (_w) =>
      `https://fonts.gstatic.com/s/opensans/v40/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVQUwaEQbjB_mQ.ttf`,
  },
  {
    family: 'Lato',
    weights: [100, 300, 400, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/lato/v24/S6u8w4BMUTPHh30AXC-qNiXg7Q.ttf',
        300: 'https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh7USSwiPGQ3q5d0.ttf',
        400: 'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wXiWtFCc.ttf',
        700: 'https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh6UVSwiPGQ3q5d0.ttf',
        900: 'https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh50XSwiPGQ3q5d0.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Montserrat',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/montserrat/v29/JTUHjIg1_i6t8kCHKm4532VJOt5-QNFgpCtr6Ew-Y3tcoqK5.ttf`,
  },
  {
    family: 'Poppins',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/poppins/v22/pxiGyp8kv8JHgFVrLPTucHtAOvWDSA.ttf',
        200: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLFj_Z1xlFd2JQEk.ttf',
        300: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLDz8Z1xlFd2JQEk.ttf',
        400: 'https://fonts.gstatic.com/s/poppins/v22/pxiEyp8kv8JHgFVrJJfecnFHGPc.ttf',
        500: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLGT9Z1xlFd2JQEk.ttf',
        600: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLEj6Z1xlFd2JQEk.ttf',
        700: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLCz7Z1xlFd2JQEk.ttf',
        800: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLDD4Z1xlFd2JQEk.ttf',
        900: 'https://fonts.gstatic.com/s/poppins/v22/pxiByp8kv8JHgFVrLBT5Z1xlFd2JQEk.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Oswald',
    weights: [200, 300, 400, 500, 600, 700],
    url: (_w) =>
      `https://fonts.gstatic.com/s/oswald/v53/TK3_WkUHHAIjg75cFRf3bXL8LICs1_FvsUZiYySUhiCXAA.ttf`,
  },
  {
    family: 'Raleway',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/raleway/v34/1Ptxg8zYS_SKggPN4iEgvnHyvveLxVvaorCIPrE.ttf`,
  },
  {
    family: 'Nunito',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/nunito/v26/XRXI3I6Li01BKofiOc5wtlZ2di8HDLshRTY9jo7eTWk.ttf`,
  },
  {
    family: 'Playfair Display',
    weights: [400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQZNLo_U2r.ttf`,
  },
  {
    family: 'Merriweather',
    weights: [300, 400, 700, 900],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/merriweather/v30/u-4n0qyriQwlOrhSvowK_l521wRZWMf6hPvhPQ.ttf',
        400: 'https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZMdeX3rg.ttf',
        700: 'https://fonts.gstatic.com/s/merriweather/v30/u-4n0qyriQwlOrhSvowK_l52xwNZWMf6hPvhPQ.ttf',
        900: 'https://fonts.gstatic.com/s/merriweather/v30/u-4n0qyriQwlOrhSvowK_l52_wFZWMf6hPvhPQ.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Source Sans 3',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/sourcesans3/v15/nwpBtKy2OAdR1K-IwhWudF-R9QMylBJAV3Bo8Ky462EM.ttf`,
  },
  {
    family: 'PT Sans',
    weights: [400, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/ptsans/v17/jizaRExUiTo99u79D0KExcOPIDU.ttf',
        700: 'https://fonts.gstatic.com/s/ptsans/v17/jizfRExUiTo99u79B_mh0O6tLR8a8zI.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Rubik',
    weights: [300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/rubik/v28/iJWZBXyIfDnIV5PNhY1KTN7Z-Yh-B4i1UE80V4bVkA.ttf`,
  },
  {
    family: 'Work Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/worksans/v19/QGY_z_wNahGAdqQ43RhVcIgYT2Xz5u32K0nXNigDp6_cOg.ttf`,
  },
  {
    family: 'Fira Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/firasans/v17/va9C4kDNxMZdWfMOD5Vn9IjOazP3dUTP.ttf',
        200: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnWKnuQR37fF3Wlg.ttf',
        300: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnPKruQR37fF3Wlg.ttf',
        400: 'https://fonts.gstatic.com/s/firasans/v17/va9E4kDNxMZdWfMOD5VfkILKSTbndQ.ttf',
        500: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnZKvuQR37fF3Wlg.ttf',
        600: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnSKzuQR37fF3Wlg.ttf',
        700: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnLK3uQR37fF3Wlg.ttf',
        800: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnMK7uQR37fF3Wlg.ttf',
        900: 'https://fonts.gstatic.com/s/firasans/v17/va9B4kDNxMZdWfMOD5VnFK_uQR37fF3Wlg.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Noto Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/notosans/v36/o-0bIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjc5a7du3mhPy0.ttf`,
  },
  {
    family: 'Ubuntu',
    weights: [300, 400, 500, 700],
    url: (w) => {
      const map: Record<number, string> = {
        300: 'https://fonts.gstatic.com/s/ubuntu/v20/4iCv6KVjbNBYlgoC1CzTtxZOhnC41Y0.ttf',
        400: 'https://fonts.gstatic.com/s/ubuntu/v20/4iCs6KVjbNBYlgo6eAT3v02QFg.ttf',
        500: 'https://fonts.gstatic.com/s/ubuntu/v20/4iCv6KVjbNBYlgoCjC3TtxZOhnC41Y0.ttf',
        700: 'https://fonts.gstatic.com/s/ubuntu/v20/4iCv6KVjbNBYlgoCxCvTtxZOhnC41Y0.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Quicksand',
    weights: [300, 400, 500, 600, 700],
    url: (_w) =>
      `https://fonts.gstatic.com/s/quicksand/v31/6xK-dSZaM9iE8KbpRA_LJ3z8mH9BOJvgkP8o58a-xDwxUD2GFw.ttf`,
  },
  {
    family: 'Cabin',
    weights: [400, 500, 600, 700],
    url: (_w) =>
      `https://fonts.gstatic.com/s/cabin/v27/u-4X0qWljRw-PfU81xCKCpdpbgZJl6XFpfEd7eA9BIxxkV2EH7alx0E.ttf`,
  },
  {
    family: 'Inconsolata',
    weights: [200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/inconsolata/v32/QldgNThLqRwH-OJ1UHjlKENVzkWGVkL3GZQmAwLYxYWI2qfdm7Lpp4U8aRr8lleY2co.ttf`,
  },
  {
    family: 'Libre Baskerville',
    weights: [400, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/librebaskerville/v14/kmKnZrc3Hgbbcjq75U4uslyuy4kqN1NlOlCE.ttf',
        700: 'https://fonts.gstatic.com/s/librebaskerville/v14/kmKiZrc3Hgbbcjq75U4uslyuy4kqN1NhMFgkSR0.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'Karla',
    weights: [200, 300, 400, 500, 600, 700, 800],
    url: (_w) =>
      `https://fonts.gstatic.com/s/karla/v31/qkBIXvYC6trAT55ZBi1ueQVIjQTD-JqqFENLR7fHGw.ttf`,
  },
  {
    family: 'Josefin Sans',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (_w) =>
      `https://fonts.gstatic.com/s/josefinsans/v32/Qw3PZQNVED7rKGKxtqIqX5E-AVSJrOCfjY46_DjRbMZhKSbpUVzEEQ.ttf`,
  },
  {
    family: 'Archivo',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/archivo/v19/k3kPo8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTNDNp8B1oJ0vyVQ.ttf`,
  },
  {
    family: 'DM Sans',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/dmsans/v15/rP2Yp2ywxg089UriI5-g4vlH9VoD8Cmcqbu0-K4.ttf`,
  },
  {
    family: 'Space Grotesk',
    weights: [300, 400, 500, 600, 700],
    url: (_w) =>
      `https://fonts.gstatic.com/s/spacegrotesk/v16/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj7oUXskPMBBSSJLm2E.ttf`,
  },
  {
    family: 'Bitter',
    weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    url: (_w) =>
      `https://fonts.gstatic.com/s/bitter/v36/raxhHiqOu8IVPmnRc6SY1KXhnF_Y8fbeCL_EXFh2reU.ttf`,
  },
  {
    family: 'Crimson Text',
    weights: [400, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        400: 'https://fonts.gstatic.com/s/crimsontext/v19/wlp2gwHKFkZgtmSR3NB0oRJvaAJSA_JN3Q.ttf',
        600: 'https://fonts.gstatic.com/s/crimsontext/v19/wlppgwHKFkZgtmSR3NB0oRJXsCx2C9lR1LFffg.ttf',
        700: 'https://fonts.gstatic.com/s/crimsontext/v19/wlppgwHKFkZgtmSR3NB0oRJX1C12C9lR1LFffg.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'IBM Plex Mono',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6pfjptAgt5VM-kVkqdyU8n3kwq0n1hj-sNFQ.ttf',
        200: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3uAL8ldPg-IUDNg.ttf',
        300: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3oQI8ldPg-IUDNg.ttf',
        400: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F63fjptAgt5VM-kVkqdyU8n5igg1l9kn27e.ttf',
        500: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3twJ8ldPg-IUDNg.ttf',
        600: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3vAO8ldPg-IUDNg.ttf',
        700: 'https://fonts.gstatic.com/s/ibmplexmono/v19/-F6qfjptAgt5VM-kVkqdyU8n3pQP8ldPg-IUDNg.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
  {
    family: 'IBM Plex Sans',
    weights: [100, 200, 300, 400, 500, 600, 700],
    url: (w) => {
      const map: Record<number, string> = {
        100: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX-KVElMYYaJe8bpLHnCwDKjbLeEKxIedbzDw.ttf',
        200: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjR7_MIZmdd_qFmo.ttf',
        300: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjXr8MIZmdd_qFmo.ttf',
        400: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYXgKVElMYYaJe8bpLHnCwDKtdbUFI5NadY.ttf',
        500: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjSL9MIZmdd_qFmo.ttf',
        600: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjQ76MIZmdd_qFmo.ttf',
        700: 'https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjWr7MIZmdd_qFmo.ttf',
      };
      return map[w] ?? map[400]!;
    },
  },
];
