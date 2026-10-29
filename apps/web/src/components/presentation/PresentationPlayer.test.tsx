import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import {
  createTimeline,
  withScopeDuration,
  withScopeSounds,
  withScopeTransition,
} from '@quar/animation';
import type { FrameRenderContext, FrameRendererHandle } from '@quar/export';
import type { Sound, SoundClip } from '@quar/types';

import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import type { FontUse } from '../../services/documentFonts';
import { useEditorStore } from '../../stores/editorStore';
import { textIn } from '../../test/textNode';
import { setGoogleFontsConsent } from '../common/ConsentBanner';
import { LOADER_DELAY_MS, PresentationHost } from './PresentationPlayer';
import { percentReady } from './PresentationLoader';
import { startPresentation, usePresentation } from './presentation';

function layer(id: string, type: 'artboard' | 'rectangle', name = id) {
  return {
    id,
    name,
    type,
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 100,
    fills: [],
    strokes: [],
    ...(type === 'artboard' ? { clipContent: true } : { cornerRadius: [0, 0, 0, 0] }),
  } as never;
}

function Capture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  onCapture(useSceneGraph());
  return null;
}

/** Two slides: Intro (topmost in Layers) then Outro, each with a ball. */
function deck(sg: SceneGraph) {
  sg.addNode(layer('outro', 'artboard', 'Outro'));
  sg.addNode(layer('ball2', 'rectangle'), 'outro');
  sg.addNode(layer('intro', 'artboard', 'Intro'));
  sg.addNode(layer('ball1', 'rectangle'), 'intro');
  const clip = { id: 'c', soundId: 'voice', start: 0, offset: 0, duration: 1, gain: 1 };
  let timeline = createTimeline({ duration: 60, frameRate: 30 });
  timeline = withScopeDuration(timeline, 'intro', 45);
  timeline = withScopeSounds(timeline, 'outro', [clip]);
  useEditorStore.setState({ timeline, sounds: [] });
}

function fakeRenderer() {
  const canvas = document.createElement('canvas');
  return {
    canvas,
    preloadTextures: vi.fn(async () => undefined),
    renderFrame: vi.fn((_ctx: FrameRenderContext, _frame: number) => canvas),
    renderFrameAsBlob: vi.fn(async () => null),
    dispose: vi.fn(),
  };
}

function fakeSounds() {
  return {
    play: vi.fn(),
    stop: vi.fn(),
    prepare: vi.fn(
      async (_sounds: Sound[], _decoded?: (sound: Sound) => void, _clips?: SoundClip[]) => undefined
    ),
    warm: vi.fn(),
    dispose: vi.fn(),
  };
}

/** A promise settled when the test says. */
function later<T = void>() {
  let settle: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => (settle = resolve));
  return { promise, settle };
}

describe('the presentation', () => {
  let renderer: ReturnType<typeof fakeRenderer>;
  let sounds: ReturnType<typeof fakeSounds>;
  let fonts: ReturnType<typeof vi.fn<[FontUse], Promise<unknown>>>;
  let sg: SceneGraph;

  beforeEach(() => {
    useEditorStore.getState().resetProject();
    renderer = fakeRenderer();
    sounds = fakeSounds();
    fonts = vi.fn(async (_font: FontUse): Promise<unknown> => null);
    render(
      <SceneGraphProvider>
        <Capture onCapture={(graph) => (sg = graph)} />
        <PresentationHost
          createRenderer={() => renderer as unknown as FrameRendererHandle}
          createSoundPlayer={() => sounds as never}
          loadFont={(font) => fonts(font)}
        />
      </SceneGraphProvider>
    );
    deck(sg);
  });
  afterEach(() => {
    act(() => usePresentation.setState({ open: false }));
    setGoogleFontsConsent(false);
    cleanup();
  });

  const lastSlide = () => renderer.renderFrame.mock.calls.at(-1)?.[0].exportRootIds?.[0];

  it('plays the topmost artboard first, full screen, with its own timeline', async () => {
    act(() => startPresentation());
    expect(screen.getByTestId('presentation')).toBeTruthy();
    await waitFor(() => expect(lastSlide()).toBe('intro'));
    const ctx = renderer.renderFrame.mock.calls.at(-1)?.[0];
    expect(ctx?.timeline.duration).toBe(45);
    // Drawn on the screen, from its first frame
    expect(screen.getByTestId('presentation').querySelector('canvas')).toBe(renderer.canvas);
    expect(renderer.renderFrame.mock.calls[0]?.[1]).toBe(0);
    expect(sounds.play).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ clips: [], lastFrame: 44 })
    );
  });

  it('moves on with ↓ and back with ↑, each slide from its start with its sounds', async () => {
    act(() => startPresentation());
    await waitFor(() => expect(lastSlide()).toBe('intro'));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(lastSlide()).toBe('outro'));
    expect(sounds.play).toHaveBeenLastCalledWith(
      0,
      expect.objectContaining({ clips: [expect.objectContaining({ id: 'c' })], lastFrame: 59 })
    );
    expect(screen.getByText('Slide 2 of 2: Outro')).toBeTruthy();
    // No further than the last
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(screen.getByText('Slide 2 of 2: Outro')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    await waitFor(() => expect(lastSlide()).toBe('intro'));
  });

  it('starts the first slide over with ↑, Page Up or Home: its animation and its sounds', async () => {
    act(() => startPresentation());
    const lastFrame = () => renderer.renderFrame.mock.calls.at(-1)?.[1] ?? 0;
    for (const key of ['ArrowUp', 'PageUp', 'Home']) {
      // Under way…
      await waitFor(() => expect(lastFrame()).toBeGreaterThan(0));
      const plays = sounds.play.mock.calls.length;
      const stops = sounds.stop.mock.calls.length;
      const drawn = renderer.renderFrame.mock.calls.length;
      // …then from the start again
      fireEvent.keyDown(window, { key });
      expect(sounds.stop.mock.calls.length).toBeGreaterThan(stops);
      await waitFor(() => expect(sounds.play.mock.calls.length).toBe(plays + 1));
      expect(sounds.play).toHaveBeenLastCalledWith(
        0,
        expect.objectContaining({ clips: [], lastFrame: 44 })
      );
      const again = renderer.renderFrame.mock.calls[drawn];
      expect(again?.[0].exportRootIds).toEqual(['intro']);
      expect(again?.[1]).toBe(0);
      expect(screen.getByText('Slide 1 of 2: Intro')).toBeTruthy();
    }
  });

  it('keeps the last slide as it is with ↓ or End', async () => {
    act(() => startPresentation());
    await waitFor(() => expect(lastSlide()).toBe('intro'));
    fireEvent.keyDown(window, { key: 'End' });
    await waitFor(() => expect(lastSlide()).toBe('outro'));
    const plays = sounds.play.mock.calls.length;
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'End' });
    // A while later: not started over
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(sounds.play.mock.calls.length).toBe(plays);
    expect(renderer.renderFrame.mock.calls.at(-1)?.[1]).toBeGreaterThan(0);
  });

  it('keeps the editor’s shortcuts out of it, and Escape leaves', () => {
    const editor = vi.fn();
    window.addEventListener('keydown', editor);
    act(() => startPresentation());
    fireEvent.keyDown(window, { key: 'r' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(editor).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(usePresentation.getState().open).toBe(false);
    expect(screen.queryByTestId('presentation')).toBeNull();
    expect(renderer.dispose).toHaveBeenCalled();
    expect(sounds.dispose).toHaveBeenCalled();
    window.removeEventListener('keydown', editor);
  });

  it('leaves the editor’s scene as it was', async () => {
    const before = JSON.stringify(sg.toJSON());
    act(() => startPresentation());
    await waitFor(() => expect(lastSlide()).toBe('intro'));
    const drawn = renderer.renderFrame.mock.calls.at(-1)?.[0];
    expect(drawn?.sceneGraph).not.toBe(sg);
    expect(JSON.stringify(sg.toJSON())).toBe(before);
  });

  describe('transitions', () => {
    const stageCanvas = () => screen.getByTestId('presentation').querySelector('canvas');
    const lastDrawn = () => {
      const call = renderer.renderFrame.mock.calls.at(-1);
      return `${call?.[0].exportRootIds?.[0]}@${call?.[1]}`;
    };
    /**
     * The clock moved on a screen refresh at a time, React committing
     * between (as it would: timers and effects take turns)
     */
    const wait = async (ms: number) => {
      for (let left = ms; left > 0; left -= 16) {
        await act(() => vi.advanceTimersByTimeAsync(Math.min(16, left)));
      }
    };

    beforeEach(() => {
      vi.useFakeTimers({
        toFake: [
          'setTimeout',
          'clearTimeout',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'performance',
          'Date',
        ],
      });
      // Half a second's fade into the outro
      const { timeline } = useEditorStore.getState();
      useEditorStore.setState({
        timeline: withScopeTransition(timeline, 'outro', { type: 'fade', duration: 0.5 }),
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    /** The presentation on, its first slide played through (1.5 s) and held. */
    async function throughTheIntro() {
      act(() => startPresentation());
      await wait(1700);
      expect(lastDrawn()).toBe('intro@44');
    }

    it('↓ plays the transition, both slides held, then the next slide and its sounds', async () => {
      await throughTheIntro();
      const drawn = renderer.renderFrame.mock.calls.length;
      const plays = sounds.play.mock.calls.length;
      const stops = sounds.stop.mock.calls.length;

      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await wait(100);
      // The intro's sounds stop; on screen, the blend of the two (not the renderer's canvas)
      expect(sounds.stop.mock.calls.length).toBeGreaterThan(stops);
      expect(stageCanvas()).not.toBe(renderer.canvas);
      expect(stageCanvas()).toBeTruthy();
      // The outro's first frame drawn once; the intro's held frame is the one on screen
      expect(
        renderer.renderFrame.mock.calls
          .slice(drawn)
          .map(([ctx, frame]) => [ctx.exportRootIds, frame])
      ).toEqual([[['outro'], 0]]);
      expect(screen.getByText('Slide 2 of 2: Outro')).toBeTruthy();
      // Its timeline and sounds wait for the transition
      await wait(300);
      expect(sounds.play.mock.calls.length).toBe(plays);
      expect(renderer.renderFrame.mock.calls.length).toBe(drawn + 1);

      // Over: the outro from its start, its sounds with it
      await wait(150);
      expect(sounds.play.mock.calls.length).toBe(plays + 1);
      expect(sounds.play).toHaveBeenLastCalledWith(
        0,
        expect.objectContaining({ clips: [expect.objectContaining({ id: 'c' })], lastFrame: 59 })
      );
      expect(stageCanvas()).toBe(renderer.canvas);
      expect(lastDrawn()).toBe('outro@0');
      await wait(1000);
      // A second into its own timeline
      expect(renderer.renderFrame.mock.calls.at(-1)?.[1]).toBeGreaterThanOrEqual(29);
      expect(renderer.renderFrame.mock.calls.at(-1)?.[1]).toBeLessThanOrEqual(31);
    });

    it('holds the outgoing slide on the frame it got to, when ↓ comes early', async () => {
      act(() => startPresentation());
      await wait(500);
      const shown = renderer.renderFrame.mock.calls.at(-1)?.[1] ?? 0;
      expect(shown).toBeGreaterThan(0);
      expect(shown).toBeLessThan(44);
      const drawn = renderer.renderFrame.mock.calls.length;
      fireEvent.keyDown(window, { key: 'PageDown' });
      await wait(200);
      // Not drawn again at its last frame: only the outro's first
      expect(renderer.renderFrame.mock.calls.slice(drawn).map(([, frame]) => frame)).toEqual([0]);
    });

    it('↓ again during the transition skips to its end', async () => {
      await throughTheIntro();
      const plays = sounds.play.mock.calls.length;
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await wait(100);
      expect(stageCanvas()).not.toBe(renderer.canvas);
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await wait(20);
      expect(sounds.play.mock.calls.length).toBe(plays + 1);
      expect(stageCanvas()).toBe(renderer.canvas);
      expect(lastDrawn()).toBe('outro@0');
      // Still the outro: the skip didn't move on (there's nothing after it anyway)
      expect(screen.getByText('Slide 2 of 2: Outro')).toBeTruthy();
    });

    it('↑ cuts back, and End cuts forward: no transition', async () => {
      await throughTheIntro();
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await wait(700);
      expect(lastDrawn()).toMatch(/^outro@/);

      fireEvent.keyDown(window, { key: 'ArrowUp' });
      await wait(20);
      expect(stageCanvas()).toBe(renderer.canvas);
      expect(lastDrawn()).toBe('intro@0');
      expect(screen.getByText('Slide 1 of 2: Intro')).toBeTruthy();

      const plays = sounds.play.mock.calls.length;
      fireEvent.keyDown(window, { key: 'End' });
      await wait(20);
      expect(stageCanvas()).toBe(renderer.canvas);
      expect(lastDrawn()).toBe('outro@0');
      expect(sounds.play.mock.calls.length).toBe(plays + 1);
    });

    it('Escape during a transition ends the presentation', async () => {
      await throughTheIntro();
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await wait(100);
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(usePresentation.getState().open).toBe(false);
      expect(screen.queryByTestId('presentation')).toBeNull();
    });
  });

  describe('getting ready', () => {
    const voice: Sound = {
      id: 'voice',
      name: 'Voice',
      src: 'data:audio/wav;base64,AA',
      duration: 1,
    };
    const loader = () => screen.queryByTestId('presentation-loading');

    it('starts straight away, with no loading screen, when it’s ready in a moment', async () => {
      act(() => startPresentation());
      await waitFor(() => expect(lastSlide()).toBe('intro'));
      await new Promise((resolve) => setTimeout(resolve, LOADER_DELAY_MS + 120));
      expect(loader()).toBeNull();
      // The keys come up as the first slide starts
      expect(screen.getByText('↓')).toBeTruthy();
    });

    it('shows how far the slides have got, then plays the first from its start', async () => {
      // A Google font allowed but not loaded yet, a sound to decode, the second slide's pictures slow
      setGoogleFontsConsent(true);
      sg.addNode(textIn('title', 'Outfit', 700), 'intro');
      useEditorStore.setState({ sounds: [voice] });
      const font = later<unknown>();
      fonts.mockImplementation(() => font.promise);
      const decoded = later();
      sounds.prepare.mockImplementation(async (list, each) => {
        await decoded.promise;
        list.forEach((one) => each?.(one));
      });
      const pictures = later();
      renderer.preloadTextures
        .mockImplementationOnce(async () => undefined)
        .mockImplementationOnce(() => pictures.promise);

      act(() => startPresentation());
      // Not in a moment: the loading screen, the first slide's name on it
      expect(loader()).toBeNull();
      const screenUp = await screen.findByTestId('presentation-loading');
      const up = within(screenUp);
      expect(up.getByText('Intro')).toBeTruthy();
      expect(up.getByText('2 slides')).toBeTruthy();
      expect(up.getByText('1/2')).toBeTruthy();
      // Its renditions at the speeds the slides' clips play it at made ahead too
      expect(sounds.prepare).toHaveBeenCalledWith([voice], expect.any(Function), [
        expect.objectContaining({ id: 'c', soundId: 'voice' }),
      ]);
      expect(fonts).toHaveBeenCalledWith({ family: 'Outfit', weight: 700 });
      expect(up.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25');
      // Nothing drawn or heard yet, the keys not shown, and the slides don't move
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      expect(renderer.renderFrame).not.toHaveBeenCalled();
      expect(sounds.play).not.toHaveBeenCalled();
      expect(screen.queryByText('↓')).toBeNull();

      await act(async () => pictures.settle());
      expect(up.getByText('2/2')).toBeTruthy();
      await act(async () => decoded.settle());
      expect(up.getAllByText('1/1')).toHaveLength(1);
      expect(up.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('75');
      expect(renderer.renderFrame).not.toHaveBeenCalled();
      await act(async () => font.settle(null));
      expect(up.getAllByText('1/1')).toHaveLength(2);
      expect(up.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');

      // Ready: it fades over the first slide's first frame, waiting…
      await waitFor(() => expect(screenUp.hasAttribute('data-leaving')).toBe(true));
      await waitFor(() => expect(renderer.renderFrame).toHaveBeenCalled());
      expect(renderer.renderFrame.mock.calls[0]?.[0].exportRootIds).toEqual(['intro']);
      expect(renderer.renderFrame.mock.calls[0]?.[1]).toBe(0);
      expect(sounds.play).not.toHaveBeenCalled();
      // …then it plays, from its start, its sounds with it, the keys up
      await waitFor(() => expect(loader()).toBeNull());
      await waitFor(() => expect(sounds.play).toHaveBeenCalledTimes(1));
      expect(sounds.play).toHaveBeenCalledWith(0, expect.objectContaining({ lastFrame: 44 }));
      expect(screen.getByText('Slide 1 of 2: Intro')).toBeTruthy();
      expect(screen.getByText('↓')).toBeTruthy();
    });

    it('can be left with Escape while it loads', async () => {
      renderer.preloadTextures.mockImplementation(() => new Promise(() => undefined));
      act(() => startPresentation());
      await screen.findByTestId('presentation-loading');
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(usePresentation.getState().open).toBe(false);
      expect(screen.queryByTestId('presentation')).toBeNull();
      expect(renderer.dispose).toHaveBeenCalled();
      expect(sounds.dispose).toHaveBeenCalled();
      expect(sounds.play).not.toHaveBeenCalled();
    });

    it('asks for no fonts it isn’t allowed to load, and waits for none', async () => {
      sg.addNode(textIn('title', 'Outfit', 700), 'intro');
      act(() => startPresentation());
      await waitFor(() => expect(lastSlide()).toBe('intro'));
      expect(fonts).not.toHaveBeenCalled();
    });
  });
});

describe('how much is ready', () => {
  it('counts every part alike, whole percent', () => {
    const part = (done: number, total: number) => ({ done, total });
    expect(percentReady({ slides: part(1, 2), sounds: part(0, 1), fonts: part(0, 0) })).toBe(33);
    expect(percentReady({ slides: part(3, 2), sounds: part(1, 1), fonts: part(1, 1) })).toBe(100);
    expect(percentReady({ slides: part(0, 0), sounds: part(0, 0), fonts: part(0, 0) })).toBe(100);
  });
});
