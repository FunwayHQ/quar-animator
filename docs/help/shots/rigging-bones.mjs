/**
 * Pictures for "Bones and binding" (rigging-bones.md).
 */

/** Tutorial 5's page "2 · Bind", fitted to the window. */
export const bindPage = [
  { open: 'tutorial-rigging' },
  { page: '2 · Bind' },
  { wait: 600 },
  { press: 'Control+0' },
  { wait: 300 },
];

/** Right-click the canvas at a point in its own pixels. */
export const rightClickCanvas = (x, y) => ({
  run: async (page) => {
    const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
    await page.mouse.click(box.x + x, box.y + y, { button: 'right' });
    await page.waitForTimeout(250);
  },
});

/** The Limb on the Bind page, bound to the arm's bones from its right-click menu. */
export const bindLimb = [
  ...bindPage,
  { layer: 'Limb' },
  rightClickCanvas(558, 262),
  { click: 'role=menuitem[name=/Bind to Bones/]' },
  { wait: 300 },
];

/**
 * Turn the selected bone by dragging from just outside the top-right corner
 * of its box, as a person does.
 */
export const turnSelectedBone = (dx, dy) => ({
  run: async (page) => {
    const box = await page.locator('[data-testid="selection-bounds"]').boundingBox();
    const x = box.x + box.width + 10;
    const y = box.y - 10;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(400);
  },
});

/** Give an element a data-shot attribute, for a marker to point at. */
export const tag = (locator, name) => ({
  run: async (page) => {
    await page
      .locator(locator)
      .first()
      .evaluate((element, value) => element.setAttribute('data-shot', value), name);
  },
});

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'rigging-bones-chain',
    about: 'A chain of three bones drawn with the Bone tool, nested in the Layers panel',
    steps: [
      { open: 'new' },
      { press: 'j' },
      { drag: { from: [150, 330], to: [270, 300] } },
      { drag: { from: [270, 300], to: [370, 230] } },
      { drag: { from: [370, 230], to: [450, 215] } },
      { press: 'Escape' },
      { wait: 300 },
    ],
    capture: { clip: { x: 0, y: 76, width: 720, height: 380 } },
  },
  {
    name: 'rigging-bones-properties',
    about: 'A bone’s settings in the Properties panel, from Transform to Rotation',
    // Tall enough for the whole of a bone's settings
    viewport: { width: 1280, height: 1500 },
    steps: [
      { open: 'tutorial-rigging' },
      { press: 'Control+0' },
      { layer: 'Forearm' },
      { wait: 300 },
      tag('[class*="_rightPanel_"] :text-is("Transform")', 'transform'),
      {
        run: async (page) => {
          await page
            .locator('[data-shot="transform"]')
            .evaluate((element) => element.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: {
      selectors: ['[data-shot="transform"]', '#prop-rotation'],
      padding: { top: 10, right: 12, bottom: 12, left: 12 },
    },
  },
  {
    name: 'rigging-bones-bind',
    about:
      'The Rigging menu at Bind Selection to Bones, with a shape selected on a page with bones',
    steps: [
      ...bindPage,
      { layer: 'Limb' },
      { click: '[data-testid="menu-rigging"]' },
      { hover: 'role=menuitem[name=/Bind Selection to Bones/]' },
    ],
    keepPointer: true,
    capture: {
      selectors: ['[data-testid="menu-rigging"]', '[data-testid="rigging-menu-dropdown"]'],
      padding: { top: 6, right: 290, bottom: 16, left: 16 },
    },
  },
  {
    name: 'rigging-bones-bend',
    about: 'The bound shape bending as its middle bone turns',
    steps: [...bindLimb, { layer: 'Forearm' }, { wait: 300 }, turnSelectedBone(-30, -60)],
    capture: { clip: { x: 650, y: 222, width: 232, height: 162 } },
  },
];
