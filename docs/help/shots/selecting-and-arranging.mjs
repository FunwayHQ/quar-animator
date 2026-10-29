/**
 * Pictures for "Select and arrange" (selecting-and-arranging.md).
 */

import { newProjectWithShape } from './_kit.mjs';

const CANVAS = '[data-testid="canvas-drop-zone"]';

/** Two rectangles side by side in a new project; the second one is selected. */
const twoRectangles = [
  { open: 'new' },
  { press: 'r' },
  { drag: { from: [300, 170], to: [400, 270] } },
  { press: 'r' },
  { drag: { from: [550, 220], to: [620, 300] } },
  { wait: 300 },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'selecting-and-arranging-handles',
    about: 'A selected rectangle: a corner handle, a side handle and the place to rotate it',
    steps: newProjectWithShape,
    // World Y runs up: the handle called top-right is drawn at the bottom right
    markers: [
      { target: '[data-testid="handle-top-right"]', label: 1, dx: 24, dy: 24 },
      { target: '[data-testid="handle-right"]', label: 2, dx: 26 },
      { target: '[data-testid="handle-bottom-right"]', label: 3, dx: 22, dy: -22 },
    ],
    capture: { selector: '[data-testid="selection-bounds"]', padding: 64 },
  },
  {
    name: 'selecting-and-arranging-transform',
    about: 'The Transform settings in Properties: a scrub label, the aspect lock, the grid button',
    steps: [
      ...newProjectWithShape,
      {
        run: async (page) => {
          await page.locator('[data-testid="snap-to-grid-toggle"]').scrollIntoViewIfNeeded();
          await page.waitForTimeout(200);
        },
      },
    ],
    markers: [
      { target: '[data-testid="scrub-label-X"]', label: 1, at: 'left', dx: -46 },
      { target: '[data-testid="aspect-ratio-lock"]', label: 2, dy: -24 },
      { target: '[data-testid="snap-to-grid-toggle"]', label: 3, dx: -30 },
    ],
    capture: {
      selectors: ['[data-testid="snap-to-grid-toggle"]', '#prop-pos-x', '#prop-rotation'],
      padding: { top: 12, right: 12, bottom: 12, left: 56 },
    },
  },
  {
    name: 'selecting-and-arranging-guides',
    about: 'The rulers, a guide dragged from one, and a smart guide as a rectangle is moved',
    steps: [
      ...twoRectangles,
      // A guide from the left ruler
      { drag: { from: [10, 330], to: [470, 330] } },
      { wait: 200 },
      // Move the first rectangle until its top lines up with the second's
      {
        run: async (page) => {
          const box = await page.locator(CANVAS).boundingBox();
          await page.mouse.move(box.x + 350, box.y + 230);
          await page.mouse.down();
          await page.mouse.move(box.x + 380, box.y + 265, { steps: 10 });
          await page.mouse.move(box.x + 382, box.y + 281, { steps: 6 });
          await page.waitForTimeout(300);
        },
      },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-testid="canvas-ruler-h"]', label: 1, at: 'left', dx: 60 },
      { target: '[data-testid="guide-hit"]', label: 2, at: 'bottom', dy: -40 },
      { target: '[data-testid="smart-alignment-guide"]', label: 3, at: 'right', dx: 30, dy: -16 },
    ],
    capture: { selector: CANVAS },
  },
  {
    name: 'selecting-and-arranging-layers',
    about: 'The Layers panel: an artboard, a group in it, and a selected layer’s eye and lock',
    steps: [{ open: 'tutorial-groups-symbols-masks' }, { layer: 'Flower' }, { wait: 300 }],
    // The pointer stays on the row: its eye and lock show while it's pointed at
    keepPointer: true,
    markers: [
      {
        target: '[data-testid^="layer-row-"][aria-pressed="true"] button[aria-label="Hide layer"]',
        label: 1,
        dy: -27,
      },
      {
        target: '[data-testid^="layer-row-"][aria-pressed="true"] button[aria-label="Lock layer"]',
        label: 2,
        dy: 27,
      },
    ],
    capture: {
      selectors: [
        '[data-testid^="layer-row-"]:has-text("1 · Groups")',
        '[data-testid^="layer-row-"]:has-text("Petal 3")',
      ],
      padding: { top: 48, right: 0, bottom: 10, left: 0 },
    },
  },
];
