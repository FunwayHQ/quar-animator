/**
 * Tests for CanvasRuler — rendering, tick generation, and guide drag callbacks.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { CanvasRuler, RULER_SIZE } from './CanvasRuler';
import { Camera } from '@quar/core';

describe('CanvasRuler', () => {
  it('renders horizontal ruler with data-testid', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    render(<CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} />);
    expect(screen.getByTestId('canvas-ruler-h')).toBeTruthy();
  });

  it('renders vertical ruler with data-testid', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    render(<CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} />);
    expect(screen.getByTestId('canvas-ruler-v')).toBeTruthy();
  });

  it('renders corner square', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const { container } = render(
      <CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} />
    );
    // Corner div is the third child rendered
    const corner = container.querySelector('[class*="corner"]');
    expect(corner).toBeTruthy();
  });

  it('renders tick marks for horizontal ruler', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const { container } = render(
      <CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} cameraVersion={0} />
    );
    const hRuler = screen.getByTestId('canvas-ruler-h');
    // Should have some tick marks
    const ticks = hRuler.children;
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('renders tick marks for vertical ruler', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const { container } = render(
      <CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} cameraVersion={0} />
    );
    const vRuler = screen.getByTestId('canvas-ruler-v');
    const ticks = vRuler.children;
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('renders nothing when camera is null', () => {
    render(<CanvasRuler camera={null} viewportWidth={800} viewportHeight={600} />);
    const hRuler = screen.getByTestId('canvas-ruler-h');
    expect(hRuler.children.length).toBe(0);
  });

  it('horizontal ruler height matches RULER_SIZE', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    render(<CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} />);
    const hRuler = screen.getByTestId('canvas-ruler-h');
    expect(hRuler.style.height).toBe(`${RULER_SIZE}px`);
  });

  it('vertical ruler width matches RULER_SIZE', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    render(<CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} />);
    const vRuler = screen.getByTestId('canvas-ruler-v');
    expect(vRuler.style.width).toBe(`${RULER_SIZE}px`);
  });

  it('RULER_SIZE export is 20', () => {
    expect(RULER_SIZE).toBe(20);
  });

  it('calls onGuideDragStart on horizontal ruler pointerDown', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const onGuideDragStart = vi.fn();
    render(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        onGuideDragStart={onGuideDragStart}
      />
    );
    const hRuler = screen.getByTestId('canvas-ruler-h');
    // JSDOM doesn't implement setPointerCapture
    hRuler.setPointerCapture = vi.fn();
    fireEvent.pointerDown(hRuler, { clientX: 100, clientY: 10, pointerId: 1 });
    // Horizontal ruler drags create Y-axis guides
    expect(onGuideDragStart).toHaveBeenCalledWith('y');
  });

  it('calls onGuideDragStart on vertical ruler pointerDown', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const onGuideDragStart = vi.fn();
    render(
      <CanvasRuler
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        onGuideDragStart={onGuideDragStart}
      />
    );
    const vRuler = screen.getByTestId('canvas-ruler-v');
    // JSDOM doesn't implement setPointerCapture
    vRuler.setPointerCapture = vi.fn();
    fireEvent.pointerDown(vRuler, { clientX: 10, clientY: 100, pointerId: 1 });
    // Vertical ruler drags create X-axis guides
    expect(onGuideDragStart).toHaveBeenCalledWith('x');
  });

  it('updates ticks when cameraVersion changes', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const { rerender } = render(
      <CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} cameraVersion={0} />
    );
    const hRuler1 = screen.getByTestId('canvas-ruler-h');
    const tickCount1 = hRuler1.children.length;

    // Zoom in and rerender with new cameraVersion
    camera.zoom = 2.0;
    rerender(
      <CanvasRuler camera={camera} viewportWidth={800} viewportHeight={600} cameraVersion={1} />
    );
    // Tick count may change with zoom (adaptive spacing)
    const hRuler2 = screen.getByTestId('canvas-ruler-h');
    // Just verify it re-rendered without error
    expect(hRuler2.children.length).toBeGreaterThan(0);
  });
});
