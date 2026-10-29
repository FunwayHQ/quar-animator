/**
 * Sound store actions: the document's sound library, and the clips on the
 * timeline in view: placed, moved, trimmed, sped up or slowed down, looped,
 * made louder or quieter, muted and taken off again, each an undoable step
 * (the timeline lengthened to play them to their ends). Also whether sounds
 * are heard while scrubbing, a preference of this browser's.
 */

import {
  clipEndFrame,
  findSoundClip,
  generateId,
  scopeDuration,
  scopeSounds,
  withScopeDuration,
  withScopeSounds,
  withSoundClip,
} from '@quar/animation';
import type { Sound, SoundClip } from '@quar/types';
import type { EditorStore, SceneGraphLike } from './editorStore';
import { clipOfLinkedSound, linkedVideoChange } from './videoSounds';

const SCRUB_STORAGE_KEY = 'quar-animator-scrub-sounds';

function readScrubSounds(): boolean {
  try {
    return window.localStorage.getItem(SCRUB_STORAGE_KEY) !== 'off';
  } catch {
    return true;
  }
}

export interface SoundActions {
  /** The document's sounds, which the clips on every page's timelines play */
  sounds: Sound[];
  /** The clip selected in the timeline's sound lane */
  selectedSoundClipId: string | null;
  selectSoundClip: (clipId: string | null) => void;
  /**
   * Put a sound on the timeline in view, all of it, starting on `frame`,
   * adding it to the library if it's new. The timeline lengthens to play it
   * to its end. Undoable; the clip is selected. Returns the clip's id.
   */
  addSoundClip: (sceneGraph: SceneGraphLike, sound: Sound, frame: number) => string;
  /**
   * Change a clip (move or trim it, set its speed, loop, volume, mute it);
   * a video's sound moved, trimmed, sped up or looped does the same to its
   * video layer's clip. The timeline it's on is lengthened to play it to
   * its end. An undoable step, unless `undoable` is false: a drag records
   * one as it begins. A drag doesn't lengthen the timeline as it goes
   * (`fitTimeline` false), which would move the frame under the pointer: it
   * does as it ends, with fitTimelineToSoundClip.
   */
  updateSoundClip: (
    sceneGraph: SceneGraphLike,
    clipId: string,
    change: (clip: SoundClip) => SoundClip,
    undoable?: boolean,
    fitTimeline?: boolean
  ) => void;
  /**
   * Lengthen the timeline a clip is on to play it to its end (never
   * shortened). Part of the change before it: no undo step.
   */
  fitTimelineToSoundClip: (clipId: string) => void;
  /** Take a clip off its timeline (its sound stays in the library). Undoable. */
  removeSoundClip: (sceneGraph: SceneGraphLike, clipId: string) => void;
  /** Whether the sounds at a frame are heard as the playhead is dragged or stepped there */
  scrubSounds: boolean;
  /** Hear sounds while scrubbing, or not (remembered in this browser) */
  setScrubSounds: (on: boolean) => void;
}

export function createSoundActions(
  set: (partial: Partial<EditorStore> | ((state: EditorStore) => Partial<EditorStore>)) => void,
  get: () => EditorStore
): SoundActions {
  return {
    sounds: [],
    selectedSoundClipId: null,
    scrubSounds: readScrubSounds(),
    setScrubSounds: (on) => {
      set({ scrubSounds: on });
      try {
        window.localStorage.setItem(SCRUB_STORAGE_KEY, on ? 'on' : 'off');
      } catch {
        // Storage can be unavailable (private mode, blocked site data).
      }
    },
    selectSoundClip: (clipId) =>
      set((state) =>
        clipId === state.selectedSoundClipId
          ? {}
          : {
              selectedSoundClipId: clipId,
              // One kind of thing selected in the timeline at a time
              ...(clipId !== null && state.selectedKeyframeIds.size > 0
                ? { selectedKeyframeIds: new Set<string>() }
                : {}),
            }
      ),
    addSoundClip: (sceneGraph, sound, frame) => {
      get().pushUndo(sceneGraph);
      const state = get();
      const scope = state.timelineScope;
      const clip: SoundClip = {
        id: generateId('sound'),
        soundId: sound.id,
        start: Math.max(0, Math.round(frame)),
        offset: 0,
        duration: sound.duration,
        gain: 1,
      };
      set({
        timeline: withScopeSounds(state.timeline, scope, [
          ...scopeSounds(state.timeline, scope),
          clip,
        ]),
        sounds: state.sounds.some((known) => known.id === sound.id)
          ? state.sounds
          : [...state.sounds, sound],
        selectedSoundClipId: clip.id,
        selectedKeyframeIds: new Set<string>(),
        isDirty: true,
      });
      // Long enough to play it to its end
      const needed = Math.ceil(clipEndFrame(clip, state.timeline.frameRate) - 1e-6);
      if (needed > get().timelineDuration) get().setTimelineDuration(needed);
      return clip.id;
    },
    updateSoundClip: (sceneGraph, clipId, change, undoable = true, fitTimeline = true) => {
      const before = get().timeline;
      const timeline = withSoundClip(before, clipId, change);
      if (timeline === before) return;
      if (undoable) get().pushUndo(sceneGraph);
      set({ timeline, isDirty: true });
      // A video's sound moved, trimmed, sped up or looped: its video the same way,
      // in the same step (the sound kept where the video's clip is, its timeline fitted)
      const video = linkedVideoChange(sceneGraph, before, timeline, clipId);
      if (video) {
        get().updateVideoClip(
          sceneGraph,
          video.nodeId,
          (clip) => clipOfLinkedSound(clip, video.sound),
          false,
          fitTimeline
        );
      } else if (fitTimeline) {
        get().fitTimelineToSoundClip(clipId);
      }
    },
    fitTimelineToSoundClip: (clipId) => {
      const state = get();
      const found = findSoundClip(state.timeline, clipId);
      if (!found) return;
      const needed = Math.ceil(clipEndFrame(found.clip, state.timeline.frameRate) - 1e-6);
      if (found.scope === state.timelineScope) {
        if (needed > state.timelineDuration) state.setTimelineDuration(needed);
      } else if (needed > scopeDuration(state.timeline, found.scope)) {
        set({ timeline: withScopeDuration(state.timeline, found.scope, needed), isDirty: true });
      }
    },
    removeSoundClip: (sceneGraph, clipId) => {
      const timeline = withSoundClip(get().timeline, clipId, () => null);
      if (timeline === get().timeline) return;
      get().pushUndo(sceneGraph);
      set((state) => ({
        timeline,
        selectedSoundClipId:
          state.selectedSoundClipId === clipId ? null : state.selectedSoundClipId,
        isDirty: true,
      }));
    },
  };
}
