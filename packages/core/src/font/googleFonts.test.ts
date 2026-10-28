/**
 * Tests for the generated Google Fonts catalog (googleFonts.json)
 */

import { describe, it, expect } from 'vitest';
import catalog from './googleFonts.json';

/** The families the editor offered before the catalog was generated: documents use them. */
const EARLIER_FAMILIES = [
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Oswald',
  'Raleway',
  'Nunito',
  'Playfair Display',
  'Merriweather',
  'Source Sans 3',
  'PT Sans',
  'Rubik',
  'Work Sans',
  'Fira Sans',
  'Noto Sans',
  'Ubuntu',
  'Quicksand',
  'Cabin',
  'Inconsolata',
  'Libre Baskerville',
  'Karla',
  'Josefin Sans',
  'Archivo',
  'DM Sans',
  'Outfit',
  'Space Grotesk',
  'Bitter',
  'Crimson Text',
  'IBM Plex Mono',
  'IBM Plex Sans',
];

const CATEGORIES = ['sans-serif', 'serif', 'display', 'handwriting', 'monospace'];

describe('Google Fonts catalog', () => {
  it('lists about 300 families, each once', () => {
    const families = catalog.map((entry) => entry.family);
    expect(families.length).toBeGreaterThanOrEqual(250);
    expect(new Set(families).size).toBe(families.length);
  });

  it('keeps every family the editor offered before', () => {
    const families = new Set(catalog.map((entry) => entry.family));
    expect(EARLIER_FAMILIES.filter((family) => !families.has(family))).toEqual([]);
  });

  it('leaves out Inter, which comes with the app', () => {
    expect(catalog.some((entry) => entry.family === 'Inter')).toBe(false);
  });

  it('gives every family a category and at least one weight, ascending', () => {
    for (const entry of catalog) {
      expect(CATEGORIES).toContain(entry.category);
      expect(entry.weights.length).toBeGreaterThan(0);
      expect([...entry.weights].sort((a, b) => a - b)).toEqual(entry.weights);
      for (const weight of entry.weights) {
        expect(Number.isInteger(weight) && weight >= 1 && weight <= 1000).toBe(true);
      }
    }
  });

  it('has a static TTF on fonts.gstatic.com for each weight, and only those', () => {
    for (const entry of catalog) {
      const files = entry.files as Record<string, string>;
      expect(Object.keys(files).map(Number)).toEqual(entry.weights);
      const urls = Object.values(files);
      for (const url of urls) {
        expect(url).toMatch(/^https:\/\/fonts\.gstatic\.com\/s\/[a-z0-9]+\/v\d+\/[\w-]+\.ttf$/);
      }
      // A file shared by weights would be a variable font
      expect(new Set(urls).size).toBe(urls.length);
    }
  });
});
