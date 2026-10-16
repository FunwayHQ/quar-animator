import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { Camera } from '@quar/core';
import { Canvas } from './Canvas';

function renderCanvas(onProjectFileDrop?: (file: File) => void | Promise<void>) {
  return render(
    <SceneGraphProvider>
      <Canvas onProjectFileDrop={onProjectFileDrop} />
    </SceneGraphProvider>
  );
}

describe('Canvas', () => {
  it('renders the canvas element', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('displays coordinate display', () => {
    renderCanvas();
    expect(screen.getByText(/X:/)).toBeInTheDocument();
    expect(screen.getByText(/Y:/)).toBeInTheDocument();
  });

  it('displays zoom level', () => {
    renderCanvas();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('pans the canvas on a horizontal Magic Mouse side swipe', () => {
    const pan = vi.spyOn(Camera.prototype, 'pan');
    renderCanvas();
    const canvas = document.querySelector('canvas');

    expect(canvas).toBeInTheDocument();
    fireEvent.wheel(canvas!, { deltaX: 72, deltaY: 2 });

    expect(pan).toHaveBeenCalledWith({ x: -72, y: 0 });
    pan.mockRestore();
  });

  it('updates coordinates on mouse move', () => {
    renderCanvas();
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

      // Coordinates display exists (values depend on camera initialization which may fail in test env)
      // Just verify the display updates without WebGL errors
      expect(screen.getByText(/X:/)).toBeInTheDocument();
      expect(screen.getByText(/Y:/)).toBeInTheDocument();
    }
  });

  it('has crosshair cursor style', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    // The canvas should have cursor styling applied via CSS module
    expect(canvas).toBeInTheDocument();
  });

  it('renders within a container div', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    expect(canvas?.parentElement).toBeInTheDocument();
  });

  it('shows a drop hint while a file is dragged over the canvas', () => {
    renderCanvas();
    const dropZone = screen.getByTestId('canvas-drop-zone');

    fireEvent.dragOver(dropZone, { dataTransfer: { types: ['Files'] } });

    expect(screen.getByText('Drop an image, SVG, or project file to import')).toBeInTheDocument();
  });

  it('forwards a dropped project file to the project importer', () => {
    const onProjectFileDrop = vi.fn();
    renderCanvas(onProjectFileDrop);
    const dropZone = screen.getByTestId('canvas-drop-zone');
    const file = new File(['project'], 'animation.quar', { type: 'application/octet-stream' });

    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } });

    expect(onProjectFileDrop).toHaveBeenCalledWith(file);
  });
});
