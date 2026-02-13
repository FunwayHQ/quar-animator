import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { EasingEditor } from './EasingEditor';
import { EASE, EASE_IN, createCubicBezier } from '@quar/animation';
import type { EasingFunction } from '@quar/types';

describe('EasingEditor', () => {
  const defaultProps = {
    easing: EASE as EasingFunction,
    onChange: vi.fn(),
    anchorX: 100,
    anchorY: 100,
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the editor portal with overlay', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-editor')).toBeInTheDocument();
    expect(screen.getByTestId('easing-editor-overlay')).toBeInTheDocument();
  });

  it('displays "Easing Editor" header', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByText('Easing Editor')).toBeInTheDocument();
  });

  it('renders close button', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-editor-close')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    render(<EasingEditor {...defaultProps} />);
    fireEvent.click(screen.getByTestId('easing-editor-close'));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay clicked', () => {
    render(<EasingEditor {...defaultProps} />);
    fireEvent.click(screen.getByTestId('easing-editor-overlay'));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    render(<EasingEditor {...defaultProps} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });

  it('renders the SVG curve area', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-curve-svg')).toBeInTheDocument();
  });

  it('renders P1 and P2 handles for cubic bezier easing', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-handle-p1')).toBeInTheDocument();
    expect(screen.getByTestId('easing-handle-p2')).toBeInTheDocument();
  });

  it('does not render handles for non-bezier easing', () => {
    render(<EasingEditor {...defaultProps} easing="easeOutBounce" />);
    expect(screen.queryByTestId('easing-handle-p1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('easing-handle-p2')).not.toBeInTheDocument();
  });

  it('renders the live preview strip', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-preview-strip')).toBeInTheDocument();
  });

  it('renders numeric inputs for x1, y1, x2, y2', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-input-x1')).toBeInTheDocument();
    expect(screen.getByTestId('easing-input-y1')).toBeInTheDocument();
    expect(screen.getByTestId('easing-input-x2')).toBeInTheDocument();
    expect(screen.getByTestId('easing-input-y2')).toBeInTheDocument();
  });

  it('numeric inputs reflect current bezier values', () => {
    // EASE = (0.25, 0.1, 0.25, 1)
    render(<EasingEditor {...defaultProps} easing={EASE} />);
    const x1 = screen.getByTestId('easing-input-x1') as HTMLInputElement;
    const y1 = screen.getByTestId('easing-input-y1') as HTMLInputElement;
    expect(parseFloat(x1.value)).toBeCloseTo(0.25, 1);
    expect(parseFloat(y1.value)).toBeCloseTo(0.1, 1);
  });

  it('renders the preset area with categories', () => {
    render(<EasingEditor {...defaultProps} />);
    expect(screen.getByTestId('easing-preset-area')).toBeInTheDocument();
    // Check category names
    expect(screen.getByText('CSS Standard')).toBeInTheDocument();
    expect(screen.getByText('Power')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  it('clicking a preset calls onChange', () => {
    render(<EasingEditor {...defaultProps} />);
    const linearPreset = screen.getByTestId('easing-preset-linear');
    fireEvent.click(linearPreset);
    expect(defaultProps.onChange).toHaveBeenCalled();
  });

  it('changing a numeric input calls onChange', () => {
    render(<EasingEditor {...defaultProps} />);
    const x1 = screen.getByTestId('easing-input-x1');
    fireEvent.change(x1, { target: { value: '0.5' } });
    expect(defaultProps.onChange).toHaveBeenCalled();
    // Verify the value was passed as cubic bezier
    const lastCall = defaultProps.onChange.mock.calls[defaultProps.onChange.mock.calls.length - 1]!;
    const easingArg = lastCall[0] as { type: string; points: number[] };
    expect(easingArg.type).toBe('cubicBezier');
    expect(easingArg.points[0]).toBeCloseTo(0.5, 1);
  });
});
