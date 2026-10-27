/**
 * useSoundPlayback
 * Plays the sound clips of the timeline in view while it plays: from the
 * playhead, started over when playing loops or jumps or the clips change,
 * stopped when it stops. The library's sounds are decoded ahead, so they
 * play at once.
 */

import { useEffect } from 'react';
import type { Timeline } from '@quar/types';
import { useEditorStore } from '../stores/editorStore';
import { SoundPlayer, type SoundsToPlay } from '../services/soundPlayer';
import { decodedSound, keepDecodedSounds } from '../services/soundFiles';

type EditorState = ReturnType<typeof useEditorStore.getState>;

/** The clips of a scope as the timeline holds them (the same list until they change). */
function clipsOf(timeline: Timeline, scope: string | null) {
  return scope === null ? timeline.sounds : timeline.artboards?.[scope]?.sounds;
}

function toPlay(state: EditorState): SoundsToPlay {
  return {
    clips: clipsOf(state.timeline, state.timelineScope),
    sounds: state.sounds,
    frameRate: state.timeline.frameRate,
    lastFrame: state.workAreaEnabled ? state.workAreaEnd : state.timelineDuration - 1,
  };
}

/** Each sound decoded ahead (failures are silent: the clip just doesn't sound). */
function decodeAhead(state: EditorState) {
  keepDecodedSounds(state.sounds);
  for (const sound of state.sounds) decodedSound(sound).catch(() => undefined);
}

export function useSoundPlayback(createPlayer: () => SoundPlayer = () => new SoundPlayer()) {
  useEffect(() => {
    const player = createPlayer();
    decodeAhead(useEditorStore.getState());
    // The audio clock running before playing starts: on a click or key press, with sounds to play
    const warm = () => {
      if (useEditorStore.getState().sounds.length > 0) player.warm();
    };
    window.addEventListener('pointerdown', warm, true);
    window.addEventListener('keydown', warm, true);

    const unsubscribe = useEditorStore.subscribe((curr, prev) => {
      if (curr.sounds !== prev.sounds) decodeAhead(curr);
      if (!curr.isPlaying || curr.isExporting) {
        if (prev.isPlaying && !prev.isExporting) player.stop();
        return;
      }
      const startedOrChanged =
        !prev.isPlaying ||
        prev.isExporting ||
        curr.sounds !== prev.sounds ||
        curr.timelineScope !== prev.timelineScope ||
        clipsOf(curr.timeline, curr.timelineScope) !== clipsOf(prev.timeline, prev.timelineScope) ||
        curr.timeline.frameRate !== prev.timeline.frameRate ||
        curr.workAreaEnabled !== prev.workAreaEnabled ||
        curr.workAreaEnd !== prev.workAreaEnd ||
        curr.timelineDuration !== prev.timelineDuration;
      const jumped =
        curr.currentFrame !== prev.currentFrame &&
        (curr.currentFrame < prev.currentFrame || !player.inStep(curr.currentFrame));
      if (startedOrChanged || jumped) player.play(curr.currentFrame, toPlay(curr));
    });

    return () => {
      unsubscribe();
      window.removeEventListener('pointerdown', warm, true);
      window.removeEventListener('keydown', warm, true);
      player.dispose();
    };
    // The player is made once: a test's stand-in, or the real one
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
