/**
 * Pictures for "Masks, blending and effects" (masks-and-effects.md).
 */

import { PARTS } from './_kit.mjs';

const ROW = '[data-testid^="layer-row-"]';

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'masks-and-effects-create',
    about: 'Four layers selected in Layers, their right-click menu open at the mask items',
    steps: [
      { open: 'new' },
      // Three stripes, and a circle on top of them: the circle will be the mask
      { press: 'r' },
      { drag: { from: [300, 150], to: [360, 350] } },
      { press: 'r' },
      { drag: { from: [370, 150], to: [430, 350] } },
      { press: 'r' },
      { drag: { from: [440, 150], to: [500, 350] } },
      { press: 'o' },
      { drag: { from: [320, 170], to: [480, 330] } },
      { wait: 200 },
      // All four in Layers: the top row, then Shift+click the bottom one
      { click: `${ROW}:has-text("Ellipse")` },
      {
        run: async (page) => {
          await page
            .locator(ROW)
            .last()
            .click({ modifiers: ['Shift'] });
          // Shift+click also selects the rows' text in the browser
          await page.evaluate(() => window.getSelection()?.removeAllRanges());
          await page.locator(ROW).nth(1).click({ button: 'right' });
          await page.waitForTimeout(250);
        },
      },
    ],
    keepPointer: true,
    markers: [
      {
        target: '[data-testid="context-menu-item-create-clip-mask"]',
        label: 1,
        at: 'right',
        dx: 40,
      },
    ],
    capture: {
      selectors: [PARTS.layers, '[data-testid="context-menu"]'],
      padding: { top: 0, right: 56, bottom: 8, left: 0 },
    },
  },
  {
    name: 'masks-and-effects-mask',
    about: 'Tutorial 6’s mask page: the mask group, its kind and its mask in Layers',
    steps: [
      { open: 'tutorial-groups-symbols-masks' },
      { page: '3 · Masks' },
      { wait: 600 },
      { press: 'Control+0' },
      { click: `${ROW}[aria-label="Layer: Mask"]` },
      { wait: 300 },
    ],
    markers: [
      { target: '[data-testid^="mask-badge-"]', label: 1, at: 'right', dx: 52 },
      { target: '[class*="_maskSourceBadge_"]', label: 2, at: 'right', dx: 52 },
    ],
    capture: { selectors: [PARTS.layers, PARTS.canvas], padding: 0 },
  },
  {
    name: 'masks-and-effects-effects',
    about: 'A rectangle on a white artboard with a drop shadow, and its Effects settings',
    steps: [
      { open: 'new' },
      { press: 'f' },
      { drag: { from: [150, 110], to: [560, 420] } },
      { press: 'r' },
      { drag: { from: [260, 190], to: [450, 340] } },
      { wait: 200 },
      {
        run: async (page) => {
          const add = page.locator('[data-testid="add-effect-button"]');
          await add.scrollIntoViewIfNeeded();
          await add.click();
          await page.locator('[data-testid="effect-dropdown"] >> text=Drop Shadow').click();
          const fields = page.locator('[data-testid="effect-item-0"] input');
          // Op, X, Y, Blur, Spread
          for (const [index, value] of [
            [0, '40'],
            [1, '14'],
            // Y counts up: below the layer
            [2, '-14'],
            [3, '24'],
          ]) {
            await fields.nth(index).fill(value);
          }
          await fields.nth(3).blur();
          await page.locator('[data-testid="effect-item-0"]').scrollIntoViewIfNeeded();
          await page.waitForTimeout(400);
        },
      },
    ],
    markers: [
      { target: '[data-testid="add-effect-button"]', label: 1, at: 'left', dx: -46 },
      {
        target: '[data-testid="effect-item-0"] button[aria-label="Hide effect"]',
        label: 2,
        at: 'left',
        dx: -34,
      },
      {
        target: '[data-testid="effect-item-0"] button[aria-label="Remove effect"]',
        label: 3,
        at: 'left',
        dx: -38,
      },
    ],
    capture: { selectors: [PARTS.canvas, PARTS.properties], padding: 0 },
  },
];
