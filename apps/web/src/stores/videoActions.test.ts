import { beforeEach, describe, expect, it } from 'vitest';
import type { Video } from '@quar/types';
import { useEditorStore } from './editorStore';
import { setVideoFile, videoFile } from '../services/videoFiles';

const video = (id: string, name = 'Clip'): Video => ({
  id,
  name,
  mimeType: 'video/mp4',
  byteLength: 1000,
  width: 640,
  height: 360,
  duration: 4,
  frameRate: 30,
  hasAlpha: false,
  strip: { rate: 4, height: 90, frames: [] },
});

describe('the video library', () => {
  beforeEach(() => {
    useEditorStore.getState().resetProject();
    useEditorStore.setState({ isDirty: false });
  });

  it('adds a video once, marking the project changed', () => {
    useEditorStore.getState().addVideo(video('v1'));
    useEditorStore.getState().addVideo(video('v1', 'Again'));
    const { videos, isDirty } = useEditorStore.getState();
    expect(videos.map((v) => v.name)).toEqual(['Clip']);
    expect(isDirty).toBe(true);
  });

  it('starts empty in a new project, the last one’s files let go', () => {
    setVideoFile('v1', new Blob(['x'], { type: 'video/mp4' }));
    useEditorStore.getState().addVideo(video('v1'));
    useEditorStore.getState().resetProject();
    expect(useEditorStore.getState().videos).toEqual([]);
    expect(videoFile('v1')).toBeUndefined();
  });
});
