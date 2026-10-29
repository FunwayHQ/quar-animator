/**
 * Pictures for "Artboards" (artboards.md).
 */

import { PARTS } from './_kit.mjs';

/** An artboard's name and size, drawn above its top-left corner. */
const label = (n) => `${PARTS.canvas} svg > text:has(tspan):nth-of-type(${n})`;

/** Rename the layer in a row of the Layers panel. */
const rename = (from, to) => [
  { dblclick: `[data-testid^="layer-row-"]:has-text("${from}")` },
  { fill: ['[data-testid="layer-rename-input"]', to] },
  { press: 'Enter' },
];

/**
 * Two artboards, Intro and Ending, each with a circle over its right edge;
 * the Ending one's content isn't clipped. Ending is selected.
 */
const twoArtboards = [
  { open: 'new' },
  { press: 'f' },
  { drag: { from: [120, 150], to: [360, 330] } },
  ...rename('Artboard', 'Intro'),
  { press: 'o' },
  { drag: { from: [300, 200], to: [400, 280] } },
  { press: 'f' },
  { drag: { from: [460, 150], to: [700, 330] } },
  ...rename('Artboard', 'Ending'),
  { press: 'o' },
  { drag: { from: [640, 200], to: [740, 280] } },
  // Select Ending by its name, and stop clipping what's in it
  { run: async (page, kit) => kit.drag({ from: [480, 142], to: [480, 142], steps: 1 }) },
  { wait: 200 },
  {
    run: async (page) => {
      const clip = page
        .locator('[class*="_propertyRow_"]:has-text("Clip Content") input[type="checkbox"]')
        .first();
      await clip.scrollIntoViewIfNeeded();
      await clip.uncheck();
      await page.waitForTimeout(300);
    },
  },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'artboards-draw',
    about: 'An artboard just drawn round a circle: its label, and the circle inside it in Layers',
    steps: [
      { open: 'new' },
      { press: 'o' },
      { drag: { from: [330, 200], to: [430, 280] } },
      { press: 'f' },
      { drag: { from: [250, 140], to: [560, 340] } },
      { wait: 300 },
    ],
    markers: [
      { target: label(1), label: 1, at: 'left', dx: -40, dy: -2 },
      {
        target: '[data-testid^="layer-row-"][aria-label="Layer: Ellipse"]',
        label: 2,
        at: 'right',
        dx: -8,
      },
    ],
    capture: { selectors: [PARTS.layers, PARTS.canvas], padding: 0 },
  },
  {
    name: 'artboards-clip',
    about: 'Two artboards with a circle over the edge: the first clips it, the second doesn’t',
    steps: twoArtboards,
    markers: [
      { target: label(1), label: 1, at: 'left', dx: -40, dy: -2 },
      { target: label(2), label: 2, at: 'left', dx: -40, dy: -2 },
      {
        target: `${PARTS.properties} input[type="checkbox"]`,
        label: 3,
        dx: 34,
        dy: 8,
      },
    ],
    capture: { selectors: [PARTS.canvas, PARTS.properties], padding: 0 },
  },
  {
    name: 'artboards-timeline',
    about: 'The timeline’s picker: which artboard’s timeline is in view',
    steps: [...twoArtboards, { layer: 'Intro' }, { wait: 300 }],
    markers: [{ target: '[data-testid="timeline-scope"]', label: 1, at: 'right', dx: 36 }],
    capture: {
      selectors: [
        '[data-testid="timeline-scope"]',
        '[data-testid^="timeline-layer-"]:has-text("Ellipse")',
      ],
      padding: { top: 6, right: 56, bottom: 4, left: 8 },
    },
  },
];
