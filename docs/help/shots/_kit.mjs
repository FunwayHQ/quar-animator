/**
 * Helpers the shot lists share (this file is no list: its name starts with _).
 * A chapter's own shots go in shots/<chapter>.mjs, which imports from here.
 */

/** The editor's parts, as the layout picture numbers them. */
export const PARTS = {
  tools: '[data-testid="menubar-toolbar"]',
  pages: '[data-testid="page-tabs"]',
  layers: '[class*="_leftPanel_"]',
  canvas: '[class*="_canvasArea_"]',
  properties: '[class*="_rightPanel_"]',
  timeline: '[class*="_timeline_"]',
};

/** A new project with a rectangle drawn in it (the Rectangle tool is R). */
export const newProjectWithShape = [
  { open: 'new' },
  { press: 'r' },
  { drag: { from: [300, 170], to: [520, 330] } },
  { wait: 300 },
];
