/**
 * The user guide's generator (apps/web/scripts/help/): chapters' Markdown
 * and frontmatter in, static pages, pictures and a search index out.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseFrontmatter } from '../../scripts/help/frontmatter.mjs';
import {
  classifyLink,
  createMarkdown,
  keyLabel,
  searchSections,
  slugify,
  splitKeys,
} from '../../scripts/help/markdown.mjs';
import { buildHelp, imageSize, loadChapters } from '../../scripts/help/build-help.mjs';
import { resolveHelpRequest } from '../../scripts/help/vite-plugin.mjs';
import { CSP } from '../../scripts/help/pages.mjs';

/** A PNG's first bytes: enough for its size to be read. */
function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function chapter(title: string, order: number, body: string, summary = `About ${title}.`) {
  return `---\ntitle: ${title}\norder: ${order}\nsummary: ${summary}\n---\n\n${body}\n`;
}

function render(markdown: string, env: Record<string, unknown> = {}) {
  const md = createMarkdown();
  const fullEnv = { root: '../', ...env } as Record<string, unknown>;
  const tokens = md.parse(markdown, fullEnv);
  return { html: md.renderer.render(tokens, md.options, fullEnv), env: fullEnv, tokens };
}

describe('frontmatter', () => {
  it('reads title, order and summary, and where the body starts', () => {
    const { data, body, bodyLine, problems } = parseFrontmatter(
      '---\ntitle: Getting started\norder: 1\nsummary: "First steps: a project, the layout, saving."\n---\n\nHello\n'
    );
    expect(problems).toEqual([]);
    expect(data).toEqual({
      title: 'Getting started',
      order: 1,
      summary: 'First steps: a project, the layout, saving.',
    });
    expect(body).toBe('\nHello\n');
    expect(bodyLine).toBe(5);
  });

  it('reports a chapter with none, or with fields missing or wrong', () => {
    expect(parseFrontmatter('# Just text').problems).toEqual([
      expect.stringContaining('has no frontmatter'),
    ]);
    const { problems } = parseFrontmatter(
      '---\ntitle: A\norder: first\ntitle: B\nnot a field\n---\n'
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'frontmatter has "title" twice',
        expect.stringContaining('isn\'t "key: value"'),
        'frontmatter is missing "summary"',
        'frontmatter "order" must be a number, not "first"',
      ])
    );
  });
});

describe('keyboard shortcuts', () => {
  it('splits a shortcut into its keys, the plus key included', () => {
    expect(splitKeys('Mod+Shift+Z')).toEqual(['Mod', 'Shift', 'Z']);
    expect(splitKeys('Ctrl++')).toEqual(['Ctrl', '+']);
    expect(splitKeys('Ctrl+=')).toEqual(['Ctrl', '=']);
    expect(splitKeys('Shift+,')).toEqual(['Shift', ',']);
  });

  it('labels keys as they are printed, marking the ones a Mac names differently', () => {
    expect(keyLabel('Mod')).toEqual({ label: 'Ctrl', platform: 'mod' });
    expect(keyLabel('alt')).toEqual({ label: 'Alt', platform: 'alt' });
    expect(keyLabel('s')).toEqual({ label: 'S', platform: null });
    expect(keyLabel('Escape')).toEqual({ label: 'Esc', platform: null });
    expect(keyLabel('F1')).toEqual({ label: 'F1', platform: null });
  });

  it('renders [[…]] as keycaps', () => {
    const { html } = render('Press [[Mod+S]] to save.');
    expect(html).toContain(
      '<kbd class="keys"><kbd data-key="mod">Ctrl</kbd><span class="plus">+</span><kbd>S</kbd></kbd>'
    );
  });

  it('leaves ordinary brackets alone', () => {
    expect(render('A [link](https://example.com) and [square] brackets.').html).not.toContain(
      '<kbd'
    );
  });
});

describe('headings', () => {
  it('gives every heading an id, its own when it names one', () => {
    const { html, env } = render(
      '## Save your work {#saving}\n\n## Pages & tabs\n\n### Pages & tabs\n\n## Ünïcode words'
    );
    expect(html).toContain('<h2 id="saving">Save your work<a class="anchor" href="#saving"');
    expect(html).toContain('<h2 id="pages-tabs">');
    expect(html).toContain('<h3 id="pages-tabs-2">');
    expect(html).toContain('<h2 id="unicode-words">');
    expect((env.headings as { id: string; text: string }[]).map((h) => [h.id, h.text])).toEqual([
      ['saving', 'Save your work'],
      ['pages-tabs', 'Pages & tabs'],
      ['pages-tabs-2', 'Pages & tabs'],
      ['unicode-words', 'Ünïcode words'],
    ]);
  });

  it('reports an id chosen twice', () => {
    const { env } = render('## One {#same}\n\n## Two {#same}');
    expect(env.problems).toEqual([
      expect.objectContaining({ message: 'heading id "same" is used twice' }),
    ]);
  });

  it('wraps each h2 and what follows in a section', () => {
    const { html } = render('Intro.\n\n## One\n\nA\n\n## Two\n\nB');
    expect(html.match(/<section class="part">/g)).toHaveLength(2);
    expect(html.match(/<\/section>/g)).toHaveLength(2);
    expect(html.indexOf('Intro.')).toBeLessThan(html.indexOf('<section'));
  });

  it('makes ids from words', () => {
    expect(slugify('Undo & redo!')).toBe('undo-redo');
    expect(slugify('***')).toBe('section');
  });
});

describe('callouts', () => {
  it('turns [!TIP], [!NOTE] and [!CAUTION] quotes into labelled callouts', () => {
    const { html } = render(
      '> [!TIP]\n> Press F1.\n\n> [!CAUTION]\n>\n> Careful.\n\n> [!WARNING]\n> Also careful.\n\n> [!NOTE] Inline.\n\n> Just a quote.'
    );
    expect(html).toContain(
      '<aside class="callout tip" role="note"><p class="callout-label">Tip</p>\n<p>Press F1.</p>\n</aside>'
    );
    expect(html).toContain(
      '<aside class="callout caution" role="note"><p class="callout-label">Caution</p>\n<p>Careful.</p>'
    );
    expect(html).toContain(
      '<aside class="callout caution" role="note"><p class="callout-label">Caution</p>\n<p>Also careful.</p>'
    );
    expect(html).toContain('<p class="callout-label">Note</p>\n<p>Inline.</p>');
    expect(html).toContain('<blockquote>\n<p>Just a quote.</p>\n</blockquote>');
    expect(html).not.toContain('[!');
  });
});

describe('figures and pictures', () => {
  it('makes an image alone in a paragraph a figure, its title the caption', () => {
    const seen: unknown[] = [];
    const { html } = render('![The editor](img/layout.png "The editor’s *parts*.")', {
      onImage: (src: string, info: unknown) => {
        seen.push({ src, ...(info as object) });
        return { src: `../${src}`, width: 640, height: 400 };
      },
    });
    expect(html).toBe(
      '<figure><img src="../img/layout.png" alt="The editor" width="640" height="400" loading="lazy" decoding="async"><figcaption><span>The editor’s <em>parts</em>.</span></figcaption></figure>\n'
    );
    expect(seen).toEqual([{ src: 'img/layout.png', alt: 'The editor', line: 0 }]);
  });

  it('keeps an image inside a sentence inline, still lazy', () => {
    const { html } = render('The ![plus](img/plus.png) button.', {
      onImage: (src: string) => ({ src: `../${src}` }),
    });
    expect(html).toContain(
      '<p>The <img src="../img/plus.png" alt="plus" loading="lazy" decoding="async"> button.</p>'
    );
  });

  it('reads a picture’s size, halved for the twice-size screenshots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quar-help-size-'));
    fs.writeFileSync(path.join(dir, 'shot.png'), pngHeader(2560, 1600));
    fs.writeFileSync(path.join(dir, 'icon@1x.png'), pngHeader(32, 24));
    fs.writeFileSync(
      path.join(dir, 'diagram.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120"></svg>'
    );
    expect(imageSize(path.join(dir, 'shot.png'))).toEqual({ width: 1280, height: 800 });
    expect(imageSize(path.join(dir, 'icon@1x.png'))).toEqual({ width: 32, height: 24 });
    expect(imageSize(path.join(dir, 'diagram.svg'))).toEqual({ width: 300, height: 120 });
    expect(imageSize(path.join(dir, 'missing.png'))).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('links', () => {
  it('sorts links into chapters, anchors and the web', () => {
    expect(classifyLink('saving.md#backups')).toEqual({
      kind: 'chapter',
      page: 'saving',
      anchor: 'backups',
    });
    expect(classifyLink('./pages.md')).toEqual({ kind: 'chapter', page: 'pages', anchor: null });
    expect(classifyLink('#undo')).toEqual({ kind: 'anchor', anchor: 'undo' });
    expect(classifyLink('https://free.quar.pro')).toEqual({
      kind: 'external',
      href: 'https://free.quar.pro',
    });
    expect(classifyLink('../elsewhere/')).toEqual({ kind: 'other', href: '../elsewhere/' });
  });

  it('turns chapter files into page links and opens the web in a new tab', () => {
    const { html, env } = render(
      'See [saving](saving.md#backups), [below](#undo) and [GitHub](https://github.com).'
    );
    expect(html).toContain('<a href="../saving/#backups">saving</a>');
    expect(html).toContain('<a href="#undo">below</a>');
    expect(html).toContain(
      '<a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>'
    );
    expect((env.links as { kind: string }[]).map((l) => l.kind)).toEqual([
      'chapter',
      'anchor',
      'external',
    ]);
  });

  it('wraps tables so they scroll on a phone instead of the page', () => {
    expect(render('| A | B |\n| - | - |\n| 1 | 2 |').html).toMatch(
      /^<div class="table-wrap">\n<table>[\s\S]*<\/table>\n<\/div>\n$/
    );
  });
});

describe('search sections', () => {
  it('collects each part’s words under its heading', () => {
    const { tokens } = render(
      'Opening words.\n\n## Save your work {#saving}\n\nPress [[Mod+S]].\n\n### Autosave\n\nEvery `30` seconds.'
    );
    expect(searchSections(tokens, 'Getting started')).toEqual([
      { id: '', title: 'Getting started', text: 'Opening words.' },
      { id: 'saving', title: 'Save your work', text: 'Press Ctrl+S.' },
      { id: 'autosave', title: 'Autosave', text: 'Every 30 seconds.' },
    ]);
  });
});

describe('building the guide', () => {
  let base: string;
  let free: string;
  let cloud: string;
  let out: string;
  const sources = () => [
    { dir: free, edition: 'free' as const, optional: false },
    { dir: cloud, edition: 'cloud' as const, optional: true },
  ];

  beforeEach(() => {
    base = fs.mkdtempSync(path.join(os.tmpdir(), 'quar-help-'));
    free = path.join(base, 'docs/help');
    cloud = path.join(base, 'docs/help-cloud');
    out = path.join(base, 'public/help');
    fs.mkdirSync(path.join(free, 'img'), { recursive: true });
    fs.writeFileSync(path.join(free, 'img/layout.png'), pngHeader(2400, 1500));
    fs.writeFileSync(
      path.join(free, 'getting-started.md'),
      chapter(
        'Getting started',
        1,
        'Hello.\n\n## The layout\n\n![The editor](img/layout.png "Its parts.")\n\nNext: [pages](pages.md#tabs).'
      )
    );
    fs.writeFileSync(
      path.join(free, 'pages.md'),
      chapter('Pages', 2, '## Tabs {#tabs}\n\nThey hold scenes.')
    );
    fs.writeFileSync(path.join(free, 'README.md'), '# How to write a chapter\n');
  });

  afterEach(() => {
    fs.rmSync(base, { recursive: true, force: true });
  });

  it('writes the contents page, a page per chapter, its pictures, assets and search index', () => {
    const { chapters, problems } = buildHelp({ outDir: out, sourceDirs: sources() });
    expect(problems).toEqual([]);
    expect(chapters.map((c) => [c.slug, c.number, c.edition])).toEqual([
      ['getting-started', 1, 'free'],
      ['pages', 2, 'free'],
    ]);
    for (const file of [
      'index.html',
      'getting-started/index.html',
      'pages/index.html',
      'img/layout.png',
      'assets/help.css',
      'assets/help.js',
      'assets/mark.svg',
      'assets/fonts/dm-sans-latin-400-normal.woff2',
      'assets/fonts/LICENSE-DM-Sans.txt',
      'assets/fonts/LICENSE-IBM-Plex-Mono.txt',
      'search-index.js',
    ]) {
      expect(fs.existsSync(path.join(out, file)), file).toBe(true);
    }
    // The writer's notes aren't a chapter
    expect(fs.existsSync(path.join(out, 'README/index.html'))).toBe(false);

    const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
    expect(index.indexOf('Getting started')).toBeLessThan(index.indexOf('>Pages<'));
    expect(index).toContain('<a href="getting-started/#the-layout">The layout</a>');
    expect(index).toContain('About Getting started.');

    const page = fs.readFileSync(path.join(out, 'getting-started/index.html'), 'utf8');
    expect(page).toContain(`content="${CSP}"`);
    expect(page).toContain('<p class="eyebrow">Chapter 01</p>');
    expect(page).toContain('<a href="#the-layout">The layout</a>');
    expect(page).toContain(
      'src="../img/layout.png" alt="The editor" width="1200" height="750" loading="lazy"'
    );
    expect(page).toContain('<a href="../pages/#tabs">pages</a>');
    expect(page).toContain('<a class="pager-next" rel="next" href="../pages/">');
    expect(page).toContain(
      'href="https://github.com/FunwayHQ/quar-animator/blob/main/docs/help/getting-started.md"'
    );
    expect(page).toContain('<a class="to-editor" href="../../">Open in the editor</a>');
    // Nothing the page's policy would refuse
    expect(page).not.toMatch(/\sstyle=|<style|\son[a-z]+=|<script>/i);

    const pagesPage = fs.readFileSync(path.join(out, 'pages/index.html'), 'utf8');
    expect(pagesPage).toContain('<a class="pager-prev" rel="prev" href="../getting-started/">');
  });

  it('writes the search index as a script the pages may load', () => {
    buildHelp({ outDir: out, sourceDirs: sources() });
    const sandbox: { self: { QUAR_HELP_INDEX?: unknown } } = { self: {} };
    vm.runInNewContext(fs.readFileSync(path.join(out, 'search-index.js'), 'utf8'), sandbox);
    expect(sandbox.self.QUAR_HELP_INDEX).toEqual([
      {
        slug: 'getting-started',
        title: 'Getting started',
        summary: 'About Getting started.',
        edition: 'free',
        sections: [
          { id: '', title: 'Getting started', text: 'Hello.' },
          { id: 'the-layout', title: 'The layout', text: 'Next: pages.' },
        ],
      },
      {
        slug: 'pages',
        title: 'Pages',
        summary: 'About Pages.',
        edition: 'free',
        sections: [{ id: 'tabs', title: 'Tabs', text: 'They hold scenes.' }],
      },
    ]);
  });

  it('adds the cloud edition’s chapters, in order, when their folder is there', () => {
    fs.mkdirSync(path.join(cloud, 'img'), { recursive: true });
    fs.writeFileSync(
      path.join(cloud, 'accounts.md'),
      chapter('Accounts', 1.5, '## Sign in\n\nWith email.')
    );
    const { chapters, problems } = buildHelp({ outDir: out, sourceDirs: sources() });
    expect(problems).toEqual([]);
    expect(chapters.map((c) => [c.slug, c.edition])).toEqual([
      ['getting-started', 'free'],
      ['accounts', 'cloud'],
      ['pages', 'free'],
    ]);
    const page = fs.readFileSync(path.join(out, 'accounts/index.html'), 'utf8');
    expect(page).toContain('<p class="eyebrow">Chapter 02 · Cloud edition</p>');
    expect(page).toContain('<b>Edition</b> Cloud edition');
    // The fork's sources are private: no link to them
    expect(page).not.toContain('Improve this page');
    expect(fs.readFileSync(path.join(out, 'index.html'), 'utf8')).toContain(
      '<span class="tag">Cloud edition</span>'
    );
  });

  it('reports chapters that clash, lack frontmatter or are badly named, and pictures that clash', () => {
    fs.mkdirSync(path.join(cloud, 'img'), { recursive: true });
    fs.writeFileSync(path.join(cloud, 'pages.md'), chapter('Pages again', 3, 'Text.'));
    fs.writeFileSync(path.join(cloud, 'img/layout.png'), pngHeader(10, 10));
    fs.writeFileSync(path.join(free, 'no-front.md'), '# No frontmatter\n');
    fs.writeFileSync(path.join(free, 'Bad Name.md'), chapter('Bad', 9, 'x'));
    const { problems, chapters } = buildHelp({ outDir: out, sourceDirs: sources() });
    const messages = problems.map((p) => `${path.basename(p.file)}: ${p.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^pages\.md: another chapter is also called "pages"/),
        expect.stringMatching(/^no-front\.md: has no frontmatter/),
        expect.stringMatching(/^Bad Name\.md: chapter files are named in lowercase/),
        expect.stringMatching(/^layout\.png: has the same name as/),
      ])
    );
    expect(chapters.map((c) => c.slug)).not.toContain('Bad Name');
  });

  it('needs the free chapters’ folder but not the cloud one', () => {
    expect(loadChapters({ sourceDirs: sources() }).problems).toEqual([]);
    fs.rmSync(free, { recursive: true, force: true });
    expect(loadChapters({ sourceDirs: sources() }).problems).toEqual([
      expect.objectContaining({ message: 'the chapter folder is missing' }),
    ]);
  });

  it('swaps the new build in whole, leaving nothing aside', () => {
    buildHelp({ outDir: out, sourceDirs: sources() });
    fs.writeFileSync(path.join(out, 'stale.html'), 'from an earlier build');
    buildHelp({ outDir: out, sourceDirs: sources() });
    expect(fs.existsSync(path.join(out, 'stale.html'))).toBe(false);
    expect(fs.existsSync(path.join(out, 'index.html'))).toBe(true);
    expect(fs.readdirSync(base).filter((name) => name.startsWith('.help-'))).toEqual([]);
  });

  it('only ever clears a folder named help', () => {
    expect(() => buildHelp({ outDir: path.join(base, 'public'), sourceDirs: sources() })).toThrow(
      /Refusing to clear/
    );
  });
});

describe('the dev server', () => {
  let out: string;
  beforeEach(() => {
    out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quar-help-serve-')), 'help');
    fs.mkdirSync(path.join(out, 'getting-started'), { recursive: true });
    fs.writeFileSync(path.join(out, 'index.html'), 'contents');
    fs.writeFileSync(path.join(out, 'getting-started/index.html'), 'chapter');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });

  it('opens a folder’s index.html, and adds the slash its relative links need', () => {
    expect(resolveHelpRequest('/help/', out)).toEqual({ file: path.join(out, 'index.html') });
    expect(resolveHelpRequest('/help/getting-started/?x=1', out)).toEqual({
      file: path.join(out, 'getting-started/index.html'),
    });
    expect(resolveHelpRequest('/help', out)).toEqual({ redirect: '/help/' });
    expect(resolveHelpRequest('/help/getting-started?x=1', out)).toEqual({
      redirect: '/help/getting-started/?x=1',
    });
  });

  it('answers nothing outside the guide, and nothing for a page it lacks', () => {
    expect(resolveHelpRequest('/editor', out)).toBeNull();
    expect(resolveHelpRequest('/helpful', out)).toBeNull();
    expect(resolveHelpRequest('/help/missing/', out)).toEqual({ missing: true });
    expect(resolveHelpRequest('/help/%2e%2e/%2e%2e/etc/passwd', out)).toEqual({ missing: true });
  });
});
