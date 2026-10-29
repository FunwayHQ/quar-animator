/**
 * Pictures for keyframes.md (Keyframes and the timeline).
 */

import { PARTS } from './_kit.mjs';

/** Tutorial 1's keyframes page, the Square selected, a taller timeline. */
const keyframesPage = [
  { open: 'tutorial-draw-and-animate' },
  { page: '2 · Keyframes' },
  { wait: 600 },
  { press: 'Control+0' },
  { layer: 'Square' },
];

/** The timeline's bar and parts (CSS module classes of Timeline.module.css). */
const T = {
  transport: '[class*="_transportControls_"]',
  time: '[class*="_controls_"] > [class*="_timeDisplay_"]',
  frames: '[data-testid="timeline-duration-input"]',
  fps: '[data-testid="timeline-fps-input"]',
  options: '[class*="_controls_"] > [class*="_options_"]',
  picker: '[data-testid="timeline-scope"]',
  ruler: '[data-testid="timeline-ruler"]',
  tracks: '[data-testid="timeline-tracks"]',
  sound: '[data-testid="sound-lane-label"]',
};

/** Points of the canvas a new ellipse is drawn and moved between. */
const draw = [
  { open: 'new' },
  { press: 'o' },
  { drag: { from: [250, 190], to: [310, 250] } },
  { wait: 200 },
];

export default [
  {
    name: 'keyframes-timeline',
    about: 'The timeline, its parts numbered',
    storage: { 'quar-animator-timeline-height': '250' },
    steps: [
      ...keyframesPage,
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { wait: 300 },
    ],
    // In the gaps of the bar, before each part (after FPS for the third)
    markers: [
      { target: T.transport, label: 1, at: 'left', dx: -31 },
      { target: T.time, label: 2, at: 'left', dx: -31 },
      {
        target: '[class*="_durationControl_"]:has([data-testid="timeline-fps-input"])',
        label: 3,
        at: 'right',
        dx: 44,
      },
      { target: T.options, label: 4, at: 'left', dx: -42 },
      { target: T.picker, label: 5, at: 'right', dx: 40 },
      { target: T.ruler, label: 6, at: 'right', dx: -10 },
      { target: T.tracks, label: 7, at: 'right' },
      { target: T.sound, label: 8, at: 'left', dx: 57 },
    ],
    capture: { selector: PARTS.timeline },
  },
  {
    name: 'keyframes-buttons',
    about: 'The buttons at the right of the timeline’s bar, numbered',
    steps: keyframesPage,
    markers: [
      { target: '[data-testid="auto-keyframe-toggle"]', label: 1, at: 'bottom', dy: 30 },
      { target: '[aria-label="Toggle loop"]', label: 2, at: 'bottom', dy: 30 },
      { target: '[data-testid="work-area-toggle"]', label: 3, at: 'bottom', dy: 30 },
      { target: '[data-testid="graph-editor-toggle"]', label: 4, at: 'bottom', dy: 30 },
      { target: '[data-testid="sequence-window-toggle"]', label: 5, at: 'bottom', dy: 30 },
      { target: '[data-testid="onion-skin-button"]', label: 6, at: 'bottom', dy: 30 },
    ],
    capture: {
      selector: T.options,
      padding: { top: 6, right: 8, bottom: 40, left: 8 },
    },
  },
  {
    name: 'keyframes-diamonds',
    about: 'The Transform section of Properties, Position and Rotation keyed at frame 60',
    steps: [
      ...keyframesPage,
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      { press: 'Shift+.' },
      {
        run: async (page) => {
          await page.locator('#prop-pos-x').scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: {
      selector: '[class*="_section_"]:has(#prop-pos-x)',
      padding: 4,
    },
  },
  {
    name: 'keyframes-layer-menu',
    about: 'The right-click menu of a layer’s name on the timeline',
    storage: { 'quar-animator-timeline-height': '250' },
    steps: [
      ...keyframesPage,
      { rightClick: '[data-testid^="timeline-layer-"]:has-text("Square")' },
      { wait: 200 },
    ],
    keepPointer: true,
    capture: {
      selectors: ['[data-testid^="timeline-layer-"]:has-text("Square")', 'role=menu'],
      padding: { top: 60, right: 120, bottom: 16, left: 0 },
    },
  },
  {
    name: 'keyframes-onion-skin',
    about: 'Onion skin on, a ball moving, the onion skin settings open',
    steps: [
      ...draw,
      // Position keyed at frame 0, then moved far by frame 10: wide spacing
      { click: '[data-testid="keyframe-indicator"]' },
      { press: 'Shift+.' },
      { drag: { from: [280, 220], to: [700, 220] } },
      { wait: 200 },
      // Nothing selected (an empty spot), at frame 5, onion skin on
      { drag: { from: [120, 420], to: [121, 420] } },
      { press: 'Home' },
      { press: '.' },
      { press: '.' },
      { press: '.' },
      { press: '.' },
      { press: '.' },
      { press: 'Shift+O' },
      { click: '[data-testid="onion-skin-button"]' },
      { wait: 300 },
    ],
    capture: {
      selectors: [PARTS.canvas, '[data-testid="onion-skin-panel"]'],
    },
  },
];
