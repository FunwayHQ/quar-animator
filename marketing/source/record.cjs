/**
 * Records the marketing video's raw clips with Chrome's screencast:
 *   cards/intro, cards/outro  — the title cards (cards.html)
 *   creation                  — a scripted session in the editor
 * Each clip dir gets JPEG frames and an ffmpeg concat list with real timing.
 * Usage: node record.cjs <outDir> [intro|outro|creation ...]
 */
const { chromium } = require('/Users/dimitrymd/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || 'out');
const ONLY = process.argv.slice(3);
const APP = 'http://localhost:3000';
const SHOWCASE = '/@fs/Users/dimitrymd/Documents/prj/quar-animator/marketing/source/showcase.ts';
const LOGO = 'file:///Users/dimitrymd/Documents/prj/quar-animator/apps/web/public/logo.svg';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Screencast `run` into dir: frames + concat list (durations from frame timestamps). */
async function record(page, dir, run) {
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
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1080 });
  const start = Date.now() / 1000;
  clipStart = start;
  MARKS.length = 0;
  await run();
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  await sleep(200);
  const lines = [];
  frames.forEach((frame, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : frame.t + Math.max(0.04, end - start - (frame.t - frames[0].t));
    lines.push(`file '${frame.file}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);
  fs.writeFileSync(path.join(dir, 'list.txt'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify(MARKS, null, 1));
  console.log(path.basename(dir), frames.length, 'frames', (end - start).toFixed(1), 's');
}

// --------------------------------------------------------------------------
// Overlay: a visible cursor with click ripples, and caption pills
// --------------------------------------------------------------------------

const OVERLAY = `(() => {
  const install = () => {
    if (document.getElementById('promo-cursor')) return;
    const style = document.createElement('style');
    style.textContent = \`
      #promo-cursor { position: fixed; left: 0; top: 0; width: 34px; height: 34px; z-index: 2147483647; pointer-events: none;
        transform: translate(-100px, -100px); filter: drop-shadow(0 3px 6px rgba(0,0,0,.55)); }
      .promo-ripple { position: fixed; z-index: 2147483646; pointer-events: none; width: 18px; height: 18px; margin: -9px 0 0 -9px;
        border-radius: 50%; border: 3px solid #c084fc; animation: promo-ripple .55s ease-out forwards; }
      @keyframes promo-ripple { from { transform: scale(.4); opacity: 1; } to { transform: scale(2.8); opacity: 0; } }
      #promo-caption { position: fixed; left: 50%; top: 118px; z-index: 2147483645; pointer-events: none;
        transform: translate(-50%, -14px); opacity: 0; transition: opacity .35s ease, transform .35s ease;
        display: flex; align-items: center; gap: 18px; padding: 16px 34px 16px 18px; border-radius: 999px;
        background: rgba(15, 12, 32, .9); border: 2px solid rgba(168, 85, 247, .65); box-shadow: 0 18px 50px rgba(0,0,0,.45);
        font: 700 34px -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: #fff; letter-spacing: -.3px; }
      #promo-caption.on { opacity: 1; transform: translate(-50%, 0); }
      #promo-caption b { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 50%;
        background: linear-gradient(135deg, #a855f7, #ec4899); font-size: 26px; }
    \`;
    document.head.appendChild(style);
    const cursor = document.createElement('div');
    cursor.id = 'promo-cursor';
    cursor.innerHTML = '<svg width="34" height="34" viewBox="0 0 24 24"><path d="M4 2.5 L4 19 L8.6 14.8 L11.6 21.4 L14.4 20.2 L11.4 13.7 L17.6 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    const caption = document.createElement('div');
    caption.id = 'promo-caption';
    document.body.appendChild(caption);
    const move = (e) => { cursor.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)'; };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div'); r.className = 'promo-ripple';
      r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px';
      document.body.appendChild(r); setTimeout(() => r.remove(), 600);
    }, true);
    window.__caption = (text, n) => {
      caption.classList.remove('on');
      setTimeout(() => { caption.innerHTML = (n ? '<b>' + n + '</b>' : '') + '<span>' + text + '</span>'; caption.classList.add('on'); }, text ? 180 : 0);
    };
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();`;

// --------------------------------------------------------------------------
// Smooth pointer motion (real input events, paced like a hand)
// --------------------------------------------------------------------------

function pointer(page) {
  let at = { x: 960, y: 900 };
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  return {
    async to(x, y, ms = 500) {
      const from = at;
      const steps = Math.max(2, Math.round(ms / 28));
      for (let i = 1; i <= steps; i++) {
        const k = ease(i / steps);
        await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
        await sleep(ms / steps);
      }
      at = { x, y };
    },
    async click(x, y, ms = 500) {
      await this.to(x, y, ms);
      await page.mouse.down(); await sleep(70); await page.mouse.up(); await sleep(120);
    },
    async drag(x0, y0, x1, y1, ms = 500, approach = 450) {
      await this.to(x0, y0, approach);
      await page.mouse.down(); await sleep(90);
      await this.to(x1, y1, ms);
      await sleep(90); await page.mouse.up(); await sleep(120);
    },
    async onElement(locator, ms = 550) {
      await locator.scrollIntoViewIfNeeded();
      await sleep(200);
      const b = await locator.boundingBox();
      await this.click(b.x + b.width / 2, b.y + b.height / 2, ms);
    },
  };
}

/** When each step starts, seconds into the clip (for the edit). */
const MARKS = [];
let clipStart = 0;
async function caption(page, text, n) {
  MARKS.push({ step: n, text, at: Date.now() / 1000 - clipStart });
  await page.evaluate(([t, k]) => window.__caption(t, k), [text, n]);
}

// --------------------------------------------------------------------------

(async () => {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chromium',
    args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
  });
  // The editor at 1600×900, drawn at 1.2×: a 1920×1080 video with larger, readable UI
  const cards = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1.2 });
  const cardPage = await cards.newPage();
  const page = await context.newPage();
  const want = (name) => ONLY.length === 0 || ONLY.includes(name);

  // Title cards
  for (const card of ['intro', 'outro']) {
    if (!want(card)) continue;
    const html = fs.readFileSync(path.join(__dirname, 'cards.html'), 'utf8').replaceAll('LOGO_URL', LOGO);
    const file = path.join(OUT, `${card}.html`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(file, html);
    await cardPage.goto('file://' + file);
    await cardPage.evaluate((c) => document.body.setAttribute('data-card', c), card);
    await sleep(500);
    await record(cardPage, path.join(OUT, card), async () => {
      await sleep(150);
      await cardPage.evaluate(() => document.body.classList.add('go'));
      await sleep(card === 'intro' ? 3000 : 3800);
    });
  }

  if (want('creation')) {
    await context.addInitScript(OVERLAY);
    await page.goto(APP + '/');
    await sleep(2500);
    const consent = page.getByTestId('consent-accept');
    if (await consent.count()) await consent.click();
    await page.goto(APP + '/editor');
    await sleep(3500);
    const consent2 = page.getByTestId('consent-accept');
    if (await consent2.count()) await consent2.click();
    const canvas = await page.locator('canvas').first().boundingBox();
    const cx = canvas.x + canvas.width / 2 - 120;
    const cy = canvas.y + canvas.height / 2 - 20;
    // An empty spot just inside the canvas (clear of the rulers): clicking it
    // deselects and gives the canvas focus for its shortcuts
    const empty = [canvas.x + 90, canvas.y + 110];
    const hand = pointer(page);
    await page.mouse.move(cx + 300, cy + 260);

    await record(page, path.join(OUT, 'creation'), async () => {
      await sleep(600);

      // 1 · Pen
      await caption(page, 'Draw with the Pen', 1);
      await hand.onElement(page.locator('[data-testid="tool-pen"], button[title^="Pen"]').first(), 650);
      await sleep(250);
      const A = [cx - 230, cy + 40], B = [cx + 20, cy - 150], C = [cx + 150, cy + 110];
      await hand.drag(A[0], A[1], cx - 170, cy - 80, 450, 700);
      await hand.to(B[0] - 40, B[1] + 20, 650);
      await hand.drag(B[0], B[1], cx + 170, cy - 90, 450, 250);
      await hand.to(C[0] + 30, C[1] - 40, 600);
      await hand.drag(C[0], C[1], cx + 10, cy + 170, 450, 250);
      await hand.to(A[0] + 25, A[1] - 10, 700);
      await sleep(250);
      await hand.click(A[0], A[1], 300);
      await sleep(700);

      // 2 · Direct Selection: bend a segment, move a point
      await caption(page, 'Bend it into shape', 2);
      await page.keyboard.press('a');
      await sleep(500);
      // Middle of the B→C curve (cubic with B's handle out and C's mirrored handle in)
      const mid = [
        (B[0] + 3 * (cx + 170) + 3 * (2 * C[0] - (cx + 10)) + C[0]) / 8,
        (B[1] + 3 * (cy - 90) + 3 * (2 * C[1] - (cy + 170)) + C[1]) / 8,
      ];
      await hand.drag(mid[0], mid[1], mid[0] + 70, mid[1] - 10, 650, 700);
      await sleep(250);
      await hand.drag(B[0], B[1], B[0] - 20, B[1] - 45, 550, 600);
      await sleep(600);

      // 3 · Gradient fill, no outline
      await caption(page, 'Paint it with gradients', 3);
      await hand.onElement(page.getByTestId('fill-type-linear').first(), 750);
      await sleep(450);
      await hand.onElement(page.getByTestId('stroke-remove-0').first(), 650);
      await sleep(700);

      // 4 · Duplicate and mirror
      await caption(page, 'Duplicate & mirror', 4);
      await page.keyboard.press('v');
      await hand.click(cx - 40, cy + 10, 550);
      await page.keyboard.press('Control+d');
      await sleep(350);
      await page.keyboard.press('Shift+H');
      await sleep(450);
      await hand.drag(cx - 20, cy + 10, cx + 300, cy + 10, 750, 300);
      await sleep(500);

      // 5 · Animation presets on both
      await caption(page, 'Animate in one click', 5);
      await hand.click(empty[0], empty[1], 500);
      await page.keyboard.press('Control+a');
      await sleep(400);
      await hand.onElement(page.getByTestId('animation-preset-pop-in').first(), 800);
      await sleep(500);
      await hand.onElement(page.getByTestId('animation-preset-float').first(), 650);
      await sleep(600);

      // 6 · Play
      await caption(page, 'Hit play', 6);
      await hand.click(empty[0], empty[1], 650);
      await page.keyboard.press('Home');
      await sleep(250);
      await page.keyboard.press('Space');
      await hand.to(cx + 700, cy + 330, 900);
      await sleep(3800);
    });
  }

  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
