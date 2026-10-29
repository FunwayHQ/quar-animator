/**
 * The user guide's page script (apps/web/scripts/help/theme/help.js): the
 * shortcuts it relabels for a Mac.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SCRIPT = readFileSync(resolve(__dirname, '../../scripts/help/theme/help.js'), 'utf8');

/** The guide's keycaps once the script has read the page on this platform. */
function keysOn(platform: { userAgentData?: string; platform: string }): string[] {
  document.body.innerHTML =
    '<kbd data-key="mod">Ctrl</kbd><kbd data-key="alt">Alt</kbd><kbd>Z</kbd>';
  Object.defineProperty(navigator, 'userAgentData', {
    value: platform.userAgentData === undefined ? undefined : { platform: platform.userAgentData },
    configurable: true,
  });
  Object.defineProperty(navigator, 'platform', { value: platform.platform, configurable: true });
  // The theme asks for the system's (jsdom has no media queries)
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  // This run's page-read handler only, not the earlier runs'
  const onRead = vi.spyOn(document, 'addEventListener');
  window.eval(SCRIPT);
  const [, handler] = onRead.mock.calls.find(([type]) => type === 'DOMContentLoaded') ?? [];
  onRead.mockRestore();
  if (handler) document.removeEventListener('DOMContentLoaded', handler);
  if (typeof handler === 'function') handler(new Event('DOMContentLoaded'));
  return [...document.querySelectorAll('kbd')].map((key) => key.textContent ?? '');
}

describe('the guide’s shortcuts', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows Cmd and Option in Chrome on a Mac, which says “macOS”', () => {
    expect(keysOn({ userAgentData: 'macOS', platform: 'MacIntel' })).toEqual([
      'Cmd',
      'Option',
      'Z',
    ]);
  });

  it('shows Cmd and Option in Safari and Firefox on a Mac', () => {
    expect(keysOn({ platform: 'MacIntel' })).toEqual(['Cmd', 'Option', 'Z']);
  });

  it('leaves Ctrl and Alt on Windows', () => {
    expect(keysOn({ userAgentData: 'Windows', platform: 'Win32' })).toEqual(['Ctrl', 'Alt', 'Z']);
  });
});
