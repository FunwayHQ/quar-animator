/**
 * Pictures for sound.md (Sound). The sounds are made here, as WAV files of
 * a few plucked notes, so the waveforms have a shape and nothing is kept
 * beside the list.
 */

import { PARTS } from './_kit.mjs';

/** A mono 16-bit WAV of plucked notes, one after another. */
function pluckedWav(notes, seconds) {
  const rate = 16000;
  const count = Math.round(seconds * rate);
  const data = Buffer.alloc(count * 2);
  const perNote = count / notes.length;
  for (let i = 0; i < count; i++) {
    const note = Math.floor(i / perNote);
    const t = (i - note * perNote) / rate;
    const envelope = Math.exp(-t * 3.2) * Math.min(1, t * 200);
    const value = Math.sin(2 * Math.PI * notes[note] * t) * envelope * 0.8;
    data.writeInt16LE(Math.round(value * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** Import a sound with the Sound lane's + button, at the playhead. */
function importSound(name, notes, seconds) {
  return {
    run: async (page) => {
      const before = await page.locator('[data-testid^="sound-clip-sound"]').count();
      const chooser = page.waitForEvent('filechooser');
      await page.locator('[data-testid="sound-lane-import"]').click();
      await (
        await chooser
      ).setFiles({ name, mimeType: 'audio/wav', buffer: pluckedWav(notes, seconds) });
      await page.locator('[data-testid^="sound-clip-sound"]').nth(before).waitFor();
      // Its waveform drawn
      await page.waitForTimeout(800);
    },
  };
}

/** The messages saying what was added, closed (they'd cover the timeline). */
const closeMessages = {
  run: async (page) => {
    for (const close of await page.locator('[data-testid^="toast-close-"]').all()) {
      await close.click().catch(() => undefined);
    }
    await page.waitForTimeout(400);
  },
};

/** A new project with one shape, and two sounds: one at frame 0, one overlapping it at 60. */
const twoSounds = [
  { open: 'new' },
  { press: 'r' },
  { drag: { from: [300, 170], to: [420, 260] } },
  { wait: 200 },
  importSound('Plucks.wav', [262, 330, 392, 523], 4),
  { press: 'Shift+.' },
  { press: 'Shift+.' },
  { press: 'Shift+.' },
  { press: 'Shift+.' },
  { press: 'Shift+.' },
  { press: 'Shift+.' },
  importSound('Chimes.wav', [784, 659, 523], 3),
  { press: 'Home' },
  closeMessages,
];

export default [
  {
    name: 'sound-lane',
    about: 'The Sound lane with two overlapping clips, one fading in',
    storage: { 'quar-animator-timeline-height': '220' },
    steps: [
      ...twoSounds,
      // The second clip fades in: its top-left corner dragged to the right
      {
        run: async (page) => {
          const handle = page.locator('[data-testid^="sound-clip-fade-in-"]').nth(1);
          const box = await handle.boundingBox();
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          await page.mouse.move(x + 110, y, { steps: 10 });
          await page.mouse.up();
          await page.waitForTimeout(300);
        },
      },
    ],
    markers: [
      // 1 and 2 below their buttons, in the label's second row; 4 below the fade
      { target: '[data-testid="sound-lane-scrub"]', label: 1, at: 'bottom', dx: -10, dy: 32 },
      { target: '[data-testid="sound-lane-import"]', label: 2, at: 'bottom', dx: 10, dy: 32 },
      { target: '[data-testid^="sound-clip-sound"]', label: 3, at: 'right', dx: -6 },
      { target: '[data-testid^="sound-clip-fades-"]', label: 4, at: 'bottom-left', dx: 47, dy: 40 },
    ],
    capture: { selector: PARTS.timeline },
  },
  {
    name: 'sound-settings',
    about: 'A sound clip’s settings, opened by double-clicking it',
    storage: { 'quar-animator-timeline-height': '220' },
    steps: [...twoSounds, { dblclick: '[data-testid^="sound-clip-sound"]' }, { wait: 300 }],
    capture: { selector: '[data-testid="sound-clip-settings"]', padding: 8 },
  },
];
