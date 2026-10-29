/**
 * The pictures of "Text" (text.md): text being typed in a box, the Text
 * settings, the font picker and the question Google Fonts asks first.
 */

/** Where the canvas is on the page, for clicks in its own pixels. */
async function canvasAt(page, x, y) {
  const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
  return [box.x + x, box.y + y];
}

const clickCanvas = (x, y, options = {}) => ({
  run: async (page) => page.mouse.click(...(await canvasAt(page, x, y)), options),
});

/** A line of auto width text, then a fixed box of text, both typed. */
const twoTexts = [
  { open: 'new' },
  { press: 't' },
  clickCanvas(160, 90),
  { type: 'Auto width: one line' },
  { press: 'Escape' },
  { press: 't' },
  { drag: { from: [160, 180], to: [430, 330] } },
  { type: 'A fixed box: the words wrap at its width, line after line.' },
];

/** The Text rows of Properties, by where they are after the Font row. */
const FONT_ROW = '[class*="_propertyRow_"]:has([data-testid="font-picker"])';
const RESIZE_ROW = '[class*="_propertyRow_"]:has([data-testid="text-resize-fixed"])';

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'text-box',
    about: 'A line of auto width text, and a fixed box of text, selected',
    // Finished, the box stays selected: its frame shows the size it was dragged to
    steps: [...twoTexts, { press: 'Escape' }],
    capture: { clip: { x: 360, y: 140, width: 360, height: 300 } },
  },
  {
    name: 'text-settings',
    about: 'The Text settings in Properties, numbered',
    viewport: { width: 1280, height: 1000 },
    storage: { 'quar-animator-timeline-height': '120' },
    steps: [
      ...twoTexts,
      clickCanvas(700, 520),
      clickCanvas(250, 220),
      { click: '[data-testid="animation-presets-toggle"]' },
    ],
    markers: [
      { target: FONT_ROW, label: 1, at: 'left', dx: -46 },
      { target: `${FONT_ROW} + div`, label: 2, at: 'left', dx: -46 },
      { target: `${FONT_ROW} + div + div`, label: 3, at: 'left', dx: -46 },
      { target: `${FONT_ROW} + div + div + div`, label: 4, at: 'left', dx: -46 },
      { target: RESIZE_ROW, label: 5, at: 'left', dx: -46 },
      { target: `${RESIZE_ROW} + div`, label: 6, at: 'left', dx: -46 },
      { target: `${RESIZE_ROW} + div + div`, label: 7, at: 'left', dx: -46 },
    ],
    capture: {
      selectors: [FONT_ROW, `${RESIZE_ROW} + div + div`],
      padding: { top: 10, right: 4, bottom: 10, left: 44 },
    },
  },
  {
    name: 'text-font-picker',
    about: 'The font picker open: search, categories and the lists of fonts',
    storage: { 'quar-recent-fonts': '["Playfair Display","Lobster"]' },
    steps: [
      { open: 'new' },
      { press: 't' },
      clickCanvas(160, 120),
      { type: 'Title' },
      { press: 'Escape' },
      { click: '[data-testid="animation-presets-toggle"]' },
      { click: '[data-testid="font-picker"] input' },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-testid="font-picker"]', label: 1, at: 'left', dx: -46 },
      { target: '[role="radiogroup"][aria-label="Font category"]', label: 2, at: 'left', dx: -46 },
      {
        target: '[data-section="document"] [class*="_sectionHeader_"]',
        label: 3,
        at: 'left',
        dx: -46,
      },
      {
        target: '[data-section="recent"] [class*="_sectionHeader_"]',
        label: 4,
        at: 'left',
        dx: -46,
      },
      {
        target: '[data-section="google"] [class*="_sectionHeader_"]',
        label: 5,
        at: 'left',
        dx: -46,
      },
      {
        target: '[data-testid="font-picker-list"] [class*="_footer_"]',
        label: 6,
        at: 'left',
        dx: -46,
      },
    ],
    capture: {
      selectors: ['[data-testid="font-picker"]', '[data-testid="font-picker-list"]'],
      padding: { top: 8, right: 8, bottom: 8, left: 44 },
    },
  },
  {
    name: 'text-google-fonts',
    about: 'The question asked the first time a Google font is picked',
    steps: [
      { open: 'new' },
      { press: 't' },
      clickCanvas(160, 120),
      { type: 'Title' },
      { press: 'Escape' },
      { click: '[data-testid="animation-presets-toggle"]' },
      { click: '[data-testid="font-picker"] input' },
      { type: 'Lobster' },
      { press: 'Enter' },
      { waitFor: '[data-testid="prompt-dialog"]' },
    ],
    capture: { selector: '[data-testid="prompt-dialog"]', padding: 16 },
  },
];
