/**
 * Tests for where the path editing overlay draws points and handles
 */

import { describe, it, expect } from 'vitest';
import { render } from '../../test/utils';
import { DirectSelectionOverlay } from './DirectSelectionOverlay';
import { Camera, SceneGraph, createDefaultTransform } from '@quar/core';
import type { PathNode } from '@quar/types';

/** A path scaled 10× at (100, 50), anchor in the middle as Pen paths have it. */
function scaledPath(): { node: PathNode; sceneGraph: SceneGraph } {
  const transform = createDefaultTransform();
  transform.position = { x: 100, y: 50 };
  transform.scale = { x: 10, y: 10 };
  transform.anchor = { x: 0.5, y: 0.5 };
  const node: PathNode = {
    id: 'p',
    name: 'Path',
    type: 'path',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    points: [
      { position: { x: 1, y: 0 }, handleIn: null, handleOut: { x: 1, y: 1 }, type: 'smooth' },
      { position: { x: 4, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
    ],
    closed: false,
    fills: [],
    strokes: [],
  };
  const sceneGraph = new SceneGraph();
  sceneGraph.addNode(node);
  return { node, sceneGraph };
}

describe('DirectSelectionOverlay placement', () => {
  it('draws points where the path renders: no anchor offset', () => {
    const { node, sceneGraph } = scaledPath();
    const camera = new Camera();
    const { container } = render(
      <DirectSelectionOverlay
        pathNodes={[node]}
        selectedPoints={[{ nodeId: 'p', pointIndex: 0 }]}
        camera={camera}
        sceneGraph={sceneGraph}
      />
    );

    const expected = camera.worldToScreen({ x: 110, y: 50 });
    const rects = container.querySelectorAll('rect');
    expect(Number(rects[0]!.getAttribute('x')) + 4).toBeCloseTo(expected.x);
    expect(Number(rects[0]!.getAttribute('y')) + 4).toBeCloseTo(expected.y);
  });

  it("draws a handle at the end of the point's handle, through the camera", () => {
    const { node, sceneGraph } = scaledPath();
    const camera = new Camera();
    camera.zoomTo(2);
    const { container } = render(
      <DirectSelectionOverlay
        pathNodes={[node]}
        selectedPoints={[{ nodeId: 'p', pointIndex: 0 }]}
        camera={camera}
        sceneGraph={sceneGraph}
      />
    );

    // Local (1,0) + (1,1) → world (120, 60)
    const expected = camera.worldToScreen({ x: 120, y: 60 });
    const handle = container.querySelector('circle')!;
    expect(Number(handle.getAttribute('cx'))).toBeCloseTo(expected.x);
    expect(Number(handle.getAttribute('cy'))).toBeCloseTo(expected.y);
  });

  it('draws a bound path where its bones pose it, handles turned with it', () => {
    const { node, sceneGraph } = scaledPath();
    const bound = { ...node, skinData: {} as PathNode['skinData'] };
    const camera = new Camera();
    // The bones turn the mesh a quarter and put it at (500, 0): (x, y) → (500 - y, x)
    const pose = {
      vertices: new Float32Array([1, 0, 4, 0]),
      deformed: new Float32Array([500, 1, 500, 4]),
      linear: new Float32Array([0, 1, -1, 0, 0, 1, -1, 0]),
    };
    const { container } = render(
      <DirectSelectionOverlay
        pathNodes={[bound]}
        selectedPoints={[{ nodeId: 'p', pointIndex: 0 }]}
        camera={camera}
        sceneGraph={sceneGraph}
        getSkinPose={() => pose}
      />
    );

    const point = camera.worldToScreen({ x: 500, y: 1 });
    const rects = container.querySelectorAll('rect');
    expect(Number(rects[0]!.getAttribute('x')) + 4).toBeCloseTo(point.x);
    expect(Number(rects[0]!.getAttribute('y')) + 4).toBeCloseTo(point.y);
    // Its handle (1, 1) turned: (-1, 1) from it
    const handle = camera.worldToScreen({ x: 499, y: 2 });
    const circle = container.querySelector('circle')!;
    expect(Number(circle.getAttribute('cx'))).toBeCloseTo(handle.x);
    expect(Number(circle.getAttribute('cy'))).toBeCloseTo(handle.y);
  });
});
