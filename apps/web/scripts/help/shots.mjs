/**
 * Takes the user guide's screenshots, so every picture can be taken again
 * when the editor changes: `pnpm help:shots` takes them all, `pnpm
 * help:shots editor-layout projects-*` the ones named. Each shot in
 * docs/help/shots.mjs (and docs/help-cloud/shots.mjs, where there is one)
 * is taken in a fresh browser — its own storage, so the tutorials are
 * seeded as on a first visit — at twice its size, into that folder's img/.
 *
 *   --url http://localhost:3000   use a dev server that's running (by default
 *                                 one is started for this checkout)
 *   --list                        list the shots and stop
 *   --headed                      show the browser while it works
 *
 * Playwright's browser is installed once: pnpm --filter @quar/web exec
 * playwright install chromium
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { REPO_ROOT, SOURCE_DIRS, WEB_ROOT } from './paths.mjs';
import {
  DEFAULTS,
  captureClip,
  drawMarkers,
  numbersInEnglish,
  loadShotLists,
  parseArgs,
  selectShots,
} from './shot-kit.mjs';

const relative = (file) => path.relative(REPO_ROOT, file);

/** The editor's first-visit notes, already read: they'd cover the pictures. */
const FIRST_VISIT_SEEN = {
  'quar-consent-accepted': 'true',
  'quar-beta-notice-seen': '1',
};

// ============================================================================
// Getting somewhere in the app
// ============================================================================

/** Every card's thumbnail drawn (they're made one by one after the page lists them). */
async function waitForThumbnails(page) {
  await page
    .waitForFunction(
      () => {
        const cards = document.querySelectorAll('[data-testid^="project-card-"]');
        const pictures = document.querySelectorAll('[data-testid^="thumbnail-"]');
        return cards.length > 0 && pictures.length >= cards.length;
      },
      null,
      { timeout: 20000 }
    )
    .catch(() => console.warn('  (some project thumbnails were still missing)'));
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('img')].map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => img.addEventListener('load', resolve, { once: true }))
      )
    )
  );
}

async function openProjects(page, kit) {
  await page.goto(kit.url('/'));
  // Listed once the tutorials are seeded
  await page
    .locator('[data-testid="projects-grid"], [data-testid="empty-state"]')
    .first()
    .waitFor();
}

async function editorReady(page) {
  await page.locator('[data-testid="canvas-drop-zone"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  // A few frames for the canvas to draw the scene
  await page.waitForTimeout(900);
}

/**
 * `open: 'projects'` (the Projects page), `'new'` (a new project in the
 * editor) or a project's id (a tutorial's, or one seeded): in the editor.
 */
async function open(page, target, kit) {
  await openProjects(page, kit);
  if (target === 'projects') {
    await waitForThumbnails(page);
    return;
  }
  // Into the editor the way a person goes, without loading the app again
  const card = target === 'new' ? 'new-project-card' : `project-card-${target}`;
  await page.locator(`[data-testid="${card}"]`).click();
  await editorReady(page);
  if (target !== 'new') await page.locator('[data-testid^="layer-row-"]').first().waitFor();
}

/** `seed: { id, name, file }`: a .quar file (beside the shot list) put among the projects. */
async function seed(page, { id, name, file }, kit) {
  const bytes = [...fs.readFileSync(path.resolve(kit.shot.outDir, '..', file))];
  if (!page.url().startsWith(kit.baseUrl)) await page.goto(kit.url('/'));
  await page.evaluate(
    async ({ id, name, bytes }) => {
      const storage = await import('/src/services/projectStorage.ts');
      await storage.saveProject(id, name, new Uint8Array(bytes).buffer);
    },
    { id, name: name ?? id, bytes }
  );
}

/** `drag: { from: [x, y], to: [x, y], within?, shift?, alt? }`, in the element's own pixels. */
async function drag(
  page,
  { from, to, within = '[data-testid="canvas-drop-zone"]', shift, alt, steps = 12 }
) {
  const box = await page.locator(within).first().boundingBox();
  if (!box) throw new Error(`drag: nothing matches ${within}`);
  const at = ([x, y]) => [box.x + x, box.y + y];
  if (shift) await page.keyboard.down('Shift');
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps });
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  if (shift) await page.keyboard.up('Shift');
}

async function runStep(page, step, kit) {
  const [action] = Object.keys(step).filter((key) => key !== 'note');
  const value = step[action];
  const first = (selector) => page.locator(selector).first();
  switch (action) {
    case 'goto':
      return page.goto(kit.url(value));
    case 'open':
      return open(page, value, kit);
    case 'seed':
      return seed(page, value, kit);
    case 'click':
      return first(value).click();
    case 'dblclick':
      return first(value).dblclick();
    case 'rightClick':
      return first(value).click({ button: 'right' });
    case 'hover':
      return first(value).hover();
    case 'press':
      return page.keyboard.press(value);
    case 'type':
      return page.keyboard.type(value);
    case 'fill':
      return first(value[0]).fill(value[1]);
    case 'waitFor':
      return first(value).waitFor();
    case 'wait':
      return page.waitForTimeout(value);
    case 'page':
      return page.locator('[data-testid^="page-tab-"]', { hasText: value }).first().click();
    case 'layer':
      return page.locator('[data-testid^="layer-row-"]', { hasText: value }).first().click();
    case 'drag':
      return drag(page, value);
    case 'evaluate':
      return page.evaluate(value);
    case 'run':
      return value(page, kit);
    default:
      throw new Error(`unknown step ${action}`);
  }
}

// ============================================================================
// Taking a shot
// ============================================================================

async function takeShot(browser, shot, baseUrl) {
  const viewport = { ...DEFAULTS.viewport, ...shot.viewport };
  const theme = shot.theme ?? DEFAULTS.theme;
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: shot.scale ?? DEFAULTS.scale,
    colorScheme: theme,
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  try {
    const storage = { ...FIRST_VISIT_SEEN, 'quar-animator-ui-theme': theme, ...shot.storage };
    await context.addInitScript((entries) => {
      for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
    }, storage);
    // The editor's grain (a noise texture at 1.5%) can't be seen at the size the
    // guide shows its pictures, but it makes every pixel different: without it
    // a screenshot is a fraction of the size
    await context.addInitScript(() => {
      if (window.top !== window) return;
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = 'body::before { display: none !important; }';
        document.head.appendChild(style);
      });
    });
    const page = await context.newPage();
    // Dates on the page (a project's "last saved") stay the same from one take to the next
    if (shot.date) await page.clock.setFixedTime(new Date(shot.date));
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));

    const kit = {
      baseUrl,
      shot,
      url: (to) => new URL(to, baseUrl).href,
      editorReady: () => editorReady(page),
      drag: (options) => drag(page, options),
    };
    for (const step of shot.steps) await runStep(page, step, kit);

    if (!shot.keepPointer) await page.mouse.move(viewport.width - 2, viewport.height - 2);
    await page.waitForTimeout(shot.settle ?? DEFAULTS.settle);
    // 0.42, not this computer's 0,42
    await page.evaluate(numbersInEnglish);
    if (shot.markers?.length) {
      const missing = await page.evaluate(drawMarkers, shot.markers);
      if (missing.length) throw new Error(`markers point at nothing: ${missing.join(', ')}`);
    }

    let clip;
    const capture = shot.capture ?? 'viewport';
    if (capture !== 'viewport') {
      if (capture.clip) {
        clip = capture.clip;
      } else {
        const selectors = capture.selectors ?? [capture.selector];
        const boxes = [];
        for (const selector of selectors) {
          const box = await page.locator(selector).first().boundingBox();
          if (!box) throw new Error(`capture: nothing visible matches ${selector}`);
          boxes.push(box);
        }
        clip = captureClip(boxes, capture.padding ?? 0, viewport);
      }
    }

    fs.mkdirSync(shot.outDir, { recursive: true });
    const file = path.join(shot.outDir, `${shot.name}.png`);
    await page.screenshot({ path: file, clip, animations: 'disabled', caret: 'hide' });
    if (errors.length)
      console.warn(`  page errors while taking ${shot.name}:\n    ${errors.join('\n    ')}`);
    return file;
  } catch (error) {
    // What the browser showed when it went wrong, to see why
    const pages = context.pages();
    const debug = path.join(os.tmpdir(), `quar-help-shot-${shot.name}.png`);
    await pages[0]?.screenshot({ path: debug }).catch(() => undefined);
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), { debug });
  } finally {
    await context.close();
  }
}

/** A dev server for this checkout (on a port of its own), warmed up. */
async function startServer() {
  const server = await createServer({
    root: WEB_ROOT,
    configFile: path.join(WEB_ROOT, 'vite.config.ts'),
    logLevel: 'warn',
    server: { port: 3190, strictPort: false, open: false, host: '127.0.0.1' },
  });
  await server.listen();
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('The dev server has no address');
  return { server, url };
}

/** Load the editor once, so Vite has prepared its modules before the first shot. */
async function warmUp(browser, url) {
  const page = await browser.newPage();
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) window.localStorage.setItem(key, value);
  }, FIRST_VISIT_SEEN);
  await page.goto(new URL('/editor', url).href, { waitUntil: 'networkidle', timeout: 120000 });
  await page.locator('[data-testid="canvas-drop-zone"]').waitFor({ timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.close();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('pnpm help:shots [name…] [--url <dev server>] [--list] [--headed]');
    return 0;
  }
  const { shots, problems } = await loadShotLists(SOURCE_DIRS);
  if (problems.length) {
    problems.forEach((problem) => console.error(problem));
    return 1;
  }
  const { selected, unknown } = selectShots(shots, options.names);
  if (unknown.length) {
    console.error(
      `No shot is called ${unknown.join(', ')}. The shots: ${shots.map((s) => s.name).join(', ')}`
    );
    return 1;
  }
  if (options.list) {
    for (const shot of shots) console.log(`${shot.name.padEnd(28)} ${shot.about ?? ''}`);
    return 0;
  }
  if (selected.length === 0) {
    console.log('No shots to take.');
    return 0;
  }

  let browser;
  try {
    browser = await chromium.launch({
      headless: !options.headed,
      // The canvas is WebGL, drawn at twice the size: on a Mac, the full
      // Chromium (not the headless shell) on the GPU; elsewhere, in software
      ...(process.platform === 'darwin'
        ? { channel: 'chromium', args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }
        : {
            args: [
              '--use-angle=swiftshader',
              '--enable-unsafe-swiftshader',
              '--ignore-gpu-blocklist',
            ],
          }),
    });
  } catch (error) {
    console.error(String(error));
    console.error(
      '\nInstall the browser once: pnpm --filter @quar/web exec playwright install chromium'
    );
    return 1;
  }

  const started = options.url ? null : await startServer();
  const baseUrl = options.url ?? started.url;
  let failed = 0;
  try {
    console.log(
      `Taking ${selected.length} shot${selected.length === 1 ? '' : 's'} from ${baseUrl}`
    );
    await warmUp(browser, baseUrl);
    for (const shot of selected) {
      const began = Date.now();
      try {
        const file = await takeShot(browser, shot, baseUrl);
        console.log(
          `✓ ${shot.name} → ${relative(file)} (${((Date.now() - began) / 1000).toFixed(1)}s)`
        );
      } catch (error) {
        failed++;
        console.error(`✗ ${shot.name}: ${error instanceof Error ? error.message : error}`);
        if (error?.debug) console.error(`  what the browser showed: ${error.debug}`);
      }
    }
  } finally {
    await browser.close();
    await started?.server.close();
  }
  return failed ? 1 : 0;
}

process.exitCode = await main();
