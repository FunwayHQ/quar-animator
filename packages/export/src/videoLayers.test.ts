/**
 * Video layers in the exports that don't draw them yet (Lottie, SVG, PDF:
 * a still of the moment comes later): left out, everything else exported,
 * nothing thrown — in a group, a mask group and an artboard too.
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph, exportNodesToSvg } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { Node, VideoNode } from '@quar/types';
import { exportToLottieJson, analyzeLottieExport } from './lottie/lottieExporter';
import { exportPdf } from './pdf/pdfExport';
import { exportSvgFrame } from './svgFrame';
import { readPdf } from './__fixtures__/pdfReader';
import { BLUE, artboard, base, group, rect, solid } from './__fixtures__/pdfNodes';

function video(id: string): VideoNode {
  return {
    ...base(id),
    type: 'video',
    videoId: `file-${id}`,
    width: 160,
    height: 90,
    naturalWidth: 1280,
    naturalHeight: 720,
    cornerRadius: [4, 4, 4, 4],
    adjustments: {
      brightness: 10,
      contrast: 0,
      saturation: 0,
      hue: 0,
      exposure: 0,
      temperature: 0,
      tint: 0,
      blur: 0,
    },
    effects: [
      {
        id: 'shadow',
        type: 'drop-shadow',
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 1 },
        opacity: 0.5,
        offsetX: 4,
        offsetY: -4,
        blur: 8,
        spread: 0,
      },
    ],
    clip: { start: 0, offset: 0, duration: 4 },
  };
}

/**
 * A page with video layers everywhere a layer can be: on its own, in a
 * group with a shape, as a mask and as what's masked, in an artboard.
 */
function scene(): SceneGraph {
  const sg = new SceneGraph();
  const entries: Array<[Node, string?]> = [
    [video('alone')],
    [group('grouped', [])],
    [video('in-group'), 'grouped'],
    [rect('shape', 0, 0, 40, 40, { fills: [solid(BLUE)] }), 'grouped'],
    [group('masked', [], { maskNodeId: 'mask-video', maskMode: 'alpha' })],
    [rect('under', 0, 0, 40, 40, { fills: [solid(BLUE)] }), 'masked'],
    [video('mask-video'), 'masked'],
    [artboard('board', 0, 0, 400, 300)],
    [video('on-board'), 'board'],
  ];
  for (const [node, parent] of entries) sg.addNode(structuredClone(node), parent);
  return sg;
}

describe('video layers in exports that don’t draw them', () => {
  it('Lottie: leaves them out, keeps the rest, and counts them as unsupported', () => {
    const sg = scene();
    const roots = sg.getRootNodes();
    const resolve = (id: string) => sg.getNode(id);
    const lottie = exportToLottieJson(
      roots,
      createTimeline(),
      { width: 800, height: 600 },
      resolve
    );
    const names = JSON.stringify(lottie);
    expect(names).not.toContain('"nm":"alone"');
    expect(names).not.toContain('"nm":"on-board"');
    expect(names).toContain('"nm":"shape"');

    const analysis = analyzeLottieExport(roots, resolve);
    expect(analysis.unsupportedTypes).toEqual(['video']);
  });

  it('SVG: writes no element for them', () => {
    const sg = scene();
    const svg = exportNodesToSvg(sg.getRootNodes(), sg);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('<image');
    expect(exportSvgFrame(sg, createTimeline(), undefined, { frame: 0 })).not.toContain('<image');
  });

  it('PDF: paints the rest of the page', async () => {
    const sg = scene();
    const blob = await exportPdf(
      [
        {
          sceneGraph: sg,
          timeline: createTimeline(),
          viewport: { x: -200, y: -200, width: 400, height: 400 },
          frame: 0,
        },
      ],
      { rasterizer: null, decodeImage: () => Promise.resolve(null) }
    );
    expect(blob).not.toBeNull();
    const pdf = await readPdf(blob!);
    expect(pdf.pages).toHaveLength(1);
    expect([...pdf.objects.values()].some((object) => /\/Subtype \/Image/.test(object.body))).toBe(
      false
    );
  });
});
