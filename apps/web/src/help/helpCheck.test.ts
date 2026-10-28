/**
 * The user guide's checks (apps/web/scripts/help/check-help.mjs, also
 * `pnpm help:check`): the guide in this repo passes them, and they catch
 * what they're for.
 */

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHelp, checkSite, readHtml } from '../../scripts/help/check-help.mjs';
import { WEB_ROOT } from '../../scripts/help/paths.mjs';

/** A PNG's first bytes: enough for its size to be read. */
function png(width = 200, height = 100): Buffer {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

const messages = (problems: { message: string }[]) => problems.map((p) => p.message);

describe('the guide in this repo', () => {
  it('passes every check', async () => {
    const { problems } = await checkHelp();
    expect(problems.map((p) => `${p.file}:${p.line}: ${p.message}`)).toEqual([]);
  }, 60000);
});

describe('reading a built page', () => {
  it('accepts sound pages: void elements, comments, scripts from files', () => {
    const { problems, ids, refs } = readHtml(
      `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>A <b> title</title>
<link rel="stylesheet" href="assets/help.css" /><script src="assets/help.js"></script></head>
<body><!-- a <div> in a comment --><p id="one">a<br>b <kbd class="keys"><kbd>Ctrl</kbd></kbd></p>
<img src="img/x.png" alt="" width="1" height="1"><input id="two" type="search" /></body></html>`
    );
    expect(problems).toEqual([]);
    expect([...ids]).toEqual(['one', 'two']);
    expect(refs.map((r) => r.value)).toEqual(['assets/help.css', 'assets/help.js', 'img/x.png']);
  });

  it('finds tags left open, closed twice or closed out of turn', () => {
    expect(messages(readHtml('<div><p>text</div>').problems)).toEqual([
      "<p> isn't closed before </div> on line 1",
    ]);
    expect(messages(readHtml('<p>text</p></span>').problems)).toEqual(['</span> closes nothing']);
    expect(messages(readHtml('<p>a</br></p>').problems)).toEqual([
      '</br> closes an element that has no end tag',
    ]);
    expect(readHtml('<section>\n<h2>Open</h2>\n').problems).toEqual([
      { line: 1, message: "<section> isn't closed" },
    ]);
  });

  it('finds what the pages’ policy would refuse, and ids used twice', () => {
    expect(
      messages(
        readHtml(
          '<p style="color:red" onclick="go()">a</p><script>alert(1)</script><style>p{}</style><a href="javascript:go()">x</a><b id="x"></b><i id="x"></i>'
        ).problems
      )
    ).toEqual([
      "<p> has an inline style, which the pages' policy refuses",
      "<p> has an inline onclick handler, which the pages' policy refuses",
      "an inline script, which the pages' policy refuses",
      "an inline <style>, which the pages' policy refuses",
      '<a> links to javascript:',
      'id "x" is used twice',
    ]);
  });
});

describe('checking the built site', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(WEB_ROOT, '.help-test-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('follows every local link, picture and #anchor', () => {
    const out = path.join(dir, 'public/help');
    fs.mkdirSync(path.join(out, 'page'), { recursive: true });
    fs.mkdirSync(path.join(out, 'img'));
    fs.writeFileSync(path.join(out, 'img/x.png'), png());
    fs.writeFileSync(path.join(out, 'page/index.html'), '<h2 id="here">Here</h2>');
    fs.writeFileSync(
      path.join(out, 'index.html'),
      [
        '<a href="page/#here">fine</a>',
        '<a href="../">the editor</a>',
        '<a href="https://github.com">the web</a>',
        '<a href="#top" id="top">this page</a>',
        '<a href="page/#gone">no anchor</a>',
        '<a href="missing/">no page</a>',
        '<a href="/help/page/">absolute</a>',
        '<a href="../../elsewhere/">outside</a>',
        '<img src="img/x.png" alt="An x">',
        '<img src="img/x.png" width="10" height="10">',
      ].join('\n')
    );
    expect(checkSite(out).map((p) => `${p.file}:${p.line}: ${p.message}`)).toEqual([
      'help/index.html:9: <img src="img/x.png"> needs a width and a height, so the page doesn\'t move as it loads',
      'help/index.html:10: <img src="img/x.png"> needs an alt',
      'help/index.html:5: href="page/#gone": that page has no #gone',
      'help/index.html:6: href="missing/" goes nowhere (no missing/index.html)',
      'help/index.html:7: href="/help/page/" isn\'t a relative link (the guide must work wherever the app is served)',
      'help/index.html:8: href="../../elsewhere/" points outside the guide',
    ]);
  });
});

describe('checking the sources', () => {
  let dir: string;
  let free: string;
  let app: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(WEB_ROOT, '.help-test-'));
    free = path.join(dir, 'docs/help');
    app = path.join(dir, 'src');
    fs.mkdirSync(path.join(free, 'img'), { recursive: true });
    fs.mkdirSync(path.join(app, 'components'), { recursive: true });
    fs.writeFileSync(path.join(free, 'img/layout.png'), png());
    fs.writeFileSync(path.join(free, 'img/no-shot.png'), png());
    fs.writeFileSync(path.join(free, 'img/unused.png'), png());
    fs.writeFileSync(
      path.join(free, 'shots.mjs'),
      `export default [
        { name: 'layout', steps: [{ open: 'projects' }] },
        { name: 'missing', steps: [{ open: 'new' }] },
      ];\n`
    );
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const check = () =>
    checkHelp({ sourceDirs: [{ dir: free, edition: 'free', optional: false }], appSrc: app });

  it('passes a sound chapter, and the editor’s links into it', async () => {
    fs.writeFileSync(
      path.join(free, 'guide.md'),
      '---\ntitle: Guide\norder: 1\nsummary: The guide.\n---\n\n## Saving {#saving}\n\n![The editor](img/layout.png "Its parts.")\n\nSee [saving](#saving) and [this](guide.md#saving).\n'
    );
    fs.writeFileSync(
      path.join(app, 'components/Thing.tsx'),
      `// openHelp('nowhere') in a comment is only an example\nexport const a = () => openHelp('guide', 'saving');\nexport const b = <div data-help="guide#saving" />;\nexport const c = openHelp('index');\n`
    );
    const { problems, warnings } = await check();
    expect(problems).toEqual([]);
    expect(messages(warnings).sort()).toEqual([
      'no chapter shows this picture',
      'no chapter shows this picture',
    ]);
  });

  it('finds pictures, links and frontmatter that are wrong', async () => {
    fs.writeFileSync(
      path.join(free, 'guide.md'),
      [
        '---',
        'title: Guide',
        'order: 1',
        '---',
        '',
        '## One {#one}',
        '',
        '![](img/layout.png)',
        '',
        '![Not taken yet](img/missing.png)',
        '',
        '![Made by hand](img/no-shot.png)',
        '',
        '![From the web](https://example.com/x.png)',
        '',
        '![Lost](pictures/x.png)',
        '',
        '[nowhere](#two) · [no chapter](other.md) · [no part](guide.md#three) · [odd](../x/)',
      ].join('\n')
    );
    fs.writeFileSync(
      path.join(app, 'components/Thing.tsx'),
      `export const a = () => openHelp('nope');\nexport const b = <div data-help="guide#missing" />;\n`
    );
    const { problems } = await check();
    const found = problems.map((p) => `${path.basename(p.file)}:${p.line}: ${p.message}`);
    expect(found).toEqual(
      expect.arrayContaining([
        'guide.md:1: frontmatter is missing "summary"',
        'guide.md:8: the picture img/layout.png needs a description: ![What it shows](img/layout.png)',
        "guide.md:10: img/missing.png isn't there (take it: pnpm help:shots missing)",
        "guide.md:12: img/no-shot.png has no shot in shots.mjs, so it can't be taken again when the editor changes",
        'guide.md:14: https://example.com/x.png: pictures come from img/ (the pages load nothing from elsewhere)',
        'guide.md:16: pictures/x.png: pictures go in img/ beside the chapter',
        'guide.md:18: #two: this chapter has no heading with that id',
        "guide.md:18: other.md: there's no chapter called other",
        'guide.md:18: guide.md#three: guide has no heading with the id three',
        'guide.md:18: ../x/: link to a chapter as its file (name.md#part), or to a web address',
        'Thing.tsx:1: asks the guide for "nope", which isn\'t a chapter',
        'Thing.tsx:2: asks for guide#missing, but that chapter has no heading with that id',
      ])
    );
  });
});
