/**
 * The pictures of "Paths and the Pen" (paths.md): a path being drawn with
 * the Pen, a point picked with Direct Selection and its Vertex settings, the
 * Edit menu's path commands, and a boolean subtraction.
 */

/** Where the canvas is on the page, for clicks and pointer moves in its own pixels. */
async function canvasAt(page, x, y) {
  const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
  return [box.x + x, box.y + y];
}

/** A click on the canvas, in its own pixels. */
const clickCanvas = (x, y, options = {}) => ({
  run: async (page) => page.mouse.click(...(await canvasAt(page, x, y)), options),
});

/** The Pen's points for an arch: a corner, a smooth point dragged out, a corner. */
const arch = (left, top, width, height) => [
  clickCanvas(left, top + height),
  { drag: { from: [left + width / 2, top], to: [left + width * 0.85, top] } },
  clickCanvas(left + width, top + height),
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'paths-pen',
    about:
      'A path being drawn with the Pen: its points, a pair of handles and the line to the pointer',
    steps: [
      { open: 'new' },
      { press: 'p' },
      ...arch(220, 150, 240, 170),
      {
        run: async (page) => {
          await page.mouse.move(...(await canvasAt(page, 380, 410)), { steps: 6 });
        },
      },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-testid="pen-first-point"]', label: 1, at: 'left', dx: -40 },
      { target: 'circle[class*="_handle_"]', label: 2, at: 'top', dy: -38 },
      { target: '[data-testid="pen-rubber-band"]', label: 3, at: 'right', dx: 28 },
    ],
    capture: { clip: { x: 380, y: 190, width: 420, height: 340 } },
  },
  {
    name: 'paths-direct-selection',
    about: 'A point picked with Direct Selection, its handles, and its Vertex settings',
    viewport: { width: 1280, height: 1000 },
    storage: { 'quar-animator-timeline-height': '120' },
    steps: [
      { open: 'new' },
      { press: 'p' },
      ...arch(460, 330, 240, 170),
      clickCanvas(460, 500),
      // Double-clicked with the Selection tool: Direct Selection, the path's points
      clickCanvas(580, 450, { clickCount: 2 }),
      clickCanvas(580, 330),
      { click: '[data-testid="animation-presets-toggle"]' },
    ],
    markers: [
      { target: '[class*="_pointSelected_"]', label: 1, at: 'top', dy: -36 },
      { target: 'circle[class*="_handle_"]', label: 2, at: 'top', dy: -36 },
      { target: '[data-testid="vertex-pos-x"]', label: 3, at: 'left', dx: -46 },
      { target: '[data-testid="vertex-type"]', label: 4, at: 'left', dx: -46 },
      {
        target: '[class*="_propertyRow_"]:has([data-testid="vertex-handle-in-x"])',
        label: 5,
        at: 'left',
        dx: -46,
        dy: 8,
      },
    ],
    capture: { clip: { x: 620, y: 370, width: 660, height: 390 } },
  },
  {
    name: 'paths-edit-menu',
    about: 'The Edit menu’s Path and Convert commands, with a path selected',
    viewport: { width: 1280, height: 1100 },
    steps: [
      { open: 'new' },
      { press: 'p' },
      ...arch(220, 150, 240, 170),
      { press: 'Enter' },
      { click: '[data-testid="menu-edit"]' },
      { hover: 'role=menuitem[name="Simplify Path"]' },
    ],
    keepPointer: true,
    capture: {
      selectors: ['role=menuitem[name="Reverse Path"]', 'role=menuitem[name=/Outline Stroke/]'],
      padding: { top: 34, right: 0, bottom: 8, left: 0 },
    },
  },
  {
    name: 'paths-boolean',
    about: 'A circle subtracted from a rectangle, and the boolean group that holds them in Layers',
    steps: [
      { open: 'new' },
      { press: 'r' },
      { drag: { from: [160, 90], to: [380, 270] } },
      { press: 'o' },
      { drag: { from: [300, 130], to: [450, 280], shift: true } },
      { press: 'Control+a' },
      { press: 'Control+Shift+d' },
    ],
    markers: [
      {
        target: '[class*="_leftPanel_"] [data-testid^="layer-row-"]',
        label: 1,
        at: 'right',
        dx: -6,
      },
    ],
    capture: { clip: { x: 0, y: 76, width: 700, height: 300 } },
  },
];
