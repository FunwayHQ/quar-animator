/**
 * Pictures for "Weights and bending" (rigging-weights.md).
 */

import { bindLimb, tag, turnSelectedBone } from './rigging-bones.mjs';

/** The Limb bound and bent: the arm's middle bone turned. */
const bentLimb = [...bindLimb, { layer: 'Forearm' }, { wait: 300 }, turnSelectedBone(-30, -60)];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'rigging-weights-paint',
    about:
      'Weight painting a bent shape: its weights for one bone in color, the brush settings beside it',
    steps: [
      ...bentLimb,
      { layer: 'Limb' },
      { press: 'w' },
      { wait: 400 },
      tag('[class*="_rightPanel_"] select:has(option:text-is("Select bone..."))', 'bone'),
      {
        run: async (page) => {
          const select = page.locator('[data-shot="bone"]');
          await select.selectOption({ label: 'Forearm' });
          await select.evaluate((element) => element.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(300);
          // The brush over the shape
          const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
          await page.mouse.move(box.x + 590, box.y + 205);
          await page.waitForTimeout(300);
        },
      },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-shot="bone"]', label: 1, at: 'right', dx: -30 },
      { target: 'input[aria-label="Brush size"]', label: 2, at: 'left', dx: -38 },
      { target: 'input[aria-label="Brush strength"]', label: 3, at: 'left', dx: -38 },
      { target: 'button[title="Add weight (X)"]', label: 4, at: 'right', dx: 130 },
    ],
    capture: { clip: { x: 660, y: 160, width: 620, height: 400 } },
  },
  {
    name: 'rigging-weights-points',
    about: 'Direct Selection on a bound path: its points shown where the bones have bent it',
    steps: [
      ...bindLimb.slice(0, -3),
      { press: 'Control+Shift+p' },
      { wait: 300 },
      ...bindLimb.slice(-3),
      { layer: 'Forearm' },
      { wait: 300 },
      turnSelectedBone(-30, -60),
      { layer: 'Limb' },
      { press: 'a' },
      { wait: 400 },
    ],
    capture: { clip: { x: 650, y: 222, width: 232, height: 162 } },
  },
];
