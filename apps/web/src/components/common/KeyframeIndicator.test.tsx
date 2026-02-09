import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { KeyframeIndicator } from './KeyframeIndicator';

describe('KeyframeIndicator', () => {
  it('renders a diamond shape (rotated 45deg)', () => {
    render(<KeyframeIndicator state="none" onToggle={() => {}} />);
    const btn = screen.getByTestId('keyframe-indicator');
    expect(btn).toBeInTheDocument();
    expect(btn.style.transform).toBe('rotate(45deg)');
  });

  it('shows outline-only for none state', () => {
    render(<KeyframeIndicator state="none" onToggle={() => {}} />);
    const btn = screen.getByTestId('keyframe-indicator');
    expect(btn.style.background).toBe('transparent');
    expect(btn.style.border).toContain('var(--color-text-disabled)');
  });

  it('shows filled for active state', () => {
    render(<KeyframeIndicator state="active" onToggle={() => {}} />);
    const btn = screen.getByTestId('keyframe-indicator');
    expect(btn.style.background).toBe('var(--color-keyframe-active)');
  });

  it('calls onToggle when clicked', () => {
    const toggle = vi.fn();
    render(<KeyframeIndicator state="none" onToggle={toggle} />);
    fireEvent.click(screen.getByTestId('keyframe-indicator'));
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('shows appropriate title for each state', () => {
    const { rerender } = render(<KeyframeIndicator state="none" onToggle={() => {}} />);
    expect(screen.getByTestId('keyframe-indicator')).toHaveAttribute('title', 'Add keyframe');

    rerender(<KeyframeIndicator state="inactive" onToggle={() => {}} />);
    expect(screen.getByTestId('keyframe-indicator')).toHaveAttribute('title', 'Add keyframe');

    rerender(<KeyframeIndicator state="active" onToggle={() => {}} />);
    expect(screen.getByTestId('keyframe-indicator')).toHaveAttribute('title', 'Remove keyframe');
  });
});
