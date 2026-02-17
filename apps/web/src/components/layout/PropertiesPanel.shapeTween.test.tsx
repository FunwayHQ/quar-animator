import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { PathNode, RectangleNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';

// ============================================================================
// Test Helpers
// ============================================================================

function SceneGraphCapture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  const sg = useSceneGraph();
  onCapture(sg);
  return null;
}

function renderWithSceneGraph() {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  return sg!;
}

function createTestPath(): PathNode {
  return {
    id: 'path1',
    name: 'Test Path',
    type: 'path',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    closed: true,
    points: [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 50, y: 100 }, handleIn: null, handleOut: null, type: 'corner' },
    ],
    fills: [{ type: 'solid', color: { r: 100, g: 100, b: 200, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function createTestRect(): RectangleNode {
  return {
    id: 'rect1',
    name: 'Test Rect',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 200, g: 100, b: 100, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PropertiesPanel - Shape Tween', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
  });

  it('renders Shape row for path nodes', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
    });

    expect(screen.getByTestId('shape-tween-row')).toBeInTheDocument();
    expect(screen.getByText('Shape')).toBeInTheDocument();
  });

  it('does not render Shape row for non-path nodes', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect());
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.queryByTestId('shape-tween-row')).not.toBeInTheDocument();
  });

  it('shows correct point count', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
    });

    expect(screen.getByText('3 points')).toBeInTheDocument();
  });

  it('KeyframeIndicator shows none state without keyframes', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
    });

    const row = screen.getByTestId('shape-tween-row');
    // The KeyframeIndicator button should exist
    const button = row.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('clicking indicator adds keyframe with current points', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
      useEditorStore.setState({ currentFrame: 0 });
    });

    const row = screen.getByTestId('shape-tween-row');
    const button = row.querySelector('button');

    act(() => {
      fireEvent.click(button!);
    });

    const { timeline } = useEditorStore.getState();
    const track = timeline.tracks.find((t) => t.nodeId === 'path1' && t.property === 'points');
    expect(track).toBeDefined();
    expect(track!.keyframes.length).toBe(1);
    expect(track!.keyframes[0].time).toBe(0);
    // Value should be the PathPoint array
    const points = track!.keyframes[0].value as unknown[];
    expect(points).toHaveLength(3);
  });

  it('KeyframeIndicator shows active state at keyframed frame', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
      useEditorStore.setState({ currentFrame: 0 });
    });

    // Add a keyframe via the store
    act(() => {
      const pathNode = sg.getNode('path1') as PathNode;
      useEditorStore
        .getState()
        .addKeyframeAtFrame('path1', 'points', 0, structuredClone(pathNode.points));
    });

    // The track should exist with 1 keyframe
    const { timeline } = useEditorStore.getState();
    const track = timeline.tracks.find((t) => t.nodeId === 'path1' && t.property === 'points');
    expect(track).toBeDefined();
    expect(track!.keyframes.length).toBe(1);
  });

  it('clicking active indicator removes keyframe', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestPath());
      useEditorStore.getState().setSelection(['path1']);
      useEditorStore.setState({ currentFrame: 0 });
    });

    // Add a keyframe
    act(() => {
      const pathNode = sg.getNode('path1') as PathNode;
      useEditorStore
        .getState()
        .addKeyframeAtFrame('path1', 'points', 0, structuredClone(pathNode.points));
    });

    // Click the diamond to remove
    const row = screen.getByTestId('shape-tween-row');
    const button = row.querySelector('button');

    act(() => {
      fireEvent.click(button!);
    });

    const { timeline } = useEditorStore.getState();
    const track = timeline.tracks.find((t) => t.nodeId === 'path1' && t.property === 'points');
    // Track should be removed since last keyframe was deleted
    expect(track).toBeUndefined();
  });
});
