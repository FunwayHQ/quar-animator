import { describe, it, expect } from 'vitest';
import type { ArtboardNode, GroupNode, ImageNode, Node, RectangleNode } from '@quar/types';
import { createTimeline } from '@quar/animation';
import { exportToLottieJson } from './lottieExporter';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function base(id: string, name: string) {
  return {
    id,
    name,
    parent: null,
    children: [] as string[],
    transform: {
      position: { x: 100, y: 200 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
  };
}

function image(id: string, overrides: Partial<ImageNode> = {}): ImageNode {
  return {
    ...base(id, `Image ${id}`),
    type: 'image',
    src: PNG,
    width: 80,
    height: 40,
    naturalWidth: 80,
    naturalHeight: 40,
    cornerRadius: [0, 0, 0, 0],
    ...overrides,
  };
}

function rect(id: string): RectangleNode {
  return {
    ...base(id, `Rect ${id}`),
    type: 'rectangle',
    width: 50,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

const timeline = createTimeline({ duration: 60, frameRate: 30 });
const options = { width: 800, height: 600 };
const resolverOf =
  (...nodes: Node[]) =>
  (id: string) =>
    nodes.find((node) => node.id === id);

describe('images → Lottie', () => {
  it('exports a root image as an image layer with the picture embedded', () => {
    const animation = exportToLottieJson([image('i1')], timeline, options);
    const [layer] = animation.layers;
    expect(layer).toMatchObject({ ty: 2, refId: 'image_0', nm: 'Image i1' });
    // Pivot at the image center; positioned like any layer (Y flipped)
    expect(layer!.ks.a).toEqual({ a: 0, k: [40, 20] });
    expect(layer!.ks.p).toEqual({ a: 0, k: [100, 400] });
    expect(animation.assets).toEqual([{ id: 'image_0', w: 80, h: 40, u: '', p: PNG, e: 1 }]);
  });

  it('embeds a repeated picture once', () => {
    const animation = exportToLottieJson([image('i1'), image('i2')], timeline, options);
    expect(animation.assets).toHaveLength(1);
    expect(animation.layers.map((layer) => layer.refId)).toEqual(['image_0', 'image_0']);
  });

  it('gives a picture shown at another size an asset of that size', () => {
    const animation = exportToLottieJson(
      [image('i1'), image('i2', { width: 160, height: 80 }), image('i3')],
      timeline,
      options
    );
    // Lottie draws an image layer at its asset's size
    expect(animation.assets.map((asset) => [asset.id, asset.w, asset.h, asset.p])).toEqual([
      ['image_0', 80, 40, PNG],
      ['image_1', 160, 80, PNG],
    ]);
    expect(animation.layers.map((layer) => layer.refId)).toEqual(['image_0', 'image_1', 'image_0']);
  });

  it('clips rounded corners with a layer mask', () => {
    const [layer] = exportToLottieJson(
      [image('i1', { cornerRadius: [8, 8, 8, 8] })],
      timeline,
      options
    ).layers;
    expect(layer!.hasMask).toBe(true);
    const vertices = (layer!.masksProperties![0]!.pt.k as { v: number[][] }).v;
    // The mask stays within the image's own [0,w]×[0,h] space
    for (const [x, y] of vertices) {
      expect(x).toBeGreaterThanOrEqual(-0.001);
      expect(x).toBeLessThanOrEqual(80.001);
      expect(y).toBeGreaterThanOrEqual(-0.001);
      expect(y).toBeLessThanOrEqual(40.001);
    }
  });

  it('turns a group containing an image into a precomposition', () => {
    const img = { ...image('i1'), parent: 'g1' };
    const shape = { ...rect('r1'), parent: 'g1' };
    const group: GroupNode = {
      ...base('g1', 'Group'),
      type: 'group',
      children: ['i1', 'r1'],
    } as GroupNode;
    const animation = exportToLottieJson([group], timeline, options, resolverOf(group, img, shape));

    const [layer] = animation.layers;
    expect(layer).toMatchObject({ ty: 0, nm: 'Group', w: 3200, h: 3200 });
    // The group's origin is the precomp's center
    expect(layer!.ks.a).toEqual({ a: 0, k: [1600, 1600] });
    const comp = animation.assets!.find((asset) => asset.id === layer!.refId)!;
    // Top first: the rectangle (last child) over the image
    expect(comp.layers!.map((inner) => [inner.ty, inner.nm])).toEqual([
      [4, 'Rect r1'],
      [2, 'Image i1'],
    ]);
    // Children are placed relative to the precomp's center
    expect(comp.layers![1]!.ks.p).toEqual({ a: 0, k: [1700, 1400] });
  });

  it('exports an artboard with images with its background and clip', () => {
    const img = { ...image('i1'), parent: 'ab' };
    const artboard: ArtboardNode = {
      ...base('ab', 'Artboard'),
      type: 'artboard',
      width: 400,
      height: 300,
      fills: [
        { type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1, visible: true },
      ],
      clipContent: true,
      children: ['i1'],
    };
    const animation = exportToLottieJson([artboard], timeline, options, resolverOf(artboard, img));
    const [layer] = animation.layers;
    expect(layer!.hasMask).toBe(true);
    const comp = animation.assets!.find((asset) => asset.id === layer!.refId)!;
    expect(comp.layers!.map((inner) => inner.nm)).toEqual(['Image i1', 'Background']);
  });

  it('keeps a group mask over a precomposition’s content', () => {
    const img = { ...image('i1'), parent: 'g1' };
    const mask = { ...rect('m1'), parent: 'g1' };
    const group = {
      ...base('g1', 'Masked'),
      type: 'group',
      children: ['m1', 'i1'],
      maskNodeId: 'm1',
      maskMode: 'alpha',
    } as GroupNode;
    const animation = exportToLottieJson([group], timeline, options, resolverOf(group, img, mask));
    const comp = animation.assets!.find((asset) => asset.id === animation.layers[0]!.refId)!;
    expect(comp.layers!.map((inner) => [inner.ty, inner.td, inner.tt])).toEqual([
      [4, 1, undefined],
      [0, undefined, 1],
    ]);
  });

  it('keeps groups without images as shape layers', () => {
    const shape = { ...rect('r1'), parent: 'g1' };
    const group = { ...base('g1', 'Group'), type: 'group', children: ['r1'] } as GroupNode;
    const animation = exportToLottieJson([group], timeline, options, resolverOf(group, shape));
    expect(animation.layers[0]!.ty).toBe(4);
    expect(animation.assets).toEqual([]);
  });
});
