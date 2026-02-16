/**
 * Tests for GuideOverlay
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { GuideOverlay } from './GuideOverlay';
import { Camera } from '@quar/core';
import type { Guide } from '../../stores/editorStore';

function createGuide(id: string, axis: 'x' | 'y', position: number): Guide {
  return { id, axis, position };
}

describe('GuideOverlay', () => {
  it('renders SVG overlay with data-testid', () => {
    const camera = new Camera();
    render(
      <GuideOverlay
        guides={[]}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );
    expect(screen.getByTestId('guide-overlay')).toBeTruthy();
  });

  it('renders vertical guide lines', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const guides = [createGuide('g1', 'x', 100)];

    const { container } = render(
      <GuideOverlay
        guides={guides}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    // Should have 2 lines per guide (hit area + visible line)
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders horizontal guide lines', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const guides = [createGuide('g1', 'y', 200)];

    const { container } = render(
      <GuideOverlay
        guides={guides}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });

  it('renders drag preview line', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);

    const { container } = render(
      <GuideOverlay
        guides={[]}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={{ axis: 'x', worldPosition: 150 }}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    // Should render the preview line
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(1);
  });

  it('renders nothing when no guides and no preview', () => {
    const camera = new Camera();

    const { container } = render(
      <GuideOverlay
        guides={[]}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(0);
  });

  it('renders multiple guides', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const guides = [
      createGuide('g1', 'x', 100),
      createGuide('g2', 'y', 200),
      createGuide('g3', 'x', 300),
    ];

    const { container } = render(
      <GuideOverlay
        guides={guides}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    // 3 guides × 2 lines each = 6 lines
    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(6);
  });

  it('does not render drag preview when NaN position', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);

    const { container } = render(
      <GuideOverlay
        guides={[]}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={{ axis: 'y', worldPosition: NaN }}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(0);
  });

  it('handles null camera gracefully', () => {
    const { container } = render(
      <GuideOverlay
        guides={[createGuide('g1', 'x', 100)]}
        camera={null}
        viewportWidth={800}
        viewportHeight={600}
        cameraVersion={0}
        dragPreview={null}
        onRemoveGuide={vi.fn()}
        onUpdateGuidePosition={vi.fn()}
      />
    );

    const lines = container.querySelectorAll('line');
    expect(lines.length).toBe(0);
  });
});
