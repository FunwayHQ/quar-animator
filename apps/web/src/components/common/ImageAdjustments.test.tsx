import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImageAdjustments, DEFAULT_ADJUSTMENTS } from './ImageAdjustments';
import type { ImageAdjustments as ImageAdjustmentsType } from '@quar/types';

// ============================================================================
// Test Helpers
// ============================================================================

const ADJUSTMENT_KEYS: (keyof ImageAdjustmentsType)[] = [
  'brightness',
  'exposure',
  'contrast',
  'saturation',
  'hue',
  'temperature',
];

function defaultAdjustments(): ImageAdjustmentsType {
  return { ...DEFAULT_ADJUSTMENTS };
}

function renderAdjustments(overrides: Partial<ImageAdjustmentsType> = {}) {
  const adjustments = { ...defaultAdjustments(), ...overrides };
  const onChange = vi.fn();
  const onReset = vi.fn();
  const onResetAll = vi.fn();
  const result = render(
    <ImageAdjustments
      adjustments={adjustments}
      onChange={onChange}
      onReset={onReset}
      onResetAll={onResetAll}
    />
  );
  return { ...result, onChange, onReset, onResetAll, adjustments };
}

// ============================================================================
// Tests
// ============================================================================

describe('ImageAdjustments', () => {
  it('renders the component container', () => {
    renderAdjustments();
    expect(screen.getByTestId('image-adjustments')).toBeInTheDocument();
  });

  it('renders all six adjustment sliders', () => {
    renderAdjustments();
    for (const key of ADJUSTMENT_KEYS) {
      expect(screen.getByTestId(`adjustment-slider-${key}`)).toBeInTheDocument();
    }
  });

  it('renders labels for all adjustments', () => {
    renderAdjustments();
    expect(screen.getByText('Brightness')).toBeInTheDocument();
    expect(screen.getByText('Exposure')).toBeInTheDocument();
    expect(screen.getByText('Contrast')).toBeInTheDocument();
    expect(screen.getByText('Saturation')).toBeInTheDocument();
    expect(screen.getByText('Hue')).toBeInTheDocument();
    expect(screen.getByText('Temperature')).toBeInTheDocument();
  });

  it('displays current values correctly for default (zero) adjustments', () => {
    renderAdjustments();
    for (const key of ADJUSTMENT_KEYS) {
      const valueInput = screen.getByTestId(`adjustment-value-${key}`) as HTMLInputElement;
      if (key === 'hue') {
        expect(valueInput.value).toBe('0\u00B0');
      } else {
        expect(valueInput.value).toBe('0');
      }
    }
  });

  it('displays current non-default values correctly', () => {
    renderAdjustments({ brightness: 50, hue: -90, contrast: 25 });

    const brightnessValue = screen.getByTestId('adjustment-value-brightness') as HTMLInputElement;
    expect(brightnessValue.value).toBe('50');

    const hueValue = screen.getByTestId('adjustment-value-hue') as HTMLInputElement;
    expect(hueValue.value).toBe('-90\u00B0');

    const contrastValue = screen.getByTestId('adjustment-value-contrast') as HTMLInputElement;
    expect(contrastValue.value).toBe('25');
  });

  it('hue shows degree suffix', () => {
    renderAdjustments({ hue: 45 });
    const hueValue = screen.getByTestId('adjustment-value-hue') as HTMLInputElement;
    expect(hueValue.value).toBe('45\u00B0');
  });

  // ============================================================================
  // onChange callback
  // ============================================================================

  it('calls onChange when slider value is changed', () => {
    const { onChange } = renderAdjustments();

    const slider = screen.getByTestId('adjustment-slider-brightness');
    fireEvent.change(slider, { target: { value: '42' } });

    expect(onChange).toHaveBeenCalledWith('brightness', 42);
  });

  it('calls onChange for each different adjustment slider', () => {
    const { onChange } = renderAdjustments();

    fireEvent.change(screen.getByTestId('adjustment-slider-contrast'), {
      target: { value: '-30' },
    });
    expect(onChange).toHaveBeenCalledWith('contrast', -30);

    fireEvent.change(screen.getByTestId('adjustment-slider-saturation'), {
      target: { value: '75' },
    });
    expect(onChange).toHaveBeenCalledWith('saturation', 75);

    fireEvent.change(screen.getByTestId('adjustment-slider-hue'), {
      target: { value: '120' },
    });
    expect(onChange).toHaveBeenCalledWith('hue', 120);
  });

  // ============================================================================
  // Value input editing
  // ============================================================================

  it('calls onChange when text input value is changed', () => {
    const { onChange } = renderAdjustments();

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.change(input, { target: { value: '65' } });

    expect(onChange).toHaveBeenCalledWith('brightness', 65);
  });

  it('clamps text input value to min/max range', () => {
    const { onChange } = renderAdjustments();

    // brightness min is -100, max is 100
    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.change(input, { target: { value: '200' } });

    expect(onChange).toHaveBeenCalledWith('brightness', 100);
  });

  it('clamps hue text input to -180/180 range', () => {
    const { onChange } = renderAdjustments();

    const input = screen.getByTestId('adjustment-value-hue');
    fireEvent.change(input, { target: { value: '250' } });

    expect(onChange).toHaveBeenCalledWith('hue', 180);
  });

  it('ignores non-numeric text input', () => {
    const { onChange } = renderAdjustments();

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.change(input, { target: { value: 'abc' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('strips suffix characters from text input before parsing', () => {
    const { onChange } = renderAdjustments();

    // The hue input has degree suffix; changing it with suffix should still work
    const input = screen.getByTestId('adjustment-value-hue');
    fireEvent.change(input, { target: { value: '45\u00B0' } });

    // The handler strips non-numeric chars (except - and .), so "45" should parse
    expect(onChange).toHaveBeenCalledWith('hue', 45);
  });

  // ============================================================================
  // Arrow key handling in value inputs
  // ============================================================================

  it('increments value on ArrowUp key', () => {
    const { onChange } = renderAdjustments({ brightness: 10 });

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.keyDown(input, { key: 'ArrowUp' });

    expect(onChange).toHaveBeenCalledWith('brightness', 11);
  });

  it('decrements value on ArrowDown key', () => {
    const { onChange } = renderAdjustments({ brightness: 10 });

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(onChange).toHaveBeenCalledWith('brightness', 9);
  });

  it('uses step of 10 when Shift is held with arrow keys', () => {
    const { onChange } = renderAdjustments({ brightness: 10 });

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });

    expect(onChange).toHaveBeenCalledWith('brightness', 20);
  });

  it('clamps arrow key values to min/max', () => {
    const { onChange } = renderAdjustments({ brightness: 95 });

    const input = screen.getByTestId('adjustment-value-brightness');
    fireEvent.keyDown(input, { key: 'ArrowUp', shiftKey: true });

    // 95 + 10 = 105, clamped to 100
    expect(onChange).toHaveBeenCalledWith('brightness', 100);
  });

  // ============================================================================
  // onReset callback
  // ============================================================================

  it('calls onReset when individual reset button is clicked', () => {
    const { onReset } = renderAdjustments({ brightness: 50 });

    const resetButton = screen.getByTestId('adjustment-reset-brightness');
    fireEvent.click(resetButton);

    expect(onReset).toHaveBeenCalledWith('brightness');
  });

  it('disables individual reset button when value is at default', () => {
    renderAdjustments({ brightness: 0, contrast: 50 });

    const brightnessReset = screen.getByTestId('adjustment-reset-brightness');
    const contrastReset = screen.getByTestId('adjustment-reset-contrast');

    expect(brightnessReset).toBeDisabled();
    expect(contrastReset).not.toBeDisabled();
  });

  // ============================================================================
  // Reset All button
  // ============================================================================

  it('does NOT show Reset All button when all values are default', () => {
    renderAdjustments();
    expect(screen.queryByTestId('image-adjustments-reset-all')).not.toBeInTheDocument();
  });

  it('shows Reset All button when any value is modified', () => {
    renderAdjustments({ brightness: 10 });
    expect(screen.getByTestId('image-adjustments-reset-all')).toBeInTheDocument();
  });

  it('calls onResetAll when Reset All button is clicked', () => {
    const { onResetAll } = renderAdjustments({ brightness: 10 });

    const resetAllButton = screen.getByTestId('image-adjustments-reset-all');
    fireEvent.click(resetAllButton);

    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  // ============================================================================
  // Modified state styling
  // ============================================================================

  it('applies modified class when value differs from default', () => {
    renderAdjustments({ brightness: 50, contrast: 0 });

    const brightnessRow = screen.getByTestId('adjustment-brightness');
    const contrastRow = screen.getByTestId('adjustment-contrast');

    expect(brightnessRow.className).toContain('modified');
    expect(contrastRow.className).not.toContain('modified');
  });

  it('does not apply modified class when value is at default', () => {
    renderAdjustments();

    for (const key of ADJUSTMENT_KEYS) {
      const row = screen.getByTestId(`adjustment-${key}`);
      expect(row.className).not.toContain('modified');
    }
  });

  // ============================================================================
  // Slider range attributes
  // ============================================================================

  it('sets correct min/max for brightness slider', () => {
    renderAdjustments();
    const slider = screen.getByTestId('adjustment-slider-brightness') as HTMLInputElement;
    expect(slider.min).toBe('-100');
    expect(slider.max).toBe('100');
  });

  it('sets correct min/max for hue slider', () => {
    renderAdjustments();
    const slider = screen.getByTestId('adjustment-slider-hue') as HTMLInputElement;
    expect(slider.min).toBe('-180');
    expect(slider.max).toBe('180');
  });

  it('has aria-label on each slider', () => {
    renderAdjustments();
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Exposure' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Contrast' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Saturation' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Hue' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Temperature' })).toBeInTheDocument();
  });

  it('renders the section title "Adjustments"', () => {
    renderAdjustments();
    expect(screen.getByText('Adjustments')).toBeInTheDocument();
  });

  it('renders a divider between light and color adjustment groups', () => {
    const { container } = renderAdjustments();
    // Light adjustments: brightness, exposure, contrast
    // Then a divider
    // Then color adjustments: saturation, hue, temperature
    // The divider is a div with class 'divider'
    const dividers = container.querySelectorAll('[class*="divider"]');
    expect(dividers.length).toBeGreaterThanOrEqual(1);
  });
});
