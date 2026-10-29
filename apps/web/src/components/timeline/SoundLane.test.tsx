/**
 * The timeline's sound lane: clips drawn where they play, moved, trimmed,
 * muted, made quieter and taken off; sound files dropped where they land.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { createTimeline, scopeSounds } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { Sound, VideoNode } from '@quar/types';
import { Timeline } from '../layout/Timeline';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { linkedSound, testVideo, videoLayer } from '../../test/videoLayer';

const mocks = vi.hoisted(() => ({
  importSoundFiles: vi.fn(async () => {}),
  chooseSoundFiles: vi.fn(),
}));
vi.mock('../../services/soundImport', () => mocks);
const importVideoFiles = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../services/videoImport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/videoImport')>()),
  importVideoFiles,
}));

// Decoding takes as long as a test needs: it's done only where a test does it
const decodedSound = vi.hoisted(() => vi.fn(() => new Promise<AudioBuffer>(() => {})));
vi.mock('../../services/soundFiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/soundFiles')>();
  return { ...actual, decodedSound };
});

/** A second of a loud then quiet sound, at 100 samples a second */
function decodedVoice() {
  const samples = new Float32Array(100).map((_, i) => (i < 50 ? 0.9 : 0.1));
  return {
    duration: 1,
    length: 100,
    numberOfChannels: 1,
    getChannelData: () => samples,
  } as unknown as AudioBuffer;
}

const store = () => useEditorStore.getState();
const voice: Sound = { id: 'voice', name: 'Voice', src: 'data:audio/wav;base64,AAAA', duration: 4 };

let sceneGraph: SceneGraph | null = null;
function Capture() {
  sceneGraph = useSceneGraph();
  return null;
}

function renderTimeline() {
  return render(
    <SceneGraphProvider>
      <Capture />
      <Timeline />
    </SceneGraphProvider>
  );
}

let layout: { mockRestore: () => void } | null = null;

/** The lane is 300 px wide: a pixel a frame (the timeline is 300 frames). */
function laneOfWidth(width = 300) {
  layout = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    right: width,
    bottom: 32,
    width,
    height: 32,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

const clips = () => scopeSounds(store().timeline, store().timelineScope);

describe('the sound lane', () => {
  beforeEach(() => {
    store().resetProject();
    useEditorStore.setState({ timelineExpanded: true, timelineViewMode: 'dopeSheet' });
    sceneGraph = null;
    vi.clearAllMocks();
  });
  afterEach(() => {
    layout?.mockRestore();
    layout = null;
  });

  /** Puts the voice on the timeline at a frame; returns the clip's id */
  function placed(frame: number) {
    let id = '';
    act(() => {
      id = store().addSoundClip(sceneGraph!, voice, frame);
    });
    return id;
  }

  it('is there with no sounds, saying how to add one', () => {
    renderTimeline();
    expect(screen.getByTestId('sound-lane-label')).toHaveTextContent('Sound');
    expect(screen.getByTestId('sound-lane')).toHaveTextContent('Drop sound files here');
    fireEvent.click(screen.getByTestId('sound-lane-import'));
    expect(mocks.chooseSoundFiles).toHaveBeenCalledOnce();
  });

  it('turns hearing sounds while scrubbing off and on', () => {
    act(() => store().setScrubSounds(true));
    renderTimeline();
    const toggle = screen.getByTestId('sound-lane-scrub');
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(store().scrubSounds).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(store().scrubSounds).toBe(true);
  });

  it('draws a clip where it plays, with its name and waveform', async () => {
    decodedSound.mockResolvedValue(decodedVoice());
    renderTimeline();
    const id = placed(30);
    const clip = screen.getByTestId(`sound-clip-${id}`);
    // 4 s from frame 30: frames 30 to 149 of 300
    expect(clip.style.left).toBe('10%');
    expect(clip.style.width).toBe('40%');
    expect(clip).toHaveAccessibleName('Sound Voice, frames 30 to 149');
    await waitFor(() => expect(clip.querySelector('path')?.getAttribute('d')).toMatch(/^M0 0.5L/));
    // Turned down, the waveform is drawn as quietly as it plays: 0.9 at half volume
    expect(clip.querySelector('path')?.getAttribute('d')).toContain(' 0.050L');
    act(() => store().updateSoundClip(sceneGraph!, id, (c) => ({ ...c, gain: 0.5 })));
    expect(clip.querySelector('path')?.getAttribute('d')).toContain(' 0.275L');
    decodedSound.mockImplementation(() => new Promise<AudioBuffer>(() => {}));
  });

  it('moves a clip as it’s dragged, a frame at a time, in one undo step', () => {
    renderTimeline();
    const id = placed(30);
    laneOfWidth();
    const steps = store().undoStack.length;
    const clip = screen.getByTestId(`sound-clip-${id}`);
    fireEvent.pointerDown(clip, { button: 0, clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(clip, { clientX: 55.4, pointerId: 1 });
    fireEvent.pointerMove(clip, { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(clip, { pointerId: 1 });
    expect(clips()[0]).toMatchObject({ start: 60, offset: 0, duration: 4 });
    expect(store().undoStack.length).toBe(steps + 1);
    expect(store().selectedSoundClipId).toBe(id);
  });

  it('trims a clip by its ends', () => {
    renderTimeline();
    const id = placed(30);
    laneOfWidth();
    const clip = screen.getByTestId(`sound-clip-${id}`);
    const [start, end] = clip.querySelectorAll('[data-edge]');
    // The start a second later: the sound's first second is skipped
    fireEvent.pointerDown(start!, { button: 0, clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(start!, { clientX: 60, pointerId: 1 });
    fireEvent.pointerUp(start!, { pointerId: 1 });
    expect(clips()[0]).toMatchObject({ start: 60, offset: 1, duration: 3 });
    // The end a second sooner
    fireEvent.pointerDown(end!, { button: 0, clientX: 150, pointerId: 2 });
    fireEvent.pointerMove(end!, { clientX: 120, pointerId: 2 });
    fireEvent.pointerUp(end!, { pointerId: 2 });
    expect(clips()[0]).toMatchObject({ start: 60, offset: 1, duration: 2 });
  });

  it('fades a clip in and out by its top corners, a frame at a time, a step a drag', () => {
    renderTimeline();
    const id = placed(30);
    laneOfWidth();
    const fadeIn = screen.getByTestId(`sound-clip-fade-in-${id}`);
    const fadeOut = screen.getByTestId(`sound-clip-fade-out-${id}`);
    const steps = store().undoStack.length;
    // 15 frames in: half a second
    fireEvent.pointerDown(fadeIn, { button: 0, clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(fadeIn, { clientX: 40.4, pointerId: 1 });
    fireEvent.pointerMove(fadeIn, { clientX: 45, pointerId: 1 });
    fireEvent.pointerUp(fadeIn, { pointerId: 1 });
    expect(clips()[0]).toMatchObject({ start: 30, offset: 0, duration: 4, fadeIn: 0.5 });
    expect(store().undoStack.length).toBe(steps + 1);
    // From the end, 30 frames back: a second; no further than the fade in leaves
    fireEvent.pointerDown(fadeOut, { button: 0, clientX: 150, pointerId: 2 });
    fireEvent.pointerMove(fadeOut, { clientX: 120, pointerId: 2 });
    fireEvent.pointerUp(fadeOut, { pointerId: 2 });
    expect(clips()[0]).toMatchObject({ fadeIn: 0.5, fadeOut: 1 });
    fireEvent.pointerDown(fadeOut, { button: 0, clientX: 120, pointerId: 3 });
    fireEvent.pointerMove(fadeOut, { clientX: 0, pointerId: 3 });
    fireEvent.pointerUp(fadeOut, { pointerId: 3 });
    expect(clips()[0]?.fadeOut).toBe(3.5);

    const clip = screen.getByTestId(`sound-clip-${id}`);
    expect(clip).toHaveAccessibleName(
      'Sound Voice, frames 30 to 149, fades in over 0.5 s, fades out over 3.5 s'
    );
    expect(screen.getByTestId(`sound-clip-fades-${id}`)).toBeInTheDocument();
    // Its handles where the fades end: an eighth in, and an eighth from the start
    expect(fadeIn.style.left).toBe('12.5%');
    expect(fadeOut.style.left).toBe('12.5%');
  });

  it('takes keys of its own: Delete takes it off (not the selected layers), M mutes, arrows nudge', () => {
    renderTimeline();
    const id = placed(30);
    act(() => useEditorStore.setState({ selectedNodeIds: new Set(['some-layer']) }));
    const clip = screen.getByTestId(`sound-clip-${id}`);
    const outside = vi.fn();
    window.addEventListener('keydown', outside);

    fireEvent.keyDown(clip, { key: 'ArrowRight', shiftKey: true });
    expect(clips()[0]?.start).toBe(40);
    fireEvent.keyDown(clip, { key: 'm' });
    expect(clips()[0]?.muted).toBe(true);
    expect(screen.getByTestId(`sound-clip-${id}`)).toHaveAccessibleName(/muted/);
    fireEvent.keyDown(clip, { key: 'Delete' });
    expect(clips()).toEqual([]);

    expect(outside).not.toHaveBeenCalled();
    expect(store().selectedNodeIds).toEqual(new Set(['some-layer']));
    window.removeEventListener('keydown', outside);
  });

  it('keeps Delete for the clip, not the timeline’s selected keyframes', () => {
    renderTimeline();
    const id = placed(30);
    act(() => {
      store().addKeyframeAtFrame('some-layer', 'opacity', 10, 1);
      const [keyframe] = store().timeline.tracks[0]?.keyframes ?? [];
      if (keyframe) store().selectKeyframe(keyframe.id);
    });
    fireEvent.keyDown(screen.getByTestId(`sound-clip-${id}`), { key: 'Delete' });
    expect(clips()).toEqual([]);
    expect(store().timeline.tracks[0]?.keyframes).toHaveLength(1);
  });

  it('sets a clip’s volume and mute in its settings', () => {
    renderTimeline();
    const id = placed(0);
    fireEvent.contextMenu(screen.getByTestId(`sound-clip-${id}`), { clientX: 20, clientY: 20 });
    expect(screen.getByText('Mute')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Sound Settings...'));

    const settings = screen.getByTestId('sound-clip-settings');
    expect(settings).toHaveTextContent('Voice');
    const steps = store().undoStack.length;
    fireEvent.change(screen.getByTestId('sound-clip-volume'), { target: { value: '50' } });
    fireEvent.change(screen.getByTestId('sound-clip-volume'), { target: { value: '40' } });
    fireEvent.pointerUp(screen.getByTestId('sound-clip-volume'));
    // One slide, one step
    expect(store().undoStack.length).toBe(steps + 1);
    expect(clips()[0]?.gain).toBe(0.4);
    expect(settings).toHaveTextContent('40%');
    fireEvent.click(screen.getByTestId('sound-clip-mute'));
    expect(clips()[0]?.muted).toBe(true);

    // Fades in seconds, each entered one step, kept within the clip
    const fadeIn = screen.getByTestId('sound-clip-fade-in');
    fireEvent.change(fadeIn, { target: { value: '1.5' } });
    expect(clips()[0]?.fadeIn).toBeUndefined();
    const before = store().undoStack.length;
    fireEvent.keyDown(fadeIn, { key: 'Enter' });
    expect(clips()[0]?.fadeIn).toBe(1.5);
    expect(store().undoStack.length).toBe(before + 1);
    const fadeOut = screen.getByTestId('sound-clip-fade-out');
    fireEvent.change(fadeOut, { target: { value: '9' } });
    fireEvent.blur(fadeOut);
    expect(clips()[0]?.fadeOut).toBe(2.5);
    expect(fadeOut).toHaveValue(2.5);
    // Nonsense goes back to what it was
    fireEvent.change(fadeIn, { target: { value: '' } });
    fireEvent.blur(fadeIn);
    expect(fadeIn).toHaveValue(1.5);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('sound-clip-settings')).not.toBeInTheDocument();
  });

  it('puts clips that play together one under another', () => {
    renderTimeline();
    placed(0);
    placed(60);
    placed(200);
    // The first two overlap (4 s each): two rows
    expect(screen.getByTestId('sound-lane').style.height).toBe('64px');
    expect(screen.getByTestId('sound-lane-label').style.height).toBe('64px');
  });

  it('puts sound files dropped on the tracks where they’re dropped', () => {
    renderTimeline();
    laneOfWidth();
    const tracks = screen.getByTestId('timeline-tracks');
    const sound = new File(['RIFF'], 'bell.wav', { type: 'audio/wav' });
    const picture = new File(['PNG'], 'cat.png', { type: 'image/png' });

    // jsdom's drag events have no pointer position: given one
    const at = (event: Event) => {
      Object.defineProperty(event, 'clientX', { value: 120 });
      return event;
    };
    fireEvent(tracks, at(createEvent.dragOver(tracks, { dataTransfer: { types: ['Files'] } })));
    expect(screen.getByTestId('sound-drop-marker')).toHaveTextContent('Frame 120');
    fireEvent(
      tracks,
      at(createEvent.drop(tracks, { dataTransfer: { types: ['Files'], files: [sound, picture] } }))
    );

    expect(mocks.importSoundFiles).toHaveBeenCalledWith(sceneGraph, [sound], 120);
    expect(screen.queryByTestId('sound-drop-marker')).not.toBeInTheDocument();
  });

  it('puts video files dropped on the tracks on the canvas, their clips from where they’re dropped', () => {
    renderTimeline();
    laneOfWidth();
    const tracks = screen.getByTestId('timeline-tracks');
    const clip = new File(['mp4'], 'clip.mp4', { type: 'video/mp4' });
    const drop = createEvent.drop(tracks, { dataTransfer: { types: ['Files'], files: [clip] } });
    Object.defineProperty(drop, 'clientX', { value: 120 });
    fireEvent(tracks, drop);

    expect(importVideoFiles).toHaveBeenCalledWith(sceneGraph, [clip], 120);
    expect(mocks.importSoundFiles).not.toHaveBeenCalled();
  });

  it('shows the artboard’s clips when its timeline is in view', () => {
    renderTimeline();
    const onPage = placed(0);
    act(() => store().setTimelineScope('slide'));
    expect(screen.queryByTestId(`sound-clip-${onPage}`)).not.toBeInTheDocument();
    const onSlide = placed(10);
    expect(screen.getByTestId(`sound-clip-${onSlide}`)).toBeInTheDocument();
  });

  it('draws a sped-up clip as long as it plays, its speed on it', () => {
    renderTimeline();
    const id = placed(30);
    act(() => store().updateSoundClip(sceneGraph!, id, (c) => ({ ...c, speed: 2 })));
    const clip = screen.getByTestId(`sound-clip-${id}`);
    // 4 s twice as fast: frames 30 to 89
    expect(clip.style.width).toBe('20%');
    expect(screen.getByTestId(`sound-clip-speed-${id}`)).toHaveTextContent('2×');
    expect(clip).toHaveAccessibleName('Sound Voice, frames 30 to 89, at 2× speed');
    act(() => store().updateSoundClip(sceneGraph!, id, (c) => ({ ...c, speed: 1 })));
    expect(screen.queryByTestId(`sound-clip-speed-${id}`)).not.toBeInTheDocument();
  });

  it('draws a looped clip a pass at a time, marking where it starts over', async () => {
    decodedSound.mockResolvedValue(decodedVoice());
    laneOfWidth();
    renderTimeline();
    const id = placed(0);
    // Its second of sound, looped for 2.5 s: passes from frames 0, 30 and 60
    act(() =>
      store().updateSoundClip(sceneGraph!, id, (c) => ({
        ...c,
        duration: 1,
        loop: true,
        loopFor: 2.5,
      }))
    );
    const clip = screen.getByTestId(`sound-clip-${id}`);
    expect(clip.style.width).toBe('25%');
    expect(clip).toHaveAccessibleName('Sound Voice, frames 0 to 74, looped');
    const marks = clip.querySelectorAll('[data-testid="sound-clip-loop-mark"]');
    expect([...marks].map((mark) => (mark as HTMLElement).style.left)).toEqual(['40%', '80%']);
    // A waveform for each pass, the last cut short
    await waitFor(() => expect(clip.querySelectorAll('svg path[transform]')).toHaveLength(3));
    decodedSound.mockImplementation(() => new Promise<AudioBuffer>(() => {}));
  });

  it('lengthens a looped clip by its right end past the sound’s end, the timeline with it', () => {
    renderTimeline();
    act(() => store().setTimelineDuration(300));
    const id = placed(0);
    act(() => store().updateSoundClip(sceneGraph!, id, (c) => ({ ...c, loop: true })));
    laneOfWidth();
    const end = screen.getByTestId(`sound-clip-${id}`).querySelector('[data-edge="end"]')!;
    const steps = store().undoStack.length;
    fireEvent.pointerDown(end, { button: 0, clientX: 120, pointerId: 1 });
    fireEvent.pointerMove(end, { clientX: 250, pointerId: 1 });
    fireEvent.pointerMove(end, { clientX: 330, pointerId: 1 });
    // Not lengthened while it's dragged: the frame under the pointer stays put
    expect(store().timelineDuration).toBe(300);
    fireEvent.pointerUp(end, { pointerId: 1 });
    expect(clips()[0]).toMatchObject({ duration: 4, loop: true, loopFor: 11 });
    expect(store().timelineDuration).toBe(330);
    expect(store().undoStack.length).toBe(steps + 1);
  });

  it('sets a clip’s speed and loop in its settings, a step each', () => {
    renderTimeline();
    const id = placed(0);
    fireEvent.doubleClick(screen.getByTestId(`sound-clip-${id}`));
    // Its volume in focus, as before it had a speed
    expect(screen.getByTestId('sound-clip-volume')).toHaveFocus();
    const steps = store().undoStack.length;
    fireEvent.click(screen.getByTestId('sound-clip-speed-2'));
    expect(clips()[0]?.speed).toBe(2);
    expect(screen.getByTestId('sound-clip-speed-2')).toHaveAttribute('aria-pressed', 'true');
    expect(store().undoStack.length).toBe(steps + 1);
    // Typed in: set as it's entered, kept to 0.25×–4×
    const field = screen.getByTestId('sound-clip-speed-field');
    fireEvent.change(field, { target: { value: '0.75' } });
    expect(clips()[0]?.speed).toBe(2);
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(clips()[0]?.speed).toBe(0.75);
    fireEvent.change(field, { target: { value: '9' } });
    fireEvent.blur(field);
    expect(clips()[0]?.speed).toBe(4);
    expect(field).toHaveValue(4);
    fireEvent.click(screen.getByTestId('sound-clip-speed-1'));
    expect(clips()[0]).not.toHaveProperty('speed');

    fireEvent.click(screen.getByTestId('sound-clip-loop'));
    expect(clips()[0]?.loop).toBe(true);
    expect(screen.getByTestId('sound-clip-settings')).toHaveTextContent('Looped');
    fireEvent.click(screen.getByTestId('sound-clip-loop'));
    expect(clips()[0]).not.toHaveProperty('loop');
    act(() => store().undo(sceneGraph!));
    expect(clips()[0]?.loop).toBe(true);
  });

  it('trims a video’s sound by its ends, its video with it', () => {
    renderTimeline();
    const layer = videoLayer('v', 'beach', { speed: 2 });
    act(() => {
      sceneGraph!.addNode(layer);
      useEditorStore.setState({
        videos: [testVideo('beach')],
        sounds: [voice],
        timeline: createTimeline({
          duration: 300,
          frameRate: 30,
          sounds: [linkedSound('s', layer, 'voice')],
        }),
      });
    });
    laneOfWidth();
    const clip = screen.getByTestId('sound-clip-s');
    const [start, end] = clip.querySelectorAll('[data-edge="start"], [data-edge="end"]');
    // 15 frames later at 2×: a second of the sound and the video skipped
    fireEvent.pointerDown(start!, { button: 0, clientX: 30, pointerId: 1 });
    fireEvent.pointerMove(start!, { clientX: 45, pointerId: 1 });
    fireEvent.pointerUp(start!, { pointerId: 1 });
    expect(clips()[0]).toMatchObject({ start: 45, offset: 1, duration: 3, speed: 2 });
    expect((sceneGraph!.getNode('v') as VideoNode).clip).toEqual({
      start: 45,
      offset: 1,
      duration: 3,
      speed: 2,
    });
    // The end no further than the video and the sound both go
    fireEvent.pointerDown(end!, { button: 0, clientX: 90, pointerId: 2 });
    fireEvent.pointerMove(end!, { clientX: 290, pointerId: 2 });
    fireEvent.pointerUp(end!, { pointerId: 2 });
    expect(clips()[0]?.duration).toBe(3);
    fireEvent.pointerDown(end!, { button: 0, clientX: 90, pointerId: 3 });
    fireEvent.pointerMove(end!, { clientX: 75, pointerId: 3 });
    fireEvent.pointerUp(end!, { pointerId: 3 });
    expect((sceneGraph!.getNode('v') as VideoNode).clip.duration).toBe(2);
  });

  it('sets a video’s speed and loop with its sound’s, in its settings', () => {
    renderTimeline();
    const layer = videoLayer('v', 'beach');
    act(() => {
      sceneGraph!.addNode(layer);
      useEditorStore.setState({
        videos: [testVideo('beach')],
        sounds: [voice],
        timeline: createTimeline({
          duration: 300,
          frameRate: 30,
          sounds: [linkedSound('s', layer, 'voice')],
        }),
      });
    });
    fireEvent.doubleClick(screen.getByTestId('sound-clip-s'));
    expect(screen.getByTestId('sound-clip-settings')).toHaveTextContent('with its video');
    fireEvent.click(screen.getByTestId('sound-clip-speed-0.5'));
    fireEvent.click(screen.getByTestId('sound-clip-loop'));
    expect((sceneGraph!.getNode('v') as VideoNode).clip).toMatchObject({ speed: 0.5, loop: true });
    act(() => {
      store().undo(sceneGraph!);
      store().undo(sceneGraph!);
    });
    expect((sceneGraph!.getNode('v') as VideoNode).clip).toEqual({
      start: 30,
      offset: 0,
      duration: 4,
    });
  });

  it('moves a video’s sound with its video until it’s unlinked', () => {
    renderTimeline();
    const layer = videoLayer('v', 'beach');
    act(() => {
      sceneGraph!.addNode(layer);
      useEditorStore.setState({
        sounds: [voice],
        timeline: createTimeline({
          duration: 300,
          frameRate: 30,
          sounds: [linkedSound('s', layer, 'voice')],
        }),
      });
    });
    laneOfWidth();
    const clip = screen.getByTestId('sound-clip-s');
    expect(clip).toHaveAccessibleName('Sound Voice, frames 30 to 149, the sound of a video');
    expect(screen.getByTestId('sound-clip-linked-s')).toBeInTheDocument();
    // Trimmed here too, its video with it
    expect(clip.querySelectorAll('[data-edge="start"], [data-edge="end"]')).toHaveLength(2);

    const steps = store().undoStack.length;
    fireEvent.pointerDown(clip, { button: 0, clientX: 40, pointerId: 1 });
    fireEvent.pointerMove(clip, { clientX: 70, pointerId: 1 });
    fireEvent.pointerUp(clip, { pointerId: 1 });
    expect(clips()[0]?.start).toBe(60);
    expect((sceneGraph!.getNode('v') as VideoNode).clip.start).toBe(60);
    expect(store().undoStack.length).toBe(steps + 1);

    fireEvent.contextMenu(clip, { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByText('Unlink from Video'));
    expect(clips()[0]).not.toHaveProperty('linkedTo');
    expect(screen.queryByTestId('sound-clip-linked-s')).not.toBeInTheDocument();
    expect(clip.querySelectorAll('[data-edge="start"], [data-edge="end"]')).toHaveLength(2);
    // On its own now
    fireEvent.keyDown(clip, { key: 'ArrowRight' });
    expect(clips()[0]?.start).toBe(61);
    expect((sceneGraph!.getNode('v') as VideoNode).clip.start).toBe(60);
    act(() => {
      store().undo(sceneGraph!);
      store().undo(sceneGraph!);
    });
    expect(clips()[0]?.linkedTo).toBe('v');
  });
});
