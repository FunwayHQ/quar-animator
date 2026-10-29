/**
 * Pictures for shape-tweening.md (Shape tweening).
 */

import { PARTS } from './_kit.mjs';

/** A star drawn in a new project, made a path, its Shape keyed at frame 0. */
const starPath = [
  { open: 'new' },
  { press: 's' },
  { drag: { from: [300, 150], to: [460, 310] } },
  { wait: 200 },
  { press: 'Control+Shift+P' },
  { wait: 300 },
  { click: '[data-testid="shape-tween-row"] [data-testid="keyframe-indicator"]' },
];

/** Direct Selection (A), then the star's top point dragged by (dx, dy). */
function pullTopPoint(dx, dy) {
  return [
    { press: 'a' },
    { wait: 300 },
    {
      run: async (page) => {
        // The point nearest the top of the overlay: the star's top tip
        const points = await page.evaluate(() =>
          [...document.querySelectorAll('svg rect[class*="_point"]')].map((rect) => {
            const box = rect.getBoundingClientRect();
            return [box.x + box.width / 2, box.y + box.height / 2];
          })
        );
        const [x, y] = points.sort((a, b) => a[1] - b[1])[0];
        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + dx, y + dy, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
      },
    },
  ];
}

/** Nothing selected: a click on an empty spot with the Selection tool. */
const selectNothing = [{ press: 'v' }, { drag: { from: [60, 440], to: [61, 440] } }];

const frames = (n) => Array.from({ length: n }, () => ({ press: '.' }));

export default [
  {
    name: 'shape-tweening-edit',
    about: 'A star path edited at frame 20: the point, the Shape row, the keyframes',
    steps: [...starPath, { press: 'Shift+.' }, { press: 'Shift+.' }, ...pullTopPoint(0, -80)],
    markers: [
      { target: 'svg rect[class*="_pointSelected_"]', label: 1, at: 'center', dx: 30 },
      { target: '[data-testid="shape-tween-row"]', label: 2, at: 'right' },
      { target: '[data-testid^="timeline-track-"]', label: 3, at: 'left', dx: 100 },
    ],
  },
  {
    name: 'shape-tweening-morph',
    about: 'Onion skin on a star whose top point swings to the right over six frames',
    steps: [
      ...starPath,
      ...frames(6),
      ...pullTopPoint(220, -40),
      ...selectNothing,
      { press: 'Home' },
      ...frames(3),
      { press: 'Shift+O' },
      { wait: 300 },
    ],
    capture: { selector: PARTS.canvas },
  },
  {
    name: 'shape-tweening-converted',
    about: 'Onion skin on a rounded rectangle made a path, its width keyframes now Shape keyframes',
    steps: [
      { open: 'new' },
      { press: 'r' },
      { drag: { from: [330, 220], to: [410, 300] } },
      { wait: 200 },
      // Rounded corners, then Size keyed at frame 0 and widened by frame 6
      { fill: ['[data-testid="corner-radius-input"]', '24'] },
      { press: 'Enter' },
      { click: '[data-testid="keyframe-indicator"] >> nth=1' },
      ...frames(6),
      { fill: ['#prop-size-w', '320'] },
      { press: 'Enter' },
      // Out of the field, so the shortcut goes to the editor
      { evaluate: () => document.activeElement?.blur() },
      { wait: 200 },
      { press: 'Control+Shift+P' },
      { wait: 300 },
      ...selectNothing,
      { press: 'Home' },
      ...frames(3),
      { press: 'Shift+O' },
      { wait: 300 },
    ],
    capture: { selector: PARTS.canvas },
  },
];
