import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ColorPicker } from './ColorPicker';
import type { Color } from '@quar/types';

function makeColor(r = 255, g = 0, b = 0, a = 1): Color {
  return { r, g, b, a };
}

describe('ColorPicker', () => {
  let onChange: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onChange = vi.fn();
    onClose = vi.fn();
  });

  function renderPicker(color: Color = makeColor(), showAlpha = false) {
    return render(
      <ColorPicker
        color={color}
        onChange={onChange}
        anchorX={100}
        anchorY={200}
        onClose={onClose}
        showAlpha={showAlpha}
      />
    );
  }

  it('renders all core elements', () => {
    renderPicker();
    expect(screen.getByTestId('color-picker')).toBeInTheDocument();
    expect(screen.getByTestId('sv-area')).toBeInTheDocument();
    expect(screen.getByTestId('hue-slider')).toBeInTheDocument();
    expect(screen.getByTestId('hex-input')).toBeInTheDocument();
    expect(screen.getByTestId('r-input')).toBeInTheDocument();
    expect(screen.getByTestId('g-input')).toBeInTheDocument();
    expect(screen.getByTestId('b-input')).toBeInTheDocument();
  });

  it('shows initial hex value', () => {
    renderPicker(makeColor(255, 128, 0));
    const hex = screen.getByTestId('hex-input') as HTMLInputElement;
    expect(hex.value).toBe('#FF8000');
  });

  it('shows initial RGB values', () => {
    renderPicker(makeColor(100, 200, 50));
    expect((screen.getByTestId('r-input') as HTMLInputElement).value).toBe('100');
    expect((screen.getByTestId('g-input') as HTMLInputElement).value).toBe('200');
    expect((screen.getByTestId('b-input') as HTMLInputElement).value).toBe('50');
  });

  it('calls onClose when overlay is clicked', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('color-picker-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape key', () => {
    renderPicker();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('updates color via hex input', () => {
    renderPicker();
    const hex = screen.getByTestId('hex-input');
    fireEvent.change(hex, { target: { value: '#00FF00' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ r: 0, g: 255, b: 0 }));
  });

  it('updates color via R input', () => {
    renderPicker(makeColor(100, 100, 100));
    const rInput = screen.getByTestId('r-input');
    fireEvent.change(rInput, { target: { value: '200' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ r: 200 }));
  });

  it('toggles between RGB and HSL modes', () => {
    renderPicker();
    const toggle = screen.getByTestId('mode-toggle');
    expect(toggle.textContent).toBe('HSL');

    fireEvent.click(toggle);
    expect(screen.getByTestId('h-input')).toBeInTheDocument();
    expect(screen.getByTestId('s-input')).toBeInTheDocument();
    expect(screen.getByTestId('l-input')).toBeInTheDocument();
    expect(screen.queryByTestId('r-input')).not.toBeInTheDocument();

    expect(toggle.textContent).toBe('RGB');
  });

  it('shows alpha slider when showAlpha is true', () => {
    renderPicker(makeColor(), true);
    expect(screen.getByTestId('alpha-slider')).toBeInTheDocument();
    expect(screen.getByTestId('a-input')).toBeInTheDocument();
  });

  it('does not show alpha slider by default', () => {
    renderPicker();
    expect(screen.queryByTestId('alpha-slider')).not.toBeInTheDocument();
    expect(screen.queryByTestId('a-input')).not.toBeInTheDocument();
  });

  it('calls onChange on SV area pointerdown', () => {
    renderPicker(makeColor(255, 0, 0));
    const svArea = screen.getByTestId('sv-area');
    // Mock getBoundingClientRect
    vi.spyOn(svArea, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 150,
      right: 200,
      bottom: 150,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.pointerDown(svArea, { clientX: 100, clientY: 75 });
    expect(onChange).toHaveBeenCalled();
  });

  it('calls onChange on hue slider pointerdown', () => {
    renderPicker();
    const hue = screen.getByTestId('hue-slider');
    vi.spyOn(hue, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 12,
      right: 200,
      bottom: 12,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
    fireEvent.pointerDown(hue, { clientX: 100 });
    expect(onChange).toHaveBeenCalled();
  });
});
