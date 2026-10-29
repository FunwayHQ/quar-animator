/**
 * The pictures of "Brush and Eraser" (brush-and-eraser.md): a brush stroke
 * and its settings, and the Eraser cutting through a shape.
 */

/** Where the canvas is on the page, for pointer moves in its own pixels. */
async function canvasAt(page, x, y) {
  const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
  return [box.x + x, box.y + y];
}

/** A wave dragged across the canvas, `from` x to `to` x, around `y`. */
const wave = (from, to, y, height, { release = true } = {}) => ({
  run: async (page) => {
    await page.mouse.move(...(await canvasAt(page, from, y)));
    await page.mouse.down();
    // On a little past the end, so the smoothing catches up along the curve
    for (let i = 1; i <= 52; i++) {
      const t = i / 48;
      const x = from + (to - from) * t;
      await page.mouse.move(...(await canvasAt(page, x, y - Math.sin(t * Math.PI * 2) * height)));
    }
    if (release) await page.mouse.up();
  },
});

/** A circle to erase, deselected, then the Eraser (chosen by its key, so [ and ] reach it). */
const circleThenEraser = [
  { open: 'new' },
  { press: 'o' },
  { drag: { from: [260, 110], to: [500, 350], shift: true } },
  // Deselected: a click on an empty part of the canvas
  {
    run: async (page) => page.mouse.click(...(await canvasAt(page, 720, 520))),
  },
  { press: 'e' },
  { press: ']' },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'brush-stroke',
    about: 'A brush stroke that tapers at both ends, and its Width and Profile',
    steps: [
      { open: 'new' },
      { press: 'b' },
      wave(400, 760, 240, 70),
      { click: '[data-testid="animation-presets-toggle"]' },
      { fill: ['[data-testid="brush-stroke-width"]', '18'] },
      { press: 'Enter' },
      { evaluate: () => document.activeElement?.blur() },
      {
        run: async (page) => {
          await page.selectOption('[data-testid="brush-stroke-profile"]', 'taper-both');
        },
      },
    ],
    markers: [
      { target: '[data-testid="brush-stroke-width"]', label: 1, at: 'left', dx: -77 },
      { target: '[data-testid="brush-stroke-profile"]', label: 2, at: 'left', dx: -58 },
    ],
    capture: { clip: { x: 600, y: 210, width: 680, height: 350 } },
  },
  {
    name: 'brush-eraser-trail',
    about: 'The Eraser dragged across a circle: the red trail of what it will take away',
    steps: [...circleThenEraser, wave(200, 560, 230, 40, { release: false })],
    keepPointer: true,
    capture: { clip: { x: 400, y: 160, width: 400, height: 280 } },
  },
  {
    name: 'brush-erased',
    about: 'The circle once the Eraser has cut through it, in two pieces',
    steps: [...circleThenEraser, wave(200, 560, 230, 40)],
    capture: { clip: { x: 400, y: 160, width: 400, height: 280 } },
  },
];
