/**
 * Checks the user guide (`pnpm help:check`, and a test in the normal test
 * run): every chapter has its frontmatter; every picture it shows is in
 * img/, described, and has a shot that can take it again; every link to a
 * chapter or a part of one goes somewhere; every page and part the editor
 * opens with openHelp() or data-help exists; and the built pages are sound —
 * tags closed, nothing the pages' policy would refuse, every local link,
 * picture and #anchor there.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildHelp, formatProblem, loadChapters, renderChapters } from './build-help.mjs';
import { APP_SRC, REPO_ROOT, SOURCE_DIRS } from './paths.mjs';
import { loadShotLists } from './shot-kit.mjs';

/** @typedef {{ file: string, line: number, message: string }} Problem */

const relative = (file) => path.relative(REPO_ROOT, file) || file;

// ============================================================================
// The built pages
// ============================================================================

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
const TAG =
  /<!--[\s\S]*?-->|<!doctype[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
const ATTRIBUTE = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function lineAt(html, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (html.charCodeAt(i) === 10) line++;
  return line;
}

/** @param {string} text */
function attributes(text) {
  const found = {};
  for (const match of text.matchAll(ATTRIBUTE)) {
    found[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return found;
}

/**
 * Read a page's tags: what's wrong with them (unclosed, mismatched, or
 * refused by the pages' Content Security Policy), and its ids and links.
 *
 * @param {string} html
 * @returns {{ problems: { line: number, message: string }[], ids: Set<string>, refs: { line: number, tag: string, attr: string, value: string }[], images: { line: number, attrs: Record<string, string> }[] }}
 */
export function readHtml(html) {
  const problems = [];
  const ids = new Set();
  const refs = [];
  const images = [];
  const stack = [];
  TAG.lastIndex = 0;
  let match;
  while ((match = TAG.exec(html))) {
    const [whole, closing, rawName, rawAttrs = ''] = match;
    if (!rawName) continue; // a comment or the doctype
    const name = rawName.toLowerCase();
    const line = lineAt(html, match.index);

    if (closing) {
      if (VOID.has(name)) {
        problems.push({ line, message: `</${name}> closes an element that has no end tag` });
        continue;
      }
      const open = stack.findLastIndex((entry) => entry.name === name);
      if (open < 0) {
        problems.push({ line, message: `</${name}> closes nothing` });
        continue;
      }
      for (const unclosed of stack.splice(open).slice(1)) {
        problems.push({
          line: unclosed.line,
          message: `<${unclosed.name}> isn't closed before </${name}> on line ${line}`,
        });
      }
      continue;
    }

    const attrs = attributes(rawAttrs.replace(/\/\s*$/, ''));
    if ('style' in attrs) {
      problems.push({
        line,
        message: `<${name}> has an inline style, which the pages' policy refuses`,
      });
    }
    for (const key of Object.keys(attrs)) {
      if (/^on[a-z]+$/.test(key)) {
        problems.push({
          line,
          message: `<${name}> has an inline ${key} handler, which the pages' policy refuses`,
        });
      }
    }
    for (const key of ['href', 'src']) {
      if (attrs[key] !== undefined) {
        if (/^\s*javascript:/i.test(attrs[key])) {
          problems.push({ line, message: `<${name}> links to javascript:` });
        } else {
          refs.push({ line, tag: name, attr: key, value: attrs[key] });
        }
      }
    }
    if (attrs.id !== undefined) {
      if (ids.has(attrs.id)) problems.push({ line, message: `id "${attrs.id}" is used twice` });
      ids.add(attrs.id);
    }
    if (name === 'img') images.push({ line, attrs });
    if (name === 'style') {
      problems.push({ line, message: "an inline <style>, which the pages' policy refuses" });
    }

    if (RAW_TEXT.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, TAG.lastIndex);
      if (end < 0) {
        problems.push({ line, message: `<${name}> isn't closed` });
        break;
      }
      if (name === 'script' && (attrs.src === undefined || html.slice(TAG.lastIndex, end).trim())) {
        problems.push({ line, message: "an inline script, which the pages' policy refuses" });
      }
      // On past its end tag
      TAG.lastIndex = html.indexOf('>', end) + 1 || html.length;
      continue;
    }
    if (!VOID.has(name) && !whole.endsWith('/>')) stack.push({ name, line });
  }
  for (const unclosed of stack) {
    problems.push({ line: unclosed.line, message: `<${unclosed.name}> isn't closed` });
  }
  return { problems, ids, refs, images };
}

/** The file a link goes to, within the guide, and its #anchor. */
function resolveRef(fromFile, value) {
  const [withoutHash, hash = null] = value.split('#');
  const target = withoutHash.split('?')[0];
  if (!target) return { file: fromFile, anchor: hash };
  let file = path.resolve(path.dirname(fromFile), decodeURIComponent(target));
  if (target.endsWith('/')) file = path.join(file, 'index.html');
  return { file, anchor: hash ? decodeURIComponent(hash) : null, folder: target.endsWith('/') };
}

/**
 * Check every page the build wrote: its tags, and that its local links,
 * pictures, scripts and stylesheets are there, #anchors included.
 *
 * @param {string} outDir
 * @returns {Problem[]}
 */
export function checkSite(outDir) {
  const problems = [];
  const pages = new Map();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith('.html'))
        pages.set(file, readHtml(fs.readFileSync(file, 'utf8')));
    }
  };
  walk(outDir);
  // The app beside the guide ("Open in the editor")
  const appRoot = path.join(path.dirname(outDir), 'index.html');

  for (const [file, page] of pages) {
    const where = `help/${path.relative(outDir, file)}`;
    for (const problem of page.problems) problems.push({ file: where, ...problem });
    for (const image of page.images) {
      const src = image.attrs.src ?? '';
      if (!/^(https?:|data:)/.test(src) && !(image.attrs.width && image.attrs.height)) {
        problems.push({
          file: where,
          line: image.line,
          message: `<img src="${src}"> needs a width and a height, so the page doesn't move as it loads`,
        });
      }
      if (image.attrs.alt === undefined) {
        problems.push({
          file: where,
          line: image.line,
          message: `<img src="${src}"> needs an alt`,
        });
      }
    }
    for (const ref of page.refs) {
      if (/^(https?:|mailto:|data:)/i.test(ref.value)) continue;
      if (/^[a-z][a-z0-9+.-]*:/i.test(ref.value) || ref.value.startsWith('/')) {
        problems.push({
          file: where,
          line: ref.line,
          message: `${ref.attr}="${ref.value}" isn't a relative link (the guide must work wherever the app is served)`,
        });
        continue;
      }
      const target = resolveRef(file, ref.value);
      if (target.file === appRoot) continue;
      if (!target.file.startsWith(outDir + path.sep)) {
        problems.push({
          file: where,
          line: ref.line,
          message: `${ref.attr}="${ref.value}" points outside the guide`,
        });
        continue;
      }
      if (!fs.existsSync(target.file)) {
        problems.push({
          file: where,
          line: ref.line,
          message: `${ref.attr}="${ref.value}" goes nowhere (no ${path.relative(outDir, target.file)})`,
        });
        continue;
      }
      if (target.anchor) {
        const ids = pages.get(target.file)?.ids;
        if (ids && !ids.has(target.anchor)) {
          problems.push({
            file: where,
            line: ref.line,
            message: `${ref.attr}="${ref.value}": that page has no #${target.anchor}`,
          });
        }
      }
    }
  }
  return problems;
}

// ============================================================================
// The sources
// ============================================================================

/**
 * Check what the chapters say: their pictures, links and anchors.
 *
 * @param {import('./build-help.mjs').Chapter[]} chapters
 * @param {Set<string>} shotNames the shots that can take a picture again
 * @param {{ dir: string }[]} sourceDirs
 */
export function checkChapters(chapters, shotNames, sourceDirs) {
  const problems = [];
  const warnings = [];
  const bySlug = new Map(chapters.map((chapter) => [chapter.slug, chapter]));
  const used = new Set();

  for (const chapter of chapters) {
    const where = relative(chapter.file);
    const ids = new Set(chapter.headings.map((h) => h.id));
    for (const image of chapter.images) {
      const at = { file: where, line: image.line };
      if (!image.alt.trim()) {
        problems.push({
          ...at,
          message: `the picture ${image.src} needs a description: ![What it shows](${image.src})`,
        });
      }
      if (!image.file) {
        problems.push({
          ...at,
          message: /^[a-z]+:/i.test(image.src)
            ? `${image.src}: pictures come from img/ (the pages load nothing from elsewhere)`
            : `${image.src}: pictures go in img/ beside the chapter`,
        });
        continue;
      }
      used.add(image.file);
      const name = path.basename(image.file).replace(/\.[a-z]+$/i, '');
      if (!fs.existsSync(image.file)) {
        problems.push({
          ...at,
          message: `${image.src} isn't there${shotNames.has(name) ? ` (take it: pnpm help:shots ${name})` : ''}`,
        });
      } else if (/\.png$/i.test(image.file) && !name.endsWith('@1x') && !shotNames.has(name)) {
        problems.push({
          ...at,
          message: `${image.src} has no shot in shots.mjs, so it can't be taken again when the editor changes`,
        });
      }
    }
    for (const link of chapter.links) {
      const at = { file: where, line: link.line };
      if (link.kind === 'anchor' && !ids.has(link.anchor)) {
        problems.push({
          ...at,
          message: `#${link.anchor}: this chapter has no heading with that id`,
        });
      } else if (link.kind === 'chapter') {
        const target = bySlug.get(link.page);
        if (!target) {
          problems.push({ ...at, message: `${link.href}: there's no chapter called ${link.page}` });
        } else if (link.anchor && !target.headings.some((h) => h.id === link.anchor)) {
          problems.push({
            ...at,
            message: `${link.href}: ${link.page} has no heading with the id ${link.anchor}`,
          });
        }
      } else if (link.kind === 'other') {
        problems.push({
          ...at,
          message: `${link.href}: link to a chapter as its file (name.md#part), or to a web address`,
        });
      }
    }
  }

  // Pictures nothing shows (a warning: a writer may take them before writing)
  for (const source of sourceDirs) {
    const dir = path.join(source.dir, 'img');
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (!name.startsWith('.') && fs.statSync(file).isFile() && !used.has(file)) {
        warnings.push({ file: relative(file), line: 0, message: 'no chapter shows this picture' });
      }
    }
  }
  return { problems, warnings };
}

const OPEN_HELP = /\b(?:openHelp|helpUrl)\(\s*(['"`])([^'"`]*)\1\s*(?:,\s*(['"`])([^'"`]*)\3)?/g;
const DATA_HELP = /data-help=(?:"([^"]*)"|'([^']*)'|\{\s*(['"`])([^'"`]*)\3\s*\})/g;

/**
 * The pages and parts the editor asks for — openHelp('page', 'anchor'),
 * helpUrl(…) and data-help="page#anchor" — that the guide doesn't have.
 *
 * @param {import('./build-help.mjs').Chapter[]} chapters
 * @param {string} appSrc
 */
export function checkAppLinks(chapters, appSrc) {
  const problems = [];
  const bySlug = new Map(chapters.map((chapter) => [chapter.slug, chapter]));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'test') walk(file);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) continue;
      // Comments name these too, as examples: they're blanked (keeping the lines)
      const source = fs
        .readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
        .replace(
          /(^|[^:])\/\/.*$/gm,
          (comment, before) => before + ' '.repeat(comment.length - before.length)
        );
      const asks = [];
      for (const match of source.matchAll(OPEN_HELP)) {
        asks.push({ index: match.index, page: match[2], anchor: match[4] ?? null });
      }
      for (const match of source.matchAll(DATA_HELP)) {
        const [page, anchor = null] = (match[1] ?? match[2] ?? match[4] ?? '').split('#');
        asks.push({ index: match.index, page, anchor: anchor || null });
      }
      for (const ask of asks) {
        if (ask.page === 'index' && !ask.anchor) continue;
        const line = source.slice(0, ask.index).split('\n').length;
        const where = { file: relative(file), line };
        const chapter = bySlug.get(ask.page);
        if (!chapter) {
          problems.push({
            ...where,
            message: `asks the guide for "${ask.page}", which isn't a chapter`,
          });
        } else if (ask.anchor && !chapter.headings.some((h) => h.id === ask.anchor)) {
          problems.push({
            ...where,
            message: `asks for ${ask.page}#${ask.anchor}, but that chapter has no heading with that id`,
          });
        }
      }
    }
  };
  if (fs.existsSync(appSrc)) walk(appSrc);
  return problems;
}

/**
 * Everything: the sources, the editor's links into the guide, and a build of
 * it (into a folder of its own, not the app's).
 *
 * @param {{ sourceDirs?: typeof SOURCE_DIRS, appSrc?: string }} [options]
 * @returns {Promise<{ problems: Problem[], warnings: Problem[], chapters: import('./build-help.mjs').Chapter[], pictures: number }>}
 */
export async function checkHelp({ sourceDirs = SOURCE_DIRS, appSrc = APP_SRC } = {}) {
  const loaded = loadChapters({ sourceDirs });
  const { chapters, problems: renderProblems } = renderChapters(loaded.chapters);
  const { shots, problems: shotProblems } = await loadShotLists(sourceDirs);
  const shotNames = new Set(shots.map((shot) => shot.name));
  const checked = checkChapters(chapters, shotNames, sourceDirs);
  const problems = [
    ...loaded.problems,
    ...renderProblems,
    ...shotProblems.map((message) => ({ file: 'shots.mjs', line: 0, message })),
    ...checked.problems,
    ...checkAppLinks(chapters, appSrc),
  ];

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'quar-help-check-'));
  try {
    const outDir = path.join(scratch, 'public', 'help');
    const built = buildHelp({ outDir, sourceDirs });
    // Clashes found while building (pictures with the same name) not already reported
    for (const problem of built.problems) {
      if (!problems.some((p) => p.file === problem.file && p.message === problem.message)) {
        problems.push(problem);
      }
    }
    problems.push(...checkSite(outDir));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const pictures = new Set(chapters.flatMap((chapter) => chapter.images.map((image) => image.src)));
  return { problems, warnings: checked.warnings, chapters, pictures: pictures.size };
}

// Run from the command line: `pnpm help:check`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { problems, warnings, chapters, pictures } = await checkHelp();
  for (const warning of warnings) console.warn(`warning: ${formatProblem(warning)}`);
  for (const problem of problems) console.error(formatProblem(problem));
  const links = chapters.reduce((sum, chapter) => sum + chapter.links.length, 0);
  console.log(
    problems.length
      ? `\nhelp: ${problems.length} problem${problems.length === 1 ? '' : 's'}`
      : `help: all good — ${chapters.length} chapter${chapters.length === 1 ? '' : 's'}, ${pictures} picture${pictures === 1 ? '' : 's'}, ${links} link${links === 1 ? '' : 's'}`
  );
  process.exitCode = problems.length ? 1 : 0;
}
