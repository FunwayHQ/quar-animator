/**
 * Bundled Fonts
 * The Inter weights shipped with the app, which text falls back to
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { getFontManager } from '@quar/core';
import interFontUrl400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url';
import interFontUrl700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url';

const BUNDLED_INTER: Array<[weight: number, url: string]> = [
  [400, interFontUrl400],
  [700, interFontUrl700],
];

/**
 * Load the bundled Inter weights. Safe to call repeatedly: loaded weights are
 * skipped and loads in flight are shared. Rejects if any weight fails.
 */
export async function loadBundledFonts(): Promise<void> {
  const fm = getFontManager();
  await Promise.all(
    BUNDLED_INTER.map(async ([weight, url]) => {
      if (!fm.hasFontWeight('Inter', weight)) {
        await fm.loadFontFromUrl(url, 'Inter', 'bundled', weight);
      }
    })
  );
}
