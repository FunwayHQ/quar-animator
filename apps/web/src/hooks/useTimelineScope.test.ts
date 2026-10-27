import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Node } from '@quar/types';

import { SceneGraphProvider, useSceneGraph } from '../contexts/SceneGraphContext';
import { useEditorStore } from '../stores/editorStore';
import { useTimelineScope } from './useTimelineScope';

function wrapper({ children }: { children: ReactNode }) {
  return SceneGraphProvider({ children });
}

function layer(id: string, type: string): Node {
  return {
    id,
    name: id,
    type,
    parent: null,
    children: [],
    transform: {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    clipContent: true,
  } as unknown as Node;
}

function setUp() {
  const { result } = renderHook(
    () => {
      useTimelineScope();
      return useSceneGraph();
    },
    { wrapper }
  );
  const sg = result.current;
  act(() => {
    sg.addNode(layer('slide1', 'artboard'));
    sg.addNode(layer('title', 'rectangle'), 'slide1');
    sg.addNode(layer('slide2', 'artboard'));
    sg.addNode(layer('photo', 'rectangle'), 'slide2');
    sg.addNode(layer('note', 'rectangle'));
  });
  return sg;
}

const select = (...ids: string[]) =>
  act(() => useEditorStore.setState({ selectedNodeIds: new Set(ids) }));

describe('the timeline in view', () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
  });

  it('is the artboard’s of what you select, else the page’s', () => {
    setUp();
    select('photo');
    expect(useEditorStore.getState().timelineScope).toBe('slide2');
    select('slide1');
    expect(useEditorStore.getState().timelineScope).toBe('slide1');
    select('note');
    expect(useEditorStore.getState().timelineScope).toBeNull();
    // Nothing selected: the one in view stays
    select('title');
    select();
    expect(useEditorStore.getState().timelineScope).toBe('slide1');
  });

  it('goes back to the page’s when the artboard in view is deleted', () => {
    const sg = setUp();
    select('photo');
    act(() => sg.removeNode('slide2'));
    expect(useEditorStore.getState().timelineScope).toBeNull();
  });
});
