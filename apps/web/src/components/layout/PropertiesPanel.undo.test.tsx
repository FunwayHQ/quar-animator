/**
 * Every edit made in the Properties panel is an undo step: typed in a field
 * (until Enter or leaving it), picked, toggled or dragged — a drag one step
 * however many changes it makes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';

const store = () => useEditorStore.getState();

function rect(): RectangleNode {
  return {
    id: 'rect1',
    name: 'Rectangle 1',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 150, y: 200 } },
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [
      {
        color: { r: 255, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'round',
        join: 'round',
        visible: true,
      },
    ],
  };
}

function renderPanel(): SceneGraph {
  let sg: SceneGraph | null = null;
  function Capture() {
    sg = useSceneGraph();
    return null;
  }
  render(
    <SceneGraphProvider>
      <Capture />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  return sg!;
}

/** A rectangle drawn (an undo step, as the tools make one) and selected. */
function drawRect(sg: SceneGraph) {
  act(() => {
    store().pushUndo(sg);
    sg.addNode(rect());
    store().setSelection(['rect1']);
  });
}

const node = (sg: SceneGraph) => sg.getNode('rect1') as RectangleNode | undefined;
const steps = () => store().undoStack.length;

/** Type into a field as a person does: a key, and the field's new text. */
function type(input: HTMLElement, text: string) {
  for (let i = 1; i <= text.length; i++) {
    fireEvent.keyDown(input, { key: text[i - 1] });
    fireEvent.change(input, { target: { value: text.slice(0, i) } });
  }
}

describe('Properties panel edits and undo', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    act(() => {
      store().resetProject();
      store().clearHistory();
    });
    sg = renderPanel();
    drawRect(sg);
  });

  it('undoes a typed X, not the drawing before it, and redoes it', () => {
    const x = document.getElementById('prop-pos-x')!;
    act(() => x.focus());
    type(x, '125');
    fireEvent.keyDown(x, { key: 'Enter' });
    // Visual left 125 → center 175 for a 100-wide rectangle
    expect(node(sg)?.transform.position.x).toBe(175);
    expect(steps()).toBe(2);

    act(() => store().undo(sg));
    expect(node(sg)?.transform.position.x).toBe(150);
    act(() => store().redo(sg));
    expect(node(sg)?.transform.position.x).toBe(175);
  });

  it('makes typing one step until Enter, or leaving the field', () => {
    const x = document.getElementById('prop-pos-x')!;
    act(() => x.focus());
    type(x, '10');
    fireEvent.keyDown(x, { key: 'Enter' });
    type(x, '20');
    act(() => x.blur());
    expect(steps()).toBe(3);

    act(() => store().undo(sg));
    expect(node(sg)?.transform.position.x).toBe(60);
    act(() => store().undo(sg));
    expect(node(sg)?.transform.position.x).toBe(150);
  });

  it('undoes a pasted stroke width, each change a step', () => {
    const width = screen.getByTestId('stroke-width-0');
    fireEvent.change(width, { target: { value: '6' } });
    fireEvent.change(width, { target: { value: '9' } });
    expect(node(sg)?.strokes[0]?.width).toBe(9);
    expect(steps()).toBe(3);

    act(() => store().undo(sg));
    expect(node(sg)?.strokes[0]?.width).toBe(6);
  });

  it('undoes a colour dragged out in the picker in one step', () => {
    fireEvent.click(screen.getByTestId('fill-swatch'));
    const area = screen.getByTestId('sv-area');
    Object.defineProperty(area, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect,
    });
    fireEvent.pointerDown(area, { clientX: 10, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 40, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(area, { clientX: 80, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(area, { clientX: 80, clientY: 20, pointerId: 1 });
    expect(node(sg)?.fills[0]?.color).not.toEqual({ r: 100, g: 149, b: 237, a: 1 });
    expect(steps()).toBe(2);

    act(() => store().undo(sg));
    expect(node(sg)?.fills[0]?.color).toEqual({ r: 100, g: 149, b: 237, a: 1 });
  });

  it('undoes a fill turned into a gradient', () => {
    fireEvent.click(screen.getAllByTestId('fill-type-linear')[0]!);
    expect(node(sg)?.fills[0]?.type).toBe('gradient');
    expect(steps()).toBe(2);

    act(() => store().undo(sg));
    expect(node(sg)?.fills[0]?.type).toBe('solid');
  });

  it('undoes keying a property from its diamond', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Add opacity keyframe' }));
    const opacityTrack = () =>
      store().timeline.tracks.find((t) => t.nodeId === 'rect1' && t.property === 'opacity');
    expect(opacityTrack()?.keyframes).toHaveLength(1);

    act(() => store().undo(sg));
    expect(opacityTrack()).toBeUndefined();
    expect(node(sg)).toBeDefined();
  });

  it('makes an effect slider scrub one step', () => {
    fireEvent.click(screen.getByTestId('add-effect-button'));
    fireEvent.click(screen.getByRole('button', { name: 'Drop Shadow' }));
    expect(steps()).toBe(2);
    const opacity = () => (node(sg)?.effects?.[0] as { opacity: number } | undefined)?.opacity;
    const before = opacity();

    const label = screen.getByTestId('scrub-label-Op');
    fireEvent.pointerDown(label, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 90, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 80, pointerId: 1 });
    fireEvent.pointerMove(document, { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(document, { clientX: 70, pointerId: 1 });
    expect(opacity()).not.toBe(before);
    expect(steps()).toBe(3);

    act(() => store().undo(sg));
    expect(opacity()).toBe(before);
  });

  it('pushes no step for presses and focus that change nothing', () => {
    const x = document.getElementById('prop-pos-x')!;
    fireEvent.pointerDown(x, { pointerId: 1 });
    act(() => x.focus());
    fireEvent.pointerUp(x, { pointerId: 1 });
    fireEvent.keyDown(x, { key: 'ArrowLeft' });
    act(() => x.blur());
    expect(steps()).toBe(1);
  });
});

describe('document background and undo', () => {
  it('undoes and redoes the background colour', () => {
    act(() => {
      store().resetProject();
      store().clearHistory();
    });
    const sg = renderPanel();
    const input = screen.getByTestId('document-background-input');
    fireEvent.change(input, { target: { value: '#F0ECE4' } });
    expect(store().documentBackground).toEqual({ r: 240, g: 236, b: 228, a: 1 });

    act(() => store().undo(sg));
    expect(store().documentBackground).toEqual({ r: 26, g: 26, b: 26, a: 1 });
    act(() => store().redo(sg));
    expect(store().documentBackground).toEqual({ r: 240, g: 236, b: 228, a: 1 });
  });

  it('leaves the background alone when undoing other edits', () => {
    act(() => {
      store().resetProject();
      store().clearHistory();
    });
    const sg = renderPanel();
    fireEvent.change(screen.getByTestId('document-background-input'), {
      target: { value: '#F0ECE4' },
    });
    drawRect(sg);

    act(() => store().undo(sg));
    expect(sg.getNode('rect1')).toBeUndefined();
    expect(store().documentBackground).toEqual({ r: 240, g: 236, b: 228, a: 1 });
    act(() => store().undo(sg));
    expect(store().documentBackground).toEqual({ r: 26, g: 26, b: 26, a: 1 });
  });
});
