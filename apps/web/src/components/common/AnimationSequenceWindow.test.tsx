import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { AnimationSequenceWindow } from './AnimationSequenceWindow';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode } from '@quar/types';

const STORAGE_KEY = 'quar-animator-sequence-window';

function makeRect(id: string, name: string): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
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
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

const store = () => useEditorStore.getState();

function renderWindow() {
  let graph: SceneGraph | undefined;
  function Capture() {
    graph = useSceneGraph();
    return null;
  }
  render(
    <SceneGraphProvider>
      <Capture />
      <AnimationSequenceWindow />
    </SceneGraphProvider>
  );
  act(() => {
    graph!.addNode(makeRect('logo', 'Logo'));
    graph!.addNode(makeRect('title', 'Title'));
    graph!.addNode(makeRect('badge', 'Badge'));
  });
  return graph!;
}

function addSteps(sg: SceneGraph) {
  act(() => {
    store().addSequenceSteps(sg, ['logo'], 'fade-in', { duration: 24 });
    store().addSequenceSteps(sg, ['title'], 'rise-in', { duration: 30 });
    store().addSequenceSteps(sg, ['badge'], 'float', { duration: 30 });
  });
}

function stepRow(number: number) {
  return screen.getByTestId(`sequence-step-${number}`);
}

describe('AnimationSequenceWindow', () => {
  beforeEach(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    store().resetProject();
    store().clearHistory();
    useEditorStore.setState({ sequenceWindowOpen: true, frameRate: 30 });
  });

  afterEach(() => window.localStorage.removeItem(STORAGE_KEY));

  it('explains how to add steps while the sequence is empty', () => {
    renderWindow();
    expect(screen.getByRole('dialog', { name: 'Animation Sequence' })).toBeInTheDocument();
    expect(screen.getByText(/No steps yet/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add step/ })).toBeDisabled();
  });

  it('lists numbered steps with their object, effect and timing', () => {
    const sg = renderWindow();
    addSteps(sg);

    expect(within(stepRow(1)).getByText('Logo')).toBeInTheDocument();
    expect(within(stepRow(1)).getByText('Fade')).toBeInTheDocument();
    expect(within(stepRow(1)).getByText('0.0s–0.8s')).toBeInTheDocument();
    expect(within(stepRow(2)).getByText('Title')).toBeInTheDocument();
    expect(within(stepRow(2)).getByText('0.8s–1.8s')).toBeInTheDocument();
    expect(screen.getByText(/3 steps · 2\.8s/)).toBeInTheDocument();
  });

  it('times a step with an earlier one through the start picker', () => {
    const sg = renderWindow();
    addSteps(sg);

    const picker = screen.getByLabelText('Start of step 3');
    expect(within(picker).getByRole('option', { name: 'With #1' })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Start of step 1')).queryByRole('option', { name: /#/ })
    ).toBeNull();

    fireEvent.change(picker, {
      target: { value: `with:${store().animationSequence.steps[0]!.id}` },
    });
    expect(store().animationSequence.steps[2]).toMatchObject({ trigger: 'with' });
    expect(within(stepRow(3)).getByText('0.0s–1.0s')).toBeInTheDocument();
  });

  it('commits delay and duration edits in seconds on blur', () => {
    const sg = renderWindow();
    addSteps(sg);

    const delay = within(stepRow(2)).getByLabelText('Delay');
    fireEvent.change(delay, { target: { value: '0,5' } });
    // Nothing is committed while typing
    expect(store().animationSequence.steps[1]!.delay).toBe(0);
    fireEvent.blur(delay);
    expect(store().animationSequence.steps[1]!.delay).toBe(15);
    expect(within(stepRow(2)).getByText('1.3s–2.3s')).toBeInTheDocument();

    const duration = within(stepRow(1)).getByLabelText('Duration');
    fireEvent.change(duration, { target: { value: '2' } });
    fireEvent.keyDown(duration, { key: 'Enter' });
    fireEvent.blur(duration);
    expect(store().animationSequence.steps[0]!.duration).toBe(60);
  });

  it('offers Repeat only for loop effects', () => {
    const sg = renderWindow();
    addSteps(sg);
    expect(screen.queryByLabelText('Repeat step 1')).toBeNull();

    fireEvent.change(screen.getByLabelText('Repeat step 3'), { target: { value: 'untilEnd' } });
    expect(store().animationSequence.steps[2]!.repeat).toBe('untilEnd');
  });

  it('removes and reorders steps', () => {
    const sg = renderWindow();
    addSteps(sg);

    fireEvent.keyDown(within(stepRow(1)).getByLabelText('Start of step 1'), {
      key: 'ArrowDown',
      altKey: true,
    });
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual([
      'title',
      'logo',
      'badge',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove step 3' }));
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual(['title', 'logo']);
  });

  it('reorders by dragging a step onto another', () => {
    const sg = renderWindow();
    addSteps(sg);

    const grip = stepRow(3).querySelector('[draggable="true"]')!;
    const dataTransfer = {
      setData: () => {},
      setDragImage: () => {},
      effectAllowed: '',
      dropEffect: '',
    };
    fireEvent.dragStart(grip, { dataTransfer });
    fireEvent.dragOver(stepRow(1), { dataTransfer });
    fireEvent.drop(stepRow(1), { dataTransfer });
    expect(store().animationSequence.steps.map((step) => step.nodeId)).toEqual([
      'badge',
      'logo',
      'title',
    ]);
  });

  it('selects the object and jumps to the step when its name is clicked', () => {
    const sg = renderWindow();
    addSteps(sg);

    fireEvent.click(within(stepRow(2)).getByRole('button', { name: 'Title' }));
    expect([...store().selectedNodeIds]).toEqual(['title']);
    expect(store().currentFrame).toBe(24);
    expect(stepRow(2).className).toMatch(/active/);
    expect(stepRow(1).className).not.toMatch(/active/);
  });

  it('adds the chosen effect for the selected objects', () => {
    renderWindow();
    act(() => store().setSelection(['logo', 'title']));

    fireEvent.change(screen.getByLabelText('Effect to add'), { target: { value: 'pop-in' } });
    fireEvent.click(screen.getByRole('button', { name: /Add for 2 objects/ }));
    expect(
      store().animationSequence.steps.map(({ nodeId, presetId, trigger }) => [
        nodeId,
        presetId,
        trigger,
      ])
    ).toEqual([
      ['logo', 'pop-in', 'afterPrevious'],
      ['title', 'pop-in', 'withPrevious'],
    ]);
  });

  it('scrolls to and flashes a step revealed from its keyframe', () => {
    const sg = renderWindow();
    addSteps(sg);
    const scrolled: Element[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };

    const third = store().animationSequence.steps[2]!.id;
    act(() => store().revealSequenceStep(third));
    expect(stepRow(3).className).toMatch(/focused/);
    expect(scrolled).toEqual([stepRow(3)]);
    // The request is consumed so revealing the same step again works
    expect(store().focusedSequenceStepId).toBeNull();
    Element.prototype.scrollIntoView = original;
  });

  it('turns the selection’s own keyframes into a clip step', () => {
    const sg = renderWindow();
    act(() => {
      store().addKeyframeAtFrame('title', 'transform.position.x', 10, 0);
      store().addKeyframeAtFrame('title', 'transform.position.x', 40, 200);
      store().setSelection(['logo', 'title']);
    });

    fireEvent.change(screen.getByLabelText('Effect to add'), {
      target: { value: 'own-keyframes' },
    });
    // Only "title" has keyframes of its own
    fireEvent.click(screen.getByRole('button', { name: 'Add step' }));

    const [step] = store().animationSequence.steps;
    expect(step).toMatchObject({ nodeId: 'title', delay: 10, duration: 30 });
    expect(within(stepRow(1)).getByText(/Own keyframes · 1 property/)).toBeInTheDocument();
    expect(within(stepRow(1)).getByText('0.3s–1.3s')).toBeInTheDocument();
    // Clips can repeat
    expect(screen.getByLabelText('Repeat step 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove step 1' })).toHaveAttribute(
      'title',
      expect.stringContaining('keyframes stay')
    );
    expect(sg.getNode('title')).toBeDefined();
  });

  it('closes with the close button or Escape', () => {
    renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Close Animation Sequence' }));
    expect(store().sequenceWindowOpen).toBe(false);

    act(() => store().setSequenceWindowOpen(true));
    fireEvent.keyDown(screen.getByLabelText('Effect to add'), { key: 'Escape' });
    expect(store().sequenceWindowOpen).toBe(false);
  });

  it('moves by its title bar and remembers where it was left', () => {
    renderWindow();
    const dialog = screen.getByRole('dialog', { name: 'Animation Sequence' });
    const startLeft = parseFloat(dialog.style.left);
    const startTop = parseFloat(dialog.style.top);
    const titleBar = screen.getByText('Animation Sequence').parentElement!;

    fireEvent.pointerDown(titleBar, { button: 0, clientX: 500, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(titleBar, { buttons: 1, clientX: 440, clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(titleBar, { clientX: 440, clientY: 260, pointerId: 1 });

    expect(parseFloat(dialog.style.left)).toBe(startLeft - 60);
    expect(parseFloat(dialog.style.top)).toBe(startTop + 60);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject({
      x: startLeft - 60,
      y: startTop + 60,
    });

    // Moves after release, or without a pressed button, don't drag it
    fireEvent.pointerMove(titleBar, { buttons: 1, clientX: 100, clientY: 100, pointerId: 1 });
    expect(parseFloat(dialog.style.left)).toBe(startLeft - 60);
  });

  it('stops dragging when the button was released without a pointerup', () => {
    renderWindow();
    const dialog = screen.getByRole('dialog', { name: 'Animation Sequence' });
    const titleBar = screen.getByText('Animation Sequence').parentElement!;
    const startLeft = parseFloat(dialog.style.left);

    fireEvent.pointerDown(titleBar, { button: 0, clientX: 500, clientY: 200, pointerId: 1 });
    fireEvent.pointerMove(titleBar, { buttons: 0, clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(titleBar, { buttons: 1, clientX: 200, clientY: 300, pointerId: 1 });
    expect(parseFloat(dialog.style.left)).toBe(startLeft);
  });

  it('is read-only while a symbol is being edited', () => {
    renderWindow();
    act(() => useEditorStore.setState({ editingSymbolId: 'sym' }));
    expect(screen.getByText(/Exit symbol editing/)).toBeInTheDocument();
    expect(screen.getByLabelText('Effect to add')).toBeDisabled();
  });
});
