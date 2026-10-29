/**
 * Tests for painting a scene onto a PDF page as the canvas paints it
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { Node, SymbolDefinition } from '@quar/types';
import { exportPdf, type PdfExportOptions } from './pdfExport';
import { gaussianBlur, type PdfRasterizer } from './pdfScene';
import { readPdf } from '../__fixtures__/pdfReader';
import {
  BLUE,
  RED,
  artboard,
  base,
  corner,
  ellipse,
  group,
  image,
  line,
  path,
  rect,
  solid,
  text,
} from '../__fixtures__/pdfNodes';

/** The world from (-100, -100) to (100, 100): the page maps it by 0.75, moved by 75. */
const VIEW = { x: -100, y: -100, width: 200, height: 200 };

type Entry = Node | [Node, string];

async function draw(
  entries: Entry[],
  options: PdfExportOptions & { roots?: string[]; symbols?: SymbolDefinition[] } = {}
) {
  const sg = new SceneGraph();
  for (const entry of entries) {
    const [node, parent] = Array.isArray(entry) ? entry : [entry, undefined];
    sg.addNode(structuredClone(node), parent);
  }
  const blob = await exportPdf(
    [
      {
        sceneGraph: sg,
        timeline: createTimeline(),
        rootIds: options.roots,
        viewport: VIEW,
        frame: 0,
        symbols: options.symbols,
      },
    ],
    { rasterizer: null, decodeImage: () => Promise.resolve(null), ...options }
  );
  if (!blob) throw new Error('cancelled');
  const pdf = await readPdf(blob);
  const objects = [...pdf.objects.values()];
  return {
    pdf,
    page: pdf.content(pdf.pages[0]!),
    /** Every stream's text (the page's, and its groups') */
    streams: objects.map((object) => object.text ?? '').join('\n----\n'),
    /** Every object's dictionary */
    bodies: objects.map((object) => object.body).join('\n'),
  };
}

/** The ops between the n-th `q … Q` that paints with `marker`. */
function block(content: string, marker: string): string {
  const at = content.indexOf(marker);
  if (at < 0) return '';
  const start = content.lastIndexOf('\nq\n', at);
  const end = content.indexOf('\nQ', at);
  return content.slice(start, end);
}

describe('painting layers', () => {
  it('fills a rectangle where the canvas draws it, the world mapped onto the page in points', async () => {
    const { pdf, page } = await draw([rect('box', 10, 20, 10, 10)]);
    expect(pdf.pages[0]!.body).toContain('/MediaBox [0 0 150 150]');
    expect(page.startsWith('0.75 0 0 0.75 75 75 cm')).toBe(true);
    expect(block(page, '1 0 0 rg')).toContain('1 0 0 1 10 20 cm');
    // A straight closing side is the close itself
    expect(block(page, '1 0 0 rg')).toContain('-5 -5 m\n5 -5 l\n5 5 l\n-5 5 l\nh\nf');
  });

  it('gives each paint its own opacity, its layer’s and its ancestors’', async () => {
    const { page, bodies } = await draw([
      group('g', [], { opacity: 0.5 }),
      [rect('box', 0, 0, 10, 10, { opacity: 0.5, fills: [solid({ ...RED, a: 0.5 }, 0.8)] }), 'g'],
    ]);
    const gs = /\/(G\d+) gs 1 0 0 rg/.exec(page)?.[1];
    expect(bodies).toMatch(new RegExp(`/ca 0.1 /CA 1 >>`));
    expect(gs).toBeDefined();
  });

  it('leaves out hidden layers and rig helpers, but draws what hangs from a bone', async () => {
    const bone = { ...base('bone'), type: 'bone', length: 50 } as unknown as Node;
    const { page } = await draw([
      rect('hidden', 0, 0, 10, 10, { visible: false, fills: [solid(BLUE)] }),
      bone,
      [rect('hung', 0, 0, 10, 10), 'bone'],
    ]);
    expect(page).not.toContain('0 0 1 rg');
    expect(page).toContain('1 0 0 rg');
  });

  it('leaves an open path unfilled, and draws a stroke on only as far as its progress', async () => {
    const open = path('open', [corner(0, 0), corner(40, 0)], {
      closed: false,
      strokes: [line(BLUE, 2)],
      strokeProgress: 0.5,
    });
    const { page } = await draw([open]);
    expect(page).not.toMatch(/\nf\n/);
    // Half of it: the trimmed piece ends halfway
    expect(block(page, '0 0 1 RG')).toMatch(/\n0 0 m\n[^\n]* 20 0 c\nS$/);
  });

  it('fills a compound path by its fill rule', async () => {
    const compound = path(
      'donut',
      [corner(-20, -20), corner(20, -20), corner(20, 20), corner(-20, 20)],
      {
        subpaths: [[corner(-5, -5), corner(5, -5), corner(5, 5), corner(-5, 5)]],
        fillRule: 'evenodd',
      }
    );
    const { page } = await draw([compound]);
    expect(block(page, '1 0 0 rg')).toMatch(/h\n-5 -5 m[\s\S]*h\nf\*$/);
  });

  it('draws a text as its glyph outlines, filled by the nonzero rule', async () => {
    const outlines = vi.fn(() => [[corner(0, 0), corner(8, 0), corner(8, 12), corner(0, 12)]]);
    const { page } = await draw([text('title', 'I')], { textOutlines: outlines });
    expect(outlines).toHaveBeenCalled();
    expect(block(page, '1 0 0 rg')).toContain('0 0 m\n8 0 l\n8 12 l\n0 12 l\nh\nf');
  });
});

describe('strokes', () => {
  it('strokes with its own width, caps, joins and dashes, an odd dash pattern repeated', async () => {
    const box = rect('box', 0, 0, 10, 10, {
      fills: [],
      strokes: [
        line(BLUE, 3, { cap: 'round', join: 'bevel', dashArray: [4, 2, 1], dashOffset: 1 }),
      ],
    });
    const { page } = await draw([box]);
    const stroke = block(page, '0 0 1 RG');
    expect(stroke).toContain('3 w 1 J 2 j');
    expect(stroke).toContain('4 M');
    expect(stroke).toContain('[4 2 1 4 2 1] 1 d');
  });

  it('starts a rectangle’s dashes at its top-left and an ellipse’s at its rightmost point, clockwise', async () => {
    const dashed = line(BLUE, 1, { dashArray: [3, 3] });
    const { page } = await draw([
      rect('box', 0, 0, 10, 10, { fills: [], strokes: [dashed] }),
      ellipse('round', 0, 0, 10, 6, { fills: [], strokes: [{ ...dashed, color: RED }] }),
    ]);
    expect(block(page, '0 0 1 RG')).toContain('-5 5 m\n5 5 l\n5 -5 l');
    // From the rightmost point, down (clockwise on screen)
    expect(block(page, '1 0 0 RG')).toMatch(/\n10 0 m\n[^\n]* 0 -6 c\n/);
  });

  it('never strokes thinner than a unit across, as the canvas', async () => {
    const { page } = await draw([
      rect('box', 0, 0, 10, 10, { fills: [], strokes: [line(BLUE, 0.2)] }),
    ]);
    expect(block(page, '0 0 1 RG')).toContain('1 w');
  });

  it('strokes inside a closed shape by clipping a doubled width to it, outside by clipping to the rest', async () => {
    const { page } = await draw([
      rect('in', 0, 0, 10, 10, { fills: [], strokes: [line(BLUE, 4, { align: 'inside' })] }),
      rect('out', 30, 0, 10, 10, { fills: [], strokes: [line(RED, 4, { align: 'outside' })] }),
    ]);
    const inside = block(page, '0 0 1 RG');
    expect(inside).toMatch(/h\nW n\n[\s\S]*8 w/);
    const outside = block(page, '1 0 0 RG');
    expect(outside).toMatch(/ re\n-5 -5 m[\s\S]*h\nW\* n\n[\s\S]*8 w/);
  });

  it('fills the canvas’s own outline for a stroke with a width profile', async () => {
    const brush = path('brush', [corner(0, 0), corner(40, 0)], {
      closed: false,
      fills: [],
      strokes: [line(BLUE, 6, { widthProfile: [0, 1, 0] })],
    });
    const { page } = await draw([brush]);
    expect(page).not.toContain('RG');
    expect(block(page, '0 0 1 rg')).toMatch(/ m\n[\s\S]* l\nh\nf$/);
  });
});

describe('gradients', () => {
  const gradientFill = (stops: Array<{ offset: number; color: typeof RED }>) => ({
    type: 'gradient' as const,
    opacity: 1,
    visible: true,
    gradient: { type: 'linear' as const, stops, start: { x: 0, y: 0.5 }, end: { x: 1, y: 0.5 } },
  });

  it('spreads a gradient over the filled outline’s box, its pattern placed on the page', async () => {
    const { page, bodies } = await draw([
      rect('box', 10, 20, 20, 10, {
        fills: [
          gradientFill([
            { offset: 0, color: RED },
            { offset: 1, color: BLUE },
          ]),
        ],
      }),
    ]);
    expect(page).toMatch(/\/Pattern cs \/P\d+ scn/);
    // The box (0, 15)–(20, 25) in the world, on the page: ×0.75, +75
    expect(bodies).toContain('/PatternType 2 /Shading');
    expect(bodies).toContain('/Matrix [15 0 0 7.5 75 86.25]');
  });

  it('fades a gradient’s stops through a soft mask of their opacity', async () => {
    const { bodies, streams } = await draw([
      rect('box', 0, 0, 20, 10, {
        fills: [
          gradientFill([
            { offset: 0, color: RED },
            { offset: 1, color: { ...BLUE, a: 0 } },
          ]),
        ],
      }),
    ]);
    expect(bodies).toMatch(/\/SMask << \/Type \/Mask \/S \/Luminosity \/G \d+ 0 R >>/);
    expect(bodies).toContain('/Group << /Type /Group /S /Transparency /CS /DeviceGray >>');
    expect(streams).toMatch(/20 0 0 10 -10 -5 cm\n\/S\d+ sh/);
  });
});

describe('pictures', () => {
  const pixels = () =>
    Promise.resolve({
      kind: 'pixels' as const,
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]),
    });

  it('places a picture over its box, its alpha as a soft mask, written once however often it’s drawn', async () => {
    const { page, bodies } = await draw([image('a', 20, 10), image('b', 20, 10)], {
      decodeImage: pixels,
    });
    expect(page.match(/20 0 0 10 -10 -5 cm\n\/X\d+ Do/g)).toHaveLength(2);
    expect(
      bodies.match(
        /\/Subtype \/Image \/Width 2 \/Height 1 \/BitsPerComponent 8 \/ColorSpace \/DeviceRGB/g
      )
    ).toHaveLength(1);
    expect(bodies).toMatch(/\/ColorSpace \/DeviceRGB \/Interpolate true \/SMask \d+ 0 R/);
  });

  it('embeds a JPEG as it is', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const { pdf } = await draw([image('photo', 20, 10)], {
      decodeImage: () =>
        Promise.resolve({ kind: 'jpeg', width: 4, height: 2, components: 3, bytes: jpeg }),
    });
    const embedded = [...pdf.objects.values()].find((object) => object.body.includes('/DCTDecode'));
    expect(embedded?.body).toContain('/Width 4 /Height 2 /ColorSpace /DeviceRGB');
    expect([...(embedded?.stream ?? [])]).toEqual([...jpeg]);
  });

  it('rounds a picture’s corners by clipping to them', async () => {
    const { page } = await draw([image('a', 20, 10, { cornerRadius: [4, 4, 4, 4] })], {
      decodeImage: pixels,
    });
    expect(block(page, ' Do')).toMatch(/ c\n[\s\S]*h\nW n\n20 0 0 10 -10 -5 cm/);
  });

  it('maps a picture with its corners moved as two triangles, as the canvas draws it', async () => {
    const { page } = await draw(
      [
        image('a', 20, 10, {
          vertexOffsets: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 5, y: 5 },
          ],
        }),
      ],
      { decodeImage: pixels }
    );
    expect(page.match(/h\nW n\n[^\n]* cm\n\/X\d+ Do/g)).toHaveLength(2);
    // The top-right half: bottom-right, top-left, and the moved top-right corner,
    // the picture's corners mapped onto them
    expect(page).toContain('10 -5 m\n-10 5 l\n15 10 l\nh\nW n\n25 5 5 15 -15 -10 cm');
  });

  it('leaves out pictures from anywhere but the document', async () => {
    const decode = vi.fn(pixels);
    const { page } = await draw([image('a', 20, 10, { src: 'https://example.com/a.png' })], {
      decodeImage: decode,
    });
    expect(decode).not.toHaveBeenCalled();
    expect(page).not.toContain('Do');
  });
});

describe('structure', () => {
  it('paints an artboard’s background and clips its contents to it', async () => {
    const { page } = await draw([
      artboard('board', 10, 0, 40, 30),
      [rect('box', 0, 0, 100, 10), 'board'],
    ]);
    expect(page).toContain('1 1 1 rg');
    expect(page).toMatch(/-10 -15 40 30 re\nW n\n/);
  });

  it('clips by a filled, unstroked mask shape with a clipping path, the mask itself not drawn', async () => {
    const { page } = await draw([
      group('g', [], { maskNodeId: 'mask', maskMode: 'clip' }),
      [rect('mask', 5, 0, 10, 10), 'g'],
      [rect('content', 0, 0, 40, 40, { fills: [solid(BLUE)] }), 'g'],
    ]);
    expect(page).not.toContain('1 0 0 rg');
    // The mask's outline, in the world
    expect(page).toMatch(/q\n0 -5 m\n10 -5 l\n10 5 l\n0 5 l\nh\nW n\n[\s\S]*0 0 1 rg/);
  });

  it('masks by alpha with a soft mask, the masked layers painted together under it', async () => {
    const { page, bodies, streams } = await draw([
      group('g', [], { maskNodeId: 'mask', maskMode: 'alpha' }),
      [rect('mask', 0, 0, 10, 10, { opacity: 0.5 }), 'g'],
      [rect('content', 0, 0, 40, 40, { fills: [solid(BLUE)] }), 'g'],
    ]);
    expect(bodies).toMatch(/\/SMask << \/Type \/Mask \/S \/Alpha \/G \d+ 0 R >>/);
    expect(page).toMatch(/q\n\/G\d+ gs \/X\d+ Do\nQ/);
    // The mask's own opacity (not its group's) is its coverage
    expect(bodies).toContain('/ca 0.5 /CA 1');
    expect(streams).toContain('0 0 1 rg');
  });

  it('masks by luminance over black, as the canvas reads a mask’s brightness', async () => {
    const { bodies } = await draw([
      group('g', [], { maskNodeId: 'mask', maskMode: 'luminance' }),
      [rect('mask', 0, 0, 10, 10), 'g'],
      [rect('content', 0, 0, 40, 40), 'g'],
    ]);
    expect(bodies).toMatch(/\/S \/Luminosity \/G \d+ 0 R \/BC \[0 0 0\]/);
  });

  it('clips by any other mask as its solid silhouette', async () => {
    const { bodies, streams } = await draw([
      group('g', [], { maskNodeId: 'mask', maskMode: 'clip' }),
      [rect('mask', 0, 0, 10, 10, { opacity: 0.3, strokes: [line(BLUE, 2)] }), 'g'],
      [rect('content', 0, 0, 40, 40), 'g'],
    ]);
    expect(bodies).toMatch(/\/S \/Alpha/);
    expect(streams).toContain('1 1 1 rg');
    expect(streams).toContain('1 1 1 RG');
  });

  it('blends a layer as a whole: an isolated group painted in its blend mode', async () => {
    const { page, bodies } = await draw([rect('box', 0, 0, 10, 10, { blendMode: 'multiply' })]);
    expect(bodies).toContain('/BM /Multiply');
    expect(bodies).toContain('/Group << /Type /Group /S /Transparency /CS /DeviceRGB /I true >>');
    expect(page).toMatch(/\/G\d+ gs \/X\d+ Do/);
  });

  it('paints a boolean group’s result, worked out in the world, with the group’s own fills', async () => {
    const { page } = await draw([
      group('union', [], { booleanOp: 'union', fills: [solid(BLUE)], strokes: [] }),
      [rect('a', 0, 0, 10, 10), 'union'],
      [rect('b', 5, 5, 10, 10), 'union'],
    ]);
    const result = block(page, '0 0 1 rg');
    expect(result).toContain('1 0 0 1 0 0 cm');
    expect(result.match(/ l\n/g)?.length).toBeGreaterThanOrEqual(7);
    expect(result).toMatch(/f\*$/);
    expect(page).not.toContain('1 0 0 rg');
  });

  it('draws a symbol instance as its symbol’s artwork, where the instance is', async () => {
    const symbol: SymbolDefinition = {
      id: 'sym',
      name: 'Badge',
      sceneGraphJSON: { nodes: [rect('art', 2, 0, 4, 4)], rootNodeIds: ['art'] },
    };
    const instance = {
      ...base('use', 30, 10),
      type: 'symbol-instance',
      symbolId: 'sym',
      overrides: [],
    } as Node;
    const { page } = await draw([instance], { symbols: [symbol] });
    expect(block(page, '1 0 0 rg')).toContain('1 0 0 1 32 10 cm');
  });

  it('blends a group as a whole, its layers painted together in an isolated group', async () => {
    const { page, streams, bodies } = await draw([
      group('g', [], { blendMode: 'difference' }),
      [rect('a', 0, 0, 10, 10), 'g'],
      [rect('b', 5, 5, 10, 10, { fills: [solid(BLUE)] }), 'g'],
    ]);
    expect(bodies).toContain('/BM /Difference');
    expect(page).toMatch(/\/G\d+ gs \/X\d+ Do/);
    // Both painted in the group's form, not on the page
    expect(page).not.toContain('1 0 0 rg');
    expect(streams).toContain('1 0 0 rg');
    expect(streams).toContain('0 0 1 rg');
  });
});

describe('effects', () => {
  const raster = (width: number, height: number) => ({
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4).fill(255),
  });

  it('draws a drop shadow from the layer’s silhouette under it, moved by its offset (down for a positive Y)', async () => {
    const render = vi.fn((_id: string, rect: { width: number; height: number }, scale: number) =>
      Promise.resolve(raster(Math.round(rect.width * scale), Math.round(rect.height * scale)))
    );
    const rasterizer: PdfRasterizer = { render };
    const shadow = {
      id: 's',
      type: 'drop-shadow' as const,
      visible: true,
      color: { r: 0, g: 0, b: 0, a: 1 },
      offsetX: 4,
      offsetY: 6,
      blur: 3,
      spread: 0,
      opacity: 0.5,
    };
    const { page, bodies } = await draw([rect('box', 0, 0, 10, 10, { effects: [shadow] })], {
      rasterizer: () => rasterizer,
    });
    expect(render).toHaveBeenCalledWith('box', { x: -10, y: -10, width: 20, height: 20 }, 2, false);
    // The shadow, then the layer itself, still vector
    expect(page).toMatch(/20 0 0 20 -6 -16 cm\n\/X\d+ Do[\s\S]*1 0 0 rg/);
    expect(bodies).toMatch(/\/ColorSpace \/DeviceRGB \/Interpolate true \/SMask \d+ 0 R/);
  });

  it('draws a blurred layer as the renderer draws it, in its place', async () => {
    const render = vi.fn(() => Promise.resolve(raster(4, 4)));
    const blur = { id: 'b', type: 'layer-blur' as const, visible: true, radius: 6 };
    const { page } = await draw([rect('box', 0, 0, 10, 10, { effects: [blur] })], {
      rasterizer: () => ({ render }),
    });
    expect(render).toHaveBeenCalledWith('box', expect.anything(), 3, true);
    expect(page).toContain('Do');
    expect(page).not.toContain('1 0 0 rg');
  });

  it('draws an adjusted picture as the renderer draws it, at the picture\u2019s own resolution on the page', async () => {
    const render = vi.fn(() => Promise.resolve(raster(4, 4)));
    const photo = image('photo', 20, 10, {
      adjustments: {
        brightness: 20,
        contrast: 0,
        saturation: 0,
        hue: 0,
        exposure: 0,
        temperature: 0,
        tint: 0,
        blur: 0,
      },
    });
    photo.transform.scale = { x: 2, y: 2 };
    await draw([photo], {
      rasterizer: () => ({ render }),
      decodeImage: () =>
        Promise.resolve({
          kind: 'pixels',
          width: 200,
          height: 100,
          data: new Uint8ClampedArray(80_000),
        }),
    });
    // 200 pixels across 40 units of the page
    expect(render).toHaveBeenCalledWith('photo', expect.anything(), 5, true);
  });

  it('draws a blurred group as the renderer draws it, its layers and all, in its place', async () => {
    const render = vi.fn(() => Promise.resolve(raster(4, 4)));
    const blur = { id: 'b', type: 'layer-blur' as const, visible: true, radius: 20 };
    const { page } = await draw(
      [group('g', [], { effects: [blur] }), [rect('a', 0, 0, 10, 10), 'g']],
      { rasterizer: () => ({ render }) }
    );
    expect(render).toHaveBeenCalledWith('g', expect.anything(), expect.any(Number), true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(page).toContain('Do');
    expect(page).not.toContain('1 0 0 rg');
  });

  it('draws layers with effects plainly without a renderer', async () => {
    const blur = { id: 'b', type: 'layer-blur' as const, visible: true, radius: 6 };
    const { page } = await draw([rect('box', 0, 0, 10, 10, { effects: [blur] })]);
    expect(page).toContain('1 0 0 rg');
    expect(page).not.toContain('Do');
  });
});

describe('gaussianBlur', () => {
  it('spreads a point evenly round it and keeps its weight', () => {
    const size = 31;
    const values = new Float32Array(size * size);
    values[15 * size + 15] = 1;
    gaussianBlur(values, size, size, 3);
    const sum = values.reduce((total, v) => total + v, 0);
    expect(sum).toBeCloseTo(1, 3);
    expect(values[15 * size + 12]).toBeCloseTo(values[15 * size + 18]!, 6);
    expect(values[12 * size + 15]).toBeCloseTo(values[15 * size + 12]!, 6);
    expect(values[15 * size + 15]!).toBeGreaterThan(values[15 * size + 18]!);
  });
});
