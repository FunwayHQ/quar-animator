/**
 * Pictures for presets-and-sequences.md (Presets and Animation Sequence).
 */

import { PARTS } from './_kit.mjs';

const WINDOW = '[data-testid="animation-sequence-window"]';

/** The Animation Sequence window at the left of the canvas, clear of the artboard's objects. */
const windowAtLeft = {
  'quar-animator-sequence-window': JSON.stringify({ x: 232, y: 92, width: 400, height: 440 }),
};

/** Tutorial 2's sequence page at its end (everything in view), the window open. */
const sequencePage = [
  { open: 'tutorial-presets-and-sequences' },
  { page: '2 · Sequence' },
  { wait: 600 },
  { press: 'Control+0' },
  { press: 'End' },
  { press: 'Shift+A' },
  { wait: 500 },
];

export default [
  {
    name: 'presets-panel',
    about: 'The animation presets in Properties, a shape selected',
    viewport: { width: 1280, height: 1000 },
    steps: [
      { open: 'tutorial-presets-and-sequences' },
      { click: 'role=button[name="Collapse timeline"]' },
      { layer: 'Pop in' },
      { wait: 300 },
    ],
    capture: { selector: '[data-testid="animation-presets"]', padding: 6 },
  },
  {
    name: 'presets-sequence-window',
    about: 'The Animation Sequence window with Tutorial 2’s steps, numbers on the objects',
    storage: windowAtLeft,
    steps: sequencePage,
    capture: { selectors: [PARTS.canvas, WINDOW] },
  },
  {
    name: 'presets-sequence-step',
    about: 'One step of the Animation Sequence window',
    storage: windowAtLeft,
    steps: sequencePage,
    capture: { selector: '[data-testid="sequence-step-2"]', padding: 2 },
  },
  {
    name: 'presets-sequence-hint',
    about:
      'Own keyframes chosen for a layer with keyframes: the line above Add step says what it adds',
    storage: windowAtLeft,
    steps: [
      { open: 'tutorial-presets-and-sequences' },
      { press: 'Control+0' },
      { layer: 'Pop in' },
      { press: 'Shift+A' },
      { wait: 300 },
      { run: (page) => page.locator('[aria-label="Effect to add"]').selectOption('own-keyframes') },
      { wait: 200 },
    ],
    capture: {
      selectors: ['[data-testid="sequence-add-hint"]', `${WINDOW} footer`],
      padding: 2,
    },
  },
];
