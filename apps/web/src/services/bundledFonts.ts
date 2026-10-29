/**
 * Bundled Fonts
 * Inter, shipped with the app in every weight and script (Latin, Cyrillic,
 * Greek, Vietnamese — built by scripts/fonts/build-inter.py): the default
 * font, and the one text falls back to. Its regular and bold load at
 * startup; any other weight when text set in it is shown. No one is asked:
 * it comes from the app, not Google.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import { getFontManager, nearestWeight } from '@quar/core';
import type { Node, SymbolDefinition } from '@quar/types';
import inter100 from '../assets/fonts/inter/inter-100.woff?url';
import inter200 from '../assets/fonts/inter/inter-200.woff?url';
import inter300 from '../assets/fonts/inter/inter-300.woff?url';
import inter400 from '../assets/fonts/inter/inter-400.woff?url';
import inter500 from '../assets/fonts/inter/inter-500.woff?url';
import inter600 from '../assets/fonts/inter/inter-600.woff?url';
import inter700 from '../assets/fonts/inter/inter-700.woff?url';
import inter800 from '../assets/fonts/inter/inter-800.woff?url';
import inter900 from '../assets/fonts/inter/inter-900.woff?url';

/** The family shipped with the app */
export const BUNDLED_FAMILY = 'Inter';

const BUNDLED_INTER: ReadonlyMap<number, string> = new Map([
  [100, inter100],
  [200, inter200],
  [300, inter300],
  [400, inter400],
  [500, inter500],
  [600, inter600],
  [700, inter700],
  [800, inter800],
  [900, inter900],
]);

/** The weights shipped, ascending */
export const BUNDLED_WEIGHTS: readonly number[] = [...BUNDLED_INTER.keys()];

/** The weights loaded at startup: what new text and the fallback are set in */
const STARTUP_WEIGHTS = [400, 700];

/** Whether text in this family is drawn from the app's own font files. */
export function isBundledFamily(family: string): boolean {
  return family === BUNDLED_FAMILY;
}

/** The weight shipped closest to the one asked for. */
export function bundledWeight(weight: number): number {
  return nearestWeight(BUNDLED_WEIGHTS, Number(weight) || 400);
}

/**
 * Load one of Inter's weights (the one shipped closest to `weight`). Safe to
 * call repeatedly: a loaded weight is skipped, a load in flight shared.
 */
export async function loadBundledFont(weight: number): Promise<void> {
  const shipped = bundledWeight(weight);
  const url = BUNDLED_INTER.get(shipped);
  const fm = getFontManager();
  if (!url || fm.hasFontWeight(BUNDLED_FAMILY, shipped)) return;
  await fm.loadFontFromUrl(url, BUNDLED_FAMILY, 'bundled', shipped);
}

/**
 * Load Inter's regular and bold (or the weights given). Rejects if any
 * weight fails.
 */
export async function loadBundledFonts(
  weights: readonly number[] = STARTUP_WEIGHTS
): Promise<void> {
  await Promise.all(weights.map(loadBundledFont));
}

/** The weights of Inter these nodes' text is set in (symbols' too), each once, as shipped. */
export function bundledWeightsUsed(
  nodes: Iterable<Node>,
  symbols: readonly SymbolDefinition[] = []
): number[] {
  const weights = new Set<number>();
  const visit = (node: Node) => {
    if (node.type === 'text' && isBundledFamily(node.fontFamily)) {
      weights.add(bundledWeight(node.fontWeight));
    }
  };
  for (const node of nodes) visit(node);
  for (const symbol of symbols) symbol.sceneGraphJSON.nodes.forEach(visit);
  return [...weights];
}
