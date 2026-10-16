import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline, createTrack, addKeyframe } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { Node } from '@quar/types';

function renderTimeline() {
  return render(
    <SceneGraphProvider>
      <Timeline />
    </SceneGraphProvider>
  );
}

describe('Timeline', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      workAreaEnabled: false,
      workAreaStart: 0,
      workAreaEnd: 299,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
    });
  });

  it('renders transport controls', () => {
    renderTimeline();

    expect(screen.getByTitle('Go to start (Home)')).toBeInTheDocument();
    expect(screen.getByTitle('Previous frame (,)')).toBeInTheDocument();
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
    expect(screen.getByTitle('Next frame (.)')).toBeInTheDocument();
    expect(screen.getByTitle('Go to end (End)')).toBeInTheDocument();
  });

  it('renders option buttons', () => {
    renderTimeline();

    expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle onion skinning (Shift+O)')).toBeInTheDocument();
  });

  it('displays time in correct format', () => {
    renderTimeline();

    // Initial time should be 00:00:00
    expect(screen.getByText('00:00:00')).toBeInTheDocument();

    // Duration should be 00:10:00 (10 seconds at 30fps = 300 frames)
    expect(screen.getByText('00:10:00')).toBeInTheDocument();
  });

  it('allows extending the timeline beyond 300 frames', () => {
    renderTimeline();

    const durationInput = screen.getByRole('spinbutton', {
      name: 'Timeline duration in frames',
    });
    fireEvent.change(durationInput, { target: { value: '600' } });
    fireEvent.blur(durationInput);

    const state = useEditorStore.getState();
    expect(state.timelineDuration).toBe(600);
    expect(state.timeline.duration).toBe(600);
    expect(state.workAreaEnd).toBe(599);
    expect(state.isDirty).toBe(true);
    expect(screen.getByTestId('timeline-ruler')).toHaveAttribute('aria-valuemax', '599');
    expect(screen.getByText('00:20:00')).toBeInTheDocument();
  });

  it('zooms the ruler and tracks together', () => {
    renderTimeline();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in timeline' }));
    expect(screen.getByTestId('timeline-zoom-level')).toHaveTextContent('125%');
    expect(screen.getByTestId('timeline-content')).toHaveStyle({ width: '125%' });

    fireEvent.click(screen.getByRole('button', { name: 'Zoom out timeline' }));
    expect(screen.getByTestId('timeline-zoom-level')).toHaveTextContent('100%');
    expect(screen.getByTestId('timeline-content')).toHaveStyle({ width: '100%' });
  });

  it('pans with Magic Mouse side swipes and Shift+wheel, clamped to scroll bounds', () => {
    renderTimeline();

    const scrollArea = screen.getByTestId('timeline-scroll-area');
    Object.defineProperty(scrollArea, 'clientWidth', { configurable: true, value: 300 });
    Object.defineProperty(scrollArea, 'scrollWidth', { configurable: true, value: 600 });

    fireEvent.wheel(scrollArea, { deltaY: 80, shiftKey: true });
    expect(scrollArea.scrollLeft).toBe(80);

    scrollArea.scrollLeft = 0;
    fireEvent.wheel(scrollArea, { deltaX: 120 });
    expect(scrollArea.scrollLeft).toBe(120);

    fireEvent.wheel(scrollArea, { deltaX: 500 });
    expect(scrollArea.scrollLeft).toBe(300);
  });

  it('displays "No layers" when scene graph is empty', () => {
    renderTimeline();

    expect(screen.getByText('No layers')).toBeInTheDocument();
  });

  it('shows keyframes for nodes nested inside a group', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }
    const track = createTrack<number>('child', 'transform.rotation');
    const keyframe = addKeyframe(track, 12, 45);
    useEditorStore.setState({ timeline: createTimeline({ tracks: [track] }) });

    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Timeline />
      </SceneGraphProvider>
    );
    act(() => {
      graph!.addNode({ id: 'parent', name: 'Parent', children: [] } as unknown as Node);
      graph!.addNode({ id: 'child', name: 'Child', children: [] } as unknown as Node, 'parent');
    });

    expect(screen.getByText('Parent')).toBeInTheDocument();
    expect(screen.getByText('Child')).toBeInTheDocument();
    expect(screen.getByTestId(`keyframe-${keyframe.id}`)).toBeInTheDocument();
  });

  it('adds an opacity keyframe from the empty timeline context menu', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }

    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Timeline />
      </SceneGraphProvider>
    );
    act(() => {
      graph!.addNode({
        id: 'opacity-node',
        name: 'Opacity layer',
        type: 'rectangle',
        parent: null,
        children: [],
        opacity: 0.4,
      } as unknown as Node);
      useEditorStore.setState({ selectedNodeIds: new Set(['opacity-node']) });
    });

    const tracks = screen.getByTestId('timeline-tracks');
    Object.defineProperty(tracks, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 300,
          bottom: 80,
          width: 300,
          height: 80,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    fireEvent.contextMenu(tracks, { clientX: 75, clientY: 30 });
    fireEvent.click(screen.getByText('Add Opacity Keyframe at Frame 75'));

    const opacityTrack = useEditorStore
      .getState()
      .timeline.tracks.find(
        (track) => track.nodeId === 'opacity-node' && track.property === 'opacity'
      );
    expect(useEditorStore.getState().currentFrame).toBe(75);
    expect(opacityTrack?.keyframes).toHaveLength(1);
    expect(opacityTrack?.keyframes[0]?.time).toBe(75);
    expect(opacityTrack?.keyframes[0]?.value).toBe(0.4);
  });

  it('displays ruler marks', () => {
    renderTimeline();

    // Should display frame numbers
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('selects a ruler range and enables looping playback for that range', () => {
    useEditorStore.setState({
      workAreaEnabled: false,
      workAreaStart: 0,
      workAreaEnd: 299,
      isLooping: false,
      currentFrame: 10,
    });
    renderTimeline();

    const ruler = screen.getByTestId('timeline-ruler');
    Object.defineProperty(ruler, 'getBoundingClientRect', {
      configurable: true,
      value: () =>
        ({
          x: 0,
          y: 0,
          left: 0,
          top: 0,
          right: 300,
          bottom: 28,
          width: 300,
          height: 28,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    fireEvent.pointerDown(ruler, { button: 0, clientX: 20, pointerId: 1 });
    fireEvent.pointerMove(ruler, { button: 0, clientX: 120, pointerId: 1 });
    fireEvent.pointerUp(ruler, { button: 0, clientX: 120, pointerId: 1 });
    fireEvent.click(ruler, { clientX: 120 });

    const state = useEditorStore.getState();
    expect(state.workAreaEnabled).toBe(true);
    expect(state.workAreaStart).toBe(20);
    expect(state.workAreaEnd).toBe(120);
    expect(state.isLooping).toBe(true);
    // Completing a range drag must not also scrub the playhead.
    expect(state.currentFrame).toBe(10);
  });

  it('toggles play state when play button clicked', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const playButton = screen.getByTitle('Play/Pause (Space)');
    await user.click(playButton);

    expect(useEditorStore.getState().isPlaying).toBe(true);
  });

  it('navigates to start when go to start is clicked', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ currentFrame: 50 });
    renderTimeline();

    const goToStartButton = screen.getByTitle('Go to start (Home)');
    await user.click(goToStartButton);

    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  it('steps forward one frame', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const nextButton = screen.getByTitle('Next frame (.)');
    await user.click(nextButton);

    expect(useEditorStore.getState().currentFrame).toBe(1);
    // Time should now be 00:00:01 (1 frame at 30fps)
    expect(screen.getByText('00:00:01')).toBeInTheDocument();
  });

  it('steps backward one frame', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ currentFrame: 2 });
    renderTimeline();

    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    expect(useEditorStore.getState().currentFrame).toBe(1);
  });

  it('navigates to end when go to end is clicked', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const goToEndButton = screen.getByTitle('Go to end (End)');
    await user.click(goToEndButton);

    expect(useEditorStore.getState().currentFrame).toBe(299);
  });

  it('does not go below frame 0', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  // ============================================================================
  // Collapsed mode
  // ============================================================================

  describe('collapsed mode', () => {
    it('renders collapsed bar when timelineExpanded is false', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.getByTitle('Expand timeline')).toBeInTheDocument();
      expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });

    it('does not render transport controls in collapsed mode', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.queryByTitle('Go to start (Home)')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Go to end (End)')).not.toBeInTheDocument();
    });

    it('toggles to expanded when expand button clicked', async () => {
      const user = userEvent.setup();
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      await user.click(screen.getByTitle('Expand timeline'));
      expect(useEditorStore.getState().timelineExpanded).toBe(true);
    });

    it('toggles to collapsed when collapse button clicked', async () => {
      const user = userEvent.setup();
      renderTimeline();

      await user.click(screen.getByTitle('Collapse timeline'));
      expect(useEditorStore.getState().timelineExpanded).toBe(false);
    });

    it('shows loop toggle in collapsed mode', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    });
  });
});
