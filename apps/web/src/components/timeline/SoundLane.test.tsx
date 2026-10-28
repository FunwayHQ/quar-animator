/**
 * The timeline's sound lane: clips drawn where they play, moved, trimmed,
 * muted, made quieter and taken off; sound files dropped where they land.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createEvent, fireEvent, waitFor } from '@testing-library/react';
import { render, screen } from '../../test/utils';
import { scopeSounds } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { Sound } from '@quar/types';
import { Timeline } from '../layout/Timeline';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';

const mocks = vi.hoisted(() => ({
  importSoundFiles: vi.fn(async () => {}),
  chooseSoundFiles: vi.fn(),
}));
vi.mock('../../services/soundImport', () => mocks);

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

  it('shows the artboard’s clips when its timeline is in view', () => {
    renderTimeline();
    const onPage = placed(0);
    act(() => store().setTimelineScope('slide'));
    expect(screen.queryByTestId(`sound-clip-${onPage}`)).not.toBeInTheDocument();
    const onSlide = placed(10);
    expect(screen.getByTestId(`sound-clip-${onSlide}`)).toBeInTheDocument();
  });
});
