/**
 * The pictures of "Draw shapes" (shapes.md): the shape tools, a star's
 * settings, the Appearance section, the color picker and a radial gradient.
 */

/** A click on the canvas, in its own pixels (to pick a shape, or nothing). */
const clickCanvas = (x, y) => ({
  run: async (page) => {
    const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
    await page.mouse.click(box.x + x, box.y + y);
  },
});

/** Type a value into a field and take it. */
const enter = (selector, value) => [{ fill: [selector, value] }, { press: 'Enter' }];

/** The Animation presets folded away, so the shape's own settings show. */
const foldPresets = { click: '[data-testid="animation-presets-toggle"]' };

const TOOLS = ['rectangle', 'ellipse', 'polygon', 'star'].map((tool) => `[data-tool="${tool}"]`);

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'shapes-tools',
    about: 'The four shape tools, numbered, and a shape drawn with each',
    steps: [
      { open: 'new' },
      { press: 'r' },
      { drag: { from: [345, 64], to: [455, 154] } },
      ...enter('[data-testid="corner-radius-input"]', '16'),
      clickCanvas(600, 480),
      { press: 'o' },
      { drag: { from: [475, 64], to: [565, 154] } },
      { press: 'u' },
      { drag: { from: [585, 64], to: [675, 154] } },
      { press: 's' },
      { drag: { from: [695, 64], to: [785, 154] } },
      clickCanvas(600, 480),
    ],
    markers: TOOLS.map((target, i) => ({ target, label: i + 1, at: 'bottom', dy: 34 })),
    capture: { clip: { x: 556, y: 0, width: 452, height: 246 } },
  },
  {
    name: 'shapes-star-settings',
    about: 'A star with rounded corners, and its Corner Radius, Sides and Inner Radius',
    viewport: { width: 1280, height: 900 },
    steps: [
      { open: 'new' },
      { press: 's' },
      { drag: { from: [560, 130], to: [760, 330] } },
      foldPresets,
      ...enter('[data-testid="corner-radius-input"]', '10'),
      ...enter('[data-testid="polygon-sides-input"]', '6'),
      // Picked again, so no field has the focus (the presets open again with it)
      clickCanvas(600, 520),
      clickCanvas(660, 230),
      foldPresets,
    ],
    markers: [
      {
        target: '[data-testid="corner-radius-section"] [class*="_propertyHeader_"]',
        label: 1,
        at: 'right',
        dx: 8,
      },
      {
        target:
          '[class*="_propertyRow_"]:has([data-testid="polygon-sides-input"]) [class*="_propertyHeader_"]',
        label: 2,
        at: 'right',
        dx: 8,
      },
      {
        target:
          '[class*="_propertyRow_"]:has([data-testid="polygon-inner-radius-input"]) [class*="_propertyHeader_"]',
        label: 3,
        at: 'right',
        dx: 8,
      },
    ],
    capture: { clip: { x: 760, y: 180, width: 520, height: 380 } },
  },
  {
    name: 'shapes-appearance',
    about: 'The Appearance section of a selected rectangle, its parts numbered',
    viewport: { width: 1280, height: 1000 },
    storage: { 'quar-animator-timeline-height': '120' },
    steps: [
      { open: 'new' },
      { press: 'r' },
      { drag: { from: [250, 150], to: [520, 330] } },
      foldPresets,
      // Pointed at, the fill's row shows its × too
      { hover: '[data-testid="fill-row-0"] [class*="_fillStrokeRow_"]' },
    ],
    keepPointer: true,
    markers: [
      {
        target: '[data-testid="fill-row-0"] [class*="_fillStrokeRow_"]',
        label: 1,
        at: 'left',
        dx: -46,
      },
      {
        target: '[data-testid="fill-row-0"] [data-testid="gradient-editor"]',
        label: 2,
        at: 'left',
        dx: -46,
      },
      { target: '[data-testid="add-fill"]', label: 3, at: 'left', dx: -46 },
      {
        target: '[data-testid="stroke-row-0"] [class*="_fillStrokeRow_"]',
        label: 4,
        at: 'left',
        dx: -46,
      },
      {
        target: '[data-testid="stroke-row-0"] [class*="_strokeSubRow_"]',
        label: 5,
        at: 'left',
        dx: -46,
      },
      { target: '#prop-opacity', label: 6, at: 'left', dx: -46 },
    ],
    capture: {
      selector: '[class*="_section_"]:has([data-testid="fill-row-0"])',
      padding: { top: 4, right: 4, bottom: 8, left: 44 },
    },
  },
  {
    name: 'shapes-color-picker',
    about: 'The color picker, open from a fill’s swatch, its parts numbered',
    viewport: { width: 1280, height: 900 },
    steps: [
      { open: 'new' },
      { press: 'r' },
      { drag: { from: [250, 150], to: [520, 330] } },
      foldPresets,
      { click: '[data-testid="fill-swatch"]' },
    ],
    keepPointer: true,
    // In a column left of the picker (the hue and alpha strips start further in)
    markers: [
      { target: '[data-testid="sv-area"]', label: 1, at: 'left', dx: -56 },
      { target: '[data-testid="hue-slider"]', label: 2, at: 'left', dx: -92, dy: -14 },
      { target: '[data-testid="alpha-slider"]', label: 3, at: 'left', dx: -92 },
      { target: '[data-testid="hex-input"]', label: 4, at: 'left', dx: -56, dy: 6 },
      { target: '[data-testid="mode-toggle"]', label: 5, at: 'right', dx: 44 },
    ],
    capture: {
      selectors: ['[data-testid="color-picker"]', '[data-testid="fill-swatch"]'],
      padding: { top: 12, right: 12, bottom: 12, left: 46 },
    },
  },
  {
    name: 'shapes-gradient',
    about: 'A radial gradient with a focal point: its handles on the canvas and its stops',
    viewport: { width: 1280, height: 900 },
    steps: [
      { open: 'new' },
      { press: 'r' },
      // Low on the canvas, level with the fill in Properties
      { drag: { from: [470, 350], to: [740, 530] } },
      foldPresets,
      { click: '[data-testid="fill-row-0"] [data-testid="fill-type-radial"]' },
      { click: '[data-testid="fill-row-0"] [data-testid="fill-type-radial"]' },
      {
        run: async (page) => {
          // Shift-drag the center: a focal point comes out of it
          const center = await page.locator('[data-testid="gradient-handle-center"]').boundingBox();
          const x = center.x + center.width / 2;
          const y = center.y + center.height / 2;
          await page.keyboard.down('Shift');
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 56, y - 36, { steps: 10 });
          await page.mouse.up();
          await page.keyboard.up('Shift');
          // A third stop, in the middle of the bar
          const bar = await page.locator('[data-testid="gradient-bar"]').boundingBox();
          await page.mouse.click(bar.x + bar.width * 0.8, bar.y + bar.height / 2);
        },
      },
    ],
    markers: [
      { target: '[data-testid="gradient-handle-center"]', label: 1, at: 'bottom', dy: 46 },
      { target: '[data-testid="gradient-handle-radius"]', label: 2, at: 'right', dx: 36 },
      { target: '[data-testid="gradient-handle-focal"]', label: 3, at: 'top', dy: -42 },
      { target: '[data-testid="stop-handle-0"]', label: 4, at: 'left', dx: -46 },
      { target: '[data-testid="stop-color-swatch"]', label: 5, at: 'left', dx: -36 },
      { target: '[data-testid="stop-offset"]', label: 6, at: 'left', dx: -4 },
    ],
    capture: { clip: { x: 664, y: 400, width: 616, height: 270 } },
  },
];
