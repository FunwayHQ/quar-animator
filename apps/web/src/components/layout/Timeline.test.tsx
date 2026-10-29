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

  it('shows the timeline in view: one artboard’s layers, or the page’s outside them', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }
    useEditorStore.setState({ timeline: createTimeline(), timelineScope: 'slide1' });
    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Timeline />
      </SceneGraphProvider>
    );
    act(() => {
      graph!.addNode({
        id: 'slide1',
        name: 'Intro',
        type: 'artboard',
        children: [],
      } as unknown as Node);
      graph!.addNode({ id: 'title', name: 'Title', children: [] } as unknown as Node, 'slide1');
      graph!.addNode({
        id: 'slide2',
        name: 'Outro',
        type: 'artboard',
        children: [],
      } as unknown as Node);
      graph!.addNode({ id: 'logo', name: 'Logo', children: [] } as unknown as Node, 'slide2');
      graph!.addNode({ id: 'note', name: 'Note', children: [] } as unknown as Node);
    });
    expect(screen.getByTestId('timeline-layer-title')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-layer-logo')).toBeNull();
    expect(screen.queryByTestId('timeline-layer-note')).toBeNull();

    // The picker: each artboard (topmost first), then the page's own
    const picker = screen.getByRole('combobox', { name: 'Timeline' });
    expect([...picker.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Outro',
      'Intro',
      'Page (outside artboards)',
    ]);
    fireEvent.change(picker, { target: { value: '' } });
    expect(useEditorStore.getState().timelineScope).toBeNull();
    expect(screen.getByTestId('timeline-layer-note')).toBeInTheDocument();
    expect(screen.queryByTestId('timeline-layer-title')).toBeNull();
    fireEvent.change(picker, { target: { value: 'slide2' } });
    expect(screen.getByTestId('timeline-layer-logo')).toBeInTheDocument();
  });

  it('tells artboards of the same name apart in the picker', () => {
    let graph: SceneGraph | undefined;
    function CaptureGraph() {
      graph = useSceneGraph();
      return null;
    }
    useEditorStore.setState({ timeline: createTimeline(), timelineScope: null });
    render(
      <SceneGraphProvider>
        <CaptureGraph />
        <Timeline />
      </SceneGraphProvider>
    );
    act(() => {
      for (const id of ['a', 'b']) {
        graph!.addNode({ id, name: 'Artboard', type: 'artboard', children: [] } as unknown as Node);
      }
    });
    const picker = screen.getByRole('combobox', { name: 'Timeline' });
    expect([...picker.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Artboard',
      'Artboard 2',
      'Page (outside artboards)',
    ]);
  });

  it('has no picker on a page without artboards (it has the one timeline)', () => {
    useEditorStore.setState({ timeline: createTimeline(), timelineScope: null });
    renderTimeline();
    expect(screen.queryByRole('combobox', { name: 'Timeline' })).toBeNull();
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

  describe('dragging keyframes', () => {
    function renderThreeKeyframes() {
      let graph: SceneGraph | undefined;
      function CaptureGraph() {
        graph = useSceneGraph();
        return null;
      }
      const track = createTrack<number>('ball', 'opacity');
      const keyframes = [
        addKeyframe(track, 10, 0),
        addKeyframe(track, 20, 1),
        addKeyframe(track, 30, 0),
      ];
      useEditorStore.setState({
        timeline: createTimeline({ tracks: [track] }),
        selectedKeyframeIds: new Set<string>(),
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
        graph!.addNode({ id: 'ball', name: 'Ball', children: [] } as unknown as Node);
      });
      // One pixel per frame
      Object.defineProperty(screen.getByTestId('timeline-tracks'), 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 300, height: 26 }) as DOMRect,
      });
      const diamonds = keyframes.map((kf) => {
        const diamond = screen.getByTestId(`keyframe-${kf.id}`);
        Object.defineProperty(diamond, 'setPointerCapture', { value: vi.fn() });
        return diamond;
      });
      return { ids: keyframes.map((kf) => kf.id), diamonds, graph: graph! };
    }

    const times = () =>
      useEditorStore.getState().timeline.tracks[0]!.keyframes.map((kf) => kf.time);
    const easings = () =>
      useEditorStore.getState().timeline.tracks[0]!.keyframes.map((kf) => kf.easing);

    it('keeps every selected keyframe selected after dragging them', () => {
      const { ids, diamonds } = renderThreeKeyframes();
      for (const diamond of diamonds) fireEvent.click(diamond, { shiftKey: true });
      expect(useEditorStore.getState().selectedKeyframeIds.size).toBe(3);

      const first = diamonds[0]!;
      fireEvent.pointerDown(first, { button: 0, clientX: 10, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 15, pointerId: 1 });
      fireEvent.pointerUp(first, { clientX: 15, pointerId: 1 });
      fireEvent.click(first, { clientX: 15 });

      expect(times()).toEqual([15, 25, 35]);
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set(ids));
    });

    it('undoes a whole drag in one step, and redoes it', () => {
      const { ids, diamonds, graph } = renderThreeKeyframes();
      act(() => useEditorStore.setState({ selectedKeyframeIds: new Set(ids) }));

      const first = diamonds[0]!;
      fireEvent.pointerDown(first, { button: 0, clientX: 10, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 12, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 15, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 18, pointerId: 1 });
      fireEvent.pointerUp(first, { clientX: 18, pointerId: 1 });
      expect(times()).toEqual([18, 28, 38]);
      expect(useEditorStore.getState().undoStack).toHaveLength(1);

      act(() => useEditorStore.getState().undo(graph));
      expect(times()).toEqual([10, 20, 30]);
      act(() => useEditorStore.getState().redo(graph));
      expect(times()).toEqual([18, 28, 38]);

      // The next drag is a step of its own
      fireEvent.pointerDown(first, { button: 0, clientX: 18, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 20, pointerId: 1 });
      fireEvent.pointerUp(first, { clientX: 20, pointerId: 1 });
      expect(useEditorStore.getState().undoStack).toHaveLength(2);
    });

    it('pushes no undo step for a click without a drag', () => {
      const { diamonds } = renderThreeKeyframes();
      fireEvent.pointerDown(diamonds[1]!, { button: 0, clientX: 20, pointerId: 1 });
      fireEvent.pointerUp(diamonds[1]!, { clientX: 20, pointerId: 1 });
      expect(useEditorStore.getState().canUndo).toBe(false);
    });

    it('undoes deleting and re-easing keyframes from their menu', () => {
      const { ids, diamonds, graph } = renderThreeKeyframes();
      act(() => useEditorStore.setState({ selectedKeyframeIds: new Set([ids[0]!, ids[1]!]) }));

      fireEvent.contextMenu(diamonds[0]!, { clientX: 10 });
      fireEvent.click(screen.getByRole('menuitem', { name: /Ease In\/Out/ }));
      expect(easings()).toEqual(['easeInOutCubic', 'easeInOutCubic', 'linear']);
      // Both keyframes in one step
      expect(useEditorStore.getState().undoStack).toHaveLength(1);

      fireEvent.contextMenu(diamonds[0]!, { clientX: 10 });
      fireEvent.click(screen.getByRole('menuitem', { name: /Delete Keyframes/ }));
      expect(times()).toEqual([30]);

      act(() => useEditorStore.getState().undo(graph));
      expect(times()).toEqual([10, 20, 30]);
      act(() => useEditorStore.getState().undo(graph));
      expect(easings()).toEqual(['linear', 'linear', 'linear']);
      act(() => useEditorStore.getState().redo(graph));
      expect(easings()).toEqual(['easeInOutCubic', 'easeInOutCubic', 'linear']);
    });

    it('makes typing a number in the custom easing editor one undo step', () => {
      const { ids, diamonds, graph } = renderThreeKeyframes();
      act(() => useEditorStore.setState({ selectedKeyframeIds: new Set([ids[1]!]) }));
      fireEvent.contextMenu(diamonds[1]!, { clientX: 20 });
      fireEvent.click(screen.getByRole('menuitem', { name: /Custom Easing/ }));

      const x1 = screen.getByTestId('easing-input-x1');
      act(() => x1.focus());
      for (const text of ['0', '0.', '0.4']) {
        fireEvent.keyDown(x1, { key: text.slice(-1) });
        fireEvent.change(x1, { target: { value: text } });
      }
      act(() => x1.blur());
      expect(useEditorStore.getState().timeline.tracks[0]!.keyframes[1]!.easing).not.toBe('linear');
      expect(useEditorStore.getState().undoStack).toHaveLength(1);

      act(() => useEditorStore.getState().undo(graph));
      expect(easings()).toEqual(['linear', 'linear', 'linear']);
    });

    it('selects only the clicked keyframe on a click without a drag', () => {
      const { ids, diamonds } = renderThreeKeyframes();
      useEditorStore.setState({ selectedKeyframeIds: new Set(ids) });

      const second = diamonds[1]!;
      fireEvent.pointerDown(second, { button: 0, clientX: 20, pointerId: 1 });
      fireEvent.pointerUp(second, { clientX: 20, pointerId: 1 });
      fireEvent.click(second, { clientX: 20 });

      expect(times()).toEqual([10, 20, 30]);
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set([ids[1]]));
    });
  });

  describe('keyframe keys, while the timeline has the focus', () => {
    /** A ball with opacity keyframes at 10 and 20, the first selected; the timeline focused */
    function renderFocusedTimeline() {
      let graph: SceneGraph | undefined;
      function CaptureGraph() {
        graph = useSceneGraph();
        return null;
      }
      const track = createTrack<number>('ball', 'opacity');
      const keyframes = [addKeyframe(track, 10, 0), addKeyframe(track, 20, 1)];
      useEditorStore.setState({
        timeline: createTimeline({ tracks: [track] }),
        timelineViewMode: 'dopeSheet',
        selectedKeyframeIds: new Set([keyframes[0]!.id]),
        selectedNodeIds: new Set(['ball']),
        keyframeClipboard: null,
        clipboard: null,
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
        graph!.addNode({ id: 'ball', name: 'Ball', children: [] } as unknown as Node);
      });
      const timeline = screen
        .getByTestId('timeline-tracks')
        .closest<HTMLElement>('[data-own-edit-keys]')!;
      act(() => timeline.focus());
      return { ids: keyframes.map((kf) => kf.id), graph: graph!, timeline };
    }

    const keyframesNow = () =>
      useEditorStore
        .getState()
        .timeline.tracks.flatMap((track) => track.keyframes.map((kf) => [kf.time, kf.value]));

    it('deletes the selected keyframes with Delete or Backspace, each an undo step', () => {
      const { ids, graph, timeline } = renderFocusedTimeline();
      expect(document.activeElement).toBe(timeline);

      expect(fireEvent.keyDown(timeline, { key: 'Delete' })).toBe(false);
      expect(keyframesNow()).toEqual([[20, 1]]);
      act(() => useEditorStore.setState({ selectedKeyframeIds: new Set([ids[1]!]) }));
      fireEvent.keyDown(timeline, { key: 'Backspace' });
      expect(keyframesNow()).toEqual([]);
      expect(useEditorStore.getState().undoStack).toHaveLength(2);

      act(() => useEditorStore.getState().undo(graph));
      expect(keyframesNow()).toEqual([[20, 1]]);
      act(() => useEditorStore.getState().undo(graph));
      expect(keyframesNow()).toEqual([
        [10, 0],
        [20, 1],
      ]);
    });

    it('copies the selected keyframes with Ctrl/Cmd+C and pastes them at the playhead with Ctrl/Cmd+V', () => {
      const { graph, timeline } = renderFocusedTimeline();

      // Taken here: not the browser's copy (which would copy the layers)
      expect(fireEvent.keyDown(timeline, { key: 'c', ctrlKey: true })).toBe(false);
      expect(useEditorStore.getState().keyframeClipboard?.entries).toHaveLength(1);
      expect(useEditorStore.getState().clipboard).toBeNull();

      act(() => useEditorStore.getState().setCurrentFrame(50));
      expect(fireEvent.keyDown(timeline, { key: 'v', metaKey: true })).toBe(false);
      expect(keyframesNow()).toEqual([
        [10, 0],
        [20, 1],
        [50, 0],
      ]);
      // The pasted keyframe is selected, and the paste is one undo step
      const pasted = useEditorStore.getState().timeline.tracks[0]!.keyframes[2]!;
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set([pasted.id]));
      expect(useEditorStore.getState().undoStack).toHaveLength(1);
      act(() => useEditorStore.getState().undo(graph));
      expect(keyframesNow()).toHaveLength(2);
    });

    it('leaves the keys to the layers elsewhere, and to the fields in it', () => {
      const { timeline } = renderFocusedTimeline();

      // Pressed with the focus outside the timeline: not for its keyframes
      act(() => timeline.blur());
      fireEvent.keyDown(document.body, { key: 'c', ctrlKey: true });
      fireEvent.keyDown(document.body, { key: 'Delete' });
      expect(useEditorStore.getState().keyframeClipboard).toBeNull();
      expect(keyframesNow()).toHaveLength(2);

      // Typed into its Frames field
      const frames = screen.getByTestId('timeline-duration-input');
      act(() => frames.focus());
      expect(fireEvent.keyDown(frames, { key: 'Backspace' })).toBe(true);
      fireEvent.keyDown(frames, { key: 'c', ctrlKey: true });
      expect(keyframesNow()).toHaveLength(2);
      expect(useEditorStore.getState().keyframeClipboard).toBeNull();
    });

    it('copies the layers as before when no keyframe is selected', () => {
      const { timeline } = renderFocusedTimeline();
      act(() => useEditorStore.setState({ selectedKeyframeIds: new Set<string>() }));
      // Left to the browser's copy event (useSystemClipboard)
      expect(fireEvent.keyDown(timeline, { key: 'c', ctrlKey: true })).toBe(true);
      expect(useEditorStore.getState().keyframeClipboard).toBeNull();
    });
  });

  describe('keyframes of several properties on one frame', () => {
    /** A ball keyed on opacity at 10 and 20, and on rotation at 10 */
    function renderStackedKeyframes() {
      let graph: SceneGraph | undefined;
      function CaptureGraph() {
        graph = useSceneGraph();
        return null;
      }
      const opacity = createTrack<number>('ball', 'opacity');
      const rotation = createTrack<number>('ball', 'transform.rotation');
      const fade = [addKeyframe(opacity, 10, 0), addKeyframe(opacity, 20, 1)];
      const turn = addKeyframe(rotation, 10, 45);
      useEditorStore.setState({
        timeline: createTimeline({ tracks: [opacity, rotation] }),
        timelineViewMode: 'dopeSheet',
        selectedKeyframeIds: new Set<string>(),
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
        graph!.addNode({ id: 'ball', name: 'Ball', children: [] } as unknown as Node);
      });
      // One pixel per frame
      Object.defineProperty(screen.getByTestId('timeline-tracks'), 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ left: 0, top: 0, width: 300, height: 26 }) as DOMRect,
      });
      const row = screen.getByTestId('timeline-track-ball');
      const diamonds = [...row.querySelectorAll<HTMLElement>('[class*="keyframe"]')].filter(
        (element) => !element.dataset.testid?.startsWith('keyframe-span')
      );
      for (const diamond of diamonds) {
        Object.defineProperty(diamond, 'setPointerCapture', { value: vi.fn() });
      }
      return { fade, turn, diamonds, graph: graph! };
    }

    const timesOf = (property: string) =>
      useEditorStore
        .getState()
        .timeline.tracks.find((track) => track.property === property)
        ?.keyframes.map((kf) => kf.time);

    it('draws one diamond for a frame, naming every property keyed on it', () => {
      const { diamonds } = renderStackedKeyframes();
      expect(diamonds).toHaveLength(2);
      expect(diamonds[0]).toHaveAttribute('title', 'opacity, transform.rotation @ frame 10');
      expect(diamonds[1]).toHaveAttribute('title', 'opacity @ frame 20');
    });

    it('selects every keyframe on the frame with a click, and adds them with Shift', () => {
      const { fade, turn, diamonds } = renderStackedKeyframes();
      fireEvent.click(diamonds[0]!);
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(
        new Set([fade[0]!.id, turn.id])
      );
      expect(diamonds[0]!.className).toMatch(/selected/);

      fireEvent.click(diamonds[1]!, { shiftKey: true });
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(
        new Set([fade[0]!.id, turn.id, fade[1]!.id])
      );
      // A click without Shift: that frame's alone
      fireEvent.click(diamonds[1]!);
      expect(useEditorStore.getState().selectedKeyframeIds).toEqual(new Set([fade[1]!.id]));
    });

    it('drags every property keyed on the frame together, as one undo step', () => {
      const { diamonds, graph } = renderStackedKeyframes();
      const first = diamonds[0]!;
      fireEvent.pointerDown(first, { button: 0, clientX: 10, pointerId: 1 });
      fireEvent.pointerMove(first, { clientX: 15, pointerId: 1 });
      fireEvent.pointerUp(first, { clientX: 15, pointerId: 1 });
      fireEvent.click(first, { clientX: 15 });

      expect(timesOf('opacity')).toEqual([15, 20]);
      expect(timesOf('transform.rotation')).toEqual([15]);
      expect(useEditorStore.getState().undoStack).toHaveLength(1);
      act(() => useEditorStore.getState().undo(graph));
      expect(timesOf('transform.rotation')).toEqual([10]);
    });

    it('deletes them all from the menu of their diamond', () => {
      const { diamonds } = renderStackedKeyframes();
      fireEvent.contextMenu(diamonds[0]!, { clientX: 10 });
      fireEvent.click(screen.getByRole('menuitem', { name: /Delete Keyframes/ }));
      expect(timesOf('opacity')).toEqual([20]);
      expect(timesOf('transform.rotation') ?? []).toEqual([]);
    });
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

  it('scrubs as the playhead’s head is dragged, selecting no range', () => {
    useEditorStore.setState({ workAreaEnabled: false, currentFrame: 10 });
    renderTimeline();
    Object.defineProperty(screen.getByTestId('timeline-ruler'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 28 }) as DOMRect,
    });
    const head = screen.getByTestId('timeline-playhead');
    Object.defineProperty(head, 'setPointerCapture', { value: vi.fn() });
    const frames: number[] = [];
    const stop = useEditorStore.subscribe((state) => frames.push(state.currentFrame));

    fireEvent.pointerDown(head, { button: 0, clientX: 10, pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: 40.4, pointerId: 1 });
    fireEvent.pointerMove(head, { clientX: 90, pointerId: 1 });
    fireEvent.pointerUp(head, { clientX: 90, pointerId: 1 });
    fireEvent.click(head, { clientX: 90 });
    stop();

    expect(frames).toEqual([40, 90]);
    expect(useEditorStore.getState().workAreaEnabled).toBe(false);
  });

  it('keeps the work area’s length when it is dragged against either end', () => {
    useEditorStore.setState({ workAreaEnabled: true, workAreaStart: 50, workAreaEnd: 100 });
    renderTimeline();
    // One pixel per frame
    Object.defineProperty(screen.getByTestId('timeline-ruler'), 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 28 }) as DOMRect,
    });
    const bar = screen.getByTestId('work-area-bar');
    Object.defineProperty(bar, 'setPointerCapture', { value: vi.fn() });
    const range = () => {
      const { workAreaStart, workAreaEnd } = useEditorStore.getState();
      return [workAreaStart, workAreaEnd];
    };

    fireEvent.pointerDown(bar, { button: 0, clientX: 75, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 65, pointerId: 1 });
    expect(range()).toEqual([40, 90]);
    fireEvent.pointerMove(bar, { clientX: 5, pointerId: 1 });
    expect(range()).toEqual([0, 50]);
    fireEvent.pointerMove(bar, { clientX: 500, pointerId: 1 });
    expect(range()).toEqual([249, 299]);
    fireEvent.pointerUp(bar, { clientX: 500, pointerId: 1 });
    expect(range()).toEqual([249, 299]);
  });

  it('leaves the playhead alone when a work-area drag ends, and takes the next ruler click', async () => {
    useEditorStore.setState({
      workAreaEnabled: true,
      workAreaStart: 50,
      workAreaEnd: 100,
      currentFrame: 10,
    });
    renderTimeline();
    const ruler = screen.getByTestId('timeline-ruler');
    Object.defineProperty(ruler, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 28 }) as DOMRect,
    });
    const bar = screen.getByTestId('work-area-bar');
    Object.defineProperty(bar, 'setPointerCapture', { value: vi.fn() });

    fireEvent.pointerDown(bar, { button: 0, clientX: 75, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 95, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 95, pointerId: 1 });
    fireEvent.click(bar, { clientX: 95 }); // the click the browser sends after
    expect(useEditorStore.getState().currentFrame).toBe(10);

    // Later, a click on the ruler moves the playhead as ever
    await new Promise((resolve) => setTimeout(resolve, 0));
    fireEvent.click(ruler, { clientX: 200 });
    expect(useEditorStore.getState().currentFrame).toBe(200);
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
    useEditorStore.setState({ timeline: createTimeline({ duration: 300, frameRate: 30 }) });
    const user = userEvent.setup();
    renderTimeline();

    const goToEndButton = screen.getByTitle('Go to end (End)');
    await user.click(goToEndButton);

    expect(useEditorStore.getState().currentFrame).toBe(299);
  });

  it('goes to the end of the animation with the ruler’s Go To End, and to the timeline’s with Go To Last Frame', () => {
    const track = createTrack<number>('ball', 'opacity');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 60, 1);
    useEditorStore.setState({ timeline: createTimeline({ tracks: [track] }), timelineScope: null });
    renderTimeline();
    const ruler = screen.getByTestId('timeline-ruler');
    Object.defineProperty(ruler, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 300, height: 20 }) as DOMRect,
    });

    fireEvent.contextMenu(ruler, { clientX: 10 });
    const end = screen.getByRole('menuitem', { name: /^Go To End/ });
    expect(end).toHaveTextContent('End');
    fireEvent.click(end);
    expect(useEditorStore.getState().currentFrame).toBe(60);

    fireEvent.contextMenu(ruler, { clientX: 10 });
    fireEvent.click(screen.getByRole('menuitem', { name: /Go To Last Frame/ }));
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
