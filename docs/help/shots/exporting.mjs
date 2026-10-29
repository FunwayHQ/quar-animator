/**
 * Pictures for "Exporting" (exporting.md).
 */

/**
 * A new project with three artboards side by side, a shape in each. They're
 * drawn right to left, so the left one is the topmost in the Layers panel:
 * the first slide.
 */
export const threeSlides = [
  { open: 'new' },
  { press: 'f' },
  { drag: { from: [540, 150], to: [740, 300] } },
  { press: 'f' },
  { drag: { from: [290, 150], to: [490, 300] } },
  { press: 'f' },
  { drag: { from: [40, 150], to: [240, 300] } },
  { press: 'o' },
  { drag: { from: [100, 190], to: [180, 260] } },
  { press: 'r' },
  { drag: { from: [340, 190], to: [440, 260] } },
  { press: 'u' },
  { drag: { from: [600, 185], to: [680, 265] } },
  { wait: 300 },
  // Nothing selected
  {
    run: async (page) => {
      const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
      await page.mouse.click(box.x + box.width - 30, box.y + box.height - 60);
    },
  },
  { press: 'Control+0' },
  { wait: 300 },
];

/** Left of the dialog's fields: where a marker sits beside a row of the Export dialog. */
const besideRow = (target, label) => ({
  target,
  label,
  at: 'left',
  // The fields start 124 px into the dialog: the badge just outside its left edge
  dx: -164,
});

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'exporting-menu',
    about: 'The Export menu, a format on each line',
    steps: [{ open: 'tutorial-draw-and-animate' }, { click: '[data-testid="menu-export"]' }],
    keepPointer: true,
    capture: {
      selectors: ['[data-testid="menu-export"]', '[data-testid="export-menu-dropdown"]'],
      padding: { top: 6, right: 24, bottom: 16, left: 80 },
    },
  },
  {
    name: 'exporting-dialog',
    about: 'The Export Animation dialog at its GIF tab, its parts numbered',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { click: '[data-testid="menu-export"]' },
      { click: 'role=menuitem[name=/Export as GIF/]' },
      { waitFor: '[data-testid="export-dialog"]' },
      { wait: 300 },
    ],
    markers: [
      { target: '[data-testid="export-tab-png-sequence"]', label: 1, at: 'left', dx: -56 },
      besideRow('[data-testid="export-width"]', 2),
      besideRow('[data-testid="export-artboard-scope"]', 3),
      besideRow('[data-testid="export-start-frame"]', 4),
      besideRow('[data-testid="export-gif-fps"]', 5),
      besideRow('[data-testid="export-gif-compression"]', 6),
    ],
    capture: {
      selector: '[data-testid="export-dialog"]',
      padding: { top: 12, right: 12, bottom: 12, left: 44 },
    },
  },
  {
    name: 'exporting-slides',
    about: 'The MP4 tab of the Export dialog on a page of three artboards, played as slides',
    steps: [
      ...threeSlides,
      { click: '[data-testid="menu-export"]' },
      { click: 'role=menuitem[name=/Export as MP4/]' },
      { waitFor: '[data-testid="export-dialog"]' },
      { wait: 300 },
    ],
    capture: { selector: '[data-testid="export-dialog"]', padding: 12 },
  },
  {
    name: 'exporting-selection',
    about:
      'The Export section of the Properties panel, with a PNG at 2x and an SVG for the selected layer',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { layer: 'Ball' },
      { click: '[data-testid="add-export-button"]' },
      { click: '[data-testid="add-export-button"]' },
      {
        run: async (page) => {
          const formats = page.locator('[data-testid="export-format-select"]');
          await formats.nth(0).selectOption('png 2x');
          await formats.nth(1).selectOption('svg');
          await page
            .locator('[data-testid="export-section"]')
            .evaluate((element) => element.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: {
      selector: '[data-testid="export-section"]',
      padding: { top: 8, right: 12, bottom: 8, left: 12 },
    },
  },
];
