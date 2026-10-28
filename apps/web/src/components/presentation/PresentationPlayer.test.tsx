import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import { createTimeline, withScopeDuration, withScopeSounds } from '@quar/animation';
import type { FrameRenderContext, FrameRendererHandle } from '@quar/export';

import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { PresentationHost } from './PresentationPlayer';
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
  return { play: vi.fn(), stop: vi.fn(), prepare: vi.fn(), warm: vi.fn(), dispose: vi.fn() };
}

describe('the presentation', () => {
  let renderer: ReturnType<typeof fakeRenderer>;
  let sounds: ReturnType<typeof fakeSounds>;
  let sg: SceneGraph;

  beforeEach(() => {
    useEditorStore.getState().resetProject();
    renderer = fakeRenderer();
    sounds = fakeSounds();
    render(
      <SceneGraphProvider>
        <Capture onCapture={(graph) => (sg = graph)} />
        <PresentationHost
          createRenderer={() => renderer as unknown as FrameRendererHandle}
          createSoundPlayer={() => sounds as never}
        />
      </SceneGraphProvider>
    );
    deck(sg);
  });
  afterEach(() => {
    act(() => usePresentation.setState({ open: false }));
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
});
