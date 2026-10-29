/**
 * The Brush's and the Eraser's settings in Properties, while either is chosen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';

function Capture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  onCapture(useSceneGraph());
  return null;
}

const store = () => useEditorStore.getState();

describe('Brush and Eraser settings', () => {
  let sg: SceneGraph;

  beforeEach(() => {
    store().resetProject();
    useEditorStore.setState({
      activeTool: 'selection',
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
    });
    render(
      <SceneGraphProvider>
        <Capture onCapture={(graph) => (sg = graph)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );
  });

  const pick = (tool: 'brush' | 'eraser' | 'selection') => act(() => store().setActiveTool(tool));

  it('show only while the Brush or the Eraser is chosen', () => {
    expect(screen.queryByTestId('brush-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eraser-settings')).not.toBeInTheDocument();

    pick('brush');
    expect(screen.getByTestId('brush-settings')).toBeInTheDocument();
    pick('eraser');
    expect(screen.queryByTestId('brush-settings')).not.toBeInTheDocument();
    expect(screen.getByTestId('eraser-settings')).toBeInTheDocument();
    pick('selection');
    expect(screen.queryByTestId('eraser-settings')).not.toBeInTheDocument();
  });

  it('stay at the top of the panel with a layer selected', () => {
    act(() => {
      sg.addNode({
        id: 'box',
        name: 'Box',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 10,
        height: 10,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      });
      store().setSelection(['box']);
    });
    pick('brush');
    expect(screen.getByTestId('brush-settings')).toBeInTheDocument();
  });

  it('set the Brush’s size and smoothing, by slider or typed', () => {
    pick('brush');
    expect(screen.getByTestId('brush-size')).toHaveValue('5');
    expect(screen.getByTestId('brush-smoothing')).toHaveValue('50');

    fireEvent.change(screen.getByTestId('brush-size-slider'), { target: { value: '32' } });
    expect(store().brushSize).toBe(32);
    expect(screen.getByTestId('brush-size')).toHaveValue('32');

    const smoothing = screen.getByTestId('brush-smoothing');
    fireEvent.change(smoothing, { target: { value: '80' } });
    fireEvent.keyDown(smoothing, { key: 'Enter' });
    expect(store().brushSmoothing).toBe(80);

    // Kept to what the Brush takes; ↑ steps it
    const size = screen.getByTestId('brush-size');
    fireEvent.change(size, { target: { value: '400' } });
    fireEvent.blur(size);
    expect(store().brushSize).toBe(100);
    fireEvent.keyDown(size, { key: 'ArrowDown', shiftKey: true });
    expect(store().brushSize).toBe(90);
    // Nonsense puts the value back
    fireEvent.change(size, { target: { value: 'wide' } });
    fireEvent.blur(size);
    expect(store().brushSize).toBe(90);
    expect(size).toHaveValue('90');
  });

  it('choose what the Eraser does, saying so', () => {
    pick('eraser');
    const cut = screen.getByTestId('eraser-mode-stroke');
    const points = screen.getByTestId('eraser-mode-point');
    expect(cut).toHaveTextContent('Cut shapes');
    expect(points).toHaveTextContent('Delete points');
    expect(cut).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('eraser-mode-note')).toHaveTextContent(/cuts the trail out/i);

    fireEvent.click(points);
    expect(store().eraserMode).toBe('point');
    expect(points).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('eraser-mode-note')).toHaveTextContent(/deletes the points/i);
  });

  it('show the Eraser’s size, as [ and ] change it too', () => {
    pick('eraser');
    expect(screen.getByTestId('eraser-size')).toHaveValue('10');
    expect(screen.getByTestId('eraser-settings')).toHaveTextContent('[]');

    // What the keys do reaches the store (useCanvasTools), and the panel shows it
    act(() => store().setEraserSize(15));
    expect(screen.getByTestId('eraser-size')).toHaveValue('15');
    expect(screen.getByTestId('eraser-size-slider')).toHaveValue('15');
  });
});
