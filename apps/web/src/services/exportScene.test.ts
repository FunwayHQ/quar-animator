import { describe, it, expect } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { ArtboardNode, RectangleNode, Timeline } from '@quar/types';
import {
  defaultExportSize,
  exportRig,
  getArtboardScope,
  getLottieExportScene,
  getSceneExportScope,
  getSlides,
  slideShow,
  slidesSeconds,
} from './exportScene';

const white = {
  type: 'solid' as const,
  color: { r: 255, g: 255, b: 255, a: 1 },
  opacity: 1,
  visible: true,
};

function artboard(id: string, children: string[] = []): ArtboardNode {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children,
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 200,
    height: 100,
    fills: [white],
    clipContent: true,
  };
}

function box(id: string, parent: string | null, x: number): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y: 0 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 20,
    height: 20,
    cornerRadius: [0, 0, 0, 0],
    fills: [white],
    strokes: [],
  };
}

const timeline = (tracks: Timeline['tracks'] = []): Timeline => ({
  id: 't',
  name: 'Main Timeline',
  duration: 30,
  frameRate: 30,
  tracks,
  markers: [],
});

describe('exportScene', () => {
  it("scopes an export to the selected artboard, or to the page's only one", () => {
    const graph = new SceneGraph();
    graph.fromJSON({ nodes: [artboard('a', ['b']), box('b', 'a', 10)], rootNodeIds: ['a'] });
    expect(getArtboardScope(graph, new Set(['a']))?.implicit).toBe(false);
    expect(getArtboardScope(graph, new Set())?.implicit).toBe(true);
    expect(getArtboardScope(graph, new Set(['b']))).toBeNull();
    expect(getArtboardScope(graph, new Set())?.bounds).toMatchObject({ width: 200, height: 100 });
  });

  it('moves an artboard into the Lottie frame, its fill underneath', () => {
    const graph = new SceneGraph();
    graph.fromJSON({ nodes: [artboard('a', ['b']), box('b', 'a', 10)], rootNodeIds: ['a'] });
    const scope = getArtboardScope(graph, new Set(['a']));
    const track = {
      id: 'k',
      nodeId: 'b',
      property: 'transform.position.x',
      keyframes: [{ id: 'f', time: 0, value: 10, easing: 'linear' as const }],
    };
    // Twice the artboard's size: everything scales with it
    const scene = getLottieExportScene(graph, timeline([track]), scope, 400, 200);
    expect(scene.nodes.map((n) => n.id)).toEqual(['a:background', 'b']);
    expect(scene.nodes[1]?.transform.position).toEqual({ x: 220, y: 100 });
    expect(scene.nodes[1]?.transform.scale).toEqual({ x: 2, y: 2 });
    expect(scene.timeline.tracks[0]?.keyframes[0]?.value).toBe(220);
    // Without an artboard: the page as it is
    const page = getLottieExportScene(graph, timeline([track]), null, 400, 200);
    expect(page.nodes.map((n) => n.id)).toEqual(['a']);
  });

  it('frames a page without artboards by its artwork, and sizes exports to fit', () => {
    const graph = new SceneGraph();
    graph.fromJSON({ nodes: [box('b', null, 100)], rootNodeIds: ['b'] });
    const scope = getSceneExportScope(graph, timeline(), [], 30, exportRig({}, 30));
    expect(scope).toMatchObject({ x: 90, width: 20, height: 20 });
    expect(defaultExportSize({ width: 20000, height: 10000 })).toEqual({
      width: 8192,
      height: 4096,
    });
    expect(defaultExportSize(null)).toEqual({ width: 800, height: 600 });
  });

  it('gives each slide the transition into it (none into the first), through to the export', () => {
    const graph = new SceneGraph();
    graph.fromJSON({
      nodes: [artboard('third'), artboard('second'), artboard('first')],
      // The topmost in the Layers panel (the last) is the first slide
      rootNodeIds: ['third', 'second', 'first'],
    });
    const fade = { type: 'fade' as const, duration: 0.5 };
    const wipe = { type: 'wipe' as const, direction: 'up' as const, duration: 1 };
    const deck: Timeline = {
      ...timeline(),
      artboards: {
        first: { duration: 30, transition: fade },
        second: { duration: 60 },
        third: { duration: 15, transition: wipe },
      },
    };
    const slides = getSlides(graph, deck);
    expect(slides.map((slide) => [slide.node.id, slide.transition])).toEqual([
      ['first', null],
      ['second', null],
      ['third', wipe],
    ]);
    // 1 s + 2 s + a second's wipe + half a second
    expect(slidesSeconds(slides, 30)).toBe(4.5);
    const show = slideShow(slides, { sceneGraph: graph, timeline: deck }, 200, 100);
    expect(show.map((slide) => slide.transition)).toEqual([null, null, wipe]);
  });
});
