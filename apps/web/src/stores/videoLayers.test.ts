/**
 * Video layers in the editing commands, as pictures are: masks (as the mask
 * and masked), groups, flips, artboards; kept out of booleans and Convert
 * to Path, as pictures are.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, SelectionManager, createDefaultTransform } from '@quar/core';
import type { GroupNode, RectangleNode } from '@quar/types';
import { useEditorStore, getMaskSelection } from './editorStore';
import { flipSelected } from '../components/canvas/flipSelected';
import { intoArtboardBeneath } from '../services/intoArtboard';
import { artboard, videoLayer } from '../test/videoLayer';

function rectangle(id: string): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 80,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

describe('video layers in editing commands', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    sceneGraph = new SceneGraph();
    useEditorStore.setState({ selectedNodeIds: new Set(), symbols: [] });
  });

  const select = (...ids: string[]) => useEditorStore.setState({ selectedNodeIds: new Set(ids) });

  it('masks with a video on top, as with a picture', () => {
    sceneGraph.addNode(rectangle('content'));
    sceneGraph.addNode(videoLayer('video', 'film'));
    select('content', 'video');

    expect(getMaskSelection(sceneGraph, new Set(['content', 'video']))?.maskNode.id).toBe('video');
    useEditorStore.getState().createMask(sceneGraph, 'alpha');

    const group = sceneGraph.getNode('video')?.parent;
    const mask = group ? (sceneGraph.getNode(group) as GroupNode) : undefined;
    expect(mask?.maskNodeId).toBe('video');
    expect(mask?.maskMode).toBe('alpha');
  });

  it('masks a video with a shape above it', () => {
    sceneGraph.addNode(videoLayer('video', 'film'));
    sceneGraph.addNode(rectangle('shape'));
    select('video', 'shape');

    useEditorStore.getState().createMask(sceneGraph, 'clip');

    const group = sceneGraph.getNode(sceneGraph.getNode('video')!.parent!) as GroupNode;
    expect(group.maskNodeId).toBe('shape');
    expect(group.children).toEqual(['video', 'shape']);
  });

  it('groups and ungroups a video with other layers', () => {
    sceneGraph.addNode(videoLayer('video', 'film'));
    sceneGraph.addNode(rectangle('shape'));
    select('video', 'shape');

    useEditorStore.getState().groupSelection(sceneGraph);
    const groupId = sceneGraph.getNode('video')?.parent;
    expect(groupId).toBeTruthy();
    expect(sceneGraph.getNode(groupId!)?.type).toBe('group');

    select(groupId!);
    useEditorStore.getState().ungroupSelection(sceneGraph);
    expect(sceneGraph.getNode('video')?.parent).toBeNull();
  });

  it('flips a video layer in place', () => {
    sceneGraph.addNode(videoLayer('video', 'film'));
    select('video');
    const bounds = () =>
      new SelectionManager().getSelectionBounds(new Set(['video']), sceneGraph)?.rect;
    const before = bounds();

    flipSelected(sceneGraph, 'horizontal');

    expect(sceneGraph.getNode('video')!.transform.scale.x).toBe(-1);
    expect(bounds()).toEqual(before);
  });

  it('goes into the artboard it’s put on', () => {
    sceneGraph.addNode(artboard('board'));
    sceneGraph.addNode(videoLayer('video', 'film'));

    intoArtboardBeneath(sceneGraph, 'video');

    expect(sceneGraph.getNode('video')?.parent).toBe('board');
  });

  it('is no boolean input, as a picture isn’t', () => {
    sceneGraph.addNode(videoLayer('video', 'film'));
    sceneGraph.addNode(rectangle('a'));
    select('video', 'a');

    useEditorStore.getState().booleanUnion(sceneGraph);

    expect(sceneGraph.getNode('video')?.parent).toBeNull();
    expect(sceneGraph.getRootNodes().some((n) => n.type === 'group')).toBe(false);
  });

  it('isn’t converted to a path', () => {
    sceneGraph.addNode(videoLayer('video', 'film'));
    select('video');

    useEditorStore.getState().convertSelectionToPaths(sceneGraph);

    expect(sceneGraph.getNode('video')?.type).toBe('video');
  });
});
