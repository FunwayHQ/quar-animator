import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { EasingCurvePreview } from './EasingCurvePreview';
import { EASE } from '@quar/animation';

describe('EasingCurvePreview', () => {
  it('renders an SVG with the curve preview', () => {
    render(<EasingCurvePreview easing="linear" />);
    const svg = screen.getByTestId('easing-curve-preview');
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe('svg');
  });

  it('renders with custom width and height', () => {
    render(<EasingCurvePreview easing="linear" width={48} height={32} />);
    const svg = screen.getByTestId('easing-curve-preview');
    expect(svg.getAttribute('width')).toBe('48');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('applies active class when active prop is true', () => {
    render(<EasingCurvePreview easing="linear" active />);
    const svg = screen.getByTestId('easing-curve-preview');
    expect(svg.className.baseVal).toContain('active');
  });

  it('renders for cubic bezier easing', () => {
    render(<EasingCurvePreview easing={EASE} />);
    const svg = screen.getByTestId('easing-curve-preview');
    expect(svg).toBeInTheDocument();
    // Should have a path element for the curve
    const path = svg.querySelector('path');
    expect(path).not.toBeNull();
  });

  it('renders for named easing types', () => {
    render(<EasingCurvePreview easing="easeOutBounce" />);
    const svg = screen.getByTestId('easing-curve-preview');
    expect(svg).toBeInTheDocument();
  });
});
