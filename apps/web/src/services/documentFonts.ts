/**
 * Document Fonts
 * Loads the fonts a document's text is set in when it opens or when text
 * arrives (a paste, a version loaded in place): Inter's weights from the
 * app, Google fonts once they're allowed. Otherwise that text shows in the
 * fallback font until each font is picked again.
 */

import type { Node, SymbolDefinition } from '@quar/types';
import { findGoogleFont, getFontManager, nearestWeight } from '@quar/core';
import {
  ensureGoogleFontsConsent,
  hasGoogleFontsConsent,
} from '../components/common/ConsentBanner';
import {
  BUNDLED_FAMILY,
  bundledWeight,
  bundledWeightsUsed,
  isBundledFamily,
  loadBundledFont,
} from './bundledFonts';
import { useEditorStore } from '../stores/editorStore';

export interface FontUse {
  family: string;
  weight: number;
}

/** The catalog fonts these nodes' text is set in (symbols' too), each family and weight once. */
export function googleFontsUsed(
  nodes: Iterable<Node>,
  symbols: readonly SymbolDefinition[] = []
): FontUse[] {
  const uses = new Map<string, FontUse>();
  const visit = (node: Node) => {
    if (node.type !== 'text' || !findGoogleFont(node.fontFamily)) return;
    const weight = Number(node.fontWeight) || 400;
    uses.set(`${node.fontFamily}:${weight}`, { family: node.fontFamily, weight });
  };
  for (const node of nodes) visit(node);
  for (const symbol of symbols) symbol.sceneGraphJSON.nodes.forEach(visit);
  return [...uses.values()];
}

/**
 * The fonts these nodes' text is set in (symbols' too) that are loaded
 * rather than built in: Inter's weights, then the catalog's.
 */
export function documentFontsUsed(
  nodes: Iterable<Node>,
  symbols: readonly SymbolDefinition[] = []
): FontUse[] {
  const all = [...nodes];
  return [
    ...bundledWeightsUsed(all, symbols).map((weight) => ({ family: BUNDLED_FAMILY, weight })),
    ...googleFontsUsed(all, symbols),
  ];
}

/** Every font family these nodes' text is set in, each once, in the order first met. */
export function fontFamiliesUsed(nodeLists: Iterable<Iterable<Node>>): string[] {
  const families = new Set<string>();
  for (const nodes of nodeLists) {
    for (const node of nodes) {
      if (node.type === 'text' && node.fontFamily) families.add(node.fontFamily);
    }
  }
  return [...families];
}

/**
 * The families the open document's text is set in: the page shown (its live
 * nodes, given), its other pages and its symbols. What the font picker lists first.
 */
export function documentFontFamilies(pageNodes: Iterable<Node>): string[] {
  const { pages, activePageId, symbols } = useEditorStore.getState();
  return fontFamiliesUsed([
    pageNodes,
    ...pages.filter((page) => page.id !== activePageId).map((page) => page.sceneGraphJSON.nodes),
    ...symbols.map((symbol) => symbol.sceneGraphJSON.nodes),
  ]);
}

/** The weight the font has closest to the one asked for, as it's loaded. */
function catalogWeight(family: string, weight: number): number {
  if (isBundledFamily(family)) return bundledWeight(weight);
  return nearestWeight(findGoogleFont(family)?.weights ?? [400], weight);
}

/** The fonts of `uses` not loaded yet. */
function notLoaded(uses: readonly FontUse[]): FontUse[] {
  const fm = getFontManager();
  return uses.filter(
    ({ family, weight }) => !fm.hasFontWeight(family, catalogWeight(family, weight))
  );
}

/**
 * The fonts of `uses` not loaded yet that may be without asking: what a
 * presentation waits for. Inter's always; Google's only when they're
 * allowed, since it never asks (the editor does, as the document opens).
 */
export function fontsToLoad(
  uses: readonly FontUse[],
  allowed: boolean = hasGoogleFontsConsent()
): FontUse[] {
  return notLoaded(uses).filter(({ family }) => allowed || isBundledFamily(family));
}

/** Loads one of Inter's weights or the catalog's fonts (or joins its load under way). */
export function loadFont({ family, weight }: FontUse): Promise<unknown> {
  if (isBundledFamily(family)) return loadBundledFont(weight);
  return getFontManager().loadGoogleFont(family, weight);
}

// Asked once a session: declining isn't stored, and shouldn't ask again on every
// paste. Turning Google Fonts on afterwards (the Help menu, say) undoes it.
let declined = false;

/**
 * Load the fonts not loaded yet: Inter's weights at once, Google's after
 * asking to use Google Fonts if they haven't been allowed. Resolves to how
 * many were loaded.
 */
export async function loadDocumentFonts(
  uses: readonly FontUse[],
  allow: () => Promise<boolean> = ensureGoogleFontsConsent
): Promise<number> {
  const fm = getFontManager();
  const missing = notLoaded(uses);
  const bundled = missing.filter(({ family }) => isBundledFamily(family));
  const google = missing.filter(({ family }) => !isBundledFamily(family));
  const shipped = await Promise.allSettled(bundled.map(({ weight }) => loadBundledFont(weight)));
  const count = shipped.filter((result) => result.status === 'fulfilled').length;
  if (hasGoogleFontsConsent()) declined = false;
  if (google.length === 0 || declined) return count;
  if (!(await allow())) {
    declined = true;
    return count;
  }
  const loaded = await Promise.allSettled(
    google.map(({ family, weight }) => fm.loadGoogleFont(family, weight))
  );
  return count + loaded.filter((result) => result.status === 'fulfilled' && result.value).length;
}

/** Forget a decline (tests). */
export function resetDocumentFontsForTests(): void {
  declined = false;
}
