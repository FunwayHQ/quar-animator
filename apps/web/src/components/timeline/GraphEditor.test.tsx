import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { GraphEditor } from './GraphEditor';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline, KeyframeManager } from '@quar/animation';

function renderGraphEditor() {
  return render(
    <SceneGraphProvider>
      <GraphEditor />
    </SceneGraphProvider>
  );
}

function setupTimelineWithKeyframes() {
  const tl = createTimeline({ duration: 120, frameRate: 30 });
  const mgr = new KeyframeManager(tl);
  mgr.addKeyframe('node1', 'transform.position.x', 0, 100, 'linear');
  mgr.addKeyframe('node1', 'transform.position.x', 30, 200, 'linear');
  mgr.addKeyframe('node1', 'transform.position.x', 60, 150, 'linear');
  mgr.addKeyframe('node1', 'transform.position.y', 0, 50, 'linear');
  mgr.addKeyframe('node1', 'transform.position.y', 30, 100, 'linear');
  return tl;
}

describe('GraphEditor', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      currentFrame: 0,
      isPlaying: false,
      timelineDuration: 120,
      frameRate: 30,
      timelineViewMode: 'graph',
      graphVisibleTracks: [],
      graphViewTransform: {
        offsetX: 0,
        offsetY: 0,
        scaleX: 10,
        scaleY: 50,
        viewWidth: 800,
        viewHeight: 200,
      },
      selectedKeyframeIds: new Set<string>(),
    });
  });

  it('renders the graph editor container', () => {
    renderGraphEditor();
    expect(screen.getByTestId('graph-editor')).toBeInTheDocument();
  });

  it('renders the property list', () => {
    renderGraphEditor();
    expect(screen.getByTestId('graph-property-list')).toBeInTheDocument();
  });

  it('shows no-data message when no tracks', () => {
    renderGraphEditor();
    expect(screen.getByText('Select nodes with keyframes to view curves')).toBeInTheDocument();
  });

  it('renders curves when timeline has keyframes', () => {
    const tl = setupTimelineWithKeyframes();
    useEditorStore.setState({ timeline: tl });
    renderGraphEditor();
    expect(screen.getByTestId('graph-editor-curves')).toBeInTheDocument();
  });

  it('renders the grid when tracks are visible', () => {
    const tl = setupTimelineWithKeyframes();
    useEditorStore.setState({ timeline: tl });
    renderGraphEditor();
    expect(screen.getByTestId('graph-editor-grid')).toBeInTheDocument();
  });

  it('renders keyframes layer when tracks are visible', () => {
    const tl = setupTimelineWithKeyframes();
    useEditorStore.setState({ timeline: tl });
    renderGraphEditor();
    expect(screen.getByTestId('graph-editor-keyframes')).toBeInTheDocument();
  });

  it('renders the graph area', () => {
    renderGraphEditor();
    expect(screen.getByTestId('graph-editor-area')).toBeInTheDocument();
  });

  it('shows properties in property list when timeline has tracks', () => {
    const tl = setupTimelineWithKeyframes();
    useEditorStore.setState({ timeline: tl });
    renderGraphEditor();
    // Short property names should appear
    expect(screen.getByText('X')).toBeInTheDocument();
    expect(screen.getByText('Y')).toBeInTheDocument();
  });

  it('toggles timeline view mode', () => {
    expect(useEditorStore.getState().timelineViewMode).toBe('graph');
    useEditorStore.getState().toggleTimelineViewMode();
    expect(useEditorStore.getState().timelineViewMode).toBe('dopeSheet');
    useEditorStore.getState().toggleTimelineViewMode();
    expect(useEditorStore.getState().timelineViewMode).toBe('graph');
  });

  describe('Delete and arrow keys', () => {
    function renderWithTwoSelected() {
      const tl = setupTimelineWithKeyframes();
      const [first, second] = tl.tracks[0]!.keyframes;
      useEditorStore.setState({
        timeline: tl,
        selectedKeyframeIds: new Set([first!.id, second!.id]),
      });
      const view = renderGraphEditor();
      return { ids: [first!.id, second!.id], view };
    }

    const xTimes = () =>
      useEditorStore.getState().timeline.tracks[0]!.keyframes.map((kf) => kf.time);

    it('leave the keyframes alone while something else has focus, like the canvas', () => {
      renderWithTwoSelected();
      const canvas = document.createElement('canvas');
      canvas.tabIndex = 0;
      document.body.appendChild(canvas);
      try {
        canvas.focus();
        fireEvent.keyDown(canvas, { key: 'ArrowRight' });
        fireEvent.keyDown(canvas, { key: 'ArrowUp' });
        fireEvent.keyDown(canvas, { key: 'Delete' });
        fireEvent.keyDown(document.body, { key: 'Backspace' });
      } finally {
        canvas.remove();
      }
      expect(xTimes()).toEqual([0, 30, 60]);
      expect(useEditorStore.getState().timeline.tracks[0]!.keyframes.map((kf) => kf.value)).toEqual(
        [100, 200, 150]
      );
    });

    it('nudge and delete the selected keyframes once a press in the graph gives it focus', () => {
      const { ids, view } = renderWithTwoSelected();
      const area = screen.getByTestId('graph-editor-area');
      // Shift-press a selected dot: the selection stays and the graph takes focus
      const dot = view.container.querySelector('circle[class*="keyframeDot"]');
      expect(dot).not.toBeNull();
      fireEvent.mouseDown(dot!, { button: 0, shiftKey: true });
      fireEvent.mouseUp(area);
      expect(document.activeElement).toBe(area);
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set(ids));

      fireEvent.keyDown(area, { key: 'ArrowRight' });
      expect(xTimes()).toEqual([1, 31, 60]);

      fireEvent.keyDown(area, { key: 'Delete' });
      expect(xTimes()).toEqual([60]);
    });
  });

  it('updates graph view transform', () => {
    useEditorStore.getState().setGraphViewTransform({ scaleX: 20 });
    expect(useEditorStore.getState().graphViewTransform.scaleX).toBe(20);
    expect(useEditorStore.getState().graphViewTransform.scaleY).toBe(50); // unchanged
  });
});
