import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WindPanel } from '../WindPanel';

const mockState: Record<string, unknown> = {
  globalWind: {
    strength: 50,
    direction: 0,
    turbulence: 0.3,
    frequency: 1,
    enabled: false,
  },
  setGlobalWind: vi.fn(),
};

vi.mock('../../../stores/editorStore', () => ({
  useEditorStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockState),
}));

const mockSceneGraph = { getNode: vi.fn() };
vi.mock('../../../contexts/SceneGraphContext', () => ({
  useSceneGraph: () => mockSceneGraph,
}));

describe('WindPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.globalWind = {
      strength: 50,
      direction: 0,
      turbulence: 0.3,
      frequency: 1,
      enabled: false,
    };
  });

  it('renders wind settings', () => {
    render(<WindPanel />);
    expect(screen.getByTestId('wind-settings')).toBeTruthy();
    expect(screen.getByText('Global Wind')).toBeTruthy();
  });

  it('lets its sliders narrow, so the number fields fit the panel', () => {
    render(<WindPanel />);
    // A range input is as wide as its own default unless it may shrink
    const sliders = screen.getAllByRole('slider');
    expect(sliders).toHaveLength(4);
    for (const slider of sliders) expect(parseFloat(slider.style.minWidth)).toBe(0);
  });

  it('toggles wind enabled', () => {
    render(<WindPanel />);
    const checkbox = screen.getByLabelText('Enable wind');
    fireEvent.click(checkbox);
    expect(mockState.setGlobalWind).toHaveBeenCalledWith({ enabled: true }, mockSceneGraph);
  });

  it('updates wind strength via slider', () => {
    render(<WindPanel />);
    const slider = screen.getByTestId('wind-strength-slider');
    fireEvent.change(slider, { target: { value: '200' } });
    expect(mockState.setGlobalWind).toHaveBeenCalledWith({ strength: 200 }, mockSceneGraph);
  });

  it('updates wind direction via number input', () => {
    render(<WindPanel />);
    const input = screen.getByTestId('wind-direction-input');
    fireEvent.change(input, { target: { value: '45' } });
    expect(mockState.setGlobalWind).toHaveBeenCalledWith({ direction: 45 }, mockSceneGraph);
  });

  it('updates turbulence via slider', () => {
    render(<WindPanel />);
    const slider = screen.getByTestId('wind-turbulence-slider');
    fireEvent.change(slider, { target: { value: '0.7' } });
    expect(mockState.setGlobalWind).toHaveBeenCalledWith({ turbulence: 0.7 }, mockSceneGraph);
  });
});
