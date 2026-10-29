import { describe, it, expect, beforeEach } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { GraphEditor } from './GraphEditor';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline, graphToScreen, KeyframeManager } from '@quar/animation';
import { SceneGraph } from '@quar/core';

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

  describe('dragging a keyframe with Shift', () => {
    it('keeps to the axis it started on, however the pointer wanders after', () => {
      useEditorStore.setState({ timeline: setupTimelineWithKeyframes(), graphVisibleTracks: [] });
      const view = renderGraphEditor();
      const area = screen.getByTestId('graph-editor-area');
      // The x track's keyframe at frame 30, value 200, where the view draws it
      const transform = useEditorStore.getState().graphViewTransform;
      const at = graphToScreen(30, 200, transform);
      const dot = [...view.container.querySelectorAll('circle[class*="keyframeDot"]')].find(
        (c) =>
          Math.abs(Number(c.getAttribute('cx')) - at.x) < 0.01 &&
          Math.abs(Number(c.getAttribute('cy')) - at.y) < 0.01
      );
      expect(dot).toBeDefined();
      const xKeys = () =>
        useEditorStore
          .getState()
          .timeline.tracks.find((t) => t.property === 'transform.position.x')!
          .keyframes.map((kf) => [kf.time, kf.value]);

      fireEvent.mouseDown(dot!, { button: 0, clientX: at.x, clientY: at.y });
      // Mostly sideways: the drag locks to time
      fireEvent.mouseMove(area, { clientX: at.x + 100, clientY: at.y + 2, shiftKey: true });
      // Then far up: still only time changes
      fireEvent.mouseMove(area, { clientX: at.x + 110, clientY: at.y - 300, shiftKey: true });
      fireEvent.mouseUp(area);

      const moved = 30 + Math.round(110 / transform.scaleX);
      expect(xKeys()).toEqual(
        [
          [0, 100],
          [moved, 200],
          [60, 150],
        ].sort((a, b) => a[0]! - b[0]!)
      );
    });
  });

  describe('undo', () => {
    const xKeys = () =>
      useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.property === 'transform.position.x')!
        .keyframes.map((kf) => [kf.time, kf.value, kf.easing]);

    function renderWithSelected(index: number) {
      const tl = setupTimelineWithKeyframes();
      const kf = tl.tracks[0]!.keyframes[index]!;
      useEditorStore.setState({
        timeline: tl,
        selectedKeyframeIds: new Set([kf.id]),
        undoStack: [],
        redoStack: [],
        canUndo: false,
        canRedo: false,
      });
      const view = renderGraphEditor();
      return { view, area: screen.getByTestId('graph-editor-area') };
    }

    const undo = () => useEditorStore.getState().undo(new SceneGraph());

    it('undoes a whole keyframe drag in one step', () => {
      const { view, area } = renderWithSelected(1);
      const before = xKeys();
      const transform = useEditorStore.getState().graphViewTransform;
      const at = graphToScreen(30, 200, transform);
      const dot = [...view.container.querySelectorAll('circle[class*="keyframeDot"]')].find(
        (c) => Math.abs(Number(c.getAttribute('cx')) - at.x) < 0.01
      );
      fireEvent.mouseDown(dot!, { button: 0, clientX: at.x, clientY: at.y });
      fireEvent.mouseMove(area, { clientX: at.x + 20, clientY: at.y });
      fireEvent.mouseMove(area, { clientX: at.x + 40, clientY: at.y - 10 });
      fireEvent.mouseMove(area, { clientX: at.x + 60, clientY: at.y - 20 });
      fireEvent.mouseUp(area);
      expect(xKeys()).not.toEqual(before);
      expect(useEditorStore.getState().undoStack).toHaveLength(1);

      act(() => undo());
      expect(xKeys()).toEqual(before);
    });

    it('undoes a whole tangent handle drag in one step', () => {
      const { view, area } = renderWithSelected(1);
      const before = xKeys();
      const handle = view.container.querySelector('circle[class*="tangentHandle"]');
      expect(handle).not.toBeNull();
      const x = Number(handle!.getAttribute('cx'));
      const y = Number(handle!.getAttribute('cy'));
      fireEvent.mouseDown(handle!, { button: 0, clientX: x, clientY: y });
      fireEvent.mouseMove(area, { clientX: x + 5, clientY: y - 30 });
      fireEvent.mouseMove(area, { clientX: x + 10, clientY: y - 60 });
      fireEvent.mouseUp(area);
      expect(xKeys()).not.toEqual(before);
      expect(useEditorStore.getState().undoStack).toHaveLength(1);

      act(() => undo());
      expect(xKeys()).toEqual(before);
    });

    it('undoes nudging and deleting keyframes with the keys, a step a press', () => {
      const { area } = renderWithSelected(1);
      const before = xKeys();
      fireEvent.mouseDown(area, { button: 0, shiftKey: true });
      fireEvent.mouseUp(area);
      fireEvent.keyDown(area, { key: 'ArrowRight' });
      fireEvent.keyDown(area, { key: 'ArrowUp' });
      const nudged = xKeys();
      fireEvent.keyDown(area, { key: 'Delete' });
      expect(xKeys()).toHaveLength(2);
      expect(useEditorStore.getState().undoStack).toHaveLength(3);

      act(() => undo());
      expect(xKeys()).toEqual(nudged);
      act(() => undo());
      act(() => undo());
      expect(xKeys()).toEqual(before);
    });
  });

  describe('the handles of a menu easing', () => {
    it('make it a custom curve that starts as the named one, so nothing jumps', () => {
      const tl = setupTimelineWithKeyframes();
      const kf = tl.tracks[0]!.keyframes[1]!;
      // Ease Out Cubic into frame 30: cubic-bezier(1/3, 1, 2/3, 1)
      kf.easing = 'easeOutCubic';
      useEditorStore.setState({ timeline: tl, selectedKeyframeIds: new Set([kf.id]) });
      const view = renderGraphEditor();
      const area = screen.getByTestId('graph-editor-area');

      // Its incoming handle, first: where the curve's second control point is
      const transform = useEditorStore.getState().graphViewTransform;
      const handle = view.container.querySelector('circle[class*="tangentHandle"]')!;
      const expected = graphToScreen(20, 200, transform);
      expect(Number(handle.getAttribute('cx'))).toBeCloseTo(expected.x);
      expect(Number(handle.getAttribute('cy'))).toBeCloseTo(expected.y);

      // Dragged 3 frames back in time
      const to = graphToScreen(17, 200, transform);
      fireEvent.mouseDown(handle, { button: 0, clientX: expected.x, clientY: expected.y });
      fireEvent.mouseMove(area, { clientX: to.x, clientY: to.y });
      fireEvent.mouseUp(area);

      const easing = useEditorStore.getState().timeline.tracks[0]!.keyframes[1]!.easing;
      expect(easing).toMatchObject({ type: 'cubicBezier' });
      const [x1, y1, x2, y2] = (easing as { points: number[] }).points;
      // The other handle stays the named curve's; this one moved back in time
      expect(x1).toBeCloseTo(1 / 3);
      expect(y1).toBeCloseTo(1);
      expect(x2).toBeCloseTo(2 / 3 - 3 / 30);
      expect(y2).toBeCloseTo(1);
    });
  });

  describe('colors', () => {
    /** The same color as jsdom writes it into an inline style. */
    function rgb(hex: string) {
      const [r, g, b] = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
      return `rgb(${r}, ${g}, ${b})`;
    }

    function colorsShown(view: ReturnType<typeof renderGraphEditor>) {
      const curves = [
        ...view.container.querySelectorAll('[data-testid="graph-editor-curves"] path'),
      ];
      const dots = [
        ...view.container.querySelectorAll<HTMLElement>(
          '[data-testid="graph-property-list"] [class*="propertyDot"]'
        ),
      ];
      return {
        curves: curves.map((path) => rgb(path.getAttribute('stroke') ?? '')),
        dots: dots.map((dot) => dot.style.backgroundColor),
      };
    }

    it('draws each curve in the color of its property in the list, whatever is selected', () => {
      const tl = setupTimelineWithKeyframes();
      const mgr = new KeyframeManager(tl);
      mgr.addKeyframe('node2', 'transform.rotation', 0, 0, 'linear');
      mgr.addKeyframe('node2', 'transform.rotation', 30, 90, 'linear');
      useEditorStore.setState({ timeline: tl });
      const everything = renderGraphEditor();
      const all = colorsShown(everything);
      everything.unmount();
      expect(all.curves).toEqual(all.dots);
      expect(new Set(all.dots).size).toBe(3);
      const rotationColor = all.dots[2];

      useEditorStore.setState({ selectedNodeIds: new Set(['node2']) });
      const selected = colorsShown(renderGraphEditor());
      expect(selected).toEqual({ curves: [rotationColor], dots: [rotationColor] });
    });
  });

  it('updates graph view transform', () => {
    useEditorStore.getState().setGraphViewTransform({ scaleX: 20 });
    expect(useEditorStore.getState().graphViewTransform.scaleX).toBe(20);
    expect(useEditorStore.getState().graphViewTransform.scaleY).toBe(50); // unchanged
  });
});
