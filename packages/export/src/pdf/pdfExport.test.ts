/**
 * Tests for exporting pages (slides) as a PDF
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { exportPdf, type PdfPageSource } from './pdfExport';
import { readPdf } from '../__fixtures__/pdfReader';
import { BLUE, RED, artboard, rect, solid } from '../__fixtures__/pdfNodes';

/** Two slides side by side, each with a box of its own. */
function slides() {
  const sg = new SceneGraph();
  sg.addNode(artboard('one', 0, 0, 400, 200));
  sg.addNode(rect('red', 0, 0, 20, 20), 'one');
  sg.addNode(artboard('two', 600, 0, 200, 300));
  sg.addNode(rect('blue', 0, 0, 20, 20, { fills: [solid(BLUE)] }), 'two');
  return sg;
}

function page(sg: SceneGraph, id: string, more: Partial<PdfPageSource> = {}): PdfPageSource {
  const board = sg.getNode(id);
  if (board?.type !== 'artboard') throw new Error('no artboard');
  const { x, y } = board.transform.position;
  return {
    sceneGraph: sg,
    timeline: createTimeline(),
    rootIds: [id],
    viewport: {
      x: x - board.width / 2,
      y: y - board.height / 2,
      width: board.width,
      height: board.height,
    },
    frame: 0,
    ...more,
  };
}

const plain = { rasterizer: null, decodeImage: () => Promise.resolve(null) };

describe('exportPdf', () => {
  it('writes a page a slide, each its own size in points, with only its own artboard on it', async () => {
    const sg = slides();
    const blob = await exportPdf([page(sg, 'one'), page(sg, 'two')], { ...plain, title: 'Deck' });
    expect(blob?.type).toBe('application/pdf');
    const pdf = await readPdf(blob!);
    expect(pdf.pages.map((p) => /\/MediaBox \[([^\]]+)\]/.exec(p.body)?.[1])).toEqual([
      '0 0 300 150',
      '0 0 150 225',
    ]);
    const [first, second] = pdf.pages.map((p) => pdf.content(p));
    expect(first).toContain('1 0 0 rg');
    expect(first).not.toContain('0 0 1 rg');
    expect(second).toContain('0 0 1 rg');
    expect(second).not.toContain('1 0 0 rg');
    // Its part of the world onto the page
    expect(second!.startsWith('0.75 0 0 0.75 -375 112.5 cm')).toBe(true);
  });

  it('paints the document background behind a page', async () => {
    const sg = slides();
    const blob = await exportPdf(
      [page(sg, 'one', { background: { r: 51, g: 51, b: 51, a: 1 } })],
      plain
    );
    const pdf = await readPdf(blob!);
    expect(pdf.content(pdf.pages[0]!)).toMatch(/0.2 0.2 0.2 rg\n-200 -100 400 200 re\nf/);
  });

  it('draws each page at its frame, posed, leaving the scene as it was', async () => {
    const sg = slides();
    const timeline = createTimeline({ duration: 30 });
    const x = getOrCreateTrack<number>(timeline, 'red', 'transform.position.x');
    addKeyframe(x, 0, 0);
    addKeyframe(x, 29, 100);
    const blob = await exportPdf([page(sg, 'one', { timeline, frame: 29 })], plain);
    const pdf = await readPdf(blob!);
    expect(pdf.content(pdf.pages[0]!)).toContain('1 0 0 1 100 0 cm');
    expect(sg.getNode('red')!.transform.position.x).toBe(0);
  });

  it('tells how far it has got, and stops when cancelled', async () => {
    const sg = slides();
    const seen: number[] = [];
    let pages = 0;
    const blob = await exportPdf(
      [page(sg, 'one'), page(sg, 'two')],
      plain,
      (progress) => {
        seen.push(progress.percentage);
        if (progress.phase === 'rendering') pages++;
      },
      () => pages >= 2
    );
    expect(blob).toBeNull();
    expect(seen).toEqual([0, 50]);
  });

  it('refuses to export no pages', async () => {
    await expect(exportPdf([], plain)).rejects.toThrow(/no pages/);
  });
});

describe('a red box on its slide', () => {
  it('stays vector: a path, not a picture', async () => {
    const sg = slides();
    const pdf = await readPdf((await exportPdf([page(sg, 'one')], plain))!);
    expect([...pdf.objects.values()].some((o) => o.body.includes('/Subtype /Image'))).toBe(false);
    expect(pdf.content(pdf.pages[0]!)).toContain(`${RED.r / 255} 0 0 rg`);
  });
});
