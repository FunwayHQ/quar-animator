import { describe, expect, it } from 'vitest';

import { SceneGraph, createDefaultTransform } from './SceneGraph';
import { artboardsInOrder, inTimelineScope, scopeNodeIds, timelineScopeOf } from './timelineScope';

function node(id: string, type: string) {
  return {
    id,
    name: id,
    type,
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    ...(type === 'artboard' ? { width: 100, height: 100, fills: [], clipContent: true } : {}),
  } as never;
}

function page() {
  const sg = new SceneGraph();
  sg.addNode(node('slide1', 'artboard'));
  sg.addNode(node('group', 'group'), 'slide1');
  sg.addNode(node('deep', 'group'), 'group');
  sg.addNode(node('slide2', 'artboard'));
  sg.addNode(node('loose', 'group'));
  return sg;
}

describe('which timeline a layer plays on', () => {
  it('is the artboard at the root of its branch, else the page’s', () => {
    const sg = page();
    expect(timelineScopeOf(sg, 'deep')).toBe('slide1');
    expect(timelineScopeOf(sg, 'slide2')).toBe('slide2');
    expect(timelineScopeOf(sg, 'loose')).toBeNull();
    expect(timelineScopeOf(sg, 'gone')).toBeNull();
  });

  it('plays an artboard and all in it, or everything outside every artboard', () => {
    const sg = page();
    expect([...scopeNodeIds(sg, 'slide1')].sort()).toEqual(['deep', 'group', 'slide1']);
    expect([...scopeNodeIds(sg, null)]).toEqual(['loose']);
  });

  it('keeps a layer no longer on the page with the page’s timeline', () => {
    const sg = page();
    const pageScope = inTimelineScope(sg, null);
    expect(['loose', 'gone', 'deep'].map(pageScope)).toEqual([true, true, false]);
    const slide = inTimelineScope(sg, 'slide1');
    expect(['deep', 'gone', 'loose'].map(slide)).toEqual([true, false, false]);
  });

  it('lists the artboards as the Layers panel does, topmost first', () => {
    expect(artboardsInOrder(page()).map((a) => a.id)).toEqual(['slide2', 'slide1']);
  });
});
