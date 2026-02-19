#!/usr/bin/env node
/**
 * Convert the book HTML to PDF using Puppeteer.
 * Usage: node html-to-pdf.mjs
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  let puppeteer;
  try {
    puppeteer = await import('puppeteer');
  } catch {
    console.log('Installing puppeteer...');
    const { execSync } = await import('child_process');
    execSync('npm install puppeteer', { cwd: __dirname, stdio: 'inherit' });
    puppeteer = await import('puppeteer');
  }

  const htmlPath = resolve(__dirname, '..', 'How-to-Code-a-Graphic-Editor-DEMO.html');
  const pdfPath = resolve(__dirname, '..', 'How-to-Code-a-Graphic-Editor-DEMO.pdf');

  console.log('Launching browser...');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();

  const htmlContent = readFileSync(htmlPath, 'utf-8');
  console.log('Loading HTML...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

  console.log('Generating PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '2cm', right: '2cm', bottom: '2.5cm', left: '2cm' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 8pt; color: #999; width: 100%; text-align: center; font-family: Georgia, serif;">
        How to Code a Graphic Editor &mdash; Demo Preview
      </div>`,
    footerTemplate: `
      <div style="font-size: 8pt; color: #999; width: 100%; text-align: center; font-family: Georgia, serif;">
        <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`,
  });

  await browser.close();
  console.log(`PDF saved to: ${pdfPath}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
