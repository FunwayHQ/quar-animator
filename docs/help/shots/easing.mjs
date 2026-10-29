/**
 * Pictures for easing.md (Easing and the graph editor).
 */

import { PARTS } from './_kit.mjs';

/** Right-click (or click) the middle of an element, wherever others lie over it. */
async function pointAt(page, selector, options = {}) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`nothing visible matches ${selector}`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, options);
}

/** The id of the first layer whose keyframes have this easing (from the editor's store). */
function layerWithEasing(page, easing) {
  return page.evaluate(async (wanted) => {
    const { useEditorStore } = await import('/src/stores/editorStore.ts');
    const track = useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.keyframes.some((kf) => kf.easing === wanted));
    return track?.nodeId;
  }, easing);
}

/** Tutorial 7's graph page: every keyframe of the rocket given Ease In Out in the Easing Editor. */
const rocketWithCustomEasing = [
  { open: 'tutorial-timing' },
  { page: '2 · Graph editor' },
  { wait: 600 },
  { press: 'Control+0' },
  { layer: 'Rocket' },
  { rightClick: '[data-testid^="timeline-layer-"]:has-text("Rocket")' },
  { click: 'role=menuitem[name="Select Keyframes"]' },
  {
    run: async (page) => {
      const id = await layerWithEasing(page, 'easeOutBack');
      await pointAt(
        page,
        // Its last diamond (one stands for all of a frame's keyframes)
        `[data-testid="timeline-track-${id}"] [data-testid^="keyframe-kf"] >> nth=-1`,
        {
          button: 'right',
        }
      );
    },
  },
  { click: 'role=menuitem[name=/Custom Easing/]' },
  { wait: 300 },
  { click: '[data-testid="easing-preset-ease-in-out"]' },
  { wait: 300 },
];

export default [
  {
    name: 'easing-menu',
    about: 'A keyframe’s right-click menu, Ease Out Bounce ticked',
    storage: { 'quar-animator-timeline-height': '300' },
    steps: [
      { open: 'tutorial-timing' },
      { wait: 400 },
      { press: 'Control+0' },
      {
        run: async (page) => {
          const id = await layerWithEasing(page, 'easeOutBounce');
          await pointAt(
            page,
            `[data-testid="timeline-track-${id}"] [data-testid^="keyframe-kf"] >> nth=1`,
            {
              button: 'right',
            }
          );
          await page.waitForTimeout(200);
        },
      },
    ],
    keepPointer: true,
    capture: {
      selectors: ['role=menu'],
      padding: { top: 70, right: 160, bottom: 30, left: 160 },
    },
  },
  {
    name: 'easing-editor',
    about: 'The Easing Editor with Ease In Out chosen',
    storage: { 'quar-animator-timeline-height': '300' },
    steps: rocketWithCustomEasing,
    capture: { selector: '[data-testid="easing-editor"]', padding: 8 },
  },
  {
    name: 'easing-graph-editor',
    about: 'The graph editor: the rocket’s curves, a keyframe selected with its handles',
    storage: { 'quar-animator-timeline-height': '300' },
    steps: [
      ...rocketWithCustomEasing,
      { press: 'Escape' },
      { press: 'g' },
      { wait: 500 },
      {
        run: async (page) => {
          // An empty spot first (no keyframe selected), then Y's keyframe at frame 70
          const area = await page.locator('[data-testid="graph-editor-area"]').boundingBox();
          await page.mouse.click(area.x + area.width * 0.3, area.y + area.height - 12);
          await pointAt(
            page,
            '[data-testid="graph-editor-area"] circle[class*="_keyframeDot_"] >> nth=1'
          );
          await page.waitForTimeout(300);
        },
      },
    ],
    markers: [
      { target: '[data-testid="graph-property-list"]', label: 1, at: 'top-right', dy: -4 },
      {
        target: '[data-testid="graph-editor-curves"] path:nth-of-type(2)',
        label: 2,
        at: 'left',
        dx: 70,
        dy: -30,
      },
      {
        target: '[data-testid="graph-editor-area"] circle[class*="_keyframeDotSelected_"]',
        label: 3,
        at: 'top',
        dy: -40,
      },
    ],
    capture: { selector: PARTS.timeline },
  },
];
