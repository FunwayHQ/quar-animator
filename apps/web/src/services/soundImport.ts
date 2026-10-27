/**
 * Sounds brought into the document, from File > Import Sound or dropped on
 * the canvas or the timeline: each put on the timeline in view, the
 * timeline shown so it can be seen there.
 */

import type { SceneGraphLike } from '../stores/editorStore';
import { useEditorStore } from '../stores/editorStore';
import { toast } from '../components/common/Toast';
import { SOUND_FILE_TYPES, readSoundFile } from './soundFiles';

/** Asks for sound files (any number), then hands over those chosen. */
export function chooseSoundFiles(onChosen: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = SOUND_FILE_TYPES;
  input.multiple = true;
  input.onchange = () => {
    const files = Array.from(input.files ?? []);
    if (files.length > 0) onChosen(files);
  };
  input.click();
}

/** "2 s", "12.5 s". */
function seconds(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} s`;
}

/** Each sound file, read and put on the timeline in view at `frame` (the playhead's by default). */
export async function importSoundFiles(
  sceneGraph: SceneGraphLike,
  files: readonly File[],
  frame?: number
): Promise<void> {
  for (const file of files) {
    let sound;
    try {
      sound = await readSoundFile(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `“${file.name}” can’t be read.`);
      continue;
    }
    const store = useEditorStore.getState();
    const before = store.timelineDuration;
    store.addSoundClip(sceneGraph, sound, frame ?? store.currentFrame);
    // Where it can be seen
    if (!store.timelineExpanded) store.setTimelineExpanded(true);
    if (store.timelineViewMode !== 'dopeSheet') store.setTimelineViewMode('dopeSheet');
    const { timelineDuration, frameRate } = useEditorStore.getState();
    toast.success(
      timelineDuration > before
        ? `Added “${sound.name}” (${seconds(sound.duration)}); the timeline now runs ${seconds(timelineDuration / frameRate)} to play it through`
        : `Added “${sound.name}” (${seconds(sound.duration)}) to the timeline`
    );
  }
}
