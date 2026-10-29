/**
 * The shortcut list Help › Keyboard Shortcuts shows, and how keys are printed.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SHORTCUT_GROUPS, formatShortcut, isMacPlatform, splitShortcut } from './shortcuts';

/** The keys the user guide's Keyboard shortcuts chapter names, as the list writes them. */
function guideKeys(): string[] {
  const chapter = readFileSync(resolve(__dirname, '../../../../../docs/help/shortcuts.md'), 'utf8');
  const keys = [...chapter.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1] ?? '');
  // Keys written out in HTML: <kbd class="keys"><kbd>Ctrl</kbd><span class="plus">+</span><kbd>]</kbd></kbd>
  for (const [combo] of chapter.matchAll(/<kbd class="keys">.*?<\/kbd><\/kbd>/g)) {
    keys.push([...combo.matchAll(/<kbd(?: [^>]*)?>([^<]+)<\/kbd>/g)].map((m) => m[1]).join('+'));
  }
  return keys.map((written) =>
    written
      .split('+')
      .map((part) => ({ Mod: 'Ctrl', Del: 'Delete' })[part] ?? part)
      .join('+')
  );
}

describe('the shortcut list', () => {
  it('has every key the user guide lists', () => {
    const listed = new Set(
      SHORTCUT_GROUPS.flatMap((group) => group.entries.flatMap((e) => e.keys))
    );
    // A key the guide names alone (Shift, held) may be listed in a combination
    const parts = new Set(
      [...listed].flatMap((keys) => {
        const { modifiers, key } = splitShortcut(keys);
        return [...modifiers, key];
      })
    );
    const guide = guideKeys();
    expect(guide.length).toBeGreaterThan(50);
    const missing = guide.filter((keys) => !listed.has(keys) && !parts.has(keys));
    expect(missing).toEqual([]);
  });

  it('gives each group some keys', () => {
    for (const group of SHORTCUT_GROUPS) expect(group.entries.length).toBeGreaterThan(0);
  });
});

describe('formatShortcut', () => {
  it('splits off the modifiers, keys like = and , included', () => {
    expect(splitShortcut('Ctrl+Shift+Z')).toEqual({ modifiers: ['Ctrl', 'Shift'], key: 'Z' });
    expect(splitShortcut('Ctrl+=')).toEqual({ modifiers: ['Ctrl'], key: '=' });
    expect(splitShortcut('Shift+,')).toEqual({ modifiers: ['Shift'], key: ',' });
    expect(splitShortcut('Space+Drag')).toEqual({ modifiers: [], key: 'Space+Drag' });
  });

  it('prints arrows and page keys as keyboards do', () => {
    expect(formatShortcut('Up')).toBe('↑');
    expect(formatShortcut('Shift+Left')).toBe('Shift+←');
    expect(formatShortcut('PageDown')).toBe('Page Down');
    expect(formatShortcut('Ctrl+Shift+Z')).toBe('Ctrl+Shift+Z');
  });

  it('prints Ctrl, Alt and Shift elsewhere', () => {
    expect(formatShortcut('Ctrl+Shift+Z', false)).toBe('Ctrl+Shift+Z');
    expect(formatShortcut('Alt+W', false)).toBe('Alt+W');
    expect(formatShortcut('Delete', false)).toBe('Delete');
    expect(formatShortcut('Ctrl+Enter', false)).toBe('Ctrl+Enter');
  });

  it('prints ⌘, ⌥ and ⇧ on a Mac, in the order Mac menus have them', () => {
    expect(formatShortcut('Ctrl+S', true)).toBe('⌘S');
    expect(formatShortcut('Ctrl+Shift+Z', true)).toBe('⇧⌘Z');
    expect(formatShortcut('Shift+H', true)).toBe('⇧H');
    expect(formatShortcut('Alt+W', true)).toBe('⌥W');
    expect(formatShortcut('Ctrl+=', true)).toBe('⌘=');
    expect(formatShortcut('Ctrl+Shift+]', true)).toBe('⇧⌘]');
    expect(formatShortcut('Shift+,', true)).toBe('⇧,');
    expect(formatShortcut('Alt+Click', true)).toBe('⌥Click');
    expect(formatShortcut('Shift+Up', true)).toBe('⇧↑');
    // A Mac's delete key is Backspace; Return is ↩
    expect(formatShortcut('Delete', true)).toBe('⌫');
    expect(formatShortcut('Ctrl+Enter', true)).toBe('⌘↩');
    expect(formatShortcut('Space', true)).toBe('Space');
    expect(formatShortcut('F', true)).toBe('F');
  });
});

describe('isMacPlatform', () => {
  afterEach(() => vi.restoreAllMocks());

  it('tells a Mac by its platform', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    expect(isMacPlatform()).toBe(true);
    expect(formatShortcut('Ctrl+Shift+S')).toBe('⇧⌘S');
  });

  it('or by the user agent data browsers have instead', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('');
    Object.defineProperty(navigator, 'userAgentData', {
      configurable: true,
      get: () => ({ platform: 'macOS' }),
    });
    try {
      expect(isMacPlatform()).toBe(true);
    } finally {
      Reflect.deleteProperty(navigator, 'userAgentData');
    }
  });

  it('and anything else by Ctrl', () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('Win32');
    expect(isMacPlatform()).toBe(false);
    expect(formatShortcut('Ctrl+Shift+S')).toBe('Ctrl+Shift+S');
  });
});
