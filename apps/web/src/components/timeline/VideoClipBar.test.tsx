/**
 * A video layer's clip bar on its timeline row: drawn where the clip plays,
 * with the video's stills and name, under the row's keyframes; dragged or
 * nudged to move it, its linked sound with it, one undo step a drag.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { VideoClip, VideoNode } from '@quar/types';
import { Timeline } from '../layout/Timeline';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { poseScene } from '../../stores/scenePosing';
import { linkedSound, testVideo, videoLayer } from '../../test/videoLayer';

const store = () => useEditorStore.getState();

let sceneGraph: SceneGraph | null = null;
function Capture() {
  sceneGraph = useSceneGraph();
  return null;
}

/**
 * The timeline (300 frames at 30 fps) with a video layer from frame 30, 4 s
 * long (of a 4 s video unless `videoDuration` says otherwise).
 */
function renderWithVideo(
  options: {
    stills?: number;
    sound?: boolean;
    clip?: Partial<VideoClip>;
    videoDuration?: number;
  } = {}
) {
  const frames = Array.from(
    { length: options.stills ?? 0 },
    (_, i) => `data:image/webp;base64,${i}`
  );
  useEditorStore.setState({
    videos: [
      testVideo('beach', {
        name: 'Beach.mp4',
        duration: options.videoDuration ?? 4,
        strip: { rate: 4, height: 90, frames },
      }),
    ],
  });
  const result = render(
    <SceneGraphProvider>
      <Capture />
      <Timeline />
    </SceneGraphProvider>
  );
  const layer = videoLayer('v', 'beach', options.clip);
  act(() => {
    sceneGraph!.addNode(layer);
    if (options.sound) {
      useEditorStore.setState({
        timeline: createTimeline({
          duration: 300,
          frameRate: 30,
          sounds: [linkedSound('s', layer)],
        }),
      });
    }
  });
  return result;
}

const clip = () => (sceneGraph!.getNode('v') as VideoNode).clip;
const bar = () => screen.getByTestId('video-clip-v');

let layout: { mockRestore: () => void } | null = null;

/** Every row is `width` px wide: with 300 frames, a pixel a frame. */
function rowsOfWidth(width = 300) {
  layout = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 26,
    width,
    height: 26,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('the video clip bar', () => {
  beforeEach(() => {
    store().resetProject();
    useEditorStore.setState({ timelineExpanded: true, timelineViewMode: 'dopeSheet' });
    sceneGraph = null;
  });
  afterEach(() => {
    layout?.mockRestore();
    layout = null;
  });

  it('is drawn on the layer’s row where its clip plays, with the video’s name', () => {
    renderWithVideo();
    expect(screen.getByTestId('timeline-track-v')).toContainElement(bar());
    // 4 s from frame 30: frames 30 to 149 of 300
    expect(bar().style.left).toBe('10%');
    expect(bar().style.width).toBe('40%');
    expect(bar()).toHaveAccessibleName('Video Beach.mp4, frames 30 to 149');
    expect(bar()).toHaveTextContent('Beach.mp4');
    expect(bar().title).toMatch(/^Beach\.mp4: from frame 30, 4\.0 s \(120 frames\)/);
    // No stills to show: a plain bar
    expect(bar().querySelectorAll('img')).toHaveLength(0);
  });

  it('shows the video’s stills along it, each where it plays', () => {
    rowsOfWidth(120);
    renderWithVideo({ stills: 16 });
    const stills = [...bar().querySelectorAll('img')];
    // 120 px of 16:9 stills 13 px high: 23.1 px each, six of them (the last cut short)
    expect(stills).toHaveLength(6);
    expect(stills[0]?.getAttribute('src')).toBe('data:image/webp;base64,0');
    // The second starts at 23.1 px of 120: 0.77 s in, the strip's still at 0.75 s
    expect(stills[1]?.getAttribute('src')).toBe('data:image/webp;base64,3');
    expect(stills[5]?.getAttribute('src')).toBe('data:image/webp;base64,15');
  });

  it('lies under the row’s keyframes, which stay clickable', () => {
    renderWithVideo();
    act(() => store().addKeyframeAtFrame('v', 'opacity', 60, 1));
    const row = screen.getByTestId('timeline-track-v');
    const [keyframe] = store().timeline.tracks[0]?.keyframes ?? [];
    const diamond = screen.getByTestId(`keyframe-${keyframe!.id}`);
    // Drawn first, so the diamonds lie on top
    expect(row.firstElementChild).toBe(bar());
    fireEvent.click(diamond);
    expect(store().selectedKeyframeIds.has(keyframe!.id)).toBe(true);
  });

  it('moves the clip as it’s dragged, a frame at a time, its sound with it, in one step', () => {
    renderWithVideo({ sound: true });
    rowsOfWidth();
    const steps = store().undoStack.length;
    fireEvent.pointerDown(bar(), { button: 0, clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 55.4, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(bar(), { pointerId: 1 });
    expect(clip()).toEqual({ start: 60, offset: 0, duration: 4 });
    expect(scopeSounds(store().timeline, null)[0]).toMatchObject({ id: 's', start: 60 });
    expect(store().undoStack.length).toBe(steps + 1);
    // The layer is selected by it
    expect(store().selectedNodeIds).toEqual(new Set(['v']));
    expect(bar().style.left).toBe('20%');

    act(() => store().undo(sceneGraph!));
    expect(clip().start).toBe(30);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(30);
    expect(bar().style.left).toBe('10%');
  });

  it('lengthens the timeline when a drag ends with the clip past its end', () => {
    renderWithVideo();
    rowsOfWidth();
    fireEvent.pointerDown(bar(), { button: 0, clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 240, pointerId: 1 });
    // Past the end while dragging: cut off where the timeline ends (frames 230 to 300)
    expect(parseFloat(bar().style.width)).toBeCloseTo((70 / 300) * 100);
    fireEvent.pointerUp(bar(), { pointerId: 1 });
    // From frame 230, 120 frames: 350 long
    expect(store().timelineDuration).toBe(350);
    act(() => store().undo(sceneGraph!));
    expect(store().timelineDuration).toBe(300);
    expect(clip().start).toBe(30);
  });

  it('is nudged by the arrow keys, Shift ten frames at a time', () => {
    renderWithVideo({ sound: true });
    fireEvent.keyDown(bar(), { key: 'ArrowRight' });
    expect(clip().start).toBe(31);
    fireEvent.keyDown(bar(), { key: 'ArrowLeft', shiftKey: true });
    expect(clip().start).toBe(21);
    expect(scopeSounds(store().timeline, null)[0]?.start).toBe(21);
  });

  it('follows the clip moved elsewhere, not the animation played', () => {
    renderWithVideo({ sound: true });
    // The linked sound dragged on the Sound lane
    act(() => store().updateSoundClip(sceneGraph!, 's', (c) => ({ ...c, start: 90 })));
    expect(bar().style.left).toBe('30%');
    // Posing the scene for a frame changes no clip, and isn't followed
    act(() => {
      poseScene(() => sceneGraph!.updateNode('v', { clip: { ...clip(), start: 0 } }));
    });
    expect(bar().style.left).toBe('30%');
  });

  it('keeps the clip when the layer’s animation is deleted from its row’s menu', () => {
    renderWithVideo();
    act(() => {
      store().addKeyframeAtFrame('v', 'opacity', 10, 1);
      store().addKeyframeAtFrame('v', 'opacity', 50, 0);
    });
    rowsOfWidth();
    // The bar's menu is its row's
    fireEvent.contextMenu(bar(), { clientX: 40, clientY: 10 });
    fireEvent.click(screen.getByText('Delete Animation'));
    expect(store().timeline.tracks.filter((track) => track.nodeId === 'v')).toEqual([]);
    expect(clip()).toEqual({ start: 30, offset: 0, duration: 4 });
    expect(bar()).toBeInTheDocument();
  });
});

describe('editing a video clip on its bar', () => {
  beforeEach(() => {
    store().resetProject();
    useEditorStore.setState({ timelineExpanded: true, timelineViewMode: 'dopeSheet' });
    sceneGraph = null;
  });
  afterEach(() => {
    layout?.mockRestore();
    layout = null;
  });

  const sound = () => scopeSounds(store().timeline, null)[0];
  const edge = (which: 'start' | 'end') => {
    const handle = bar().querySelector<HTMLElement>(`[data-edge="${which}"]`);
    if (!handle) throw new Error(`no ${which} handle`);
    return handle;
  };
  /** Drag from `from` to each of `to`, in pixels (a frame a pixel), on `target`. */
  function drag(target: HTMLElement, from: number, ...to: number[]) {
    fireEvent.pointerDown(target, { button: 0, clientX: from, pointerId: 1 });
    for (const x of to) fireEvent.pointerMove(bar(), { clientX: x, pointerId: 1 });
    fireEvent.pointerUp(bar(), { pointerId: 1 });
  }

  it('trims its start by its left end, its sound with it, in one step', () => {
    renderWithVideo({ sound: true });
    rowsOfWidth();
    const steps = store().undoStack.length;
    drag(edge('start'), 30, 45, 60.4);
    expect(clip()).toEqual({ start: 60, offset: 1, duration: 3 });
    expect(sound()).toMatchObject({ start: 60, offset: 1, duration: 3 });
    expect(store().undoStack.length).toBe(steps + 1);
    // Its end stays put: frames 60 to 149
    expect(bar().style.left).toBe('20%');
    expect(bar().style.width).toBe('30%');
    act(() => store().undo(sceneGraph!));
    expect(clip()).toEqual({ start: 30, offset: 0, duration: 4 });
    expect(sound()).toMatchObject({ start: 30, offset: 0, duration: 4 });
  });

  it('trims its end by its right end, not past the video’s end', () => {
    renderWithVideo({ sound: true, videoDuration: 6 });
    rowsOfWidth();
    drag(edge('end'), 150, 120, 90);
    expect(clip().duration).toBe(2);
    expect(sound()?.duration).toBe(2);
    // As far as the 6 s video goes: frame 210
    drag(edge('end'), 90, 280);
    expect(clip().duration).toBe(6);
    expect(store().undoStack).toHaveLength(2);
    expect(store().timelineDuration).toBe(300);
  });

  it('lengthens a looped clip past the video’s end, the timeline with it as the drag ends', () => {
    renderWithVideo({ clip: { loop: true } });
    rowsOfWidth();
    fireEvent.pointerDown(edge('end'), { button: 0, clientX: 150, pointerId: 1 });
    fireEvent.pointerMove(bar(), { clientX: 420, pointerId: 1 });
    // Cut where the timeline ends while it's dragged
    expect(store().timelineDuration).toBe(300);
    fireEvent.pointerUp(bar(), { pointerId: 1 });
    expect(clip()).toMatchObject({ duration: 4, loop: true, loopFor: 13 });
    expect(store().timelineDuration).toBe(420);
    act(() => store().undo(sceneGraph!));
    expect(store().timelineDuration).toBe(300);
    expect(clip()).not.toHaveProperty('loopFor');
  });

  it('marks where a looped clip starts over', () => {
    // 4 s passes from frame 30 for 9 s: over again at frames 150 and 270
    rowsOfWidth();
    renderWithVideo({ clip: { loop: true, loopFor: 9 } });
    const marks = screen.getAllByTestId('video-clip-loop-mark');
    expect(marks).toHaveLength(2);
    // Frames 30 to 300 (the timeline’s end): 120 and 240 frames in of 270
    expect(parseFloat(marks[0]!.style.left)).toBeCloseTo((120 / 270) * 100);
    expect(parseFloat(marks[1]!.style.left)).toBeCloseTo((240 / 270) * 100);
    expect(bar().title).toMatch(/loops/);
  });

  it('shows each pass’s stills along a looped clip', () => {
    rowsOfWidth(120);
    renderWithVideo({ stills: 16, clip: { loop: true, loopFor: 8 } });
    const stills = [...bar().querySelectorAll('img')];
    // 120 px of 8 s: the fourth still starts at 69.2 px, 4.6 s in, 0.6 s into the second pass
    expect(stills[3]?.getAttribute('src')).toBe('data:image/webp;base64,2');
  });

  it('shows its speed when it isn’t 1×', () => {
    renderWithVideo({ clip: { speed: 2 } });
    expect(bar()).toHaveTextContent('2×');
    // 4 s at 2×: frames 30 to 89
    expect(bar().style.width).toBe('20%');
    expect(bar()).toHaveAccessibleName(/at 2×/);
  });

  it('shows its last frame held to the end of the timeline', () => {
    renderWithVideo({ clip: { holdLastFrame: true } });
    const tail = screen.getByTestId('video-clip-hold-v');
    // From frame 150 (its end) to 300
    expect(tail.style.left).toBe('50%');
    expect(tail.style.width).toBe('50%');
    expect(bar()).toHaveAccessibleName(/holds its last frame/);
  });

  it('opens its settings by a double-click, Enter or its row’s menu', () => {
    renderWithVideo();
    fireEvent.doubleClick(bar());
    expect(screen.getByTestId('video-clip-settings')).toHaveTextContent('Beach.mp4');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('video-clip-settings')).not.toBeInTheDocument();
    fireEvent.keyDown(bar(), { key: 'Enter' });
    expect(screen.getByTestId('video-clip-settings')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    rowsOfWidth();
    fireEvent.contextMenu(bar(), { clientX: 40, clientY: 10 });
    fireEvent.click(screen.getByText('Clip Settings...'));
    expect(screen.getByTestId('video-clip-settings')).toBeInTheDocument();
  });

  it('sets its speed, loop and hold in its settings, each one step', () => {
    renderWithVideo({ sound: true });
    fireEvent.doubleClick(bar());
    fireEvent.click(screen.getByTestId('video-clip-speed-2'));
    expect(clip().speed).toBe(2);
    expect(sound()?.speed).toBe(2);
    expect(store().undoStack).toHaveLength(1);
    // A slide of the speed is one step: 2^-1 is 0.5×
    const slider = screen.getByTestId('video-clip-speed');
    fireEvent.change(slider, { target: { value: '-0.5' } });
    fireEvent.change(slider, { target: { value: '-1' } });
    fireEvent.pointerUp(slider);
    expect(clip().speed).toBe(0.5);
    expect(store().undoStack).toHaveLength(2);
    expect(screen.getByTestId('video-clip-settings')).toHaveTextContent('0.5×');
    // Typed, kept to 0.25×–4×
    const field = screen.getByTestId('video-clip-speed-field');
    fireEvent.change(field, { target: { value: '9' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(clip().speed).toBe(4);
    fireEvent.click(screen.getByTestId('video-clip-speed-1'));
    expect(clip()).not.toHaveProperty('speed');

    fireEvent.click(screen.getByTestId('video-clip-loop'));
    expect(clip().loop).toBe(true);
    expect(sound()?.loop).toBe(true);
    fireEvent.click(screen.getByTestId('video-clip-hold'));
    expect(clip().holdLastFrame).toBe(true);
    expect(store().undoStack).toHaveLength(6);
    act(() => store().undo(sceneGraph!));
    expect(clip()).not.toHaveProperty('holdLastFrame');
  });

  it('unlinks its sound from its settings, when it has one', () => {
    renderWithVideo({ sound: true });
    fireEvent.doubleClick(bar());
    fireEvent.click(screen.getByTestId('video-clip-unlink'));
    expect(sound()).not.toHaveProperty('linkedTo');
    expect(screen.queryByTestId('video-clip-unlink')).not.toBeInTheDocument();
    // Moved on its own now
    fireEvent.keyDown(bar(), { key: 'ArrowRight' });
    expect(clip().start).toBe(31);
    expect(sound()?.start).toBe(30);
    act(() => store().undo(sceneGraph!));
    act(() => store().undo(sceneGraph!));
    expect(sound()?.linkedTo).toBe('v');
  });
});
