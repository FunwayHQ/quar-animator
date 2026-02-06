import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { OnionSkinPanel } from './OnionSkinPanel';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';

describe('OnionSkinPanel', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      clipboard: null,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      autoKeyframe: false,
      selectedKeyframeIds: new Set<string>(),
      keyframeClipboard: null,
      onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
    });
  });

  it('renders all controls when opened', () => {
    render(<OnionSkinPanel />);
    expect(screen.getByTestId('onion-skin-panel')).toBeInTheDocument();
    expect(screen.getByTestId('onion-skin-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('before-count-value')).toBeInTheDocument();
    expect(screen.getByTestId('onion-skin-opacity')).toBeInTheDocument();
    expect(screen.getByText('Show during playback')).toBeInTheDocument();
  });

  it('toggle checkbox toggles onion skin enabled', () => {
    render(<OnionSkinPanel />);
    const toggle = screen.getByTestId('onion-skin-toggle');

    expect(useEditorStore.getState().onionSkin.enabled).toBe(false);

    fireEvent.click(toggle);
    expect(useEditorStore.getState().onionSkin.enabled).toBe(true);

    fireEvent.click(toggle);
    expect(useEditorStore.getState().onionSkin.enabled).toBe(false);
  });

  it('before count stepper changes value', () => {
    render(<OnionSkinPanel />);
    const inc = screen.getByTestId('before-count-inc');
    const dec = screen.getByTestId('before-count-dec');

    const initialCount = DEFAULT_ONION_SKIN_SETTINGS.beforeCount;
    expect(useEditorStore.getState().onionSkin.beforeCount).toBe(initialCount);

    fireEvent.click(inc);
    expect(useEditorStore.getState().onionSkin.beforeCount).toBe(initialCount + 1);

    fireEvent.click(dec);
    expect(useEditorStore.getState().onionSkin.beforeCount).toBe(initialCount);
  });

  it('opacity slider updates store', () => {
    render(<OnionSkinPanel />);
    const slider = screen.getByTestId('onion-skin-opacity');

    fireEvent.change(slider, { target: { value: '70' } });
    expect(useEditorStore.getState().onionSkin.opacity).toBeCloseTo(0.7);
  });
});
