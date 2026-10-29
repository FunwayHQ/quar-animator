/**
 * The pictures of "Pictures and SVG" (pictures-and-svg.md): a picture on an
 * artboard with its Adjustments, an SVG's shapes in the Layers panel, and a
 * picture's corner pulled with Direct Selection. The files imported are made
 * here: the picture drawn in the page, the SVG written out below.
 */

/** Where the canvas is on the page, for clicks in its own pixels. */
async function canvasAt(page, x, y) {
  const box = await page.locator('[data-testid="canvas-drop-zone"]').boundingBox();
  return [box.x + x, box.y + y];
}

/** A sunset, 480 × 320, drawn in the page and handed back as PNG bytes. */
async function sunset(page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 320;
    const g = canvas.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 230);
    sky.addColorStop(0, '#1e1b4b');
    sky.addColorStop(0.55, '#be185d');
    sky.addColorStop(1, '#f59e0b');
    g.fillStyle = sky;
    g.fillRect(0, 0, 480, 320);
    g.fillStyle = '#fde68a';
    g.beginPath();
    g.arc(300, 225, 52, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#312e81';
    g.beginPath();
    g.moveTo(0, 320);
    g.lineTo(0, 210);
    g.quadraticCurveTo(120, 150, 240, 225);
    g.quadraticCurveTo(360, 290, 480, 215);
    g.lineTo(480, 320);
    g.fill();
    g.fillStyle = '#0f172a';
    g.fillRect(0, 270, 480, 50);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'sunset.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="200" height="120">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#f97316"/><stop offset="1" stop-color="#ec4899"/>
    </linearGradient>
  </defs>
  <g id="badge">
    <rect id="plate" x="5" y="5" width="190" height="110" rx="18" fill="url(#glow)"/>
    <circle id="dot" cx="50" cy="60" r="28" fill="#fff" stroke="#111" stroke-width="4" stroke-dasharray="8 5"/>
    <path id="tick" d="M100 60 L120 82 L165 35" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;

/** File › (the item), and the file given to the browser's file chooser. */
const importFile = (item, file) => ({
  run: async (page) => {
    await page.click('[data-testid="menu-file"]');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem', { name: item }).click();
    await (await chooser).setFiles(typeof file === 'function' ? await file(page) : file);
    await page.waitForTimeout(800);
  },
});

/** Type a value into an adjustment's field. */
const adjust = (key, value) => [
  { fill: [`[data-testid="adjustment-value-${key}"]`, value] },
  { press: 'Enter' },
];

/** @type {import('../../../apps/web/scripts/help/shot-kit.mjs').Shot[]} */
export default [
  {
    name: 'pictures-adjust',
    about: 'A picture imported onto an artboard, and its Adjustments in Properties, numbered',
    viewport: { width: 1280, height: 1000 },
    storage: { 'quar-animator-timeline-height': '120' },
    steps: [
      { open: 'new' },
      // An artboard round the middle of the page, where pictures come in
      { press: 'f' },
      { drag: { from: [90, 120], to: [710, 640] } },
      importFile(/Import Image/, sunset),
      { click: '[data-testid="animation-presets-toggle"]' },
      ...adjust('saturation', '40'),
      ...adjust('temperature', '30'),
      { evaluate: () => document.activeElement?.blur() },
      // Pointed at, a row shows its own reset arrow
      { hover: '[data-testid="adjustment-saturation"] [class*="_adjustmentLabel_"]' },
    ],
    keepPointer: true,
    markers: [
      { target: '[data-testid="adjustment-saturation"]', label: 1, at: 'left', dx: -42 },
      {
        target: '[data-testid="adjustment-reset-saturation"]',
        label: 2,
        at: 'top',
        dx: -6,
        dy: -32,
      },
      { target: '[data-testid="image-adjustments-reset-all"]', label: 3, at: 'left', dx: -34 },
    ],
    capture: { clip: { x: 300, y: 280, width: 980, height: 500 } },
  },
  {
    name: 'pictures-svg',
    about: 'An imported SVG: its group and shapes in the Layers panel, named after the SVG',
    steps: [
      { open: 'new' },
      importFile(/Import SVG/, {
        name: 'badge.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(BADGE_SVG),
      }),
    ],
    markers: [
      {
        target: '[class*="_leftPanel_"] [data-testid^="layer-row-"]',
        label: 1,
        at: 'right',
        dx: -6,
      },
    ],
    capture: { clip: { x: 0, y: 76, width: 800, height: 330 } },
  },
  {
    name: 'pictures-corners',
    about: 'A picture’s corner pulled out with Direct Selection',
    steps: [
      { open: 'new' },
      importFile(/Import Image/, sunset),
      { press: 'a' },
      {
        run: async (page) => {
          // The picture is in the middle of the view: a click there shows its corners
          await page.mouse.click(...(await canvasAt(page, 400, 262)));
          await page.waitForTimeout(300);
          const corners = await page.locator('svg [class*="_point_"]').evaluateAll((points) =>
            points.map((point) => {
              const box = point.getBoundingClientRect();
              return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            })
          );
          // The top-right one, pulled up and out
          const corner = corners.reduce((best, c) => (c.x - c.y > best.x - best.y ? c : best));
          await page.mouse.move(corner.x, corner.y);
          await page.mouse.down();
          await page.mouse.move(corner.x + 60, corner.y - 50, { steps: 10 });
          await page.mouse.up();
        },
      },
    ],
    markers: [{ target: '[class*="_pointSelected_"]', label: 1, at: 'bottom', dx: -24, dy: 40 }],
    capture: { clip: { x: 300, y: 76, width: 700, height: 460 } },
  },
];
