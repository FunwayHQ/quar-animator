/**
 * The Eraser's ring round the pointer: as big as the Eraser reaches.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useEditorStore } from '../../stores/editorStore';
import { EraserCursorOverlay } from './EraserCursorOverlay';

const moveTo = (clientX: number, clientY: number) =>
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }));
  });

describe('EraserCursorOverlay', () => {
  beforeEach(() => {
    useEditorStore.setState({ eraserSize: 10 });
  });

  it('rings the pointer as far as the Eraser reaches, and follows its size', () => {
    render(<EraserCursorOverlay canvasWidth={800} canvasHeight={600} />);
    expect(screen.queryByTestId('eraser-ring')).not.toBeInTheDocument();

    moveTo(120, 80);
    const circles = screen.getByTestId('eraser-ring').querySelectorAll('circle');
    expect(circles).toHaveLength(2);
    for (const circle of circles) {
      expect(circle).toHaveAttribute('cx', '120');
      expect(circle).toHaveAttribute('cy', '80');
      expect(circle).toHaveAttribute('r', '10');
    }

    // [ ] or the panel: the ring grows with it
    act(() => useEditorStore.getState().setEraserSize(35));
    expect(screen.getByTestId('eraser-ring').querySelector('circle')).toHaveAttribute('r', '35');
  });

  it('shows no ring with the pointer off the canvas', () => {
    render(<EraserCursorOverlay canvasWidth={800} canvasHeight={600} />);
    moveTo(120, 80);
    moveTo(900, 80);
    expect(screen.queryByTestId('eraser-ring')).not.toBeInTheDocument();
  });
});
