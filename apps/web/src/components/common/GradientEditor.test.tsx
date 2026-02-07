import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GradientEditor } from './GradientEditor';
import type { Gradient } from '@quar/types';

function makeGradient(overrides: Partial<Gradient> = {}): Gradient {
  return {
    type: 'linear',
    stops: [
      { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
      { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
    ],
    angle: 90,
    ...overrides,
  };
}

describe('GradientEditor', () => {
  let onChange: ReturnType<typeof vi.fn>;
  let onFillTypeChange: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    onFillTypeChange = vi.fn();
  });

  function renderEditor(
    fillType: 'solid' | 'linear' | 'radial' | 'conic' = 'linear',
    gradient: Gradient = makeGradient()
  ) {
    return render(
      <GradientEditor
        fillType={fillType}
        onFillTypeChange={onFillTypeChange}
        gradient={gradient}
        onChange={onChange}
      />
    );
  }

  it('renders fill type tabs', () => {
    renderEditor();
    expect(screen.getByTestId('fill-type-solid')).toBeInTheDocument();
    expect(screen.getByTestId('fill-type-linear')).toBeInTheDocument();
    expect(screen.getByTestId('fill-type-radial')).toBeInTheDocument();
    expect(screen.getByTestId('fill-type-conic')).toBeInTheDocument();
  });

  it('calls onFillTypeChange when tab clicked', () => {
    renderEditor('linear');
    fireEvent.click(screen.getByTestId('fill-type-radial'));
    expect(onFillTypeChange).toHaveBeenCalledWith('radial');
  });

  it('renders gradient bar and stop handles', () => {
    renderEditor();
    expect(screen.getByTestId('gradient-bar')).toBeInTheDocument();
    expect(screen.getByTestId('stop-handle-0')).toBeInTheDocument();
    expect(screen.getByTestId('stop-handle-1')).toBeInTheDocument();
  });

  it('shows only type tabs in solid mode', () => {
    renderEditor('solid');
    expect(screen.getByTestId('fill-type-solid')).toBeInTheDocument();
    expect(screen.queryByTestId('gradient-bar')).not.toBeInTheDocument();
  });

  it('shows angle input for linear gradient', () => {
    renderEditor('linear');
    expect(screen.getByTestId('gradient-angle')).toBeInTheDocument();
    expect((screen.getByTestId('gradient-angle') as HTMLInputElement).value).toBe('90');
  });

  it('shows angle input for conic gradient', () => {
    renderEditor('conic', makeGradient({ type: 'conic', angle: 45 }));
    expect(screen.getByTestId('gradient-angle')).toBeInTheDocument();
  });

  it('does not show angle input for radial gradient', () => {
    renderEditor('radial', makeGradient({ type: 'radial' }));
    expect(screen.queryByTestId('gradient-angle')).not.toBeInTheDocument();
  });

  it('updates angle on input change', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('gradient-angle'), { target: { value: '180' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ angle: 180 }));
  });

  it('shows stop offset for selected stop', () => {
    renderEditor();
    const offsetInput = screen.getByTestId('stop-offset') as HTMLInputElement;
    expect(offsetInput.value).toBe('0');
  });

  it('updates stop offset on input change', () => {
    renderEditor();
    fireEvent.change(screen.getByTestId('stop-offset'), { target: { value: '50' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stops: expect.arrayContaining([
          expect.objectContaining({ offset: 0.5 }),
        ]),
      })
    );
  });

  it('remove stop button is disabled with only 2 stops', () => {
    renderEditor();
    const removeBtn = screen.getByTestId('remove-stop');
    expect(removeBtn).toBeDisabled();
  });

  it('remove stop button works with 3+ stops', () => {
    const gradient = makeGradient({
      stops: [
        { offset: 0, color: { r: 255, g: 0, b: 0, a: 1 } },
        { offset: 0.5, color: { r: 0, g: 255, b: 0, a: 1 } },
        { offset: 1, color: { r: 0, g: 0, b: 255, a: 1 } },
      ],
    });
    renderEditor('linear', gradient);
    const removeBtn = screen.getByTestId('remove-stop');
    expect(removeBtn).not.toBeDisabled();
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        stops: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
      })
    );
  });

  it('renders stop color swatch', () => {
    renderEditor();
    expect(screen.getByTestId('stop-color-swatch')).toBeInTheDocument();
  });
});
