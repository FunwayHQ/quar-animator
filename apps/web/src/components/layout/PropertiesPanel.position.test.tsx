/**
 * Tests for a group's and a symbol instance's Position in the Properties
 * panel: their top-left corner, as a shape's fields and the rulers have it
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, act, fireEvent, screen } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { SelectionManager, createDefaultTransform } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { ArtboardNode, RectangleNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';

function SceneGraphCapture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  onCapture(useSceneGraph());
  return null;
}

function renderPanel(): SceneGraph {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  if (!sg) throw new Error('no scene graph');
  return sg;
}

function rect(id: string, x: number, y: number, width: number, height: number): RectangleNode {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function artboard(id: string, x: number, y: number): ArtboardNode {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x, y } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 400,
    height: 300,
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    clipContent: true,
  } as ArtboardNode;
}

const posX = () => document.getElementById('prop-pos-x') as HTMLInputElement;
/** The Y field: the one after X in the Position row */
const posY = () =>
  posX().closest('[class*="propertyInputs"]')?.querySelectorAll('input')[1] as HTMLInputElement;

/** Where the selected layer's box is drawn: its left, and its top (Y counts up). */
function drawnCorner(sg: SceneGraph): { left: number; top: number } {
  const manager = new SelectionManager();
  manager.setSymbolDefinitions(useEditorStore.getState().symbols);
  const box = manager.getSelectionBounds(useEditorStore.getState().selectedNodeIds, sg)?.rect;
  if (!box) throw new Error('no bounds');
  return { left: box.x, top: box.y + box.height };
}

/** Two rectangles from (-10, -5) to (60, 40), drawn, selected and grouped (Ctrl+G). */
function groupTwo(sg: SceneGraph, parent?: string): string {
  sg.addNode(rect('a', 0, 0, 20, 10), parent);
  sg.addNode(rect('b', 50, 30, 20, 20), parent);
  useEditorStore.getState().setSelection(['a', 'b']);
  useEditorStore.getState().groupSelection(sg);
  const [id] = useEditorStore.getState().selectedNodeIds;
  if (!id) throw new Error('not grouped');
  return id;
}

describe('a group’s and a symbol instance’s Position', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
    useEditorStore.setState({
      snapToGrid: false,
      autoKeyframe: false,
      currentFrame: 0,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      symbols: [],
      undoStack: [],
    });
  });

  it('is a group’s top-left corner, as for a rectangle', () => {
    const sg = renderPanel();
    act(() => void groupTwo(sg));

    expect(sg.getNode([...useEditorStore.getState().selectedNodeIds][0]!)?.type).toBe('group');
    expect(posX().value).toBe('-10.0');
    expect(posY().value).toBe('40.0');
  });

  it('moves a group to exactly where X and Y are typed', () => {
    const sg = renderPanel();
    act(() => void groupTwo(sg));

    act(() => void fireEvent.change(posX(), { target: { value: '100' } }));
    act(() => void fireEvent.change(posY(), { target: { value: '-20' } }));

    expect(drawnCorner(sg)).toEqual({ left: 100, top: -20 });
    expect(posX().value).toBe('100.0');
    expect(posY().value).toBe('-20.0');
  });

  it('keys a group’s position where it was moved to, with auto-keyframe on', () => {
    const sg = renderPanel();
    let groupId = '';
    act(() => {
      groupId = groupTwo(sg);
      useEditorStore.setState({ autoKeyframe: true, currentFrame: 12 });
    });

    act(() => void fireEvent.change(posX(), { target: { value: '100' } }));

    const track = useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.nodeId === groupId && t.property === 'transform.position.x');
    expect(track?.keyframes.map((k) => [k.time, k.value])).toEqual([
      [12, sg.getNode(groupId)?.transform.position.x],
    ]);
    expect(drawnCorner(sg).left).toBe(100);
  });

  it('is a group’s corner in its artboard, where the artboard’s layers’ positions are', () => {
    const sg = renderPanel();
    act(() => {
      sg.addNode(artboard('board', 300, 100));
      groupTwo(sg, 'board');
    });

    // Its rectangles' corners in the artboard: the same place, shown the same way
    expect(posX().value).toBe('-10.0');
    expect(posY().value).toBe('40.0');

    act(() => void fireEvent.change(posX(), { target: { value: '0' } }));
    expect(drawnCorner(sg).left).toBe(300);
  });

  it('snaps a group’s corner to the grid when snapping is turned on', () => {
    const sg = renderPanel();
    act(() => {
      groupTwo(sg);
      useEditorStore.setState({ gridSize: 25 });
    });

    act(() => void fireEvent.click(screen.getByTestId('snap-to-grid-toggle')));

    expect(drawnCorner(sg)).toEqual({ left: 0, top: 50 });
    act(() => useEditorStore.setState({ snapToGrid: false, gridSize: 10 }));
  });

  it('is a symbol instance’s top-left corner, and moves it to exactly where it’s typed', () => {
    const sg = renderPanel();
    act(() => {
      sg.addNode(rect('a', 0, 0, 20, 10));
      sg.addNode(rect('b', 50, 30, 20, 20));
      useEditorStore.getState().setSelection(['a', 'b']);
      useEditorStore.getState().createSymbol(sg);
    });
    expect(sg.getNode([...useEditorStore.getState().selectedNodeIds][0]!)?.type).toBe(
      'symbol-instance'
    );
    expect(posX().value).toBe('-10.0');
    expect(posY().value).toBe('40.0');

    act(() => void fireEvent.change(posX(), { target: { value: '100' } }));
    act(() => void fireEvent.change(posY(), { target: { value: '-20' } }));

    expect(drawnCorner(sg)).toEqual({ left: 100, top: -20 });
  });
});
