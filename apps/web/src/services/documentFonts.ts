/**
 * Document Fonts
 * Loads the Google fonts a document's text is set in when it opens or when
 * text arrives (a paste, a version loaded in place): otherwise that text shows
 * in the fallback font until each font is picked again.
 */

import type { Node, SymbolDefinition } from '@quar/types';
import { getFontManager, GOOGLE_FONTS_CATALOG } from '@quar/core';
import { ensureGoogleFontsConsent } from '../components/common/ConsentBanner';

export interface FontUse {
  family: string;
  weight: number;
}

/** The catalog fonts these nodes' text is set in (symbols' too), each family and weight once. */
export function googleFontsUsed(
  nodes: Iterable<Node>,
  symbols: readonly SymbolDefinition[] = []
): FontUse[] {
  const catalog = new Set(GOOGLE_FONTS_CATALOG.map((entry) => entry.family));
  const uses = new Map<string, FontUse>();
  const visit = (node: Node) => {
    if (node.type !== 'text' || !catalog.has(node.fontFamily)) return;
    const weight = Number(node.fontWeight) || 400;
    uses.set(`${node.fontFamily}:${weight}`, { family: node.fontFamily, weight });
  };
  for (const node of nodes) visit(node);
  for (const symbol of symbols) symbol.sceneGraphJSON.nodes.forEach(visit);
  return [...uses.values()];
}

/** The weight the catalog has closest to the one asked for, as loadGoogleFont picks it. */
function catalogWeight(family: string, weight: number): number {
  const weights = GOOGLE_FONTS_CATALOG.find((entry) => entry.family === family)?.weights ?? [400];
  return weights.reduce((best, candidate) =>
    Math.abs(candidate - weight) < Math.abs(best - weight) ? candidate : best
  );
}

// Asked once a session: declining isn't stored, and shouldn't ask again on every paste
let declined = false;

/**
 * Load the fonts not loaded yet, first asking to use Google Fonts if they
 * haven't been allowed. Resolves to how many were loaded.
 */
export async function loadDocumentFonts(
  uses: readonly FontUse[],
  allow: () => Promise<boolean> = ensureGoogleFontsConsent
): Promise<number> {
  const fm = getFontManager();
  const missing = uses.filter(
    ({ family, weight }) => !fm.hasFontWeight(family, catalogWeight(family, weight))
  );
  if (missing.length === 0 || declined) return 0;
  if (!(await allow())) {
    declined = true;
    return 0;
  }
  const loaded = await Promise.allSettled(
    missing.map(({ family, weight }) => fm.loadGoogleFont(family, weight))
  );
  return loaded.filter((result) => result.status === 'fulfilled' && result.value).length;
}

/** Forget a decline (tests). */
export function resetDocumentFontsForTests(): void {
  declined = false;
}
