/**
 * Tests for fontPickerOptions: what the font picker lists, and in what order
 */

import { describe, it, expect } from 'vitest';
import { GOOGLE_FONTS_CATALOG } from '@quar/core';
import { buildFontSections, matchRank, type FontSectionsInput } from './fontPickerOptions';

const input = (overrides: Partial<FontSectionsInput> = {}): FontSectionsInput => ({
  query: '',
  category: 'all',
  documentFamilies: [],
  recentFamilies: [],
  loadedFamilies: [],
  ...overrides,
});

const families = (sections: ReturnType<typeof buildFontSections>, id: string) =>
  sections.find((section) => section.id === id)?.options.map((option) => option.family);

describe('matchRank', () => {
  it('ranks the name itself, its start, a word, anywhere, then without spaces', () => {
    expect(matchRank('Lobster', 'LOBSTER')).toBe(0);
    expect(matchRank('Roboto Mono', 'rob')).toBe(1);
    expect(matchRank('Roboto Mono', 'MONO')).toBe(2);
    expect(matchRank('Monoton', 'mono')).toBe(1);
    expect(matchRank('Noto Sans Display', 'play')).toBe(3);
    expect(matchRank('Open Sans', 'opensans')).toBe(4);
    expect(matchRank('Open Sans', 'serif')).toBeNull();
    expect(matchRank('Open Sans', '   ')).toBe(0);
  });

  it('puts the family typed in full before longer names starting with it', () => {
    const google = families(buildFontSections(input({ query: 'lobster' })), 'google');
    expect(google).toEqual(['Lobster', 'Lobster Two']);
    // Otherwise by popularity
    expect(families(buildFontSections(input({ query: 'lobs' })), 'google')).toEqual([
      'Lobster Two',
      'Lobster',
    ]);
  });
});

describe('buildFontSections', () => {
  it('lists the whole catalog, by popularity, with nothing else to show', () => {
    const sections = buildFontSections(input());
    expect(sections.map((section) => section.id)).toEqual(['included', 'google']);
    expect(families(sections, 'included')).toEqual(['Inter']);
    expect(families(sections, 'google')).toEqual(GOOGLE_FONTS_CATALOG.map((e) => e.family));
  });

  it("puts the document's fonts first, then recent ones, then the included ones, each once", () => {
    const sections = buildFontSections(
      input({
        documentFamilies: ['Roboto', 'Arial', 'Inter', 'Roboto'],
        recentFamilies: ['Lato', 'Roboto', 'A Font Gone From The Catalog'],
        loadedFamilies: ['Inter', 'Roboto', 'My Upload'],
      })
    );
    expect(sections.map((section) => section.label)).toEqual([
      'In this document',
      'Recent',
      'Included',
      'Google Fonts',
    ]);
    expect(families(sections, 'document')).toEqual(['Arial', 'Inter', 'Roboto']);
    expect(families(sections, 'recent')).toEqual(['Lato']);
    expect(families(sections, 'included')).toEqual(['My Upload']);
    const google = families(sections, 'google') ?? [];
    expect(google).not.toContain('Roboto');
    expect(google).not.toContain('Lato');
    expect(google).toHaveLength(GOOGLE_FONTS_CATALOG.length - 2);
  });

  it('says which can be picked, and their categories', () => {
    const [document] = buildFontSections(
      input({ documentFamilies: ['Arial', 'Inter', 'Lobster'], loadedFamilies: ['Inter'] })
    );
    expect(document?.options).toEqual([
      // Not a Google font and not loaded: its text is in a fallback font
      { family: 'Arial', category: null, available: false },
      { family: 'Inter', category: 'sans-serif', available: true },
      { family: 'Lobster', category: 'display', available: true },
    ]);
  });

  it('filters every section by what is typed, best matches first', () => {
    const sections = buildFontSections(
      input({ query: 'mono', documentFamilies: ['Roboto Mono', 'Lato'] })
    );
    expect(families(sections, 'document')).toEqual(['Roboto Mono']);
    const google = families(sections, 'google') ?? [];
    // Starting with it, then a word starting with it
    expect(google[0]).toBe('Monoton');
    expect(google).toContain('JetBrains Mono');
    expect(google).not.toContain('Lato');
  });

  it('finds a family typed without its spaces', () => {
    expect(families(buildFontSections(input({ query: 'opensans' })), 'google')).toEqual([
      'Open Sans',
    ]);
  });

  it('filters by category, leaving out families of no known category', () => {
    const sections = buildFontSections(
      input({ category: 'handwriting', documentFamilies: ['Arial', 'Dancing Script'] })
    );
    expect(families(sections, 'document')).toEqual(['Dancing Script']);
    for (const section of sections) {
      for (const option of section.options) expect(option.category).toBe('handwriting');
    }
    expect(sections.some((section) => section.id === 'included')).toBe(false);
  });

  it('leaves out empty sections, and lists nothing when nothing matches', () => {
    expect(buildFontSections(input({ query: 'zzzz' }))).toEqual([]);
    expect(buildFontSections(input({ query: 'lobster', category: 'monospace' }))).toEqual([]);
  });
});
