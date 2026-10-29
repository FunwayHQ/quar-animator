import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { createTimeline, withScopeSounds } from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';
import { useSoundPlayback } from './useSoundPlayback';
import { getPlayEnd } from './usePlayback';
import type { SoundPlayer } from '../services/soundPlayer';

vi.mock('../services/soundFiles', () => ({
  decodedSound: vi.fn(() => new Promise(() => {})),
  keepDecodedSounds: vi.fn(),
}));

const voice: Sound = { id: 'voice', name: 'Voice', src: 'data:audio/wav;base64,AAAA', duration: 2 };
const clip = (id: string, start: number): SoundClip => ({
  id,
  soundId: 'voice',
  start,
  offset: 0,
  duration: 2,
  gain: 1,
});

function fakePlayer() {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    scrub: vi.fn(),
    prepare: vi.fn(),
    inStep: vi.fn(() => true),
    warm: vi.fn(),
    dispose: vi.fn(),
  };
}

const set = (state: Partial<ReturnType<typeof useEditorStore.getState>>) =>
  act(() => useEditorStore.setState(state));

describe('useSoundPlayback', () => {
  let player: ReturnType<typeof fakePlayer>;
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.setState({
      sounds: [voice],
      timeline: createTimeline({ duration: 300, sounds: [clip('a', 30)] }),
      timelineDuration: 300,
    });
    player = fakePlayer();
    renderHook(() => useSoundPlayback(() => player as unknown as SoundPlayer));
  });
  afterEach(() => useEditorStore.setState({ isPlaying: false }));

  it('plays the clips of the timeline in view from the playhead when playing starts', () => {
    set({ currentFrame: 12, isPlaying: true });
    expect(player.play).toHaveBeenCalledWith(12, {
      clips: [clip('a', 30)],
      sounds: [voice],
      frameRate: 30,
      lastFrame: 299,
    });
  });

  it('plays an artboard’s clips with its timeline in view, up to the work area’s end', () => {
    const timeline = withScopeSounds(useEditorStore.getState().timeline, 'slide', [clip('s', 0)]);
    set({ timeline, timelineScope: 'slide', workAreaEnabled: true, workAreaEnd: 90 });
    set({ isPlaying: true });
    expect(player.play.mock.calls[0]?.[1]).toMatchObject({ clips: [clip('s', 0)], lastFrame: 90 });
  });

  it('lets frames in step play on, and starts again from a loop or a jump', () => {
    set({ isPlaying: true });
    set({ currentFrame: 1 });
    set({ currentFrame: 2 });
    expect(player.play).toHaveBeenCalledTimes(1);
    // Looped back to the start
    set({ currentFrame: 0 });
    expect(player.play).toHaveBeenLastCalledWith(0, expect.anything());
    // Out of step with the sound (the ruler clicked ahead, a stalled tab)
    player.inStep.mockReturnValue(false);
    set({ currentFrame: 200 });
    expect(player.play).toHaveBeenLastCalledWith(200, expect.anything());
    expect(player.play).toHaveBeenCalledTimes(3);
  });

  it('starts again when the clips change while playing, not for other edits', () => {
    set({ isPlaying: true });
    set({ timeline: { ...useEditorStore.getState().timeline, tracks: [] } });
    expect(player.play).toHaveBeenCalledTimes(1);
    set({ timeline: { ...useEditorStore.getState().timeline, sounds: [clip('a', 60)] } });
    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('stops when playing stops, and stays quiet while exporting', () => {
    set({ isPlaying: true });
    set({ isPlaying: false });
    expect(player.stop).toHaveBeenCalledOnce();
    set({ isExporting: true, isPlaying: true });
    expect(player.play).toHaveBeenCalledOnce();
    set({ isExporting: false });
    expect(player.play).toHaveBeenCalledTimes(2);
  });
});

describe('useSoundPlayback scrubbing', () => {
  let player: ReturnType<typeof fakePlayer>;
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.setState({
      sounds: [voice],
      timeline: createTimeline({ duration: 300, sounds: [clip('a', 30)] }),
      timelineDuration: 300,
      scrubSounds: true,
    });
    player = fakePlayer();
    renderHook(() => useSoundPlayback(() => player as unknown as SoundPlayer));
  });

  it('gets the library ready, and again as it changes', () => {
    expect(player.prepare).toHaveBeenCalledWith([voice], undefined, [clip('a', 30)]);
    set({ sounds: [] });
    expect(player.prepare).toHaveBeenLastCalledWith([], undefined, [clip('a', 30)]);
  });

  it('makes the renditions the clips in view play at, as their speeds change', () => {
    const fast = { ...clip('a', 30), speed: 2 };
    set({ timeline: { ...useEditorStore.getState().timeline, sounds: [fast] } });
    expect(player.prepare).toHaveBeenLastCalledWith([voice], undefined, [fast]);
    const timeline = withScopeSounds(useEditorStore.getState().timeline, 'slide', [clip('s', 0)]);
    set({ timeline, timelineScope: 'slide' });
    expect(player.prepare).toHaveBeenLastCalledWith([voice], undefined, [clip('s', 0)]);
  });

  it('plays the frame the playhead is dragged or stepped to, stopped', () => {
    set({ currentFrame: 40 });
    set({ currentFrame: 41 });
    expect(player.scrub.mock.calls.map(([frame]) => frame)).toEqual([40, 41]);
    expect(player.scrub).toHaveBeenLastCalledWith(
      41,
      expect.objectContaining({ clips: [clip('a', 30)] })
    );
  });

  it('is quiet while playing, exporting, turned off, or when another timeline comes into view', () => {
    set({ isPlaying: true });
    set({ currentFrame: 5 });
    set({ isPlaying: false });
    set({ isExporting: true, currentFrame: 6 });
    set({ isExporting: false });
    act(() => useEditorStore.getState().setScrubSounds(false));
    set({ currentFrame: 7 });
    act(() => useEditorStore.getState().setScrubSounds(true));
    // A project opened, a page switched to: its frame isn't scrubbed to
    set({ timeline: createTimeline({ duration: 300, sounds: [clip('b', 0)] }), currentFrame: 0 });
    set({ timelineScope: 'slide', currentFrame: 1 });
    expect(player.scrub).not.toHaveBeenCalled();
  });
});

describe('the scrubbing preference', () => {
  it('is remembered in this browser', () => {
    useEditorStore.getState().setScrubSounds(false);
    expect(window.localStorage.getItem('quar-animator-scrub-sounds')).toBe('off');
    useEditorStore.getState().setScrubSounds(true);
    expect(window.localStorage.getItem('quar-animator-scrub-sounds')).toBe('on');
    expect(useEditorStore.getState().scrubSounds).toBe(true);
  });
});

describe('useSoundPlayback warming the audio', () => {
  it('gets the audio going on a click or key press once there are sounds', () => {
    useEditorStore.getState().resetProject();
    const player = fakePlayer();
    renderHook(() => useSoundPlayback(() => player as unknown as SoundPlayer));
    window.dispatchEvent(new Event('pointerdown'));
    expect(player.warm).not.toHaveBeenCalled();
    act(() => useEditorStore.setState({ sounds: [voice] }));
    window.dispatchEvent(new Event('keydown'));
    expect(player.warm).toHaveBeenCalledOnce();
  });
});

describe('getPlayEnd', () => {
  it('plays to the end of the last sound when it’s after the last keyframe', () => {
    const track = {
      id: 't',
      nodeId: 'n',
      property: 'opacity',
      keyframes: [{ id: 'k', time: 40, value: 1, easing: 'linear' as const }],
    };
    expect(getPlayEnd(createTimeline({ tracks: [track] }))).toBe(40);
    // 2 s from frame 30 at 30 fps: frames 30–89
    expect(getPlayEnd(createTimeline({ tracks: [track], sounds: [clip('a', 30)] }))).toBe(89);
    expect(getPlayEnd(createTimeline({ sounds: [clip('a', 0)] }))).toBe(59);
    expect(getPlayEnd(createTimeline())).toBeNull();
  });
});
