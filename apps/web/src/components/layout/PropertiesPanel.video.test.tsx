/**
 * Tests for the Properties panel with a video layer: sized, rounded,
 * adjusted and faded as a picture is, with a Video section saying what it
 * shows.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent, within } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import type { SceneGraph } from '@quar/core';
import type { VideoClip, VideoNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';
import { testVideo, videoLayer } from '../../test/videoLayer';

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
    });

    it('shows where its clip starts and how long it plays, at the document’s frame rate', () => {
      selectVideo({ start: 12, offset: 2, duration: 4 });
      const section = within(screen.getByTestId('video-section'));
      expect(section.getByTestId('video-clip-start')).toHaveTextContent('Frame 12');
      expect(section.getByTestId('video-clip-length')).toHaveTextContent('0:04.0');
      expect(section.getByTestId('video-clip-length')).toHaveTextContent('96 frames');
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
      expect(section.getByTestId('video-clip-start')).toHaveTextContent('Frame 30');
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
});
