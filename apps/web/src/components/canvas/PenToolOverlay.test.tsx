/**
 * Tests for the Pen's on-canvas preview
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { Camera } from '@quar/core';
import type { PathPoint } from '@quar/types';
import { PenToolOverlay } from './PenToolOverlay';

const corner = (x: number, y: number): PathPoint => ({
  position: { x, y },
  handleIn: null,
  handleOut: null,
  type: 'corner',
});

describe('PenToolOverlay', () => {
  it('draws the path placed so far and the line on to the pointer', () => {
    const camera = new Camera();
    render(
      <PenToolOverlay
        points={[corner(0, 0), corner(100, 0)]}
        rubberBand={{ to: { x: 100, y: 100 }, closing: false }}
        camera={camera}
      />
    );

    const start = camera.worldToScreen({ x: 0, y: 0 });
    expect(screen.getByTestId('pen-path-preview').getAttribute('d')).toMatch(
      new RegExp(`^M ${start.x} ${start.y} C`)
    );
    const pointer = camera.worldToScreen({ x: 100, y: 100 });
    expect(screen.getByTestId('pen-rubber-band').getAttribute('d')).toMatch(
      new RegExp(`${pointer.x} ${pointer.y}$`)
    );
  });

  it('lights up the first point when a click would close the path', () => {
    const camera = new Camera();
    const points = [corner(0, 0), corner(100, 0), corner(50, 80)];
    const { rerender } = render(
      <PenToolOverlay
        points={points}
        rubberBand={{ to: { x: 1, y: 1 }, closing: true }}
        camera={camera}
      />
    );
    expect(screen.getByTestId('pen-first-point').getAttribute('class')).toMatch(/pointClosing/);

    rerender(
      <PenToolOverlay
        points={points}
        rubberBand={{ to: { x: 40, y: 40 }, closing: false }}
        camera={camera}
      />
    );
    expect(screen.getByTestId('pen-first-point').getAttribute('class')).not.toMatch(/pointClosing/);
  });

  it('passes on pointer moves over its points, which the canvas below misses', () => {
    const onPointerMove = vi.fn();
    render(
      <PenToolOverlay
        points={[corner(0, 0), corner(100, 0)]}
        rubberBand={null}
        camera={new Camera()}
        onPointerMove={onPointerMove}
      />
    );
    fireEvent.mouseMove(screen.getByTestId('pen-first-point'), { clientX: 5, clientY: 6 });
    expect(onPointerMove).toHaveBeenCalledTimes(1);
  });

  it('draws no line to the pointer without one', () => {
    render(<PenToolOverlay points={[corner(0, 0)]} rubberBand={null} camera={new Camera()} />);
    expect(screen.queryByTestId('pen-rubber-band')).toBeNull();
  });
});
