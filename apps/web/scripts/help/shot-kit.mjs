/**
 * The screenshot harness's parts that need no browser: the shot lists, what
 * a shot may say, the command line, capture regions, and the numbered
 * markers drawn over a screenshot (run in the page).
 *
 * A shot list is `shots.mjs` beside the chapters (docs/help/shots.mjs, and
 * docs/help-cloud/shots.mjs in the fork), its default export an array of
 * shots; each is taken into that folder's img/<name>.png. See
 * docs/help/README.md for how to write one.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * @typedef {object} Shot
 * @property {string} name        the picture's file name (img/<name>.png)
 * @property {string} [about]     what it shows (for --list)
 * @property {{ width: number, height: number }} [viewport]  the window, in CSS pixels
 * @property {number} [scale]     device pixels per CSS pixel (2)
 * @property {'dark' | 'light'} [theme]
 * @property {Record<string, string>} [storage]  more localStorage, set before the app starts
 * @property {string} [date]      what the clock says (for dates shown on the page)
 * @property {object[]} steps     what to do, in order: { open }, { click }, { press }…
 * @property {{ target: string, label: string | number, at?: string, outline?: boolean, dx?: number, dy?: number }[]} [markers]
 * @property {'viewport' | { selector?: string, selectors?: string[], padding?: number | object, clip?: object }} [capture]
 * @property {number} [settle]    milliseconds to wait before the picture
 * @property {boolean} [keepPointer]  leave the pointer where the steps left it (hovering)
 */

export const DEFAULTS = {
  viewport: { width: 1280, height: 800 },
  /** Device pixels per CSS pixel: the guide shows pictures at half their size. */
  scale: 2,
  theme: 'dark',
  /** Milliseconds to let the page settle before the picture is taken. */
  settle: 400,
};

/** What a step can do (one of these keys per step, with an optional `note`). */
export const STEP_ACTIONS = [
  'goto',
  'open',
  'seed',
  'click',
  'dblclick',
  'rightClick',
  'hover',
  'press',
  'type',
  'fill',
  'waitFor',
  'wait',
  'page',
  'layer',
  'drag',
  'evaluate',
  'run',
];

const SHOT_KEYS = new Set([
  'name',
  'about',
  'viewport',
  'scale',
  'theme',
  'storage',
  'date',
  'steps',
  'markers',
  'capture',
  'settle',
  'keepPointer',
]);

const MARKER_PLACES = new Set([
  'center',
  'top',
  'bottom',
  'left',
  'right',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

const NAME = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Everything wrong with a shot list, as messages naming the shot.
 *
 * @param {unknown[]} shots
 * @param {string} origin where the list is, for the messages
 * @returns {string[]}
 */
export function validateShots(shots, origin = 'shots.mjs') {
  const problems = [];
  if (!Array.isArray(shots)) return [`${origin}: its default export must be an array of shots`];
  const names = new Set();
  shots.forEach((shot, index) => {
    const label = `${origin}: shot ${typeof shot?.name === 'string' ? `"${shot.name}"` : `#${index + 1}`}`;
    if (!shot || typeof shot !== 'object') {
      problems.push(`${label} isn't an object`);
      return;
    }
    if (typeof shot.name !== 'string' || !NAME.test(shot.name)) {
      problems.push(
        `${label} needs a name in lowercase letters, digits and dashes (it's the file name)`
      );
    } else if (names.has(shot.name)) {
      problems.push(`${label} is named twice`);
    } else {
      names.add(shot.name);
    }
    for (const key of Object.keys(shot)) {
      if (!SHOT_KEYS.has(key)) problems.push(`${label} has an unknown field "${key}"`);
    }
    if (shot.theme !== undefined && shot.theme !== 'dark' && shot.theme !== 'light') {
      problems.push(`${label}: theme is "dark" or "light"`);
    }
    if (shot.viewport !== undefined) {
      const { width, height } = shot.viewport ?? {};
      if (!(width >= 800 && height >= 500)) {
        problems.push(
          `${label}: viewport needs a width of 800 or more and a height of 500 or more (the editor needs a desktop-sized window)`
        );
      }
    }
    if (!Array.isArray(shot.steps) || shot.steps.length === 0) {
      problems.push(`${label} needs steps (at least an { open: … })`);
    } else {
      shot.steps.forEach((step, i) => {
        const actions = Object.keys(step ?? {}).filter((key) => key !== 'note');
        if (actions.length !== 1 || !STEP_ACTIONS.includes(actions[0])) {
          problems.push(
            `${label}, step ${i + 1}: one action per step, from ${STEP_ACTIONS.join(', ')} (got ${actions.join(', ') || 'none'})`
          );
        } else if (actions[0] === 'run' && typeof step.run !== 'function') {
          problems.push(`${label}, step ${i + 1}: run is a function (page, kit) => …`);
        }
      });
    }
    for (const [i, marker] of (shot.markers ?? []).entries()) {
      if (!marker?.target || marker.label === undefined) {
        problems.push(`${label}, marker ${i + 1}: needs a target (a selector) and a label`);
      }
      if (marker?.at !== undefined && !MARKER_PLACES.has(marker.at)) {
        problems.push(`${label}, marker ${i + 1}: at is one of ${[...MARKER_PLACES].join(', ')}`);
      }
    }
    const capture = shot.capture;
    if (
      capture !== undefined &&
      capture !== 'viewport' &&
      !(capture && (capture.selector || capture.selectors || capture.clip))
    ) {
      problems.push(
        `${label}: capture is "viewport", { selector }, { selectors: […] } or { clip }`
      );
    }
  });
  return problems;
}

/**
 * Read the shot lists beside the chapters: each folder's shots.mjs, then the
 * lists in its shots/ folder (a chapter's own, `shots/<chapter>.mjs`), by
 * name; a file whose name starts with `_` is a helper, not a list.
 *
 * @param {{ dir: string, optional?: boolean }[]} sourceDirs
 * @returns {Promise<{ shots: (object & { name: string, outDir: string, list: string })[], problems: string[] }>}
 */
export async function loadShotLists(sourceDirs) {
  const shots = [];
  const problems = [];
  const names = new Map();
  for (const source of sourceDirs) {
    for (const list of shotListFiles(source.dir)) {
      const loaded = (await import(pathToFileURL(list).href)).default;
      const where = path.relative(process.cwd(), list) || list;
      problems.push(...validateShots(loaded, where));
      if (!Array.isArray(loaded)) continue;
      for (const shot of loaded) {
        if (names.has(shot?.name)) {
          problems.push(`${where}: shot "${shot.name}" is also in ${names.get(shot.name)}`);
          continue;
        }
        names.set(shot?.name, where);
        shots.push({ ...shot, outDir: path.join(source.dir, 'img'), list: where });
      }
    }
  }
  return { shots, problems };
}

/**
 * A folder's shot lists: shots.mjs, then shots/*.mjs by name (not _helpers).
 *
 * @param {string} dir
 */
function shotListFiles(dir) {
  const lists = [path.join(dir, 'shots.mjs')].filter((file) => fs.existsSync(file));
  const own = path.join(dir, 'shots');
  if (fs.existsSync(own)) {
    for (const file of fs.readdirSync(own).sort()) {
      if (file.endsWith('.mjs') && !file.startsWith('_')) lists.push(path.join(own, file));
    }
  }
  return lists;
}

/**
 * The command line: shot names, and --url <running server>, --list, --headed.
 *
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  const options = { names: [], url: null, list: false, headed: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') options.url = argv[++i] ?? null;
    else if (arg.startsWith('--url=')) options.url = arg.slice('--url='.length);
    else if (arg === '--list') options.list = true;
    else if (arg === '--headed') options.headed = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--') continue;
    else options.names.push(arg);
  }
  return options;
}

/**
 * The shots named on the command line (all of them when none are), and the
 * names that match none. A name ending in * matches every shot it begins.
 */
export function selectShots(shots, names) {
  if (names.length === 0) return { selected: shots, unknown: [] };
  const unknown = [];
  const chosen = new Set();
  for (const name of names) {
    const matches = shots.filter((shot) =>
      name.endsWith('*') ? shot.name.startsWith(name.slice(0, -1)) : shot.name === name
    );
    if (matches.length === 0) unknown.push(name);
    matches.forEach((shot) => chosen.add(shot));
  }
  return { selected: shots.filter((shot) => chosen.has(shot)), unknown };
}

/**
 * The region around some boxes, with room around them, kept inside the
 * window. Whole CSS pixels, so the picture's edges are crisp.
 *
 * @param {{ x: number, y: number, width: number, height: number }[]} boxes
 * @param {number | { top?: number, right?: number, bottom?: number, left?: number }} padding
 * @param {{ width: number, height: number }} viewport
 */
export function captureClip(boxes, padding, viewport) {
  if (boxes.length === 0) throw new Error('Nothing to capture: no element matched');
  const pad =
    typeof padding === 'number'
      ? { top: padding, right: padding, bottom: padding, left: padding }
      : { top: 0, right: 0, bottom: 0, left: 0, ...padding };
  const left = Math.min(...boxes.map((b) => b.x)) - pad.left;
  const top = Math.min(...boxes.map((b) => b.y)) - pad.top;
  const right = Math.max(...boxes.map((b) => b.x + b.width)) + pad.right;
  const bottom = Math.max(...boxes.map((b) => b.y + b.height)) + pad.bottom;
  const x = Math.max(0, Math.floor(left));
  const y = Math.max(0, Math.floor(top));
  return {
    x,
    y,
    width: Math.min(viewport.width, Math.ceil(right)) - x,
    height: Math.min(viewport.height, Math.ceil(bottom)) - y,
  };
}

/**
 * Show number fields as text, just before a picture is taken (runs in the
 * browser): Chrome writes a number field's value in the computer's own
 * format, 0,42 on a Mac set to many languages, and on a Mac nothing passed to
 * the browser changes that. As text, a field shows its value as the editor
 * holds it, 0.42. The app styles number fields only to hide their spinners,
 * which text fields don't have, so they look the same.
 *
 * @returns {number} how many fields were changed
 */
export function numbersInEnglish() {
  const fields = document.querySelectorAll('input[type="number"]');
  for (const field of fields) field.setAttribute('type', 'text');
  return fields.length;
}

/**
 * Make the page see a Windows computer (an init script, run in the browser
 * before the editor's own): the menus and the guide print shortcuts as the
 * computer's keyboard has them, ⌘ and Cmd on a Mac, and the pictures are
 * taken on one. Seen as Windows, every picture shows Ctrl and Alt, as the
 * guide's text does where it can't follow the reader's computer.
 */
export function keysAsOnWindows() {
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => ({ platform: 'Windows', mobile: false, brands: [] }),
    configurable: true,
  });
}

/**
 * Draw numbered markers over the page (runs in the browser, so it uses only
 * what's passed in): a violet badge at each target, and an outline round it
 * when asked. The guide's text names what each number points at, so the
 * pictures hold no words to translate.
 *
 * @param {{ target: string, label: string | number, at?: string, outline?: boolean, dx?: number, dy?: number }[]} markers
 * @returns {string[]} the targets that matched nothing
 */
export function drawMarkers(markers) {
  const missing = [];
  const layer = document.createElement('div');
  layer.setAttribute('data-help-markers', '');
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  const size = 26;
  const inset = 10;
  for (const marker of markers) {
    const element = document.querySelector(marker.target);
    if (!element) {
      missing.push(marker.target);
      continue;
    }
    const box = element.getBoundingClientRect();
    if (marker.outline) {
      const outline = document.createElement('div');
      Object.assign(outline.style, {
        position: 'absolute',
        left: `${box.left + 2}px`,
        top: `${box.top + 2}px`,
        width: `${box.width - 4}px`,
        height: `${box.height - 4}px`,
        border: '2px solid #A855F7',
        borderRadius: '8px',
        boxShadow: '0 0 0 4px rgba(168, 85, 247, 0.22)',
      });
      layer.appendChild(outline);
    }
    const at = marker.at ?? 'center';
    const h = at.includes('left') ? 'left' : at.includes('right') ? 'right' : 'center';
    const v = at.startsWith('top') ? 'top' : at.startsWith('bottom') ? 'bottom' : 'center';
    const x =
      h === 'left'
        ? box.left + inset
        : h === 'right'
          ? box.right - inset - size
          : box.left + box.width / 2 - size / 2;
    const y =
      v === 'top'
        ? box.top + inset
        : v === 'bottom'
          ? box.bottom - inset - size
          : box.top + box.height / 2 - size / 2;
    const badge = document.createElement('div');
    badge.textContent = String(marker.label);
    Object.assign(badge.style, {
      position: 'absolute',
      left: `${Math.round(x + (marker.dx ?? 0))}px`,
      top: `${Math.round(y + (marker.dy ?? 0))}px`,
      width: `${size}px`,
      height: `${size}px`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
      background: '#A855F7',
      color: '#fff',
      font: "600 13px/1 'DM Sans', system-ui, sans-serif",
      boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.92), 0 3px 10px rgba(0, 0, 0, 0.45)',
    });
    layer.appendChild(badge);
  }
  document.body.appendChild(layer);
  return missing;
}
