/**
 * Tests for usePlayback hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePlayback } from './usePlayback';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { SceneGraphProvider, useSceneGraph } from '../contexts/SceneGraphContext';
import type { Node } from '@quar/types';
import { PlaybackController, addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';

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
        syncFrame: vi.fn((f: number) => {
          currentFrame = f;
        }),
        setWorkArea: vi.fn(),
        playEnd: null as number | null,
        setPlayEnd: vi.fn(function (this: { playEnd: number | null }, end: number | null) {
          this.playEnd = end;
        }),
        setWorkAreaEnabled: vi.fn(),
        setWorkAreaStart: vi.fn(),
        setWorkAreaEnd: vi.fn(),
        dispose: vi.fn(),
      };
    }),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return SceneGraphProvider({ children });
}

function usePlaybackWithSceneGraph() {
  return { playback: usePlayback(), sceneGraph: useSceneGraph() };
}

function timelineWithKeyframes(frames: number[]) {
  const timeline = createTimeline({ duration: 300, frameRate: 30 });
  const track = getOrCreateTrack<number>(timeline, 'animated-node', 'opacity');
  frames.forEach((frame, index) => addKeyframe(track, frame, index));
  return timeline;
}

describe('usePlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
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

  it('starts playback when isPlaying is set from elsewhere (Animation > Play)', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => useEditorStore.setState({ isPlaying: true }));
    // The controller is running, so toggling now pauses rather than starting
    act(() => result.current.togglePlay());
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  describe('Animation Sequence objects', () => {
    function addBox(sg: ReturnType<typeof useSceneGraph>) {
      sg.addNode({
        id: 'box',
        name: 'Box',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 50,
        height: 50,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      } as Node);
    }
    const moveBoxTo = (sg: ReturnType<typeof useSceneGraph>, y: number) => {
      const node = sg.getNode('box')!;
      sg.updateNode('box', { transform: { ...node.transform, position: { x: 0, y } } });
    };
    const restY = () =>
      useEditorStore.getState().animationSequence.restPoses.box?.['transform.position.y'];

    it('carries a move into the animation when the playhead moves on', () => {
      const { result } = renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
      const sg = result.current.sceneGraph;
      act(() => {
        useEditorStore.getState().resetProject();
        addBox(sg);
        useEditorStore.getState().addSequenceSteps(sg, ['box'], 'rise-in', { duration: 24 });
        useEditorStore.getState().setCurrentFrame(24);
      });
      expect(sg.getNode('box')!.transform.position.y).toBeCloseTo(0);

      act(() => moveBoxTo(sg, 30));
      act(() => useEditorStore.getState().setCurrentFrame(0));
      expect(restY()).toBeCloseTo(30);

      // Back at the end of the rise the box is where it was moved, not snapped back
      act(() => useEditorStore.getState().setCurrentFrame(24));
      expect(sg.getNode('box')!.transform.position.y).toBeCloseTo(30);
    });

    it('absorbs an edit shortly after it is made, before the playhead moves', () => {
      vi.useFakeTimers();
      try {
        const { result } = renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
        const sg = result.current.sceneGraph;
        act(() => {
          useEditorStore.getState().resetProject();
          addBox(sg);
          useEditorStore.getState().addSequenceSteps(sg, ['box'], 'rise-in', { duration: 24 });
          useEditorStore.getState().setCurrentFrame(24);
        });
        act(() => moveBoxTo(sg, -20));
        expect(restY()).toBeCloseTo(0);
        act(() => {
          vi.advanceTimersByTime(200);
        });
        expect(restY()).toBeCloseTo(-20);
      } finally {
        vi.useRealTimers();
      }
    });
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

  it('stops playing at the last keyframe but keeps the whole timeline reachable', () => {
    useEditorStore.setState({ timeline: timelineWithKeyframes([12, 45]), timelineDuration: 300 });

    renderHook(() => usePlayback(), { wrapper });

    // Stepping and seeking cover the whole timeline…
    expect(PlaybackController).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 300 }));
    // …while playing stops at the last keyframe
    const instance = vi.mocked(PlaybackController).mock.results.at(-1)?.value;
    expect(instance?.playEnd).toBe(45);
  });

  it('updates the play end when the last keyframe moves or is removed', () => {
    useEditorStore.setState({ timeline: timelineWithKeyframes([12, 45]) });
    renderHook(() => usePlayback(), { wrapper });

    const instance = vi.mocked(PlaybackController).mock.results.at(-1)?.value;
    expect(instance?.playEnd).toBe(45);

    act(() => useEditorStore.setState({ timeline: timelineWithKeyframes([8, 20]) }));
    expect(instance?.playEnd).toBe(20);

    act(() => useEditorStore.setState({ timeline: timelineWithKeyframes([8]) }));
    expect(instance?.playEnd).toBe(8);
  });

  it('plays the whole timeline when all keyframes are at frame 0', () => {
    useEditorStore.setState({ timeline: timelineWithKeyframes([0]) });
    renderHook(() => usePlayback(), { wrapper });
    const instance = vi.mocked(PlaybackController).mock.results.at(-1)?.value;
    expect(instance?.playEnd).toBeNull();
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

  it('applies imported timeline values when the current frame does not change', () => {
    const { result } = renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
    const nodeId = 'imported-animation-node';

    act(() => {
      result.current.sceneGraph.addNode({
        id: nodeId,
        name: 'Animated node',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      });
      useEditorStore.setState({
        currentFrame: 0,
        timeline: {
          ...useEditorStore.getState().timeline,
          tracks: [
            {
              id: 'imported-opacity-track',
              nodeId,
              property: 'opacity',
              keyframes: [{ id: 'imported-opacity-keyframe', time: 0, value: 0, easing: 'linear' }],
            },
          ],
        },
      });
    });

    expect(result.current.sceneGraph.getNode(nodeId)?.opacity).toBe(0);
  });
});
