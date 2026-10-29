/**
 * Tests for the Properties panel with a video layer: sized, rounded,
 * adjusted and faded as a picture is, with a Video section saying what it
 * shows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import type { SceneGraph } from '@quar/core';
import type { VideoClip, VideoNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';
import { linkedSound, testVideo, videoLayer } from '../../test/videoLayer';
import { exportSelectionAsPng } from '../../services/exportService';

vi.mock('../../services/exportService', () => ({
  exportSelectionAsPng: vi.fn(async () => {}),
  exportSelectionAsSvg: vi.fn(),
}));

function SceneGraphCapture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  const sg = useSceneGraph();
  onCapture(sg);
  return null;
}

function renderWithSceneGraph(): SceneGraph {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  return sg!;
}

const VIDEO = testVideo('file-v', {
  name: 'Beach at dusk.mp4',
  width: 1280,
  height: 720,
  duration: 75.25,
  strip: { rate: 4, height: 90, frames: ['data:image/webp;base64,AAAA'] },
});

/** A layer showing VIDEO (320 × 180) on the canvas, selected. */
function selectVideo(clip: Partial<VideoClip> = {}): SceneGraph {
  const sg = renderWithSceneGraph();
  act(() => {
    sg.addNode(videoLayer('v', VIDEO.id, clip));
    useEditorStore.getState().setSelection(['v']);
  });
  return sg;
}

describe('PropertiesPanel - video layer', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
    if (useEditorStore.getState().aspectRatioLocked) {
      useEditorStore.getState().toggleAspectRatioLock();
    }
    useEditorStore.setState({ videos: [VIDEO], frameRate: 24 });
  });

  it('says it’s a video', () => {
    selectVideo();
    const header = screen.getByRole('heading', { name: 'Properties' }).parentElement!;
    expect(within(header).getByText('Video')).toBeInTheDocument();
  });

  it('sizes it by its width and height, as a picture', () => {
    const sg = selectVideo();
    expect(document.getElementById('prop-size-w')).toHaveValue('320.0');
    expect(document.getElementById('prop-size-h')).toHaveValue('180.0');

    act(() => {
      fireEvent.change(document.getElementById('prop-size-w')!, { target: { value: '640' } });
    });
    const video = sg.getNode('v') as VideoNode;
    expect(video.width).toBe(640);
    expect(video.transform.scale).toEqual({ x: 1, y: 1 });
  });

  it('rounds its corners', () => {
    const sg = selectVideo();
    act(() => {
      fireEvent.change(screen.getByTestId('corner-radius-input'), { target: { value: '12' } });
    });
    expect((sg.getNode('v') as VideoNode).cornerRadius).toEqual([12, 12, 12, 12]);
  });

  it('adjusts it as a picture is adjusted', () => {
    const sg = selectVideo();
    expect(screen.getByTestId('image-adjustments-section')).toBeInTheDocument();
    act(() => {
      fireEvent.change(screen.getByTestId('adjustment-slider-saturation'), {
        target: { value: '-40' },
      });
    });
    expect((sg.getNode('v') as VideoNode).adjustments?.saturation).toBe(-40);

    act(() => {
      fireEvent.click(screen.getByTestId('image-adjustments-reset-all'));
    });
    expect((sg.getNode('v') as VideoNode).adjustments?.saturation).toBe(0);
  });

  it('has opacity, effects and a blend mode, but no fills or strokes', () => {
    selectVideo();
    expect(screen.getByText('Opacity')).toBeInTheDocument();
    expect(screen.getByTestId('effects-section')).toBeInTheDocument();
    expect(screen.getByText('Blend Mode')).toBeInTheDocument();
    expect(screen.queryByText('Fill')).not.toBeInTheDocument();
    expect(screen.queryByText('Stroke')).not.toBeInTheDocument();
  });

  describe('Video section', () => {
    it('names the video and gives its length and size', () => {
      selectVideo();
      const section = within(screen.getByTestId('video-section'));
      expect(section.getByTestId('video-name')).toHaveTextContent('Beach at dusk.mp4');
      expect(section.getByTestId('video-length')).toHaveTextContent('1:15.3');
      expect(section.getByTestId('video-size')).toHaveTextContent('1280 × 720');
      // It's opaque: nothing said of transparency
      expect(section.queryByTestId('video-transparent')).not.toBeInTheDocument();
    });

    it('says the video is transparent when it is, and shows its still over a checkerboard', () => {
      useEditorStore.setState({ videos: [{ ...VIDEO, hasAlpha: true }] });
      selectVideo();
      const section = within(screen.getByTestId('video-section'));
      expect(section.getByTestId('video-transparent')).toHaveTextContent('Transparent');
      expect(section.getByText('Alpha')).toBeInTheDocument();
      expect(section.getByTestId('video-still').parentElement?.className).toMatch(
        /videoStillAlpha/
      );
    });

    it('shows where its clip starts and how long it plays, at the document’s frame rate', () => {
      selectVideo({ start: 12, offset: 2, duration: 4 });
      const section = within(screen.getByTestId('video-section'));
      expect(section.getByTestId('video-clip-start')).toHaveValue('12');
      expect(section.getByTestId('video-clip-length')).toHaveTextContent('0:04.0');
      expect(section.getByTestId('video-clip-length')).toHaveTextContent('96 frames');
      // The part of the video it plays
      expect(section.getByTestId('video-clip-part')).toHaveTextContent('0:02.0 – 0:06.0');
    });

    it('moves its clip to the frame typed, its sound with it, in one step', () => {
      const sg = selectVideo({ start: 12, offset: 2, duration: 4 });
      act(() => {
        const timeline = useEditorStore.getState().timeline;
        useEditorStore.setState({
          timeline: { ...timeline, sounds: [linkedSound('s', sg.getNode('v') as VideoNode)] },
        });
      });
      const steps = useEditorStore.getState().undoStack.length;
      const start = screen.getByTestId('video-clip-start');
      // Typed into as it is, focused (Enter leaves it: what comes next is a step of its own)
      act(() => {
        start.focus();
        fireEvent.change(start, { target: { value: '40' } });
        fireEvent.keyDown(start, { key: 'Enter' });
      });
      expect((sg.getNode('v') as VideoNode).clip.start).toBe(40);
      expect(useEditorStore.getState().timeline.sounds?.[0]?.start).toBe(40);
      expect(useEditorStore.getState().undoStack.length).toBe(steps + 1);
      // Nudged by the arrow keys, Shift ten frames
      act(() => {
        start.focus();
        fireEvent.keyDown(start, { key: 'ArrowUp', shiftKey: true });
        start.blur();
      });
      expect((sg.getNode('v') as VideoNode).clip.start).toBe(50);
      // Nonsense goes back to what it was
      act(() => {
        fireEvent.change(start, { target: { value: 'soon' } });
        fireEvent.blur(start);
      });
      expect(start).toHaveValue('50');
      act(() => useEditorStore.getState().undo(sg));
      act(() => useEditorStore.getState().undo(sg));
      expect((sg.getNode('v') as VideoNode).clip.start).toBe(12);
      expect(useEditorStore.getState().timeline.sounds?.[0]?.start).toBe(12);
    });

    it('sets its speed, loop and hold, each one step', () => {
      useEditorStore.getState().setTimelineDuration(300);
      const sg = selectVideo({ start: 12, offset: 2, duration: 4 });
      const clip = () => (sg.getNode('v') as VideoNode).clip;
      const steps = () => useEditorStore.getState().undoStack.length;
      const before = steps();
      act(() => {
        fireEvent.click(screen.getByTestId('video-section-speed-2'));
      });
      expect(clip().speed).toBe(2);
      // 4 s at 2×: 2 s, 48 frames at 24 fps
      expect(screen.getByTestId('video-clip-length')).toHaveTextContent('48 frames');
      expect(screen.getByTestId('video-section-speed-2')).toHaveAttribute('aria-pressed', 'true');
      // Typed, kept to 0.25×–4×: 16 s from frame 12 at 24 fps lengthens the timeline
      const field = screen.getByTestId('video-section-speed');
      act(() => {
        field.focus();
        fireEvent.change(field, { target: { value: '0.1' } });
        fireEvent.keyDown(field, { key: 'Enter' });
      });
      expect(clip().speed).toBe(0.25);
      expect(field).toHaveValue('0.25');
      expect(useEditorStore.getState().timelineDuration).toBe(396);
      act(() => {
        fireEvent.click(screen.getByTestId('video-section-loop'));
      });
      expect(clip().loop).toBe(true);
      act(() => {
        fireEvent.click(screen.getByTestId('video-section-hold'));
      });
      expect(clip().holdLastFrame).toBe(true);
      expect(steps()).toBe(before + 4);
      act(() => useEditorStore.getState().undo(sg));
      expect(clip()).not.toHaveProperty('holdLastFrame');
      act(() => useEditorStore.getState().undo(sg));
      expect(clip()).not.toHaveProperty('loop');
    });

    it('holds a GIF’s last frame when its loop is turned off', () => {
      useEditorStore.setState({
        videos: [{ ...VIDEO, name: 'Wave.gif', mimeType: 'image/gif', duration: 1 }],
      });
      const sg = selectVideo({ start: 12, offset: 0, duration: 1, loop: true, loopFor: 6 });
      act(() => {
        fireEvent.click(screen.getByTestId('video-section-loop'));
      });
      expect((sg.getNode('v') as VideoNode).clip).toEqual({
        start: 12,
        offset: 0,
        duration: 1,
        holdLastFrame: true,
      });
      expect(screen.getByTestId('video-section-hold')).toBeChecked();
    });

    it('says how long a looped clip plays and how often it starts over', () => {
      selectVideo({ start: 12, offset: 2, duration: 4, loop: true, loopFor: 10 });
      const length = screen.getByTestId('video-clip-length');
      expect(length).toHaveTextContent('0:10.0');
      expect(length).toHaveTextContent('240 frames');
      expect(screen.getByTestId('video-clip-part')).toHaveTextContent('looped');
      expect(screen.getByTestId('video-section-loop')).toBeChecked();
    });

    it('shows its first still', () => {
      selectVideo();
      const still = screen.getByTestId('video-still');
      expect(still).toHaveAttribute('src', VIDEO.strip.frames[0]);
    });

    it('says when the video isn’t in the document', () => {
      useEditorStore.setState({ videos: [] });
      selectVideo();
      const section = within(screen.getByTestId('video-section'));
      expect(section.getByTestId('video-missing')).toBeInTheDocument();
      // The clip is still the layer's own
      expect(section.getByTestId('video-clip-start')).toHaveValue('30');
    });

    it('isn’t shown for a picture', () => {
      const sg = renderWithSceneGraph();
      act(() => {
        sg.addNode({
          ...videoLayer('img', VIDEO.id),
          type: 'image',
          src: 'data:image/png;base64,test',
        } as unknown as VideoNode);
        useEditorStore.getState().setSelection(['img']);
      });
      expect(screen.queryByTestId('video-section')).not.toBeInTheDocument();
    });
  });

  it('exports a PNG of it as it shows now, its video decoded', async () => {
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(videoLayer('v', VIDEO.id, {}, { exports: [{ format: 'png', multiplier: 2 }] }));
      useEditorStore.getState().setSelection(['v']);
      useEditorStore.setState({ currentFrame: 7 });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('export-button'));
      await Promise.resolve();
    });
    expect(exportSelectionAsPng).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'v' })],
      sg,
      expect.objectContaining({
        multiplier: 2,
        moment: { timeline: useEditorStore.getState().timeline, frame: 7 },
        videos: [VIDEO],
        videoFile: expect.any(Function),
      })
    );
  });
});
