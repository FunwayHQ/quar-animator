/**
 * The screenshot harness's parts that need no browser
 * (apps/web/scripts/help/shot-kit.mjs): the shot lists, the command line,
 * capture regions and the numbered markers.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureClip,
  drawMarkers,
  loadShotLists,
  parseArgs,
  selectShots,
  validateShots,
} from '../../scripts/help/shot-kit.mjs';
import { WEB_ROOT } from '../../scripts/help/paths.mjs';

const shot = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  steps: [{ open: 'projects' }],
  ...extra,
});

describe('shot lists', () => {
  it('accepts shots that say what to open, do, mark and capture', () => {
    expect(
      validateShots([
        shot('projects-page', { date: '2026-10-28T10:00:00Z' }),
        shot('editor-layout', {
          theme: 'light',
          viewport: { width: 1280, height: 800 },
          steps: [{ open: 'tutorial-draw-and-animate' }, { press: 'Control+0', note: 'fit' }],
          markers: [{ target: '[data-testid="page-tabs"]', label: 1, at: 'top-right' }],
          capture: { selectors: ['a', 'b'], padding: 8 },
        }),
        shot('help', { steps: [{ open: 'new' }, { run: () => undefined }], capture: 'viewport' }),
      ])
    ).toEqual([]);
  });

  it('says what’s wrong with a shot, and which', () => {
    const problems = validateShots(
      [
        shot('Bad Name'),
        shot('twice'),
        shot('twice'),
        { name: 'no-steps', steps: [] },
        shot('two-actions', { steps: [{ click: 'a', press: 'b' }] }),
        shot('unknown-action', { steps: [{ tap: 'a' }] }),
        shot('run-not-function', { steps: [{ run: 'nope' }] }),
        shot('small', { viewport: { width: 390, height: 844 } }),
        shot('theme', { theme: 'sepia' }),
        shot('marker', { markers: [{ label: 1 }, { target: 'a', label: 2, at: 'middle' }] }),
        shot('capture', { capture: { padding: 4 } }),
        shot('extra', { colour: 'red' }),
      ],
      'docs/help/shots.mjs'
    );
    const expected = [
      'shot "Bad Name" needs a name in lowercase',
      'shot "twice" is named twice',
      'shot "no-steps" needs steps',
      'shot "two-actions", step 1: one action per step',
      'shot "unknown-action", step 1: one action per step',
      'shot "run-not-function", step 1: run is a function',
      'shot "small": viewport needs a width of 800 or more',
      'shot "theme": theme is "dark" or "light"',
      'shot "marker", marker 1: needs a target',
      'shot "marker", marker 2: at is one of',
      'shot "capture": capture is "viewport"',
      'shot "extra" has an unknown field "colour"',
    ];
    for (const message of expected) {
      expect(problems).toEqual(expect.arrayContaining([expect.stringContaining(message)]));
    }
    expect(problems.every((p) => p.startsWith('docs/help/shots.mjs: '))).toBe(true);
    expect(validateShots({} as unknown as unknown[])).toEqual([
      'shots.mjs: its default export must be an array of shots',
    ]);
  });
});

describe('loading the shot lists', () => {
  const dirs: string[] = [];
  afterEach(() => {
    dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });
  const folder = (shots: string) => {
    // Inside the workspace: the test runner loads modules only from there
    const dir = fs.mkdtempSync(path.join(WEB_ROOT, '.help-test-'));
    dirs.push(dir);
    if (shots) fs.writeFileSync(path.join(dir, 'shots.mjs'), `export default ${shots};\n`);
    return dir;
  };

  it('reads each folder’s list, each shot going into that folder’s img/', async () => {
    const free = folder(`[{ name: 'one', steps: [{ open: 'projects' }] }]`);
    const cloud = folder(`[{ name: 'two', steps: [{ open: 'new' }] }]`);
    const missing = path.join(os.tmpdir(), 'quar-shots-none-here');
    const { shots, problems } = await loadShotLists([
      { dir: free },
      { dir: cloud, optional: true },
      { dir: missing, optional: true },
    ]);
    expect(problems).toEqual([]);
    expect(shots.map((s) => [s.name, s.outDir])).toEqual([
      ['one', path.join(free, 'img')],
      ['two', path.join(cloud, 'img')],
    ]);
  });

  it('won’t have two folders’ shots share a name (they’d share a picture)', async () => {
    const free = folder(`[{ name: 'same', steps: [{ open: 'projects' }] }]`);
    const cloud = folder(`[{ name: 'same', steps: [{ open: 'new' }] }]`);
    const { shots, problems } = await loadShotLists([{ dir: free }, { dir: cloud }]);
    expect(shots).toHaveLength(1);
    expect(problems).toEqual([expect.stringContaining('shot "same" is also in')]);
  });
});

describe('the command line', () => {
  it('reads shot names and options', () => {
    expect(parseArgs(['editor-layout', '--url', 'http://localhost:3000', 'projects-*'])).toEqual({
      names: ['editor-layout', 'projects-*'],
      url: 'http://localhost:3000',
      list: false,
      headed: false,
      help: false,
    });
    expect(parseArgs(['--', '--list', '--headed', '--url=http://x'])).toMatchObject({
      names: [],
      list: true,
      headed: true,
      url: 'http://x',
    });
  });

  it('picks the shots named, a trailing * matching the start of a name', () => {
    const shots = [shot('projects-page'), shot('projects-empty'), shot('editor-layout')];
    expect(selectShots(shots, []).selected).toHaveLength(3);
    const { selected, unknown } = selectShots(shots, ['projects-*', 'nope']);
    expect(selected.map((s) => s.name)).toEqual(['projects-page', 'projects-empty']);
    expect(unknown).toEqual(['nope']);
  });
});

describe('capture regions', () => {
  const viewport = { width: 1280, height: 800 };

  it('takes in every box, with room around them, in whole pixels', () => {
    expect(
      captureClip(
        [
          { x: 10.4, y: 44, width: 400, height: 30 },
          { x: 200, y: 60, width: 150.2, height: 90.5 },
        ],
        { right: 20, bottom: 10 },
        viewport
      )
    ).toEqual({ x: 10, y: 44, width: 421, height: 117 });
  });

  it('stays inside the window', () => {
    expect(captureClip([{ x: 1200, y: 5, width: 70, height: 40 }], 24, viewport)).toEqual({
      x: 1176,
      y: 0,
      width: 104,
      height: 69,
    });
  });

  it('needs something to capture', () => {
    expect(() => captureClip([], 0, viewport)).toThrow(/no element matched/);
  });
});

describe('markers', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('puts a numbered badge where each target is, and an outline when asked', () => {
    document.body.innerHTML = '<div id="layers"></div>';
    const layers = document.getElementById('layers')!;
    layers.getBoundingClientRect = () =>
      ({ left: 0, top: 74, right: 220, bottom: 600, width: 220, height: 526 }) as DOMRect;

    const missing = drawMarkers([
      { target: '#layers', label: 3, at: 'top-right', outline: true },
      { target: '#layers', label: 4, at: 'center', dx: 5, dy: -5 },
      { target: '#timeline', label: 6 },
    ]);

    expect(missing).toEqual(['#timeline']);
    const layer = document.querySelector('[data-help-markers]') as HTMLElement;
    expect(layer.style.pointerEvents).toBe('none');
    const [outline, three, four] = [...layer.children] as HTMLElement[];
    expect(outline!.style.border).toContain('2px solid');
    expect(three!.textContent).toBe('3');
    // Inside the top-right corner: 220 - 10 - 26
    expect([three!.style.left, three!.style.top]).toEqual(['184px', '84px']);
    expect(four!.textContent).toBe('4');
    expect([four!.style.left, four!.style.top]).toEqual(['102px', '319px']);
  });
});
