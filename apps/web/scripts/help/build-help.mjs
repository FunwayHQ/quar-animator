/**
 * Builds the user guide: the Markdown chapters in docs/help/ (and the
 * cloud edition's in docs/help-cloud/, where that folder exists) become the
 * static pages served at /help/ — a contents page, a page per chapter, their
 * pictures, the search index, and the stylesheet, script and fonts.
 *
 * Runs before `vite` and `vite build` (the helpPages plugin in
 * vite.config.ts), or by hand: `pnpm help:build`.
 *
 * Problems in the sources (a chapter without its title, a missing picture)
 * are reported but don't stop the build; `pnpm help:check` fails on them.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from './frontmatter.mjs';
import { createMarkdown, searchSections } from './markdown.mjs';
import { chapterPage, indexPage } from './pages.mjs';
import { FAVICON, OUT_DIR, REPO_ROOT, SOURCE_DIRS, SOURCE_URL, THEME_DIR } from './paths.mjs';

/** Files in a chapter folder that aren't chapters. */
const NOT_CHAPTERS = /^(readme|contributing)\.md$/i;
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const WORDS_PER_MINUTE = 200;

/**
 * @typedef {{ file: string, line: number, message: string }} Problem
 *
 * @typedef {object} Chapter
 * @property {string} slug          its page: /help/<slug>/
 * @property {string} file          the Markdown file
 * @property {string} dir           the folder it's in (its pictures are in dir/img/)
 * @property {'free' | 'cloud'} edition
 * @property {string} title
 * @property {number} order
 * @property {string} summary
 * @property {number} number        its place in the guide, from 1
 * @property {number} minutes       reading time
 * @property {string} html          the rendered body
 * @property {{ level: number, id: string, text: string, line: number }[]} headings
 * @property {{ kind: string, href: string, page?: string, anchor?: string | null, line: number }[]} links
 * @property {{ src: string, file: string | null, alt: string, line: number }[]} images
 * @property {{ id: string, title: string, text: string }[]} sections
 * @property {string | null} sourceUrl
 */

/** @param {string} file */
const relative = (file) => path.relative(REPO_ROOT, file) || file;

/**
 * A picture's size as the page shows it. Pictures in img/ are taken at
 * twice the size they're shown (DPR 2) unless their name ends in @1x.
 *
 * @param {string} file
 * @returns {{ width: number, height: number } | null}
 */
export function imageSize(file) {
  let bytes;
  try {
    bytes = fs.readFileSync(file);
  } catch {
    return null;
  }
  const scale = /@1x\.[a-z]+$/i.test(file) ? 1 : 2;
  const shown = (w, h) => ({ width: Math.round(w / scale), height: Math.round(h / scale) });
  // PNG: the IHDR chunk follows the 8-byte signature
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return shown(bytes.readUInt32BE(16), bytes.readUInt32BE(20));
  }
  if (bytes.length >= 10 && bytes.toString('ascii', 0, 4) === 'GIF8') {
    return shown(bytes.readUInt16LE(6), bytes.readUInt16LE(8));
  }
  if (/\.svg$/i.test(file)) {
    const svg = bytes.toString('utf8', 0, Math.min(bytes.length, 4096));
    const tag = /<svg\b[^>]*>/i.exec(svg)?.[0] ?? '';
    const attr = (name) => Number(new RegExp(`\\b${name}="([\\d.]+)(?:px)?"`).exec(tag)?.[1]);
    let width = attr('width');
    let height = attr('height');
    const viewBox = /\bviewBox="[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)"/.exec(tag);
    if (!(width > 0 && height > 0) && viewBox) {
      width = Number(viewBox[1]);
      height = Number(viewBox[2]);
    }
    return width > 0 && height > 0
      ? { width: Math.round(width), height: Math.round(height) }
      : null;
  }
  return null;
}

/**
 * Read every chapter's source and frontmatter.
 *
 * @param {{ sourceDirs?: typeof SOURCE_DIRS }} [options]
 * @returns {{ chapters: Omit<Chapter, 'number' | 'html' | 'headings' | 'links' | 'images' | 'sections'>[] & { body: string, bodyLine: number }[], problems: Problem[] }}
 */
export function loadChapters({ sourceDirs = SOURCE_DIRS } = {}) {
  /** @type {Problem[]} */
  const problems = [];
  const chapters = [];
  const seen = new Map();
  for (const source of sourceDirs) {
    if (!fs.existsSync(source.dir)) {
      if (!source.optional) {
        problems.push({
          file: relative(source.dir),
          line: 0,
          message: 'the chapter folder is missing',
        });
      }
      continue;
    }
    const files = fs
      .readdirSync(source.dir)
      .filter((name) => name.endsWith('.md') && !NOT_CHAPTERS.test(name) && !name.startsWith('_'))
      .sort();
    for (const name of files) {
      const file = path.join(source.dir, name);
      const slug = name.slice(0, -3);
      const where = relative(file);
      if (!SLUG.test(slug)) {
        problems.push({
          file: where,
          line: 0,
          message:
            'chapter files are named in lowercase letters, digits and dashes (it becomes the page’s address)',
        });
        continue;
      }
      if (seen.has(slug)) {
        problems.push({
          file: where,
          line: 0,
          message: `another chapter is also called "${slug}": ${seen.get(slug)}`,
        });
        continue;
      }
      seen.set(slug, where);
      const {
        data,
        body,
        bodyLine,
        problems: found,
      } = parseFrontmatter(fs.readFileSync(file, 'utf8'));
      for (const message of found) problems.push({ file: where, line: 1, message });
      chapters.push({
        slug,
        file,
        dir: source.dir,
        edition: source.edition,
        title: String(data.title ?? slug),
        order: typeof data.order === 'number' ? data.order : Number.MAX_SAFE_INTEGER,
        summary: String(data.summary ?? ''),
        sourceUrl: source.edition === 'free' ? `${SOURCE_URL}${name}` : null,
        body,
        bodyLine,
      });
    }
  }
  chapters.sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug));
  return { chapters, problems };
}

/**
 * Render the chapters' Markdown, recording what each links to and shows.
 *
 * @param {ReturnType<typeof loadChapters>['chapters']} loaded
 * @returns {{ chapters: Chapter[], problems: Problem[] }}
 */
export function renderChapters(loaded) {
  const md = createMarkdown();
  /** @type {Problem[]} */
  const problems = [];
  const chapters = loaded.map((chapter, index) => {
    const where = relative(chapter.file);
    const images = [];
    const env = {
      root: '../',
      headings: [],
      links: [],
      problems: [],
      ids: new Set(),
      onImage(src, { alt, line }) {
        const at = chapter.bodyLine + line + 1;
        if (/^[a-z]+:/i.test(src) && !src.startsWith('data:')) {
          images.push({ src, file: null, alt, line: at });
          return { src };
        }
        const clean = src.replace(/^\.\//, '');
        const file = clean.startsWith('img/') ? path.join(chapter.dir, clean) : null;
        images.push({ src, file, alt, line: at });
        if (!file) return { src };
        return { src: `../${clean}`, ...(imageSize(file) ?? {}) };
      },
    };
    const tokens = md.parse(chapter.body, env);
    const html = md.renderer.render(tokens, md.options, env);
    for (const problem of env.problems) {
      problems.push({
        file: where,
        line: chapter.bodyLine + problem.line + 1,
        message: problem.message,
      });
    }
    const words = chapter.body
      .replace(/[#>*_`[\]()!|-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean).length;
    const { body: _body, bodyLine, ...rest } = chapter;
    return {
      ...rest,
      number: index + 1,
      minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)),
      html,
      headings: env.headings.map((h) => ({ ...h, line: bodyLine + h.line + 1 })),
      links: env.links.map((l) => ({ ...l, line: bodyLine + l.line + 1 })),
      images,
      sections: searchSections(tokens, chapter.title),
    };
  });
  return { chapters, problems };
}

/** Copy a folder's files (and its folders') into another. */
function copyDir(from, to, onCopy) {
  if (!fs.existsSync(from)) return;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyDir(source, target, onCopy);
    } else {
      fs.mkdirSync(to, { recursive: true });
      onCopy?.(source, target);
      fs.copyFileSync(source, target);
    }
  }
}

/** What the search box looks through: every chapter's parts and their words. */
export function searchIndex(chapters) {
  return chapters.map((chapter) => ({
    slug: chapter.slug,
    title: chapter.title,
    summary: chapter.summary,
    edition: chapter.edition,
    sections: chapter.sections,
  }));
}

/**
 * Build the guide.
 *
 * @param {{ outDir?: string, sourceDirs?: typeof SOURCE_DIRS }} [options]
 * @returns {{ chapters: Chapter[], problems: Problem[], outDir: string }}
 */
export function buildHelp({ outDir = OUT_DIR, sourceDirs = SOURCE_DIRS } = {}) {
  const loaded = loadChapters({ sourceDirs });
  const rendered = renderChapters(loaded.chapters);
  const problems = [...loaded.problems, ...rendered.problems];
  const { chapters } = rendered;

  // Generated, so it's rebuilt from nothing (only ever a folder named help, or a test's)
  if (path.basename(outDir) !== 'help') {
    throw new Error(`Refusing to clear ${outDir}: the guide is built into a folder named help`);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const write = (name, content) => {
    const file = path.join(outDir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  write('index.html', indexPage({ chapters }));
  chapters.forEach((chapter, i) => {
    write(
      `${chapter.slug}/index.html`,
      chapterPage({
        chapter,
        html: chapter.html,
        headings: chapter.headings,
        prev: chapters[i - 1] ?? null,
        next: chapters[i + 1] ?? null,
      })
    );
  });
  write('search-index.js', `self.QUAR_HELP_INDEX = ${JSON.stringify(searchIndex(chapters))};\n`);

  copyDir(THEME_DIR, path.join(outDir, 'assets'));
  fs.copyFileSync(FAVICON, path.join(outDir, 'assets/mark.svg'));

  // Every folder's pictures, side by side in help/img/
  const copied = new Map();
  for (const source of sourceDirs) {
    copyDir(path.join(source.dir, 'img'), path.join(outDir, 'img'), (from, to) => {
      const name = path.relative(path.join(outDir, 'img'), to);
      if (copied.has(name)) {
        problems.push({
          file: relative(from),
          line: 0,
          message: `has the same name as ${copied.get(name)}: one would replace the other in help/img/`,
        });
      }
      copied.set(name, relative(from));
    });
  }

  return { chapters, problems, outDir };
}

/** @param {Problem} problem */
export function formatProblem(problem) {
  return `${problem.file}${problem.line ? `:${problem.line}` : ''}: ${problem.message}`;
}

// Run from the command line: `node build-help.mjs [--out <folder>]`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const outFlag = process.argv.indexOf('--out');
  const outDir = outFlag > 0 ? path.resolve(process.argv[outFlag + 1]) : OUT_DIR;
  const { chapters, problems } = buildHelp({ outDir });
  for (const problem of problems) console.warn(`help: ${formatProblem(problem)}`);
  console.log(
    `help: ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} → ${relative(outDir)}${
      problems.length
        ? ` (${problems.length} problem${problems.length === 1 ? '' : 's'}: run pnpm help:check)`
        : ''
    }`
  );
}
