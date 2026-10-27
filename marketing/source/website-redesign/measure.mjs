/**
 * Reads funwayinteractive.com's home page as Chrome lays it out at 1440 px:
 * every text run's lines and baselines, the inline SVG icons (their colour
 * filled in), the hero picture and the logo, and a full-page screenshot.
 *
 *   node measure.mjs [out-dir]   (default ../out/website-redesign)
 *
 * Playwright comes from PLAYWRIGHT_CORE (default: the npx cache, as record.cjs).
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(process.argv[2] ?? path.join(HERE, '../out/website-redesign'));
const SITE = 'https://funwayinteractive.com/';
const require = createRequire(
  process.env.PLAYWRIGHT_CORE ?? '/Users/dimitrymd/.npm/_npx/e41f203b7505f1fb/node_modules/'
);
const { chromium } = require('playwright-core');

fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
for (const [name, url] of [['hero-back1.jpg', `${SITE}hero-back1.jpg`], ['funway-logo.svg', `${SITE}funway-logo.svg`]]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  fs.writeFileSync(path.join(OUT, 'assets', name), Buffer.from(await response.arrayBuffer()));
}

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
// No cookie bar: it's not part of the design
await page.addInitScript(() => localStorage.setItem('cookie_consent', 'declined'));
await page.goto(SITE, { waitUntil: 'networkidle' });
// Scroll through once so every reveal-on-scroll section has shown
const height = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < height; y += 500) {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await page.waitForTimeout(200);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(OUT, 'full.png'), fullPage: true });

const data = await page.evaluate(() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const metrics = {};
  const metric = (s) => {
    const key = `${s.fontWeight} ${s.fontSize} ${s.fontFamily.split(',')[0]}`;
    if (!metrics[key]) {
      ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
      const m = ctx.measureText('Hg');
      metrics[key] = { ascent: m.fontBoundingBoxAscent, descent: m.fontBoundingBoxDescent };
    }
    return metrics[key];
  };
  const box = (r) => ({ x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height });
  const texts = [];
  const svgs = [];
  for (const el of document.body.querySelectorAll('*')) {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (el.tagName.toLowerCase() === 'svg') {
      svgs.push({ rect: box(r), html: el.outerHTML.replace(/currentColor/g, s.color), parent: el.parentElement.className });
      continue;
    }
    if (el.closest('svg')) continue;
    const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (!nodes.length) continue;
    // Each character's box: lines as the browser broke them, baselines where it drew them
    const m = metric(s);
    const lines = [];
    for (const n of nodes) {
      for (let i = 0; i < n.textContent.length; i++) {
        const range = document.createRange();
        range.setStart(n, i);
        range.setEnd(n, i + 1);
        const c = range.getClientRects()[0];
        if (!c || (/\s/.test(n.textContent[i]) && c.width === 0)) continue;
        const ch = { c: n.textContent[i], x: c.x + scrollX, y: c.y + scrollY, w: c.width };
        let line = lines.find((l) => Math.abs(l.top - ch.y) < 2);
        if (!line) lines.push((line = { top: ch.y, chars: [] }));
        line.chars.push(ch);
      }
    }
    texts.push({
      i: texts.length,
      tag: el.tagName.toLowerCase(),
      rect: box(r),
      family: s.fontFamily.split(',')[0].replace(/"/g, ''),
      weight: +s.fontWeight,
      size: parseFloat(s.fontSize),
      lineHeight: parseFloat(s.lineHeight),
      ls: s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing),
      color: s.color,
      align: s.textAlign,
      lines: lines.map((l) => {
        let text = l.chars.map((c) => c.c).join('').replace(/\s+/g, ' ').trim();
        if (s.textTransform === 'uppercase') text = text.toUpperCase();
        const ink = l.chars.filter((c) => !/\s/.test(c.c));
        return { text, left: ink[0].x, right: ink.at(-1).x + ink.at(-1).w, top: l.top, baseline: l.top + m.ascent };
      }),
    });
  }
  return { texts, svgs };
});
fs.writeFileSync(path.join(OUT, 'text.json'), JSON.stringify(data, null, 1));
console.log(data.texts.length, 'texts,', data.svgs.length, 'icons ->', OUT);
await browser.close();
