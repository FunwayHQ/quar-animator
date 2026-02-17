/**
 * Tests for ArtboardOverlay
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { ArtboardOverlay } from './ArtboardOverlay';
import { SceneGraph, Camera, createDefaultTransform } from '@quar/core';
import type { ArtboardNode } from '@quar/types';

function createTestArtboard(
  id: string,
  name: string,
  x: number,
  y: number,
  width: number,
  height: number
): ArtboardNode {
  const transform = createDefaultTransform();
  transform.position = { x, y };
  return {
    id,
    name,
    type: 'artboard',
    parent: null,
    children: [],
    transform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width,
    height,
    fills: [
      {
        type: 'solid' as const,
        color: { r: 255, g: 255, b: 255, a: 1 },
        opacity: 1,
        visible: true,
      },
    ],
    clipContent: true,
  };
}

describe('ArtboardOverlay', () => {
  it('renders nothing when no artboard nodes', () => {
    const sg = new SceneGraph();
    const camera = new Camera();

    const { container } = render(
      <ArtboardOverlay
        artboardNodes={[]}
        selectedNodeIds={new Set()}
        camera={camera}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    expect(container.querySelector('svg')).toBeNull();
  });

  it('renders artboard name and dimensions', () => {
    const sg = new SceneGraph();
    const camera = new Camera();
    const artboard = createTestArtboard('art1', 'My Frame', 500, 400, 1920, 1080);
    sg.addNode(artboard);

    render(
      <ArtboardOverlay
        artboardNodes={[artboard]}
        selectedNodeIds={new Set()}
        camera={camera}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    expect(screen.getByText('My Frame')).toBeInTheDocument();
    expect(screen.getByText('1920 x 1080')).toBeInTheDocument();
  });

  it('renders multiple artboard labels', () => {
    const sg = new SceneGraph();
    const camera = new Camera();
    const art1 = createTestArtboard('art1', 'Desktop', 500, 400, 1440, 900);
    const art2 = createTestArtboard('art2', 'Mobile', 2000, 400, 375, 812);
    sg.addNode(art1);
    sg.addNode(art2);

    render(
      <ArtboardOverlay
        artboardNodes={[art1, art2]}
        selectedNodeIds={new Set()}
        camera={camera}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    expect(screen.getByText('Desktop')).toBeInTheDocument();
    expect(screen.getByText('1440 x 900')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText('375 x 812')).toBeInTheDocument();
  });

  it('highlights selected artboard with different color', () => {
    const sg = new SceneGraph();
    const camera = new Camera();
    const artboard = createTestArtboard('art1', 'Selected Frame', 200, 200, 800, 600);
    sg.addNode(artboard);

    const { container } = render(
      <ArtboardOverlay
        artboardNodes={[artboard]}
        selectedNodeIds={new Set(['art1'])}
        camera={camera}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    const textEl = container.querySelector('text');
    expect(textEl).not.toBeNull();
    // Selected artboard should use violet accent color
    expect(textEl!.getAttribute('fill')).toBe('#A855F7');
    expect(textEl!.getAttribute('font-weight')).toBe('600');
  });

  it('uses default color for unselected artboard', () => {
    const sg = new SceneGraph();
    const camera = new Camera();
    const artboard = createTestArtboard('art1', 'Unselected', 200, 200, 800, 600);
    sg.addNode(artboard);

    const { container } = render(
      <ArtboardOverlay
        artboardNodes={[artboard]}
        selectedNodeIds={new Set()}
        camera={camera}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    const textEl = container.querySelector('text');
    expect(textEl).not.toBeNull();
    expect(textEl!.getAttribute('fill')).toBe('#999');
    expect(textEl!.getAttribute('font-weight')).toBe('400');
  });

  it('renders nothing when camera is null', () => {
    const sg = new SceneGraph();
    const artboard = createTestArtboard('art1', 'Test', 0, 0, 100, 100);
    sg.addNode(artboard);

    const { container } = render(
      <ArtboardOverlay
        artboardNodes={[artboard]}
        selectedNodeIds={new Set()}
        camera={null}
        sceneGraph={sg}
        cameraVersion={0}
      />
    );

    expect(container.querySelector('svg')).toBeNull();
  });
});
