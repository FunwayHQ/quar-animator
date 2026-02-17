import { describe, it, expect, beforeEach } from 'vitest';
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

  it('updates graph view transform', () => {
    useEditorStore.getState().setGraphViewTransform({ scaleX: 20 });
    expect(useEditorStore.getState().graphViewTransform.scaleX).toBe(20);
    expect(useEditorStore.getState().graphViewTransform.scaleY).toBe(50); // unchanged
  });
});
