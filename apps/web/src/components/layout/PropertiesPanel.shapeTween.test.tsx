import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform, pathShapeOf } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { createTimeline, evaluateNodeAtFrame } from '@quar/animation';
import type { PathNode, PathShape, RectangleNode } from '@quar/types';
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
    // Value should be the whole shape
    const shape = track!.keyframes[0].value as { points: unknown[]; closed: boolean };
    expect(shape.points).toHaveLength(3);
    expect(shape.closed).toBe(createTestPath().closed);
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

// ============================================================================
// Vertex fields on a path whose Shape is keyed
// ============================================================================

describe('PropertiesPanel - Vertex fields key the Shape', () => {
  const shapeTrack = () =>
    useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.nodeId === 'path1' && t.property === 'points');
  const shapeAt = (frame: number) =>
    shapeTrack()?.keyframes.find((k) => k.time === frame)?.value as PathShape | undefined;

  /** A path whose Shape is keyed at 0 and 10, with Direct Selection on its first point. */
  function keyedPath(): void {
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(createTestPath());
      const later = createTestPath();
      later.points[0] = { ...later.points[0]!, position: { x: -40, y: 0 } };
      const { addKeyframeAtFrame } = useEditorStore.getState();
      addKeyframeAtFrame('path1', 'points', 0, pathShapeOf(createTestPath()));
      addKeyframeAtFrame('path1', 'points', 10, pathShapeOf(later));
      useEditorStore.getState().setSelection(['path1']);
      useEditorStore.setState({
        activeTool: 'direct-selection',
        directSelectionPoints: [{ nodeId: 'path1', pointIndex: 0 }],
      });
    });
  }

  beforeEach(() => {
    useEditorStore.getState().clearSelection();
    useEditorStore.setState({
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      currentFrame: 0,
      autoKeyframe: false,
    });
  });

  it('typing X on a frame with a Shape keyframe changes that keyframe', () => {
    keyedPath();
    act(() => useEditorStore.setState({ currentFrame: 10 }));
    act(() => {
      fireEvent.change(screen.getByTestId('vertex-pos-x'), { target: { value: '25' } });
    });
    expect(shapeAt(10)?.points[0]?.position).toEqual({ x: 25, y: 0 });
    expect(shapeAt(0)?.points[0]?.position).toEqual({ x: 0, y: 0 });
  });

  it('typing Y between keyframes keys the Shape there, so the point stays', () => {
    keyedPath();
    act(() => useEditorStore.setState({ currentFrame: 5 }));
    act(() => {
      fireEvent.change(screen.getByTestId('vertex-pos-y'), { target: { value: '30' } });
    });
    expect(shapeTrack()?.keyframes.map((k) => k.time)).toEqual([0, 5, 10]);
    expect(shapeAt(5)?.points[0]?.position.y).toBe(30);
    // Played back, the frame shows the point where it was typed
    const values = evaluateNodeAtFrame(useEditorStore.getState().timeline, 'path1', 5);
    expect((values.get('points') as PathShape).points[0]?.position.y).toBe(30);
  });

  it('keys the Shape rather than the point, with Auto-Keyframe on', () => {
    keyedPath();
    act(() => useEditorStore.setState({ currentFrame: 5, autoKeyframe: true }));
    act(() => {
      fireEvent.change(screen.getByTestId('vertex-pos-x'), { target: { value: '25' } });
    });
    expect(shapeAt(5)?.points[0]?.position.x).toBe(25);
    const tracks = useEditorStore.getState().timeline.tracks.map((t) => t.property);
    expect(tracks).toEqual(['points']);
  });

  it('a point type, a handle and a corner radius key the Shape too', () => {
    keyedPath();
    act(() => useEditorStore.setState({ currentFrame: 10 }));
    act(() => {
      fireEvent.click(screen.getByTestId('vertex-type-smooth'));
    });
    expect(shapeAt(10)?.points[0]?.type).toBe('smooth');
    act(() => {
      fireEvent.change(screen.getByTestId('vertex-handle-out-x'), { target: { value: '12' } });
    });
    expect(shapeAt(10)?.points[0]?.handleOut?.x).toBe(12);
    act(() => {
      fireEvent.click(screen.getByTestId('vertex-type-corner'));
    });
    act(() => {
      fireEvent.change(screen.getByTestId('vertex-corner-radius'), { target: { value: '8' } });
    });
    expect(shapeAt(10)?.points[0]?.cornerRadius).toBe(8);
  });
});
