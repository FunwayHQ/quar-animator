/**
 * Pictures for "Symbols" (symbols.md).
 */

import { PARTS } from './_kit.mjs';

const SYMBOL = '[data-testid^="symbol-item-"]';

/** Tutorial 6's symbols page, fitted in view. */
const symbolsPage = [
  { open: 'tutorial-groups-symbols-masks' },
  { page: '2 · Symbols' },
  { wait: 600 },
  { press: 'Control+0' },
];

/** In and out of the symbol, as you'd look at it: the Symbols list is up to date after. */
const editAndComeBack = [
  { dblclick: SYMBOL },
  { waitFor: '[data-testid="symbol-editing-banner"]' },
  { click: '[data-testid="symbol-editing-banner"]' },
  { wait: 500 },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'symbols-panel',
    about: 'The Symbols panel with one symbol, and its three instances in Layers and on the canvas',
    steps: [...symbolsPage, ...editAndComeBack, { layer: 'Badge' }, { wait: 300 }],
    markers: [
      { target: SYMBOL, label: 1, at: 'right', dx: 6 },
      { target: '[data-testid^="layer-row-"][aria-pressed="true"]', label: 2, at: 'right', dx: -8 },
    ],
    capture: { selectors: [PARTS.layers, PARTS.canvas], padding: 0 },
  },
  {
    name: 'symbols-editing',
    about: 'Editing the Badge symbol: the banner, and only the symbol’s layers',
    steps: [
      ...symbolsPage,
      { dblclick: SYMBOL },
      { waitFor: '[data-testid="symbol-editing-banner"]' },
    ],
    markers: [{ target: '[data-testid="symbol-editing-banner"]', label: 1, at: 'right', dx: 36 }],
    capture: { selectors: [PARTS.layers, PARTS.canvas], padding: 0 },
  },
  {
    name: 'symbols-instance',
    about: 'An instance’s Symbol section in Properties: Edit Symbol and Detach',
    steps: [
      ...symbolsPage,
      { layer: 'Badge' },
      {
        run: async (page) => {
          await page.locator('[data-testid="edit-symbol-button"]').scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
        },
      },
    ],
    markers: [
      { target: '[data-testid="edit-symbol-button"]', label: 1, at: 'bottom', dy: 30 },
      { target: '[data-testid="detach-instance-button"]', label: 2, at: 'bottom', dy: 30 },
    ],
    capture: {
      selectors: ['[data-testid="edit-symbol-button"]', '[data-testid="detach-instance-button"]'],
      padding: { top: 64, right: 150, bottom: 44, left: 16 },
    },
  },
];
