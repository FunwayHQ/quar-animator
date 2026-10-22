import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Profiler } from 'react';
import { act, fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { poseScene } from '../../stores/scenePosing';
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
    expect(
      screen.getByTitle('Onion skin settings (right-click turns it on or off, Shift+O)')
    ).toBeInTheDocument();
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

  it('sets the frames per second for the whole document', () => {
    const otherPage = { ...useEditorStore.getState().pages[0]!, id: 'page-2', name: 'Page 2' };
    useEditorStore.setState((s) => ({ pages: [...s.pages, otherPage], isDirty: false }));
    renderTimeline();

    const fps = screen.getByRole('spinbutton', { name: 'Frames per second' });
    expect(fps).toHaveValue(30);
    fireEvent.change(fps, { target: { value: '24' } });
    fireEvent.keyDown(fps, { key: 'Enter' });
    fireEvent.blur(fps);

    const state = useEditorStore.getState();
    expect(state.frameRate).toBe(24);
    expect(state.timeline.frameRate).toBe(24);
    expect(state.pages.every((page) => page.timeline.frameRate === 24)).toBe(true);
    expect(state.isDirty).toBe(true);
    // 300 frames at 24 fps
    expect(screen.getByText('00:12:12')).toBeInTheDocument();
  });

  it('keeps the frame rate within 1 to 120, and Escape keeps it as it was', () => {
    renderTimeline();
    const fps = screen.getByRole('spinbutton', { name: 'Frames per second' });

    fireEvent.change(fps, { target: { value: '500' } });
    fireEvent.blur(fps);
    expect(useEditorStore.getState().frameRate).toBe(120);
    expect(fps).toHaveValue(120);

    fireEvent.change(fps, { target: { value: '12' } });
    fireEvent.keyDown(fps, { key: 'Escape' });
    expect(fps).toHaveValue(120);

    fireEvent.change(fps, { target: { value: '' } });
    fireEvent.blur(fps);
    expect(useEditorStore.getState().frameRate).toBe(120);
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
    fireEvent.click(screen.getByTestId(`keyframe-${keyframe.id}`));
    expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set([keyframe.id]));
  });

  it('doesn’t redraw while a layer is dragged, only when a name or the order changes', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }
    const onRender = vi.fn();
    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Profiler id="timeline" onRender={onRender}>
          <Timeline />
        </Profiler>
      </SceneGraphProvider>
    );
    act(() => {
      graph!.addNode({ id: 'ball', name: 'Ball', children: [] } as unknown as Node);
      graph!.addNode({ id: 'box', name: 'Box', children: [] } as unknown as Node);
    });
    onRender.mockClear();

    // A drag moves the shape on every pointer move
    act(() => {
      for (let step = 0; step < 10; step++) {
        graph!.updateNode('ball', { opacity: step / 10 } as Partial<Node>);
      }
    });
    expect(onRender).not.toHaveBeenCalled();

    act(() => graph!.updateNode('ball', { name: 'Big ball' } as Partial<Node>));
    expect(onRender).toHaveBeenCalled();
    expect(screen.getByText('Big ball')).toBeInTheDocument();

    onRender.mockClear();
    act(() => graph!.moveNode('ball', null, 1));
    expect(onRender).toHaveBeenCalled();
    const labels = screen.getAllByTestId(/^timeline-layer-/).map((row) => row.textContent);
    expect(labels).toEqual(['Big ball', 'Box']);
  });

  it('lists the layers of a project as it loads (the whole graph replaced at once)', () => {
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
      graph!.fromJSON({
        nodes: [{ id: 'loaded', name: 'Loaded Layer', children: [] } as unknown as Node],
        rootNodeIds: ['loaded'],
      });
    });
    expect(screen.getByText('Loaded Layer')).toBeInTheDocument();
  });

  it('shows sequence keyframes as read-only and opens their step when clicked', () => {
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
        id: 'box',
        name: 'Box',
        type: 'rectangle',
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        opacity: 1,
        visible: true,
      } as unknown as Node);
      useEditorStore.getState().resetProject();
      useEditorStore.getState().addSequenceSteps(graph!, ['box'], 'fade-in', { duration: 30 });
      useEditorStore.setState({ sequenceWindowOpen: false });
    });

    const [stepId] = useEditorStore.getState().animationSequence.steps.map((step) => step.id);
    const diamond = screen.getByTestId(`keyframe-seq_${stepId}_opacity_30`);
    expect(diamond.tagName).toBe('BUTTON');
    expect(diamond.className).toMatch(/managedKeyframe/);
    expect(diamond).toHaveAttribute('title', expect.stringContaining('Animation Sequence step #1'));

    fireEvent.click(diamond);
    expect(useEditorStore.getState().sequenceWindowOpen).toBe(true);
    expect(useEditorStore.getState().focusedSequenceStepId).toBe(stepId);
    expect(useEditorStore.getState().selectedKeyframeIds.size).toBe(0);
    useEditorStore.setState({ sequenceWindowOpen: false, focusedSequenceStepId: null });
  });

  it('labels more frames on the ruler as the timeline is zoomed in', () => {
    // jsdom has no layout: report a ruler width, and capture the resize observer
    let rulerWidth = 1400;
    const observers: Array<() => void> = [];
    const OriginalObserver = global.ResizeObserver;
    global.ResizeObserver = class {
      constructor(callback: () => void) {
        observers.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      return { width: this.dataset.testid === 'timeline-ruler' ? rulerWidth : 0 } as DOMRect;
    };

    try {
      renderTimeline();
      const labels = () =>
        Array.from(
          screen.getByTestId('timeline-ruler').querySelectorAll('[class*="rulerLabel"]'),
          (el) => el.textContent
        );
      // 300 frames over 1400px: every half second
      expect(labels().slice(0, 4)).toEqual(['0', '15', '30', '45']);

      // Zoomed to 800% the content is 8× wider: every other frame
      rulerWidth = 1400 * 8;
      act(() => observers.forEach((callback) => callback()));
      expect(labels().slice(0, 4)).toEqual(['0', '2', '4', '6']);
    } finally {
      global.ResizeObserver = OriginalObserver;
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('toggles the Animation Sequence window from the toolbar', () => {
    useEditorStore.setState({ sequenceWindowOpen: false });
    renderTimeline();
    const toggle = screen.getByTestId('sequence-window-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(useEditorStore.getState().sequenceWindowOpen).toBe(true);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    useEditorStore.setState({ sequenceWindowOpen: false });
  });

  it('draws a line through the keyframes of each animation, not across rests', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }
    const opacity = createTrack<number>('box', 'opacity');
    addKeyframe(opacity, 0, 0);
    addKeyframe(opacity, 30, 1);
    addKeyframe(opacity, 150, 1);
    addKeyframe(opacity, 180, 0);
    useEditorStore.setState({ timeline: createTimeline({ tracks: [opacity] }) });

    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Timeline />
      </SceneGraphProvider>
    );
    act(() => {
      graph!.addNode({ id: 'box', name: 'Box', children: [] } as unknown as Node);
    });

    const fadeIn = screen.getByTestId('keyframe-span-box-0-30');
    expect(fadeIn.style.left).toBe('0%');
    expect(fadeIn.style.width).toBe('10%');
    expect(screen.getByTestId('keyframe-span-box-150-180').style.left).toBe('50%');
    expect(screen.queryByTestId('keyframe-span-box-30-150')).not.toBeInTheDocument();
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

  describe('layer context menu', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }

    function renderAnimatedLayers() {
      const parentTrack = createTrack<number>('parent', 'opacity');
      const parentKf = addKeyframe(parentTrack, 10, 0.5);
      const childTrack = createTrack<number>('child', 'transform.rotation');
      const childKf = addKeyframe(childTrack, 20, 45);
      useEditorStore.setState({
        timeline: createTimeline({ tracks: [parentTrack, childTrack] }),
        selectedKeyframeIds: new Set<string>(),
        keyframeClipboard: null,
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
      render(
        <SceneGraphProvider>
          <CaptureGraph />
          <Timeline />
        </SceneGraphProvider>
      );
      act(() => {
        graph!.addNode({
          id: 'parent',
          name: 'Parent',
          parent: null,
          children: [],
        } as unknown as Node);
        graph!.addNode({ id: 'child', name: 'Child', children: [] } as unknown as Node, 'parent');
        graph!.addNode({
          id: 'static',
          name: 'Static',
          parent: null,
          children: [],
        } as unknown as Node);
      });
      return { parentKf, childKf };
    }

    function stubWidth(element: HTMLElement, width: number) {
      Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () =>
          ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: width,
            bottom: 26,
            width,
            height: 26,
            toJSON: () => ({}),
          }) as DOMRect,
      });
    }

    const trackNodeIds = () => useEditorStore.getState().timeline.tracks.map((t) => t.nodeId);

    it("deletes only the right-clicked layer's animation, keeping the layer", () => {
      const { parentKf, childKf } = renderAnimatedLayers();

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-parent'));
      expect([...useEditorStore.getState().selectedNodeIds]).toEqual(['parent']);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Animation' }));

      expect(trackNodeIds()).toEqual(['child']);
      expect(screen.queryByTestId(`keyframe-${parentKf.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`keyframe-${childKf.id}`)).toBeInTheDocument();
      expect(screen.getByTestId('timeline-layer-parent')).toBeInTheDocument();
      expect(graph!.getNode('parent')).toBeDefined();
      expect(useEditorStore.getState().canUndo).toBe(true);
    });

    it('disables Delete Animation for a layer without animation', () => {
      renderAnimatedLayers();

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-static'));
      const item = screen.getByRole('menuitem', { name: 'Delete Animation' });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);

      expect(trackNodeIds()).toEqual(['parent', 'child']);
    });

    it('clears the animation inside a container whose own row has none', () => {
      renderAnimatedLayers();
      act(() => {
        graph!.addNode({ ...graph!.getNode('static')!, id: 'board', name: 'Board' });
        graph!.moveNode('parent', 'board');
      });

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-board'));
      const item = screen.getByRole('menuitem', { name: 'Delete Animation (2 Layers)' });
      expect(item).not.toHaveAttribute('aria-disabled', 'true');
      fireEvent.click(item);
      expect(trackNodeIds()).toEqual([]);
    });

    it('applies to every selected layer when right-clicking inside a multi-selection', () => {
      renderAnimatedLayers();
      act(() => {
        useEditorStore.setState({ selectedNodeIds: new Set(['parent', 'child']) });
      });

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-child'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Animation (2 Layers)' }));

      expect(trackNodeIds()).toEqual([]);
      expect(useEditorStore.getState().selectedNodeIds).toEqual(new Set(['parent', 'child']));
    });

    it("selects the layer's keyframes", () => {
      const { parentKf } = renderAnimatedLayers();

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-parent'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Select Keyframes' }));

      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set([parentKf.id]));
    });

    it('pastes copied keyframes onto the layer at the playhead', () => {
      const { childKf } = renderAnimatedLayers();
      act(() => {
        useEditorStore.setState({ selectedKeyframeIds: new Set([childKf.id]), currentFrame: 30 });
        useEditorStore
          .getState()
          .copySelectedKeyframes(
            new Map([[childKf.id, { nodeId: 'child', property: 'transform.rotation' }]])
          );
      });

      fireEvent.contextMenu(screen.getByTestId('timeline-layer-static'));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Paste Keyframes at Frame 30' }));

      const pasted = useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.nodeId === 'static' && t.property === 'transform.rotation');
      expect(pasted?.keyframes.map((kf) => kf.time)).toEqual([30]);
    });

    it("offers Delete Animation on a layer's keyframe lane without changing selection", () => {
      renderAnimatedLayers();
      act(() => {
        useEditorStore.setState({ selectedNodeIds: new Set(['static']) });
      });
      const lane = screen.getByTestId('timeline-track-parent');
      stubWidth(lane, 300);

      fireEvent.contextMenu(lane, { clientX: 30, clientY: 10 });
      expect(screen.getByRole('menuitem', { name: 'Go To Frame 30' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete Animation' }));

      expect(trackNodeIds()).toEqual(['child']);
      expect(useEditorStore.getState().selectedNodeIds).toEqual(new Set(['static']));
    });
  });

  describe('panel resizing', () => {
    const STORAGE_KEY = 'quar-animator-timeline-height';
    beforeEach(() => window.localStorage.removeItem(STORAGE_KEY));
    afterEach(() => window.localStorage.removeItem(STORAGE_KEY));

    // jsdom has no layout: report the panel's inline height as its rendered
    // height, and optionally give the editor area a height.
    function renderSized(containerHeight?: number) {
      renderTimeline();
      const handle = screen.getByTestId('timeline-resize-handle');
      const panel = handle.parentElement!;
      Object.defineProperty(panel, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ height: parseFloat(panel.style.height) }) as DOMRect,
      });
      if (containerHeight !== undefined) {
        Object.defineProperty(panel.parentElement!, 'clientHeight', {
          configurable: true,
          value: containerHeight,
        });
      }
      return { handle, panel };
    }

    it('exposes the top border as an accessible resize separator', () => {
      const { handle, panel } = renderSized();

      expect(handle).toHaveAttribute('role', 'separator');
      expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
      expect(handle).toHaveAttribute('aria-label', 'Resize timeline');
      expect(handle).toHaveAttribute('aria-valuenow', '200');
      expect(panel).toHaveStyle({ height: '200px' });
    });

    it('grows when the top border is dragged up and shrinks when dragged down', () => {
      const { handle, panel } = renderSized();

      fireEvent.pointerDown(handle, { button: 0, clientY: 500, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 380, pointerId: 1 });
      expect(panel).toHaveStyle({ height: '320px' });
      fireEvent.pointerMove(handle, { clientY: 560, pointerId: 1 });
      expect(panel).toHaveStyle({ height: '140px' });
      fireEvent.pointerUp(handle, { clientY: 560, pointerId: 1 });

      // Moves after release no longer resize
      fireEvent.pointerMove(handle, { clientY: 100, pointerId: 1 });
      expect(panel).toHaveStyle({ height: '140px' });
    });

    it('ignores drags with buttons other than the primary one', () => {
      const { handle, panel } = renderSized();

      fireEvent.pointerDown(handle, { button: 2, clientY: 500, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: 300, pointerId: 1 });

      expect(panel).toHaveStyle({ height: '200px' });
    });

    it('stops at the minimum height and leaves room for the canvas above', () => {
      const { handle, panel } = renderSized(700);

      fireEvent.pointerDown(handle, { button: 0, clientY: 500, pointerId: 1 });
      fireEvent.pointerMove(handle, { clientY: -2000, pointerId: 1 });
      expect(panel).toHaveStyle({ height: '550px' }); // 700 - 150 for the canvas
      fireEvent.pointerMove(handle, { clientY: 3000, pointerId: 1 });
      expect(panel).toHaveStyle({ height: '120px' });
      fireEvent.pointerUp(handle, { pointerId: 1 });
    });

    it('shows the resize cursor everywhere while dragging', () => {
      const { handle } = renderSized();

      fireEvent.pointerDown(handle, { button: 0, clientY: 500, pointerId: 1 });
      expect(document.body.style.cursor).toBe('row-resize');
      fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(document.body.style.cursor).toBe('');
    });

    it('resizes with the arrow keys and resets on double-click', () => {
      const { handle, panel } = renderSized(700);

      fireEvent.keyDown(handle, { key: 'ArrowUp' });
      expect(panel).toHaveStyle({ height: '210px' });
      fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });
      expect(panel).toHaveStyle({ height: '260px' });
      fireEvent.keyDown(handle, { key: 'ArrowDown' });
      expect(panel).toHaveStyle({ height: '250px' });

      fireEvent.doubleClick(handle);
      expect(panel).toHaveStyle({ height: '200px' });
    });

    it('remembers the height for the next session', () => {
      const { handle } = renderSized();

      fireEvent.keyDown(handle, { key: 'ArrowUp', shiftKey: true });

      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('250');
    });

    it('has no resize handle while collapsed', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.queryByTestId('timeline-resize-handle')).not.toBeInTheDocument();
    });
  });

  describe('while the animation plays', () => {
    it('moves the playhead, timecode and scrubber with the frame', () => {
      useEditorStore.setState({
        timelineExpanded: true,
        timelineDuration: 100,
        frameRate: 25,
        currentFrame: 0,
      });
      renderTimeline();
      act(() => useEditorStore.setState({ currentFrame: 50 }));
      expect(screen.getAllByText('00:02:00').length).toBeGreaterThan(0);
      expect(screen.getByTestId('timeline-ruler').getAttribute('aria-valuenow')).toBe('50');
      const playheads = document.querySelectorAll<HTMLElement>('[style*="left: 50%"]');
      expect(playheads.length).toBeGreaterThanOrEqual(2);
    });

    it('doesn’t rebuild its layer rows for frames being shown', () => {
      let graph: SceneGraph | undefined;
      function CaptureGraph() {
        graph = useSceneGraph();
        return null;
      }
      useEditorStore.setState({ timelineExpanded: true });
      render(
        <SceneGraphProvider>
          <CaptureGraph />
          <Timeline />
        </SceneGraphProvider>
      );
      act(() => {
        graph!.addNode({ id: 'ball', name: 'Ball', children: [] } as unknown as Node);
      });
      const roots = vi.spyOn(graph!, 'getRootNodes');
      act(() => {
        for (let frame = 0; frame < 10; frame++) {
          poseScene(() => graph!.updateNode('ball', { opacity: frame / 10 } as Partial<Node>));
        }
      });
      expect(roots).not.toHaveBeenCalled();
      act(() => graph!.updateNode('ball', { name: 'Big ball' } as Partial<Node>));
      expect(roots).toHaveBeenCalled();
      expect(screen.getByText('Big ball')).toBeInTheDocument();
    });
  });
});
