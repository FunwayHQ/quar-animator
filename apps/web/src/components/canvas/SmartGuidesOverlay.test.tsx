import { describe, expect, it } from 'vitest';
import { Camera } from '@quar/core';
import type { SmartGuide } from '@quar/core';
import { render, screen } from '../../test/utils';
import { SmartGuidesOverlay } from './SmartGuidesOverlay';

describe('SmartGuidesOverlay', () => {
  it('renders alignment lines and equal-spacing measurements', () => {
    const camera = new Camera();
    camera.setViewport(800, 600);
    const guides: SmartGuide[] = [
      {
        id: 'alignment',
        kind: 'alignment',
        axis: 'x',
        position: 20,
        start: 0,
        end: 50,
      },
      {
        id: 'spacing',
        kind: 'spacing',
        from: { x: 10, y: 10 },
        to: { x: 30, y: 10 },
        label: '20 px',
      },
    ];

    render(
      <SmartGuidesOverlay
        guides={guides}
        camera={camera}
        viewportWidth={800}
        viewportHeight={600}
      />
    );

    expect(screen.getByTestId('smart-guides-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('smart-alignment-guide')).toBeInTheDocument();
    expect(screen.getByTestId('smart-spacing-guide')).toBeInTheDocument();
    expect(screen.getByText('20 px')).toBeInTheDocument();
  });

  it('renders nothing when there are no active guides', () => {
    render(
      <SmartGuidesOverlay
        guides={[]}
        camera={new Camera()}
        viewportWidth={800}
        viewportHeight={600}
      />
    );

    expect(screen.queryByTestId('smart-guides-overlay')).not.toBeInTheDocument();
  });
});
