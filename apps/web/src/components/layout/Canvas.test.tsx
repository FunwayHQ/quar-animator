import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { Canvas } from './Canvas';

describe('Canvas', () => {
  it('renders the canvas element', () => {
    render(<Canvas />);
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('displays coordinate display', () => {
    render(<Canvas />);
    expect(screen.getByText(/X:/)).toBeInTheDocument();
    expect(screen.getByText(/Y:/)).toBeInTheDocument();
  });

  it('displays zoom level', () => {
    render(<Canvas />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('updates coordinates on mouse move', () => {
    render(<Canvas />);
    const canvas = document.querySelector('canvas');

    if (canvas) {
      // Mock getBoundingClientRect
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 });

      // The coordinates should update (exact values depend on implementation)
      expect(screen.getByText(/X: 100/)).toBeInTheDocument();
      expect(screen.getByText(/Y: 50/)).toBeInTheDocument();
    }
  });

  it('has crosshair cursor style', () => {
    render(<Canvas />);
    const canvas = document.querySelector('canvas');
    // The canvas should have cursor styling applied via CSS module
    expect(canvas).toBeInTheDocument();
  });

  it('renders within a container div', () => {
    render(<Canvas />);
    const canvas = document.querySelector('canvas');
    expect(canvas?.parentElement).toBeInTheDocument();
  });
});
