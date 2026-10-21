/**
 * Tests for the gradient handles: the radial focal point
 */

import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { GradientHandleOverlay } from './GradientHandleOverlay';
import { Camera, SceneGraph, createDefaultTransform } from '@quar/core';
import type { Gradient, RectangleNode, Vector2 } from '@quar/types';

const stops = [
  { offset: 0, color: { r: 255, g: 255, b: 255, a: 1 } },
  { offset: 1, color: { r: 0, g: 0, b: 0, a: 1 } },
];

/** A 100×100 rect at the origin with a radial fill; local (0,0) is its middle. */
function setup(gradient: Partial<Gradient> = {}) {
  const sceneGraph = new SceneGraph();
  const node: RectangleNode = {
    id: 'rect',
    name: 'Rect',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0],
    fills: [
      {
        type: 'gradient',
        gradient: { type: 'radial', stops, center: { x: 0.5, y: 0.5 }, radius: 0.5, ...gradient },
        opacity: 1,
        visible: true,
      },
    ],
    strokes: [],
  };
  sceneGraph.addNode(node);
  const camera = new Camera();
  render(
    <>
      <canvas />
      <GradientHandleOverlay
        node={node}
        fillIndex={0}
        source="fill"
        camera={camera}
        sceneGraph={sceneGraph}
      />
    </>
  );
  /** Screen point of a normalized position of the rect. */
  const at = (n: Vector2) => camera.worldToScreen({ x: -50 + n.x * 100, y: -50 + n.y * 100 });
  const gradientNow = () => (sceneGraph.getNode('rect') as RectangleNode).fills[0]!.gradient!;
  const drag = (handle: HTMLElement | SVGElement, to: Vector2, shiftKey = false) => {
    fireEvent.pointerDown(handle, { shiftKey });
    const point = at(to);
    fireEvent.pointerMove(document, { clientX: point.x, clientY: point.y });
    fireEvent.pointerUp(document);
  };
  return { at, gradientNow, drag };
}

describe('GradientHandleOverlay focal point', () => {
  it('shows no focal handle until there is a focal point', () => {
    setup();
    expect(screen.queryByTestId('gradient-handle-focal')).toBeNull();
  });

  it('Shift-dragging the center pulls out a focal point, leaving the center', () => {
    const { gradientNow, drag } = setup();
    drag(screen.getByTestId('gradient-handle-center'), { x: 0.25, y: 0.5 }, true);

    expect(gradientNow().center).toEqual({ x: 0.5, y: 0.5 });
    expect(gradientNow().focal!.x).toBeCloseTo(0.25);
    expect(gradientNow().focal!.y).toBeCloseTo(0.5);
  });

  it('draws the focal handle where the focal point is', () => {
    const { at } = setup({ focal: { x: 0.25, y: 0.75 } });
    const handle = screen.getByTestId('gradient-handle-focal');
    const expected = at({ x: 0.25, y: 0.75 });
    expect(Number(handle.getAttribute('x')) + Number(handle.getAttribute('width')) / 2).toBeCloseTo(
      expected.x
    );
    expect(
      Number(handle.getAttribute('y')) + Number(handle.getAttribute('height')) / 2
    ).toBeCloseTo(expected.y);
  });

  it('moving the center takes the focal point along', () => {
    const { gradientNow, drag } = setup({ focal: { x: 0.4, y: 0.5 } });
    drag(screen.getByTestId('gradient-handle-center'), { x: 0.6, y: 0.6 });

    expect(gradientNow().focal!.x).toBeCloseTo(0.5);
    expect(gradientNow().focal!.y).toBeCloseTo(0.6);
  });

  it('keeps a dragged focal point inside the circle', () => {
    const { gradientNow, drag } = setup({ focal: { x: 0.4, y: 0.5 } });
    drag(screen.getByTestId('gradient-handle-focal'), { x: 2, y: 0.5 });

    expect(gradientNow().focal!.x).toBeCloseTo(0.5 + 0.5 * 0.99);
  });

  it('dropping the focal point on the center puts it away', () => {
    const { gradientNow, drag } = setup({ focal: { x: 0.3, y: 0.5 } });
    drag(screen.getByTestId('gradient-handle-focal'), { x: 0.51, y: 0.5 });

    expect(gradientNow()).not.toHaveProperty('focal');
  });
});
