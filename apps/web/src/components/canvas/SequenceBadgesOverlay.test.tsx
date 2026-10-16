import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '../../test/utils';
import { Camera } from '@quar/core';
import type { AnimationSequenceStep } from '@quar/animation';
import { SequenceBadgesOverlay, type WorldRect } from './SequenceBadgesOverlay';

function step(id: string, nodeId: string): AnimationSequenceStep {
  return { id, nodeId, presetId: 'fade-in', trigger: 'afterPrevious', delay: 0, duration: 24 };
}

const bounds: Record<string, WorldRect> = {
  logo: { x: 0, y: 0, width: 100, height: 50 },
  title: { x: 200, y: 100, width: 80, height: 20 },
};

function renderBadges(steps: AnimationSequenceStep[], onBadgeClick = vi.fn()) {
  const camera = new Camera();
  render(
    <SequenceBadgesOverlay
      steps={steps}
      camera={camera}
      getNodeBounds={(id) => bounds[id] ?? null}
      onBadgeClick={onBadgeClick}
    />
  );
  return { camera, onBadgeClick };
}

describe('SequenceBadgesOverlay', () => {
  it('renders nothing without steps', () => {
    renderBadges([]);
    expect(screen.queryByTestId('sequence-badges')).toBeNull();
  });

  it('labels each object with its step numbers in sequence order', () => {
    renderBadges([step('a', 'logo'), step('b', 'title'), step('c', 'logo'), step('d', 'gone')]);
    expect(screen.getByTestId('sequence-badge-logo')).toHaveTextContent('1, 3');
    expect(screen.getByTestId('sequence-badge-title')).toHaveTextContent('2');
    // Objects without bounds get no badge
    expect(screen.queryByTestId('sequence-badge-gone')).toBeNull();
  });

  it('places a badge just left of the object’s top-left corner on screen', () => {
    const { camera } = renderBadges([step('a', 'title')]);
    const a = camera.worldToScreen({ x: 200, y: 100 });
    const b = camera.worldToScreen({ x: 280, y: 120 });
    const badge = screen.getByTestId('sequence-badge-title');
    const [, tx, ty] = /translate\(([-\d.]+), ([-\d.]+)\)/.exec(badge.getAttribute('transform')!)!;
    expect(Number(ty)).toBeCloseTo(Math.min(a.y, b.y));
    expect(Number(tx)).toBeLessThan(Math.min(a.x, b.x));
  });

  it('opens the object’s first step when clicked', () => {
    const { onBadgeClick } = renderBadges([step('a', 'logo'), step('b', 'logo')]);
    fireEvent.click(screen.getByTestId('sequence-badge-logo'));
    expect(onBadgeClick).toHaveBeenCalledWith('a');
  });
});
