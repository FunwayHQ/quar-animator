/**
 * Where the user guide's pieces live.
 *
 * Chapters are Markdown in docs/help/ (the free editor's, in this public
 * repo) and, optionally, docs/help-cloud/ (the cloud edition's, which only
 * the private fork has). Both are built into one guide under
 * apps/web/public/help/, which is generated and git-ignored.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** The web app (apps/web). */
export const WEB_ROOT = path.resolve(here, '../..');

/** The repository's root. */
export const REPO_ROOT = path.resolve(WEB_ROOT, '../..');

/**
 * The chapter folders, in the order they're read. `edition` labels the
 * chapters a folder holds; `optional` folders may be absent.
 */
export const SOURCE_DIRS = [
  { dir: path.join(REPO_ROOT, 'docs/help'), edition: 'free', optional: false },
  { dir: path.join(REPO_ROOT, 'docs/help-cloud'), edition: 'cloud', optional: true },
];

/** The generated site, served at /help/. */
export const OUT_DIR = path.join(WEB_ROOT, 'public/help');

/** The stylesheet, script and fonts every page uses (copied to help/assets/). */
export const THEME_DIR = path.join(here, 'theme');

/** The app's mark, shown in each page's masthead. */
export const FAVICON = path.join(WEB_ROOT, 'public/favicon.svg');

/** The app's source, searched for openHelp() calls the guide must answer. */
export const APP_SRC = path.join(WEB_ROOT, 'src');

/** Where a free chapter's source can be read (and corrected) on GitHub. */
export const SOURCE_URL = 'https://github.com/FunwayHQ/quar-animator/blob/main/docs/help/';
