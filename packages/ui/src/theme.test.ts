import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { colors, generateCSSVariables, typography, zIndex } from './theme';

// The editor's own stylesheet is the source of truth for the design tokens.
const APP_CSS = readFileSync(
  resolve(__dirname, '../../../apps/web/src/styles/globals.css'),
  'utf8'
);

/** The declarations of the rule with this exact selector, by property. */
function declarations(css: string, selector: string): Record<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const escaped = selector.replace(/[[\]'().*+?^$|\\]/g, '\\$&');
  const block = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`).exec(source)?.[1];
  if (block === undefined) throw new Error(`no ${selector} rule`);

  const result: Record<string, string> = {};
  for (const declaration of block.split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    const property = declaration.slice(0, colon).trim();
    result[property] = declaration
      .slice(colon + 1)
      .trim()
      .replace(/\s+/g, ' ');
  }
  return result;
}

describe('theme', () => {
  it("has the editor's dark tokens", () => {
    const app = declarations(APP_CSS, ':root');
    expect(app['--color-accent-primary']).toBe('#a855f7');
    expect(declarations(generateCSSVariables(), ':root')).toEqual(app);
  });

  it("has the editor's light theme", () => {
    const selector = ":root[data-theme='light']";
    const app = declarations(APP_CSS, selector);
    expect(app['--color-accent-primary']).toBe('#7c3aed');
    expect(declarations(generateCSSVariables(), selector)).toEqual(app);
  });

  it('uses the violet accent and the editor fonts', () => {
    expect(colors.accent.primary).toBe('#a855f7');
    expect(colors.border.focus).toBe('#e89b47');
    expect(typography.fontFamily.ui).toContain('DM Sans');
    expect(typography.fontFamily.mono).toContain('IBM Plex Mono');
  });

  it('stacks tooltips above everything else', () => {
    const others = Object.entries(zIndex).filter(([layer]) => layer !== 'tooltip');
    for (const [, value] of others) {
      expect(zIndex.tooltip).toBeGreaterThan(value);
    }
    expect(zIndex.modal).toBeGreaterThan(zIndex.popover);
    expect(zIndex.popover).toBeGreaterThan(zIndex.overlay);
  });
});
