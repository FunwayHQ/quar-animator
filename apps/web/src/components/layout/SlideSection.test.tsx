/**
 * The Slide section in Properties: the transition into an artboard's slide.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { createTimeline, scopeTransition } from '@quar/animation';
import type { ArtboardNode, Node } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';

function Capture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  onCapture(useSceneGraph());
  return null;
}

function artboard(id: string, visible = true): ArtboardNode {
  return {
    id,
    name: id,
    type: 'artboard',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 800,
    height: 600,
    fills: [],
    clipContent: true,
  };
}

const store = () => useEditorStore.getState();
const transitionOf = (id: string) => scopeTransition(store().timeline, id);

describe('the Slide section', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    useEditorStore.setState({ timeline: createTimeline({ duration: 90 }) });
    render(
      <SceneGraphProvider>
        <Capture onCapture={(graph) => (sg = graph)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );
    // Three slides: Intro topmost in Layers (the first), then Middle, then Outro
    act(() => {
      for (const id of ['outro', 'middle', 'intro']) sg.addNode(artboard(id));
    });
  });

  const select = (id: string) => act(() => store().setSelection([id]));

  it('shows for an artboard at the top of the page: which slide, and no transition yet', () => {
    select('middle');
    expect(screen.getByTestId('slide-section')).toBeTruthy();
    expect(screen.getByTestId('slide-number').textContent).toBe('2 / 3');
    expect((screen.getByTestId('slide-transition') as HTMLSelectElement).value).toBe('none');
    // No direction or duration until one is chosen
    expect(screen.queryByTestId('slide-direction')).toBeNull();
    expect(screen.queryByTestId('slide-transition-duration')).toBeNull();
  });

  it('isn’t there for other layers, or an artboard inside a group', () => {
    act(() => {
      sg.addNode({
        ...artboard('rect'),
        type: 'rectangle',
        cornerRadius: [0, 0, 0, 0],
        strokes: [],
      } as unknown as Node);
    });
    select('rect');
    expect(screen.queryByTestId('slide-section')).toBeNull();
    act(() => {
      sg.addNode({ ...artboard('inner'), parent: 'outro' }, 'outro');
    });
    select('inner');
    expect(screen.queryByTestId('slide-section')).toBeNull();
  });

  it('chooses a transition: half a second, its direction where it moves, undoably', () => {
    select('middle');
    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'fade' } });
    expect(transitionOf('middle')).toEqual({ type: 'fade', duration: 0.5 });
    expect((screen.getByTestId('slide-transition-duration') as HTMLInputElement).value).toBe('0.5');
    expect(screen.queryByTestId('slide-direction')).toBeNull();

    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'push' } });
    expect(transitionOf('middle')).toEqual({ type: 'push', direction: 'left', duration: 0.5 });
    expect(screen.getByTestId('slide-direction-left').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('slide-direction-up'));
    expect(transitionOf('middle')?.direction).toBe('up');
    expect(screen.getByTestId('slide-direction-up').getAttribute('aria-pressed')).toBe('true');
    // The preview plays it
    expect(screen.getByTestId('slide-transition-preview').getAttribute('data-type')).toBe('push');

    act(() => store().undo(sg));
    expect(transitionOf('middle')?.direction).toBe('left');

    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'none' } });
    expect(transitionOf('middle')).toBeNull();
  });

  it('sets the duration in seconds, kept within bounds, with ↑/↓ by a tenth', () => {
    select('outro');
    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'wipe' } });
    const field = screen.getByTestId('slide-transition-duration') as HTMLInputElement;
    fireEvent.change(field, { target: { value: '1.25' } });
    // Kept on Enter (or leaving the field), not while typing
    expect(transitionOf('outro')?.duration).toBe(0.5);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(transitionOf('outro')?.duration).toBe(1.25);
    fireEvent.keyDown(field, { key: 'ArrowUp' });
    expect(transitionOf('outro')?.duration).toBe(1.35);
    fireEvent.change(field, { target: { value: '99' } });
    fireEvent.blur(field);
    expect(transitionOf('outro')?.duration).toBe(10);
    expect(field.value).toBe('10');
    // Something that isn't a number: put back
    fireEvent.change(field, { target: { value: 'soon' } });
    fireEvent.blur(field);
    expect(field.value).toBe('10');
    expect(transitionOf('outro')?.duration).toBe(10);
  });

  it('sets how the transition eases, undoably, and Apply to all carries it', () => {
    select('middle');
    expect(screen.queryByTestId('slide-transition-easing')).toBeNull();
    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'push' } });
    const easing = () => screen.getByTestId('slide-transition-easing') as HTMLSelectElement;
    // Eased in and out until told otherwise
    expect(easing().value).toBe('easeInOutCubic');
    expect(screen.getByRole('option', { name: 'Ease Out Bounce' })).toBeTruthy();

    fireEvent.change(easing(), { target: { value: 'easeOutBounce' } });
    expect(transitionOf('middle')).toEqual({
      type: 'push',
      direction: 'left',
      duration: 0.5,
      easing: 'easeOutBounce',
    });
    // Another kind keeps it
    fireEvent.change(screen.getByTestId('slide-transition'), { target: { value: 'fade' } });
    expect(transitionOf('middle')?.easing).toBe('easeOutBounce');
    act(() => store().undo(sg));
    act(() => store().undo(sg));
    expect(transitionOf('middle')).toEqual({ type: 'push', direction: 'left', duration: 0.5 });

    fireEvent.change(easing(), { target: { value: 'linear' } });
    fireEvent.click(screen.getByTestId('slide-transition-apply-all'));
    for (const id of ['intro', 'middle', 'outro']) {
      expect(transitionOf(id)?.easing).toBe('linear');
    }
    // Back to in and out: no easing of its own, as a new transition has
    fireEvent.change(easing(), { target: { value: 'easeInOutCubic' } });
    expect(transitionOf('middle')).toEqual({ type: 'push', direction: 'left', duration: 0.5 });
  });

  it('applies one slide’s transition to all slides, once', () => {
    select('outro');
    fireEvent.change(screen.getByTestId('slide-transition'), {
      target: { value: 'slide-over' },
    });
    fireEvent.click(screen.getByTestId('slide-direction-down'));
    const apply = screen.getByTestId('slide-transition-apply-all') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
    fireEvent.click(apply);
    for (const id of ['intro', 'middle', 'outro']) {
      expect(transitionOf(id)).toEqual({ type: 'slide-over', direction: 'down', duration: 0.5 });
    }
    // Every slide has it now
    expect(apply.disabled).toBe(true);
    // One step takes it back
    act(() => store().undo(sg));
    expect(transitionOf('middle')).toBeNull();
    expect(transitionOf('outro')?.type).toBe('slide-over');
  });

  it('shows the first slide’s disabled: nothing plays into it', () => {
    select('intro');
    expect(screen.getByTestId('slide-number').textContent).toBe('1 / 3');
    expect((screen.getByTestId('slide-transition') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByTestId('slide-transition-apply-all') as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByTestId('slide-first-note')).toBeTruthy();
  });

  it('counts only the shown artboards as slides', () => {
    act(() => sg.updateNode('intro', { visible: false }));
    select('middle');
    // Middle is the first slide now
    expect(screen.getByTestId('slide-number').textContent).toBe('1 / 2');
    select('intro');
    expect(screen.getByTestId('slide-number').textContent).toBe('Hidden');
    expect((screen.getByTestId('slide-transition') as HTMLSelectElement).disabled).toBe(false);
  });
});
