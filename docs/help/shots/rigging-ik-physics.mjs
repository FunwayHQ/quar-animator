/**
 * Pictures for "IK, physics and Smart Bones" (rigging-ik-physics.md).
 */

import { bindLimb, tag } from './rigging-bones.mjs';

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'rigging-ik-physics-ik',
    about: 'An arm posed by dragging the IK target at the tip of its hand',
    steps: [
      { open: 'tutorial-rigging' },
      { page: '3 · IK & poses' },
      { wait: 600 },
      { press: 'Control+0' },
      { wait: 300 },
      { layer: 'Hand' },
      { click: '[data-testid="menu-rigging"]' },
      { click: 'role=menuitem[name=/Create IK Chain/]' },
      { wait: 400 },
      { drag: { from: [506, 160], to: [600, 200] } },
      { wait: 400 },
    ],
    capture: { clip: { x: 650, y: 200, width: 250, height: 230 } },
  },
  {
    name: 'rigging-ik-physics-smart-bones',
    about:
      'Recording a Smart Bone target: the bone turned to the target’s angle, the Point Magnet’s brush, the action in Properties',
    steps: [
      ...bindLimb,
      { layer: 'Forearm' },
      { wait: 300 },
      { click: '[data-testid="create-smart-bone-action"]' },
      { fill: ['[data-testid="new-target-value"]', '90'] },
      { click: '[data-testid="add-target"]' },
      { wait: 200 },
      { click: '[data-testid="start-recording"]' },
      { wait: 500 },
      {
        run: async (page, kit) => {
          await page
            .locator('[data-testid="smart-bone-action"]')
            .evaluate((element) => element.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(300);
          // Push the inside of the elbow out a little, then leave the brush over it
          await kit.drag({ from: [548, 252], to: [530, 262], steps: 16 });
          await page.mouse.move(...(await canvasPoint(page, 535, 240)));
          await page.waitForTimeout(300);
        },
      },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-testid="range-min"]', label: 1, at: 'left', dx: -44 },
      { target: '[data-testid="new-target-value"]', label: 2, at: 'left', dx: -44 },
      { target: '[data-testid="stop-recording"]', label: 3, at: 'right', dx: 40 },
    ],
    capture: { clip: { x: 650, y: 190, width: 630, height: 380 } },
  },
  {
    name: 'rigging-ik-physics-dynamic',
    about: 'A dynamic chain’s settings and the Global Wind settings in the Properties panel',
    viewport: { width: 1280, height: 1500 },
    steps: [
      { open: 'tutorial-rigging' },
      { press: 'Control+0' },
      { layer: 'Upper arm' },
      { wait: 300 },
      { click: '[data-testid="create-dynamic-chain"]' },
      { wait: 400 },
      tag('[class*="_rightPanel_"] :text-is("Dynamic Chain")', 'dynamic-chain'),
      {
        run: async (page) => {
          await page
            .locator('[data-shot="dynamic-chain"]')
            .evaluate((element) => element.scrollIntoView({ block: 'start' }));
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: {
      selectors: ['[data-shot="dynamic-chain"]', '[data-testid="wind-settings"]'],
      padding: { top: 10, right: 12, bottom: 12, left: 12 },
    },
  },
];

/** A point of the canvas, in its own pixels, on the page. */
async function canvasPoint(page, x, y) {
  const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
  return [box.x + x, box.y + y];
}
