/**
 * Records the parts of the "Redesign your site in Quar Animator" video:
 *
 *   node record.mjs [out-dir] [cards|stills|site|editor|frames|probe ...]
 *
 * cards   the intro and end cards, animated, both cuts (Chrome's screencast)
 * stills  the captions, the backdrop and the window chrome, as PNGs
 * site    funwayinteractive.com scrolled through at 1440 px
 * editor  the rebuilt page in the editor: the whole page as one artboard, its
 *         Animation Sequence, the headline's real font, then playback
 * frames  the animation as the editor exports it (PNG Sequence, every frame)
 * probe   the editor beats as stills, to check the framing
 *
 * Needs the editor built and served (`pnpm --filter @quar/web build`, then
 * `vite preview --port 3100` in apps/web) and <out-dir>/Funway.quar from
 * build-page.sh. Playwright comes from PLAYWRIGHT_CORE (default: the npx cache).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, '../out/website-redesign'));
const MODES = process.argv.slice(3);
const want = (mode) => MODES.length === 0 ? mode !== 'probe' : MODES.includes(mode);
const EDITOR = process.env.EDITOR_URL ?? 'http://localhost:3100/';
const SITE = 'https://funwayinteractive.com/';
const PROJECT = path.join(OUT, 'Funway.quar');
const FONTS = pathToFileURL(path.join(REPO, 'apps/web/node_modules/@fontsource')).href;
const LOGO = pathToFileURL(path.join(REPO, 'apps/web/src/assets/logo.svg')).href;
const require = createRequire(
  process.env.PLAYWRIGHT_CORE ?? '/Users/dimitrymd/.npm/_npx/e41f203b7505f1fb/node_modules/'
);
const { chromium } = require('playwright-core');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Where everything sits in the two cuts (assemble.py reads this too). */
export const LAYOUT = {
  wide: { size: [1920, 1080], window: { x: 160, y: 152, w: 1600, h: 900 } },
  tall: {
    size: [1080, 1920],
    page: { x: 40, y: 500, w: 1000, h: 1340 },
    site: { x: 40, y: 760, w: 1000, h: 625 },
    editor: { x: 40, y: 500, w: 1000, h: 563 },
    detail: { x: 40, y: 1150, w: 1000, h: 690 },
  },
};
const BAR = 44;
const ADDRESSES = { site: 'funwayinteractive.com', quar: 'animator.quar.pro', export: 'funway-home.mp4' };
const CAPTIONS = {
  site: ['Your website.', 'funwayinteractive.com, as it is today'],
  overview: ['Rebuilt as <span class="grad">one artboard.</span>', '200 layers · real fonts · every one editable'],
  sequence: ['Animated in <span class="grad">26 steps.</span>', 'the Animation Sequence: after, with, delays'],
  select: ['Real text, <span class="grad">real fonts.</span>', 'Outfit ExtraBold 72 · DM Sans · Google Fonts'],
  play: ['Press <span class="grad">play.</span>', 'reveals top to bottom, then the site’s own motion'],
  after: ['The same page, <span class="grad">alive.</span>', 'exported straight from the editor'],
};

// ============================================================================
// Recording
// ============================================================================

/** Chrome's screencast of a page into dir: JPEG frames, then a concat list timed as drawn. */
async function screencast(page, dir, maxWidth, maxHeight) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth, maxHeight });
  return {
    async stop(t0, t1) {
      await cdp.send('Page.stopScreencast');
      await sleep(250);
      if (frames.length === 0) throw new Error(`no frames for ${dir}`);
      // Frames can arrive a little out of order: in the order they were drawn
      frames.sort((a, b) => a.t - b.t);
      const times = frames.map((f) => Math.min(t1, Math.max(t0, f.t)));
      times[0] = t0;
      const lines = [];
      frames.forEach((frame, i) => {
        const until = i + 1 < frames.length ? times[i + 1] : t1;
        lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, until - times[i]).toFixed(4)}`);
      });
      lines.push(`file '${frames[frames.length - 1].file}'`);
      fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n') + '\n');
      console.log(path.basename(dir), frames.length, 'frames', (t1 - t0).toFixed(1), 's');
    },
  };
}
const now = () => Date.now() / 1000;

function cardsPage() {
  const html = fs.readFileSync(path.join(HERE, 'cards.html'), 'utf8')
    .replaceAll('FONTS', FONTS).replaceAll('LOGO_URL', LOGO);
  const file = path.join(OUT, 'cards.filled.html');
  fs.writeFileSync(file, html);
  return pathToFileURL(file).href;
}

async function recordCards(browser) {
  for (const format of ['wide', 'tall']) {
    const [width, height] = LAYOUT[format].size;
    for (const card of ['intro', 'outro']) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(cardsPage());
      await page.evaluate(([f, c]) => Object.assign(document.body.dataset, { format: f, card: c }), [format, card]);
      await page.evaluate(() => document.fonts.ready);
      await sleep(300);
      const cast = await screencast(page, path.join(OUT, 'cards', `${format}-${card}`), width, height);
      const t0 = now();
      await page.evaluate(() => document.body.classList.add('go'));
      await sleep(card === 'intro' ? 3600 : 4400);
      await cast.stop(t0, now());
      await page.close();
    }
  }
}

async function renderStills(browser) {
  const dir = path.join(OUT, 'stills');
  fs.mkdirSync(dir, { recursive: true });
  for (const format of ['wide', 'tall']) {
    const [width, height] = LAYOUT[format].size;
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(cardsPage());
    await page.evaluate((f) => { document.body.dataset.format = f; document.body.dataset.card = 'none'; }, format);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(dir, `${format}-bg.png`) });
    // Captions and window chrome go over the shots: transparent around them
    await page.evaluate(() => document.body.classList.add('overlay'));
    for (const [key, [title, sub]] of Object.entries(CAPTIONS)) {
      await page.evaluate(([t, s]) => {
        document.body.dataset.card = 'cap';
        document.getElementById('title').innerHTML = t;
        document.getElementById('sub').textContent = s;
      }, [title, sub]);
      await page.screenshot({ path: path.join(dir, `${format}-cap-${key}.png`), omitBackground: true });
    }
    const windows = format === 'wide'
      ? { window: LAYOUT.wide.window }
      : { page: LAYOUT.tall.page, site: LAYOUT.tall.site, editor: LAYOUT.tall.editor, detail: LAYOUT.tall.detail };
    for (const [kind, box] of Object.entries(windows)) {
      for (const [name, address] of Object.entries(ADDRESSES)) {
        const bar = kind !== 'detail';
        await page.evaluate(([b, a, withBar, barHeight]) => {
          document.body.dataset.card = 'frame';
          const frame = document.querySelector('.frame');
          Object.assign(frame.style, {
            left: `${b.x}px`, top: `${b.y - (withBar ? barHeight : 0)}px`,
            width: `${b.w}px`, height: `${b.h + (withBar ? barHeight : 0)}px`,
          });
          frame.querySelector('.bar').style.display = withBar ? 'flex' : 'none';
          document.getElementById('address').textContent = a;
        }, [box, address, bar, BAR]);
        await page.screenshot({ path: path.join(dir, `${format}-frame-${kind}-${name}.png`), omitBackground: true });
      }
    }
    await page.close();
  }
  fs.writeFileSync(path.join(OUT, 'layout.json'), JSON.stringify({ ...LAYOUT, bar: BAR }, null, 1));
  console.log('stills ->', dir);
}

/** The live site, scrolled down through its sections and its own reveals. */
async function recordSite(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('cookie_consent', 'declined'));
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await sleep(2500);
  const cast = await screencast(page, path.join(OUT, 'site'), 1440, 900);
  const t0 = now();
  await sleep(700);
  await page.evaluate(() => new Promise((done) => {
    const to = 2150;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / 5200);
      window.scrollTo(0, to * (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2));
      if (p < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }));
  await sleep(600);
  await cast.stop(t0, now());
  await page.close();
}

// ============================================================================
// The editor
// ============================================================================

async function openProject(browser, viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.addInitScript(() => {
    localStorage.setItem('quar-consent-accepted', 'true');
    localStorage.setItem('quar-google-fonts-consent', 'true');
  });
  const page = await context.newPage();
  await page.goto(EDITOR, { waitUntil: 'networkidle' });
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('import-button').click();
  await (await chooser).setFiles(PROJECT);
  await page.waitForSelector('canvas', { timeout: 30000 });
  await sleep(6000); // the page's Google fonts
  return { context, page };
}

/** The canvas's box, and its own zoom label's value (the timeline has a 100% too). */
async function canvasState(page) {
  return page.evaluate(() => {
    const canvas = [...document.querySelectorAll('canvas')].sort((a, b) =>
      b.getBoundingClientRect().width * b.getBoundingClientRect().height -
      a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0];
    const r = canvas.getBoundingClientRect();
    let zoom = 0;
    for (const el of document.querySelectorAll('span')) {
      const b = el.getBoundingClientRect();
      if (/^\d+%$/.test(el.textContent ?? '') && b.top > r.top && b.bottom < r.bottom + 40 && b.left > r.left && b.right < r.right) {
        zoom = Number.parseInt(el.textContent, 10);
      }
    }
    return { box: { x: r.x, y: r.y, w: r.width, h: r.height }, zoom };
  });
}

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Drag the canvas by dy screen px with the middle button, eased over `ms`. In
 * strokes that stay on the canvas: past its edge the drag stops reaching it.
 */
async function pan(page, box, dy, ms) {
  const reach = box.h * 0.6;
  const strokes = Math.max(1, Math.ceil(Math.abs(dy) / reach));
  const x = box.x + box.w / 2;
  const from = dy > 0 ? box.y + box.h * 0.2 : box.y + box.h * 0.8;
  const steps = Math.max(1, Math.round(ms / 16));
  let done = 0;
  for (let stroke = 0; stroke < strokes; stroke++) {
    await page.mouse.move(x, from);
    await page.mouse.down({ button: 'middle' });
    const start = done;
    for (let i = 1; i <= steps; i++) {
      const target = dy * ease((stroke + i / steps) / strokes);
      await page.mouse.move(x, from + target - start);
      done = target;
      await sleep(ms / strokes / steps);
    }
    await page.mouse.up({ button: 'middle' });
  }
}

/** A frame drawn: two animation frames after a change. */
const drawn = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

const ZOOM = 0.64; // the hero at about two thirds
const SECTIONS = ['Navigation', 'Footer', 'Blog', 'Ready to Start', 'funway.boutique banner', 'Services', 'Hero', 'Section backgrounds'];
const PAGE = { w: 1440, h: 3344 };

async function editorSession(page, { cast, still, probe }) {
  const marks = [];
  const mark = (name) => marks.push({ name, at: now() });
  for (let i = 0; i < 24; i++) await page.keyboard.press('Shift+Period'); // frame 240: all of it shown
  await page.keyboard.press('Control+0');
  const row = (name) => page.locator(`[aria-label="Layer: ${name}"]`).first();
  // The Layers panel at the page's sections (groups open expanded)
  for (const section of SECTIONS) {
    const collapse = row(section).getByRole('button', { name: 'Collapse group' });
    if (await collapse.count()) await collapse.click();
  }
  await sleep(1200);
  let { box } = await canvasState(page);

  const recording = cast ? await cast() : null;
  const t0 = now();
  mark('overview');
  await still('overview');
  await sleep(2800);

  mark('sequence');
  await page.keyboard.press('Shift+KeyA');
  await sleep(400);
  await still('sequence');
  await sleep(3000);
  await page.keyboard.press('Shift+KeyA');

  // Into the hero: zoom (about the canvas's middle, the page's middle), then down to its top
  mark('zoom');
  for (let i = 0; i < 8 && (await canvasState(page)).zoom < ZOOM * 100 - 4; i++) {
    await page.keyboard.press('Control+Equal');
    await sleep(260);
  }
  const { zoom } = await canvasState(page);
  const z = zoom / 100;
  const heroCenter = { x: PAGE.w / 2, y: 360 };
  await pan(page, box, (PAGE.h / 2 - heroCenter.y) * z, 1100);
  await sleep(500);

  // The headline picked in the Layers panel: its box on the canvas, its font in Properties
  mark('select');
  await row('Hero').getByRole('button', { name: 'Expand group' }).click();
  await sleep(450);
  await row('We Break It.').click();
  await sleep(400);
  // Properties opens at its animation presets: down to the text's font
  await page.evaluate(() => {
    const font = [...document.querySelectorAll('input, select, button, span, div')].find(
      (el) => (el.value ?? el.textContent ?? '').trim() === 'Outfit'
    );
    font?.scrollIntoView({ block: 'center' });
  });
  await sleep(400);
  await still('select');
  await sleep(2600);
  await row('Hero').getByRole('button', { name: 'Collapse group' }).click().catch(() => {});
  // Nothing selected for the playback: a click on the canvas beside the page
  await page.mouse.click(box.x + 40, box.y + box.h / 2);
  await sleep(500);

  mark('play');
  if (recording) await recording.stop(t0, now());
  fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ t0, marks, zoom, box }, null, 1));
  console.log('editor marks', marks.map((m) => `${m.name} ${(m.at - t0).toFixed(1)}`).join(', '), 'zoom', zoom);

  // Playback a frame at a time (live playback of this page is too heavy for a
  // smooth recording headless): from the start, following the reveal down to
  // the banner. One screenshot a frame, played back at 30 fps.
  const dir = path.join(OUT, 'editor-play');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  await page.keyboard.press('Home');
  const travel = -(1950 - heroCenter.y) * z;
  let moved = 0;
  const x = box.x + box.w / 2;
  for (let frame = 0; frame < PLAY_FRAMES; frame++) {
    if (frame > 0) await page.keyboard.press('Period');
    const target = Math.round(travel * ease(Math.min(1, Math.max(0, (frame - 24) / 150))));
    if (target !== moved) {
      const from = box.y + box.h * 0.6;
      await page.mouse.move(x, from);
      await page.mouse.down({ button: 'middle' });
      await page.mouse.move(x, from + target - moved);
      await page.mouse.up({ button: 'middle' });
      moved = target;
    }
    await drawn(page);
    if (frame === 30) await still('play');
    if (frame === PLAY_FRAMES - 1) await still('played');
    if (!probe) await page.screenshot({ path: path.join(dir, `f${String(frame).padStart(5, '0')}.jpg`), quality: 92 });
  }
  console.log('editor-play', PLAY_FRAMES, 'frames');
}
const PLAY_FRAMES = 280;

async function recordEditor(browser, probe) {
  const { context, page } = await openProject(browser, { width: 1920, height: 1080 });
  const dir = path.join(OUT, 'probe');
  if (probe) fs.mkdirSync(dir, { recursive: true });
  await editorSession(page, {
    cast: probe ? null : () => screencast(page, path.join(OUT, 'editor'), 1920, 1080),
    still: probe ? (name) => page.screenshot({ path: path.join(dir, `${name}.png`) }) : async () => {},
    probe,
  });
  await context.close();
}

const EXPORT_FRAMES = 200; // what the cut uses: the reveal and some of the loops
/** The animation as the editor exports it: the artboard, 1440 × 3344, a PNG a frame. */
async function exportFrames(browser) {
  const { context, page } = await openProject(browser, { width: 1600, height: 1000 });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByText('Export as PNG Sequence...').click();
  await sleep(800);
  await page.getByTestId('export-start-frame').fill('0');
  await page.getByTestId('export-end-frame').fill(String(EXPORT_FRAMES - 1));
  const download = page.waitForEvent('download', { timeout: 900000 });
  await page.locator('[role="dialog"]').getByRole('button', { name: /^Export/ }).last().click();
  const zip = path.join(OUT, 'page-frames.zip');
  await (await download).saveAs(zip);
  const dir = path.join(OUT, 'page-frames');
  fs.rmSync(dir, { recursive: true, force: true });
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  fs.rmSync(zip);
  console.log('frames', fs.readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.png')).length);
  await context.close();
}

const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
try {
  fs.mkdirSync(OUT, { recursive: true });
  if (want('cards')) await recordCards(browser);
  if (want('stills')) await renderStills(browser);
  if (want('site')) await recordSite(browser);
  if (want('editor')) await recordEditor(browser, false);
  if (want('probe')) await recordEditor(browser, true);
  if (want('frames')) await exportFrames(browser);
} finally {
  await browser.close();
}
