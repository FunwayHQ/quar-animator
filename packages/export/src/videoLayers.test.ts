/**
 * Video layers in the exports that can't play video (Lottie, SVG, PDF): a
 * still of the moment each shows, as a picture — and without stills, left
 * out, everything else exported, nothing thrown — in a group, a mask group
 * and an artboard too.
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneGraph, exportNodesToSvg } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { GroupNode, Node, VideoClip, VideoNode } from '@quar/types';
import {
  exportToLottieJson,
  analyzeLottieExport,
  lottieVideoMoments,
} from './lottie/lottieExporter';
import {
  countVideoLayers,
  drawVideoStills,
  videoMomentsAtFrame,
  type VideoMoment,
} from './videoStills';
import { exportPdf } from './pdf/pdfExport';
import { exportSvgFrame } from './svgFrame';
import { readPdf } from './__fixtures__/pdfReader';
import { BLUE, artboard, base, group, rect, solid } from './__fixtures__/pdfNodes';

function video(id: string, clip: Partial<VideoClip> = {}): VideoNode {
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
    clip: { start: 0, offset: 0, duration: 4, ...clip },
  };
}

/** A still for each of these layers, named for it. */
const stillsFor = (...ids: string[]) =>
  new Map(ids.map((id) => [id, `data:image/jpeg;base64,${id}`] as const));

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

describe('which moment a video layer’s still shows', () => {
  const at = (clip: Partial<VideoClip>, start: number, end: number) =>
    lottieVideoMoments([video('v', clip)], { frameRate: 30 }, start, end)[0]?.seconds ?? null;

  it('in a Lottie: its clip’s first picture, when the clip starts in the export', () => {
    expect(at({ start: 10, offset: 1.5 }, 0, 59)).toBeCloseTo(1.5);
  });

  it('in a Lottie: the one at the export’s first frame, when the clip is under way there', () => {
    expect(at({ start: 0, offset: 1 }, 15, 59)).toBeCloseTo(1.5);
    expect(at({ start: 0, offset: 0, speed: 2 }, 15, 59)).toBeCloseTo(1);
  });

  it('in a Lottie: its last, held, when the clip is over before the export starts', () => {
    // The picture its last frame (29) shows
    expect(at({ start: 0, duration: 1, holdLastFrame: true }, 45, 59)).toBeCloseTo(29 / 30, 9);
  });

  it('in a Lottie: none for a clip outside the export', () => {
    expect(at({ start: 0, duration: 1 }, 45, 59)).toBeNull();
    expect(at({ start: 60 }, 0, 59)).toBeNull();
  });

  it('at a frame: the moment the clip is at there, none outside it', () => {
    const nodes = [video('a', { start: 10, offset: 2 }), video('b', { start: 40 })];
    const resolve = () => undefined;
    expect(videoMomentsAtFrame(nodes, resolve, 25, 30)).toEqual([
      { nodeId: 'a', videoId: 'file-a', seconds: 2.5 },
    ]);
  });

  it('finds the visible ones in groups, mask groups and artboards', () => {
    const sg = scene();
    sg.addNode(structuredClone({ ...video('hidden'), visible: false }));
    const resolve = (id: string) => sg.getNode(id);
    const ids = videoMomentsAtFrame(sg.getRootNodes(), resolve, 0, 30).map((m) => m.nodeId);
    expect(ids.sort()).toEqual(['alone', 'in-group', 'mask-video', 'on-board']);
    expect(countVideoLayers(sg.getRootNodes(), resolve)).toBe(4);
  });
});

describe('video layers in Lottie, as stills', () => {
  const timeline = createTimeline({ duration: 60, frameRate: 30 });
  const options = { width: 800, height: 600, startFrame: 0, endFrame: 59 };

  it('is an image layer of its still, in and out with its clip', () => {
    const node = video('v', { start: 10, duration: 1 });
    const lottie = exportToLottieJson([node], timeline, {
      ...options,
      videoStills: stillsFor('v'),
    });
    const [layer] = lottie.layers;
    expect(layer).toMatchObject({ ty: 2, nm: 'v', refId: 'image_0', ip: 10, op: 40, st: 0 });
    expect(lottie.assets).toEqual([
      { id: 'image_0', w: 160, h: 90, u: '', p: 'data:image/jpeg;base64,v', e: 1 },
    ]);
    // Placed as a picture is: its pivot at its anchor, rounded corners masked
    expect(layer!.ks.a).toEqual({ a: 0, k: [80, 45] });
    expect(layer!.masksProperties).toHaveLength(1);
  });

  it('ends where the clip does, a part-frame on', () => {
    const [layer] = exportToLottieJson([video('v', { start: 0, duration: 1.01 })], timeline, {
      ...options,
      videoStills: stillsFor('v'),
    }).layers;
    expect(layer).toMatchObject({ ip: 0, op: 31 });
  });

  it('stays to the export’s end while it holds its last frame', () => {
    const [layer] = exportToLottieJson(
      [video('v', { start: 5, duration: 1, holdLastFrame: true })],
      timeline,
      { ...options, videoStills: stillsFor('v') }
    ).layers;
    expect(layer).toMatchObject({ ip: 5, op: 60 });
  });

  it('starts with the export when its clip began before it', () => {
    const [layer] = exportToLottieJson([video('v', { start: 0, duration: 4 })], timeline, {
      ...options,
      startFrame: 20,
      videoStills: stillsFor('v'),
    }).layers;
    expect(layer).toMatchObject({ ip: 20, op: 60 });
  });

  it('is left out with its clip outside the export, or without a still', () => {
    const outside = exportToLottieJson([video('v', { start: 0, duration: 0.5 })], timeline, {
      ...options,
      startFrame: 30,
      videoStills: stillsFor('v'),
    });
    expect(outside.layers).toEqual([]);
    expect(exportToLottieJson([video('v')], timeline, options).layers).toEqual([]);
  });

  it('keeps its keyframed placement and fading, as a picture’s', () => {
    const animated = createTimeline({ duration: 60, frameRate: 30 });
    animated.tracks.push({
      id: 'fade',
      nodeId: 'v',
      property: 'opacity',
      enabled: true,
      keyframes: [
        { id: 'k0', time: 0, value: 0, easing: 'linear' },
        { id: 'k1', time: 30, value: 1, easing: 'linear' },
      ],
    });
    const [layer] = exportToLottieJson([video('v')], animated, {
      ...options,
      videoStills: stillsFor('v'),
    }).layers;
    expect(layer!.ks.o.a).toBe(1);
  });

  it('makes a group with a video in it a precomposition, the still inside', () => {
    const sg = scene();
    const resolve = (id: string) => sg.getNode(id);
    const lottie = exportToLottieJson(
      [sg.getNode<GroupNode>('grouped')!],
      timeline,
      { ...options, videoStills: stillsFor('in-group') },
      resolve
    );
    expect(lottie.layers[0]).toMatchObject({ ty: 0, nm: 'grouped' });
    const comp = lottie.assets.find((asset) => asset.layers);
    expect(comp?.layers?.map((layer) => [layer.nm, layer.ty])).toEqual([
      ['shape', 4],
      ['in-group', 2],
    ]);
  });

  it('is no longer counted as unsupported', () => {
    const sg = scene();
    const analysis = analyzeLottieExport(sg.getRootNodes(), (id) => sg.getNode(id));
    expect(analysis.unsupportedTypes).toEqual([]);
  });
});

describe('video layers in an SVG of a frame, as stills', () => {
  it('draws each as the picture of its still, where it is, the scene untouched', () => {
    const sg = scene();
    const svg = exportSvgFrame(sg, createTimeline(), undefined, {
      frame: 0,
      videoStills: stillsFor('alone', 'in-group', 'on-board'),
    });
    for (const id of ['alone', 'in-group', 'on-board']) {
      expect(svg).toContain(`href="data:image/jpeg;base64,${id}"`);
    }
    expect(svg.match(/<image /g)).toHaveLength(3);
    expect(sg.getNode('alone')?.type).toBe('video');
  });

  it('keeps a video that masks its group the mask', () => {
    const sg = scene();
    const svg = exportSvgFrame(sg, createTimeline(), undefined, {
      frame: 0,
      rootIds: ['masked'],
      videoStills: stillsFor('mask-video'),
    });
    expect(svg).toMatch(/<mask[^>]*>.*href="data:image\/jpeg;base64,mask-video".*<\/mask>/);
  });

  it('places it as its keyframes have it at that frame', () => {
    const sg = new SceneGraph();
    sg.addNode(video('v'));
    const timeline = createTimeline({ duration: 60, frameRate: 30 });
    timeline.tracks.push({
      id: 'move',
      nodeId: 'v',
      property: 'transform.position.x',
      enabled: true,
      keyframes: [
        { id: 'k0', time: 0, value: 0, easing: 'linear' },
        { id: 'k1', time: 20, value: 200, easing: 'linear' },
      ],
    });
    const svg = exportSvgFrame(sg, timeline, undefined, {
      frame: 10,
      videoStills: stillsFor('v'),
      viewport: { x: -400, y: -300, width: 800, height: 600 },
    });
    expect(svg).toMatch(/<image [^>]*transform="translate\(100,0\)/);
  });
});

describe('video layers in a PDF, as stills', () => {
  const pixels = () =>
    Promise.resolve({
      kind: 'pixels' as const,
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
    });
  /** Has a still for every moment asked, named for its layer */
  const loader = () =>
    vi.fn((moments: VideoMoment[]) =>
      Promise.resolve(
        new Map(moments.map((m) => [m.nodeId, `data:image/jpeg;base64,${m.nodeId}`] as const))
      )
    );
  const page = (sg: SceneGraph, frame: number, rootIds?: string[]) => ({
    sceneGraph: sg,
    timeline: createTimeline({ duration: 60, frameRate: 30 }),
    viewport: { x: -200, y: -200, width: 400, height: 400 },
    frame,
    rootIds,
  });
  const images = async (blob: Blob | null) =>
    [...(await readPdf(blob!)).objects.values()].filter((object) =>
      /\/Subtype \/Image/.test(object.body)
    ).length;

  it('paints each as the picture of its still at the page’s frame', async () => {
    const sg = new SceneGraph();
    sg.addNode(video('v', { start: 10, offset: 1 }));
    const videoStills = loader();
    const decodeImage = vi.fn(pixels);
    const blob = await exportPdf([page(sg, 25)], { rasterizer: null, decodeImage, videoStills });
    expect(videoStills).toHaveBeenCalledWith([{ nodeId: 'v', videoId: 'file-v', seconds: 1.5 }]);
    expect(decodeImage).toHaveBeenCalledWith('data:image/jpeg;base64,v');
    expect(await images(blob)).toBe(1);
    expect(sg.getNode('v')?.type).toBe('video');
  });

  it('asks each slide’s page for its own layers at its own frame', async () => {
    const sg = scene();
    const videoStills = loader();
    await exportPdf([page(sg, 30, ['board']), page(sg, 0, ['grouped'])], {
      rasterizer: null,
      decodeImage: pixels,
      videoStills,
    });
    expect(videoStills.mock.calls.map(([moments]) => moments)).toEqual([
      [{ nodeId: 'on-board', videoId: 'file-on-board', seconds: 1 }],
      [{ nodeId: 'in-group', videoId: 'file-in-group', seconds: 0 }],
    ]);
  });

  it('shows a held last picture after its clip, nothing after one that isn’t held', async () => {
    const sg = new SceneGraph();
    sg.addNode(video('held', { duration: 1, holdLastFrame: true }));
    sg.addNode(video('gone', { duration: 1 }));
    const videoStills = loader();
    const blob = await exportPdf([page(sg, 59)], {
      rasterizer: null,
      decodeImage: pixels,
      videoStills,
    });
    const [[moments]] = videoStills.mock.calls as unknown as [[VideoMoment[]]];
    expect(moments.map((m) => m.nodeId)).toEqual(['held']);
    // The picture its last frame (29) shows
    expect(moments[0]?.seconds).toBeCloseTo(29 / 30, 9);
    expect(await images(blob)).toBe(1);
  });
});

describe('drawVideoStills', () => {
  it('puts a still in as a picture of the layer, among the same siblings', () => {
    const sg = scene();
    drawVideoStills(sg, stillsFor('in-group', 'mask-video'));
    expect(sg.getNode('in-group')).toMatchObject({
      type: 'image',
      src: 'data:image/jpeg;base64,in-group',
      width: 160,
      height: 90,
      cornerRadius: [4, 4, 4, 4],
      adjustments: { brightness: 10 },
      effects: [{ id: 'shadow' }],
    });
    expect(sg.getNode('in-group')).not.toHaveProperty('clip');
    expect(sg.getNode('grouped')?.children).toEqual(['in-group', 'shape']);
    // The mask stays the mask
    expect(sg.getNode('masked')).toMatchObject({ maskNodeId: 'mask-video', maskMode: 'alpha' });
    expect(sg.getNode('mask-video')?.type).toBe('image');
  });

  it('leaves the layers it has no still for', () => {
    const sg = scene();
    drawVideoStills(sg, stillsFor('nowhere'));
    expect(sg.getNode('alone')?.type).toBe('video');
  });
});

describe('video layers in exports, without stills', () => {
  it('Lottie: leaves them out and keeps the rest', () => {
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
