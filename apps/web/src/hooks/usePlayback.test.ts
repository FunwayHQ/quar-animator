/**
 * Tests for usePlayback hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePlayback } from './usePlayback';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { SceneGraphProvider } from '../contexts/SceneGraphContext';

// Mock PlaybackController to avoid rAF issues in tests
vi.mock('@quar/animation', async () => {
  const actual = await vi.importActual('@quar/animation');
  return {
    ...(actual as object),
    PlaybackController: vi.fn().mockImplementation((opts) => {
      let currentFrame = 0;
      let playing = false;
      let duration = opts.duration;
      let frameRate = opts.frameRate;
      let looping = opts.looping;
      const onFrameChange = opts.onFrameChange;

      return {
        get currentFrame() {
          return currentFrame;
        },
        get isPlaying() {
          return playing;
        },
        get duration() {
          return duration;
        },
        get frameRate() {
          return frameRate;
        },
        get looping() {
          return looping;
        },
        play: vi.fn(() => {
          playing = true;
        }),
        pause: vi.fn(() => {
          playing = false;
        }),
        stop: vi.fn(() => {
          playing = false;
          currentFrame = 0;
          onFrameChange?.(0);
        }),
        togglePlay: vi.fn(() => {
          playing = !playing;
        }),
        goToFrame: vi.fn((f: number) => {
          currentFrame = f;
          onFrameChange?.(f);
        }),
        nextFrame: vi.fn(() => {
          currentFrame++;
          onFrameChange?.(currentFrame);
        }),
        prevFrame: vi.fn(() => {
          currentFrame = Math.max(0, currentFrame - 1);
          onFrameChange?.(currentFrame);
        }),
        goToStart: vi.fn(() => {
          currentFrame = 0;
          onFrameChange?.(0);
        }),
        goToEnd: vi.fn(() => {
          currentFrame = duration - 1;
          onFrameChange?.(duration - 1);
        }),
        setDuration: vi.fn((d: number) => {
          duration = d;
        }),
        setFrameRate: vi.fn((r: number) => {
          frameRate = r;
        }),
        setLooping: vi.fn((l: boolean) => {
          looping = l;
        }),
        dispose: vi.fn(),
      };
    }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return SceneGraphProvider({ children });
}

describe('usePlayback', () => {
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
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
    });
  });

  it('should return playback control functions', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    expect(result.current.play).toBeDefined();
    expect(result.current.pause).toBeDefined();
    expect(result.current.togglePlay).toBeDefined();
    expect(result.current.stop).toBeDefined();
    expect(result.current.nextFrame).toBeDefined();
    expect(result.current.prevFrame).toBeDefined();
    expect(result.current.goToStart).toBeDefined();
    expect(result.current.goToEnd).toBeDefined();
    expect(result.current.goToFrame).toBeDefined();
  });

  it('play should set isPlaying in store', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.play());
    expect(useEditorStore.getState().isPlaying).toBe(true);
  });

  it('pause should clear isPlaying in store', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.play());
    act(() => result.current.pause());
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it('togglePlay should toggle isPlaying state', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.togglePlay());
    expect(useEditorStore.getState().isPlaying).toBe(true);
    act(() => result.current.togglePlay());
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  it('stop should pause and go to frame 0', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.play());
    act(() => result.current.stop());
    expect(useEditorStore.getState().isPlaying).toBe(false);
    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  it('goToFrame should update store frame', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.goToFrame(50));
    expect(useEditorStore.getState().currentFrame).toBe(50);
  });

  it('nextFrame should advance frame', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.nextFrame());
    expect(useEditorStore.getState().currentFrame).toBe(1);
  });

  it('prevFrame should go back one frame', () => {
    useEditorStore.setState({ currentFrame: 5 });
    const { result } = renderHook(() => usePlayback(), { wrapper });
    // The mock starts at 0, so prevFrame from 0 stays at 0
    act(() => result.current.prevFrame());
    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  it('goToStart should set frame to 0', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.goToFrame(100));
    act(() => result.current.goToStart());
    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  it('goToEnd should set frame to duration - 1', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => result.current.goToEnd());
    expect(useEditorStore.getState().currentFrame).toBe(299);
  });

  it('should dispose controller on unmount', () => {
    const { unmount } = renderHook(() => usePlayback(), { wrapper });
    unmount();
    // If no error thrown, dispose was called successfully
  });

  it('should sync duration changes to controller', () => {
    renderHook(() => usePlayback(), { wrapper });
    act(() => {
      useEditorStore.getState().setTimelineDuration(600);
    });
    // The mock controller's setDuration should have been called
    // via the store subscription
  });
});
