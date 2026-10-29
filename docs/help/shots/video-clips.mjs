/**
 * Pictures for "Video and GIF clips" (video-clips.md). The files imported
 * are beside this list, in media/: a 4-second MP4 of a sunrise with a
 * plucked tune, and a GIF of a bouncing ball on nothing. media/make-media.py
 * makes them again.
 */

import fs from 'node:fs';

import { PARTS } from './_kit.mjs';

/** A file of media/, as the browser's file chooser is given it. */
const media = (name, mimeType) => ({
  name,
  mimeType,
  buffer: fs.readFileSync(new URL(`./media/${name}`, import.meta.url)),
});

const SUNRISE = media('sunrise.mp4', 'video/mp4');
const BALL = media('bouncing-ball.gif', 'image/gif');

const BAR = '[data-testid^="video-clip-video_"]';
/** The first video layer's bar (the layers are listed topmost first). */
const barOf = (name) => `${BAR}[aria-label^="Video ${name},"]`;

/** File › Import Video… with a file, waiting for its clip on the timeline. */
const importVideo = (file) => ({
  run: async (page) => {
    const before = await page.locator(BAR).count();
    await page.click('[data-testid="menu-file"]');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: /Import Video/ }).click();
    await (await chooser).setFiles(file);
    await page.locator(BAR).nth(before).waitFor({ timeout: 30000 });
    // Its strip of stills drawn, and its first picture decoded on the canvas
    await page.waitForTimeout(1500);
  },
});

/** The messages saying what came in, closed (they'd cover the timeline). */
const closeMessages = {
  run: async (page) => {
    for (const close of await page.locator('[data-testid^="toast-close-"]').all()) {
      await close.click().catch(() => undefined);
    }
    await page.waitForTimeout(400);
  },
};

/** The playhead put on a frame (the timeline in view), and the canvas given time to decode it. */
const playheadAt = (frame) => ({
  run: async (page) => {
    await page.evaluate(async (frame) => {
      const { useEditorStore } = await import('/src/stores/editorStore.ts');
      useEditorStore.getState().setCurrentFrame(frame);
    }, frame);
    await page.waitForTimeout(1200);
  },
});

/** Drag one end of a clip's bar (`edge`: start or end) by `dx` pixels. */
const dragEdge = (bar, edge, dx) => ({
  run: async (page) => {
    const box = await page.locator(`${bar} [data-edge="${edge}"]`).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  },
});

/** The Properties panel's animation presets folded away, so the sections below show. */
const foldPresets = { click: '[data-testid="animation-presets-toggle"]' };

/** A new project with a 16:9 artboard, the sunrise imported into it at frame 0. */
const sunriseOnArtboard = [
  { open: 'new' },
  { press: 'f' },
  { drag: { from: [80, 70], to: [720, 430] } },
  { wait: 200 },
  importVideo(SUNRISE),
  closeMessages,
  foldPresets,
];

/**
 * The sunrise at 2×, looped and lengthened to about frame 150; the ball
 * GIF from frame 170, stopped on frame 220 and holding its picture there
 * (its row above the sunrise's, empty where the numbers go).
 */
const twoClips = [
  ...sunriseOnArtboard,
  { dblclick: barOf('sunrise') },
  { click: '[data-testid="video-clip-speed-2"]' },
  { click: '[data-testid="video-clip-loop"]' },
  { press: 'Escape' },
  dragEdge(barOf('sunrise'), 'end', 340),
  playheadAt(170),
  importVideo(BALL),
  closeMessages,
  playheadAt(220),
  { dblclick: barOf('bouncing-ball') },
  { click: '[data-testid="video-clip-stop"]' },
  { press: 'Escape' },
  { wait: 300 },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'video-clips-editor',
    about:
      'A video on an artboard: its layer, its clip on the timeline, its sound and its Video section',
    steps: [...sunriseOnArtboard, playheadAt(72)],
    markers: [
      { target: '[data-testid^="layer-row-video_"]', label: 1, at: 'right', dx: -10 },
      { target: '[data-testid="canvas-drop-zone"]', label: 2, at: 'center', dx: -250, dy: -40 },
      // Just past the ends of the clip and its sound, and beside the section's title
      { target: BAR, label: 3, at: 'right', dx: 42 },
      { target: '[data-testid^="sound-clip-sound"]', label: 4, at: 'right', dx: 42 },
      { target: '[data-testid="video-section"]', label: 5, at: 'top-left', dx: 46, dy: -6 },
    ],
  },
  {
    name: 'video-clips-timeline',
    about:
      'Two clips on the timeline: a video looped at 2× with its sound, and a GIF stopped and holding',
    storage: { 'quar-animator-timeline-height': '230' },
    steps: twoClips,
    // Above the sunrise's bar, in the empty part of the ball's row; 5 below the Sound lane
    markers: [
      { target: barOf('sunrise'), label: 1, at: 'top', dx: 90, dy: -40 },
      { target: `${barOf('sunrise')} [class*="_speed_"]`, label: 2, at: 'top', dy: -40 },
      {
        target: `${barOf('sunrise')} [data-testid="video-clip-loop-mark"]`,
        label: 3,
        at: 'top',
        dy: -40,
      },
      { target: '[data-testid^="video-clip-hold-"]', label: 4, at: 'center' },
      { target: '[data-testid^="sound-clip-linked-"]', label: 5, at: 'bottom', dy: 46 },
    ],
    capture: { selector: PARTS.timeline },
  },
  {
    name: 'video-clips-settings',
    about: 'A video clip’s settings card, opened by double-clicking its bar',
    storage: { 'quar-animator-timeline-height': '210' },
    steps: [
      ...sunriseOnArtboard,
      playheadAt(40),
      { dblclick: barOf('sunrise') },
      { click: '[data-testid="video-clip-speed-2"]' },
      { evaluate: () => document.activeElement?.blur() },
      { wait: 300 },
    ],
    capture: { selector: '[data-testid="video-clip-settings"]', padding: 8 },
  },
  {
    name: 'video-clips-properties',
    about: 'The Video section of a transparent GIF’s layer in the Properties panel',
    viewport: { width: 1280, height: 1000 },
    steps: [
      { open: 'new' },
      importVideo(BALL),
      closeMessages,
      foldPresets,
      {
        run: async (page) => {
          await page
            .locator('[data-testid="video-section"]')
            .evaluate((element) => element.scrollIntoView({ block: 'center' }));
          await page.waitForTimeout(300);
        },
      },
    ],
    capture: {
      selector: '[data-testid="video-section"]',
      padding: { top: 4, right: 8, bottom: 8, left: 8 },
    },
  },
  {
    name: 'video-clips-delete-sound',
    about: 'Deleting a video whose sound is on the Sound lane: Keep Sound or Delete Sound',
    steps: [
      ...sunriseOnArtboard,
      { layer: 'sunrise' },
      { press: 'Delete' },
      { waitFor: '[data-testid="prompt-dialog"]' },
      { wait: 300 },
    ],
    capture: { selector: '[data-testid="prompt-dialog"]', padding: 12 },
  },
];
