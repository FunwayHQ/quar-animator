import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneGraph } from '@quar/core';
import { scopeSounds } from '@quar/animation';
import type { Sound } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';

const readSoundFile = vi.hoisted(() => vi.fn());
vi.mock('./soundFiles', () => ({ readSoundFile, SOUND_FILE_TYPES: 'audio/*' }));

import { importSoundFiles } from './soundImport';

const store = () => useEditorStore.getState();
const sound = (name: string, duration: number): Sound => ({
  id: `sound-${name}`,
  name,
  src: 'data:audio/wav;base64,AAAA',
  duration,
});

describe('importSoundFiles', () => {
  beforeEach(() => {
    store().resetProject();
    readSoundFile.mockReset();
    vi.spyOn(toast, 'success').mockImplementation(() => {});
    vi.spyOn(toast, 'error').mockImplementation(() => {});
  });

  it('puts each sound on the timeline in view at the playhead, and shows the timeline', async () => {
    readSoundFile.mockResolvedValue(sound('Bell', 1));
    useEditorStore.setState({
      currentFrame: 24,
      timelineExpanded: false,
      timelineViewMode: 'graph',
    });
    await importSoundFiles(new SceneGraph(), [new File([], 'bell.wav')]);
    expect(scopeSounds(store().timeline, null)).toMatchObject([
      { soundId: 'sound-Bell', start: 24 },
    ]);
    expect(store().timelineExpanded).toBe(true);
    expect(store().timelineViewMode).toBe('dopeSheet');
    expect(toast.success).toHaveBeenCalledWith('Added “Bell” (1 s) to the timeline');
  });

  it('says when the timeline was lengthened to play a sound through', async () => {
    readSoundFile.mockResolvedValue(sound('Theme', 12.5));
    await importSoundFiles(new SceneGraph(), [new File([], 'theme.mp3')], 0);
    // 300 frames (10 s) at 30 fps: lengthened to 12.5 s
    expect(store().timelineDuration).toBe(375);
    expect(toast.success).toHaveBeenCalledWith(
      'Added “Theme” (12.5 s); the timeline now runs 12.5 s to play it through'
    );
  });

  it('says why a file couldn’t be added, and goes on with the rest', async () => {
    readSoundFile
      .mockRejectedValueOnce(new Error('“cat.png” isn’t a sound file.'))
      .mockResolvedValueOnce(sound('Bell', 1));
    await importSoundFiles(new SceneGraph(), [new File([], 'cat.png'), new File([], 'bell.wav')]);
    expect(toast.error).toHaveBeenCalledWith('“cat.png” isn’t a sound file.');
    expect(scopeSounds(store().timeline, null)).toHaveLength(1);
  });
});
