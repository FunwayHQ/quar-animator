/**
 * Pictures for "Slides and presenting" (presenting.md).
 */

import { threeSlides } from './exporting.mjs';

/** The page of three slides with its second artboard selected, pushing in from the right. */
const secondSlidePushing = [
  ...threeSlides,
  // Layers: Artboard, Ellipse, Artboard, Rectangle, Artboard, Polygon
  { click: '[data-testid^="layer-row-"] >> nth=2' },
  { wait: 300 },
  {
    run: async (page) => {
      await page.locator('[data-testid="slide-transition"]').selectOption('push');
      await page
        .locator('[data-testid="slide-section"]')
        .evaluate((element) => element.scrollIntoView({ block: 'center' }));
      // The preview plays once; at rest it shows the incoming slide
      await page.waitForTimeout(1500);
    },
  },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'presenting-slides',
    about:
      'A page of three artboards: the Layers panel’s order, the Slide section and the Play button numbered',
    steps: secondSlidePushing,
    markers: [
      { target: '[data-testid^="layer-row-"]', label: 1, at: 'right', dx: 6 },
      { target: '[data-testid="slide-section"]', label: 2, at: 'top-left', dx: -40, dy: -4 },
      { target: '[data-testid="present-button"]', label: 3, at: 'right', dx: 34 },
    ],
  },
  {
    name: 'presenting-transition',
    about: 'The Slide section of an artboard: a push in from the right, half a second long',
    steps: secondSlidePushing,
    capture: {
      selector: '[data-testid="slide-section"]',
      padding: { top: 6, right: 12, bottom: 6, left: 12 },
    },
  },
  {
    name: 'presenting-player',
    about: 'The presentation player showing the first slide, the keys at the bottom',
    steps: [
      ...threeSlides,
      { click: '[data-testid="present-button"]' },
      { waitFor: '[data-testid="presentation"]' },
      { wait: 1200 },
      {
        // The keys and the slide's number fade after a few seconds: shown as they first are
        run: async (page) => {
          await page.addStyleTag({
            content:
              '[data-testid="presentation"] [class*="_hint_"], [data-testid="presentation"] [class*="_count_"] { animation: none !important; opacity: 1 !important; }',
          });
          await page.waitForTimeout(200);
        },
      },
    ],
  },
];
