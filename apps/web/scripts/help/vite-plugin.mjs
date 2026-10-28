/**
 * The user guide in Vite: built before `vite build` copies the public folder
 * (so dist/help/ is always current), and before the dev server starts —
 * where it's rebuilt when a chapter, a picture or the theme changes, and
 * served at /help/ with folders opening their index.html, as nginx does.
 */

import fs from 'node:fs';
import path from 'node:path';
import { buildHelp, formatProblem } from './build-help.mjs';
import { OUT_DIR, SOURCE_DIRS, THEME_DIR } from './paths.mjs';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * What a request under /help/ is answered with: a file in the guide, a
 * redirect adding the slash a folder needs (its pages' links are relative),
 * or nothing (not the guide's).
 *
 * @param {string} url
 * @param {string} outDir
 * @returns {{ file: string } | { redirect: string } | { missing: true } | null}
 */
export function resolveHelpRequest(url, outDir = OUT_DIR) {
  const [pathname, query = ''] = url.split('?');
  if (pathname !== '/help' && !pathname.startsWith('/help/')) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { missing: true };
  }
  const file = path.resolve(outDir, `.${decoded.slice('/help'.length)}`);
  if (file !== outDir && !file.startsWith(outDir + path.sep)) return { missing: true };
  let stat = null;
  try {
    stat = fs.statSync(file);
  } catch {
    return { missing: true };
  }
  if (stat.isDirectory()) {
    if (!pathname.endsWith('/')) return { redirect: `${pathname}/${query ? `?${query}` : ''}` };
    const index = path.join(file, 'index.html');
    return fs.existsSync(index) ? { file: index } : { missing: true };
  }
  return { file };
}

function build(log) {
  try {
    const { chapters, problems } = buildHelp();
    for (const problem of problems) log.warn(`help: ${formatProblem(problem)}`);
    log.info(
      `help: ${chapters.length} chapter${chapters.length === 1 ? '' : 's'} built into public/help/`
    );
  } catch (error) {
    log.error(
      `help: the guide could not be built: ${error instanceof Error ? error.message : error}`
    );
  }
}

/** @returns {import('vite').Plugin} */
export function helpPages() {
  let command = 'serve';
  // Vitest runs Vite too: the tests build the guide themselves, into folders of their own
  const disabled = Boolean(process.env.VITEST);
  return {
    name: 'quar-help-pages',
    configResolved(config) {
      command = config.command;
    },
    buildStart() {
      if (disabled || command !== 'build') return;
      build({ info: console.log, warn: console.warn, error: console.error });
    },
    configureServer(server) {
      if (disabled) return;
      const log = server.config.logger;
      build(log);

      // Rebuilt (once per burst of changes) when its sources change
      const watched = [...SOURCE_DIRS.map((source) => source.dir), THEME_DIR];
      server.watcher.add(watched);
      let timer = null;
      const onChange = (file) => {
        if (!watched.some((dir) => file.startsWith(dir + path.sep))) return;
        clearTimeout(timer);
        timer = setTimeout(() => build(log), 150);
      };
      server.watcher.on('add', onChange);
      server.watcher.on('change', onChange);
      server.watcher.on('unlink', onChange);

      server.middlewares.use((req, res, next) => {
        const found = resolveHelpRequest(req.url ?? '');
        if (!found) return next();
        if ('redirect' in found) {
          res.statusCode = 301;
          res.setHeader('Location', found.redirect);
          res.end();
          return;
        }
        if ('missing' in found) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not in the user guide');
          return;
        }
        res.setHeader(
          'Content-Type',
          TYPES[path.extname(found.file)] ?? 'application/octet-stream'
        );
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(found.file).pipe(res);
      });
    },
  };
}
