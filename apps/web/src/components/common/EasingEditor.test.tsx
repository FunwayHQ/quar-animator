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

  it("shows a named curve's own control points, and its handles", () => {
    render(<EasingEditor {...defaultProps} easing="easeOutCubic" />);
    const values = ['x1', 'y1', 'x2', 'y2'].map((field) =>
      Number((screen.getByTestId(`easing-input-${field}`) as HTMLInputElement).value)
    );
    // Ease Out Cubic is cubic-bezier(1/3, 1, 2/3, 1)
    expect(values).toEqual([0.33, 1, 0.67, 1]);
    expect(screen.getByTestId('easing-handle-p1')).toBeInTheDocument();
    expect(screen.queryByTestId('easing-no-points')).not.toBeInTheDocument();
  });

  it('shows Linear as its points along the line', () => {
    render(<EasingEditor {...defaultProps} easing="linear" />);
    const values = ['x1', 'y1', 'x2', 'y2'].map((field) =>
      Number((screen.getByTestId(`easing-input-${field}`) as HTMLInputElement).value)
    );
    expect(values).toEqual([0.33, 0.33, 0.67, 0.67]);
  });

  it('leaves the fields empty and disabled, saying why, for a curve no bezier draws', () => {
    render(<EasingEditor {...defaultProps} easing="easeOutBounce" />);
    for (const field of ['x1', 'y1', 'x2', 'y2']) {
      const input = screen.getByTestId(`easing-input-${field}`) as HTMLInputElement;
      expect(input.value).toBe('');
      expect(input).toBeDisabled();
    }
    expect(screen.getByTestId('easing-no-points')).toHaveTextContent(/Ease Out Bounce/);

    // Picking a curve that has points fills them in
    fireEvent.click(screen.getByTestId('easing-preset-in-cubic'));
    const x2 = screen.getByTestId('easing-input-x2') as HTMLInputElement;
    expect(x2).not.toBeDisabled();
    expect(Number(x2.value)).toBe(0.67);
    expect(screen.queryByTestId('easing-no-points')).not.toBeInTheDocument();
  });

  it("starts a typed curve from the named one's points", () => {
    render(<EasingEditor {...defaultProps} easing="easeInCubic" />);
    fireEvent.change(screen.getByTestId('easing-input-y2'), { target: { value: '0.5' } });
    const lastCall = defaultProps.onChange.mock.calls[defaultProps.onChange.mock.calls.length - 1]!;
    const [x1, y1, x2, y2] = (lastCall[0] as { points: number[] }).points;
    expect(x1).toBeCloseTo(1 / 3);
    expect(y1).toBeCloseTo(0);
    expect(x2).toBeCloseTo(2 / 3);
    expect(y2).toBe(0.5);
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
