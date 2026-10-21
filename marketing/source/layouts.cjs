const { chromium } = require('/Users/dimitrymd/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core');
const fs = require('fs'); const path = require('path');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const html = fs.readFileSync(path.join(__dirname, 'layout.html'), 'utf8')
    .replaceAll('LOGO_URL', 'file:///Users/dimitrymd/Documents/prj/quar-animator/apps/web/public/logo.svg');
  const file = path.join(__dirname, 'out', 'layout.html');
  fs.writeFileSync(file, html);
  for (const [format, w, h] of [['vertical', 1080, 1920], ['square', 1080, 1080]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('file://' + file + '#' + format);
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(__dirname, 'out', `bg-${format}.png`) });
    await page.close();
  }
  await browser.close();
})();
