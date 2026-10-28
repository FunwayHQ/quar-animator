/**
 * Font Picker Options
 * What the font picker lists, in sections: the document's fonts, the ones
 * picked lately, those that come with the app, then Google Fonts' families
 * by popularity. Each family is listed once, in the first section it's in,
 * and every section is filtered by what's typed and by category.
 */

import { GOOGLE_FONTS_CATALOG, findGoogleFont } from '@quar/core';
import type { GoogleFontCategory } from '@quar/core';

export type FontCategoryFilter = 'all' | GoogleFontCategory;

export const FONT_CATEGORY_FILTERS: ReadonlyArray<{ id: FontCategoryFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'sans-serif', label: 'Sans' },
  { id: 'serif', label: 'Serif' },
  { id: 'display', label: 'Display' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'monospace', label: 'Mono' },
];

export type FontSectionId = 'document' | 'recent' | 'included' | 'google';

export interface FontOption {
  family: string;
  category: GoogleFontCategory | null;
  /** Whether text can be set in it here: a Google family, one that comes with the app or one loaded */
  available: boolean;
}

export interface FontSection {
  id: FontSectionId;
  label: string;
  options: FontOption[];
}

/** The fonts that come with the app (bundledFonts.ts), with their categories */
export const INCLUDED_FONTS: Readonly<Record<string, GoogleFontCategory>> = { Inter: 'sans-serif' };

const SECTION_LABELS: Record<FontSectionId, string> = {
  document: 'In this document',
  recent: 'Recent',
  included: 'Included',
  google: 'Google Fonts',
};

export interface FontSectionsInput {
  /** What's typed */
  query: string;
  category: FontCategoryFilter;
  /** The families the document's text is set in */
  documentFamilies: readonly string[];
  /** The families picked lately, newest first */
  recentFamilies: readonly string[];
  /** The families the font manager has loaded */
  loadedFamilies: readonly string[];
}

const fold = (text: string) => text.toLowerCase();
const squash = (text: string) => fold(text).replace(/\s+/g, '');

/**
 * How well a family's name matches what's typed: 0 is the name itself, 1
 * starts with it, 2 has a word starting with it, 3 has it inside, 4 has it
 * with the spaces left out ("opensans"); null doesn't match. Anything
 * matches nothing typed.
 */
export function matchRank(family: string, query: string): number | null {
  const wanted = fold(query.trim());
  if (!wanted) return 0;
  const name = fold(family);
  if (name === wanted) return 0;
  if (name.startsWith(wanted)) return 1;
  if (name.includes(` ${wanted}`)) return 2;
  if (name.includes(wanted)) return 3;
  if (squash(family).includes(squash(wanted))) return 4;
  return null;
}

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** The picker's sections, empty ones left out. */
export function buildFontSections({
  query,
  category,
  documentFamilies,
  recentFamilies,
  loadedFamilies,
}: FontSectionsInput): FontSection[] {
  const loaded = new Set(loadedFamilies);
  const option = (family: string): FontOption => {
    const google = findGoogleFont(family);
    const included = INCLUDED_FONTS[family];
    return {
      family,
      category: google?.category ?? included ?? null,
      available: !!google || !!included || loaded.has(family),
    };
  };

  const seen = new Set<string>();
  const take = (families: Iterable<string>) => {
    const taken: string[] = [];
    for (const family of families) {
      if (!family || seen.has(family)) continue;
      seen.add(family);
      taken.push(family);
    }
    return taken;
  };

  const lists: Array<[FontSectionId, string[]]> = [
    ['document', take([...new Set(documentFamilies)].sort(byName))],
    ['recent', take(recentFamilies.filter((family) => option(family).available))],
    [
      'included',
      take(
        [...Object.keys(INCLUDED_FONTS), ...loadedFamilies.filter((f) => !findGoogleFont(f))].sort(
          byName
        )
      ),
    ],
    ['google', take(GOOGLE_FONTS_CATALOG.map((entry) => entry.family))],
  ];

  const sections: FontSection[] = [];
  for (const [id, families] of lists) {
    const ranked: Array<{ option: FontOption; rank: number; index: number }> = [];
    families.forEach((family, index) => {
      const candidate = option(family);
      if (category !== 'all' && candidate.category !== category) return;
      const rank = matchRank(family, query);
      if (rank !== null) ranked.push({ option: candidate, rank, index });
    });
    ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
    if (ranked.length > 0) {
      sections.push({ id, label: SECTION_LABELS[id], options: ranked.map((r) => r.option) });
    }
  }
  return sections;
}
