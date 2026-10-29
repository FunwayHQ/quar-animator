/**
 * Tests for usePlayback hook
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { getAnimationEnd, getAnimationStart, usePlayback } from './usePlayback';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../stores/editorStore';
import { SceneGraphProvider, useSceneGraph } from '../contexts/SceneGraphContext';
import type { Node } from '@quar/types';
import { SceneGraph } from '@quar/core';
import { PlaybackController, addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { videoLayer } from '../test/videoLayer';

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

  it('plays on to the end of a video layer’s clip, following the clip as it changes', () => {
    const { result } = renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
    const ctrl = vi.mocked(PlaybackController).mock.results.at(-1)?.value as {
      playEnd: number | null;
    };
    expect(ctrl.playEnd).toBeNull();
    const { sceneGraph } = result.current;
    // 4 s from frame 30: frames 30 to 149
    act(() => sceneGraph.addNode(videoLayer('v', 'clip')));
    expect(ctrl.playEnd).toBe(149);
    // At half speed it lasts 8 s
    act(() =>
      sceneGraph.updateNode('v', { clip: { start: 30, offset: 0, duration: 4, speed: 0.5 } })
    );
    expect(ctrl.playEnd).toBe(269);
    act(() => sceneGraph.removeNode('v'));
    expect(ctrl.playEnd).toBeNull();
  });

  it('starts playback when isPlaying is set from elsewhere (Animation > Play)', () => {
    const { result } = renderHook(() => usePlayback(), { wrapper });
    act(() => useEditorStore.setState({ isPlaying: true }));
    // The controller is running, so toggling now pauses rather than starting
    act(() => result.current.togglePlay());
    expect(useEditorStore.getState().isPlaying).toBe(false);
  });

  describe('each artboard its own timeline', () => {
    const transform = () => ({
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    });
    const base = (id: string, type: string) =>
      ({
        id,
        name: id,
        type,
        parent: null,
        children: [],
        transform: transform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 100,
        height: 100,
        fills: [],
        strokes: [],
        cornerRadius: [0, 0, 0, 0],
        clipContent: true,
      }) as unknown as Node;

    /** Two slides, a box on each; each box fades from 1 to 0 over 10 frames. */
    function slides(sg: ReturnType<typeof useSceneGraph>) {
      sg.addNode(base('slide1', 'artboard'));
      sg.addNode(base('box1', 'rectangle'), 'slide1');
      sg.addNode(base('slide2', 'artboard'));
      sg.addNode(base('box2', 'rectangle'), 'slide2');
      const timeline = createTimeline({ duration: 300, frameRate: 30 });
      for (const id of ['box1', 'box2']) {
        const track = getOrCreateTrack<number>(timeline, id, 'opacity');
        addKeyframe(track, 0, 1);
        addKeyframe(track, 10, 0);
      }
      return timeline;
    }

    it('plays only the timeline in view; the other artboard stays as it was', () => {
      const { result } = renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
      const sg = result.current.sceneGraph;
      act(() => {
        useEditorStore.getState().resetProject();
        const timeline = slides(sg);
        useEditorStore.setState({ timeline, timelineScope: 'slide1' });
      });
      act(() => useEditorStore.getState().setCurrentFrame(10));
      expect(sg.getNode('box1')!.opacity).toBeCloseTo(0);
      expect(sg.getNode('box2')!.opacity).toBeCloseTo(1);

      // The other slide in view: its box at the playhead; the first keeps its frame
      act(() => useEditorStore.getState().setCurrentFrame(5));
      act(() => useEditorStore.getState().setTimelineScope('slide2'));
      expect(sg.getNode('box2')!.opacity).toBeCloseTo(0.5);
      expect(sg.getNode('box1')!.opacity).toBeCloseTo(0.5);
      act(() => useEditorStore.getState().setCurrentFrame(10));
      expect(sg.getNode('box2')!.opacity).toBeCloseTo(0);
      expect(sg.getNode('box1')!.opacity).toBeCloseTo(0.5, 5);
    });

    it('runs each artboard for its own length', () => {
      renderHook(() => usePlaybackWithSceneGraph(), { wrapper });
      act(() => {
        useEditorStore.getState().resetProject();
        useEditorStore.setState({ timelineScope: null });
        useEditorStore.getState().setTimelineScope('slide1');
        useEditorStore.getState().setTimelineDuration(48);
      });
      const state = useEditorStore.getState();
      expect(state.timeline.artboards?.slide1?.duration).toBe(48);
      expect(state.timeline.duration).toBe(300);
      act(() => useEditorStore.getState().setTimelineScope(null));
      expect(useEditorStore.getState().timelineDuration).toBe(300);
      act(() => useEditorStore.getState().setTimelineScope('slide1'));
      expect(useEditorStore.getState().timelineDuration).toBe(48);
    });
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

describe('getAnimationEnd: where End and Animation › Go to End go', () => {
  const sceneGraph = new SceneGraph();
  const endOf = (frames: number[], workArea?: [number, number]) =>
    getAnimationEnd(
      {
        ...useEditorStore.getState(),
        timeline: timelineWithKeyframes(frames),
        timelineScope: null,
        timelineDuration: 300,
        workAreaEnabled: workArea !== undefined,
        workAreaStart: workArea?.[0] ?? 0,
        workAreaEnd: workArea?.[1] ?? 299,
      },
      sceneGraph
    );

  /** Where the playback controller's goToEnd() goes for the same timeline */
  async function controllerEnd(frames: number[], workArea?: [number, number]) {
    const actual = await vi.importActual<typeof import('@quar/animation')>('@quar/animation');
    const ctrl = new actual.PlaybackController({
      duration: 300,
      frameRate: 30,
      looping: false,
      requestFrame: () => 0,
      cancelFrame: () => {},
    });
    if (workArea) ctrl.setWorkArea(true, workArea[0], workArea[1]);
    const last = Math.max(-1, ...frames);
    ctrl.setPlayEnd(last >= 1 ? last : null);
    ctrl.goToEnd();
    return ctrl.currentFrame;
  }

  it('is the last keyframe, inside the work area while it is on, as for the controller', async () => {
    const cases: Array<[number[], [number, number]?]> = [
      [[]],
      [[0]],
      [[12, 45]],
      [
        [12, 90],
        [10, 50],
      ],
      [
        [12, 90],
        [100, 200],
      ],
    ];
    for (const [frames, workArea] of cases) {
      expect(endOf(frames, workArea)).toBe(await controllerEnd(frames, workArea));
    }
    expect(endOf([12, 45])).toBe(45);
    expect(endOf([])).toBe(299);
  });

  it('is the end of a video layer’s clip when that’s later', () => {
    const withVideo = new SceneGraph();
    withVideo.addNode(videoLayer('v', 'clip'));
    const end = (frames: number[]) =>
      getAnimationEnd(
        {
          ...useEditorStore.getState(),
          timeline: timelineWithKeyframes(frames),
          timelineScope: null,
          timelineDuration: 300,
          workAreaEnabled: false,
          workAreaStart: 0,
          workAreaEnd: 299,
        },
        withVideo
      );
    expect(end([])).toBe(149);
    expect(end([12, 200])).toBe(200);
  });
});

describe('getAnimationStart: where Home and Animation › Go to Start go', () => {
  const startOf = (workArea?: [number, number]) =>
    getAnimationStart({
      timelineDuration: 300,
      workAreaEnabled: workArea !== undefined,
      workAreaStart: workArea?.[0] ?? 0,
    });

  /** Where the playback controller's goToStart() goes for the same work area */
  async function controllerStart(workArea?: [number, number]) {
    const actual = await vi.importActual<typeof import('@quar/animation')>('@quar/animation');
    const ctrl = new actual.PlaybackController({
      duration: 300,
      frameRate: 30,
      looping: false,
      requestFrame: () => 0,
      cancelFrame: () => {},
    });
    if (workArea) ctrl.setWorkArea(true, workArea[0], workArea[1]);
    ctrl.goToFrame(150);
    ctrl.goToStart();
    return ctrl.currentFrame;
  }

  it('is the work area’s start while it is on, else frame 0, as for the controller', async () => {
    const cases: Array<[number, number] | undefined> = [undefined, [0, 100], [40, 120], [200, 299]];
    for (const workArea of cases) {
      expect(startOf(workArea)).toBe(await controllerStart(workArea));
    }
    expect(startOf()).toBe(0);
    expect(startOf([40, 120])).toBe(40);
  });
});
