/**
 * FontManager for Quar Animator
 * Central font loading, parsing, and caching via opentype.js
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/require-await */
import opentype from 'opentype.js';

export interface FontInfo {
  family: string;
  source: 'bundled' | 'google' | 'local';
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
    source: 'bundled' | 'local' = 'local'
  ): Promise<opentype.Font> {
    const existing = this.fontCache.get(family);
    if (existing) return existing;

    const loading = this.loadingPromises.get(family);
    if (loading) return loading;

    const promise = (() => {
      const font = opentype.parse(buffer);
      this.fontCache.set(family, font);
      this.availableFonts.set(family, { family, source });
      this.loadingPromises.delete(family);
      return font;
    })();

    this.loadingPromises.set(family, Promise.resolve(promise));
    return promise;
  }

  /**
   * Load a font from a URL (Google Fonts or other remote source).
   * Requires consent check to be done by caller.
   */
  async loadFontFromUrl(
    url: string,
    family: string,
    source: 'google' | 'bundled' = 'google'
  ): Promise<opentype.Font> {
    const existing = this.fontCache.get(family);
    if (existing) return existing;

    const loading = this.loadingPromises.get(family);
    if (loading) return loading;

    const promise = (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch font: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      const font = opentype.parse(buffer);
      this.fontCache.set(family, font);
      this.availableFonts.set(family, { family, source });
      this.loadingPromises.delete(family);
      return font;
    })();

    this.loadingPromises.set(family, promise);
    return promise;
  }

  /**
   * Get a cached font by family name.
   */
  getFont(family: string): opentype.Font | null {
    return this.fontCache.get(family) ?? null;
  }

  /**
   * Get a font or return the first available fallback.
   */
  getFontOrFallback(family: string): opentype.Font | null {
    const font = this.fontCache.get(family);
    if (font) return font;
    // Return any cached font as fallback
    for (const f of this.fontCache.values()) {
      return f;
    }
    return null;
  }

  /**
   * Check if a font is loaded.
   */
  hasFont(family: string): boolean {
    return this.fontCache.has(family);
  }

  /**
   * Check if a font is currently loading.
   */
  isLoading(family: string): boolean {
    return this.loadingPromises.has(family);
  }

  /**
   * Get all available (loaded) font families.
   */
  getAvailableFonts(): FontInfo[] {
    return Array.from(this.availableFonts.values());
  }

  /**
   * Get loaded font family names.
   */
  getLoadedFamilies(): string[] {
    return Array.from(this.fontCache.keys());
  }

  /**
   * Remove a specific font from cache.
   */
  removeFont(family: string): void {
    this.fontCache.delete(family);
    this.availableFonts.delete(family);
    this.loadingPromises.delete(family);
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
