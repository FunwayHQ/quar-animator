/**
 * The user guide's screenshots: each one is taken by `pnpm help:shots`
 * (or `pnpm help:shots <name>`) into img/<name>.png, from a fresh browser
 * at twice its size. See README.md, "Pictures", for what a shot can say.
 *
 * Selectors are Playwright's (CSS, or text=…, role=…). Where a part of the
 * editor has no test id, its CSS module class name serves:
 * [class*="_leftPanel_"] matches the class `leftPanel` of Editor.module.css.
 */

import { PARTS, newProjectWithShape } from './shots/_kit.mjs';

/** @type {import('../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'projects-page',
    about: 'The Projects page: a project of your own, New Project and the tutorials',
    date: '2026-10-28T10:00:00Z',
    steps: [
      ...newProjectWithShape,
      { click: '[data-testid="project-name"]' },
      { fill: ['[data-testid="project-name-input"]', 'My first animation'] },
      { press: 'Enter' },
      { press: 'Control+s' },
      { wait: 600 },
      { open: 'projects' },
    ],
  },
  {
    name: 'first-shape',
    about: 'A new project with its first shape drawn and selected',
    steps: newProjectWithShape,
  },
  {
    name: 'editor-layout',
    about: 'The editor, its parts numbered',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { press: 'Control+0' },
      { layer: 'Ball' },
      { wait: 400 },
    ],
    // In the gaps beside each part, so no label is covered
    markers: [
      { target: PARTS.tools, label: 1, at: 'right', dx: 52 },
      { target: PARTS.pages, label: 2, at: 'left', dx: 414 },
      { target: PARTS.layers, label: 3, at: 'top-right' },
      { target: PARTS.canvas, label: 4, at: 'bottom-right', dy: -40 },
      { target: PARTS.properties, label: 5, at: 'top-right', dx: -84 },
      { target: PARTS.timeline, label: 6, at: 'top-right', dy: 44 },
    ],
  },
  {
    name: 'page-tabs',
    about: 'A tutorial’s pages, with a page’s right-click menu open',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { rightClick: '[data-testid^="page-tab-"]:has-text("1 · Shapes")' },
      { wait: 200 },
    ],
    keepPointer: true,
    capture: {
      selectors: [
        '[data-testid^="page-tab-"]',
        '[data-testid="add-page-button"]',
        '[data-testid="page-context-menu"]',
      ],
      padding: { top: 0, right: 180, bottom: 40, left: 8 },
    },
  },
  {
    name: 'unsaved-changes',
    about: 'The project’s name in the menu bar, with the dot for unsaved changes',
    steps: newProjectWithShape,
    capture: {
      selector: '[data-testid="project-name"]',
      padding: { top: 8, right: 10, bottom: 8, left: 64 },
    },
  },
  {
    name: 'file-menu',
    about: 'The File menu: saving, downloading and importing',
    steps: [{ open: 'tutorial-draw-and-animate' }, { click: '[data-testid="menu-file"]' }],
    keepPointer: true,
    capture: {
      selectors: ['[data-testid="menu-file"]', '[data-testid="file-menu-dropdown"]'],
      padding: { top: 6, right: 24, bottom: 16, left: 80 },
    },
  },
  {
    name: 'light-appearance',
    about: 'The editor in its light appearance, the View menu open at Light Appearance',
    theme: 'light',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { press: 'Control+0' },
      { click: '[data-testid="menu-view"]' },
      { hover: 'role=menuitemcheckbox[name=/Light Appearance/]' },
    ],
    keepPointer: true,
  },
  {
    name: 'help-panel',
    about: 'The user guide open beside the canvas, at Getting started',
    steps: [
      { open: 'tutorial-draw-and-animate' },
      { press: 'Control+0' },
      { press: 'F1' },
      {
        run: async (page) => {
          const frame = page.frameLocator('[data-testid="help-frame"]');
          await frame.locator('a[href="getting-started/"]').first().click();
          await frame.locator('h1').waitFor();
          await page.waitForTimeout(600);
        },
      },
    ],
  },
];
