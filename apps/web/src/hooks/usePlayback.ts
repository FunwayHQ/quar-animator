/**
 * usePlayback Hook
 * Manages PlaybackController lifecycle and syncs with editor store
 */

import { useEffect, useRef, useCallback } from 'react';
import { PlaybackController, evaluateTimelineAtFrame, applyAnimatedValues } from '@quar/animation';
import { evaluateIKChains } from '@quar/rigging';
import { useEditorStore } from '../stores/editorStore';
import { noteSequenceShown } from '../stores/sequenceActions';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { poseScene } from '../stores/scenePosing';

/**
 * Where playing stops or loops: the last keyframe, when the animation reaches
 * past frame 0; otherwise the end of the timeline. Stepping and seeking aren't
 * limited by it, so new keyframes can be set after the last one.
 */
export function getPlayEnd(timeline: ReturnType<typeof useEditorStore.getState>['timeline']) {
  const lastKeyframe =
    timeline.tracks?.reduce(
      (lastFrame, track) =>
        track.keyframes?.reduce(
          (trackLastFrame, keyframe) => Math.max(trackLastFrame, keyframe.time),
          lastFrame
        ) ?? lastFrame,
      -1
    ) ?? -1;
  return lastKeyframe >= 1 ? Math.ceil(lastKeyframe) : null;
}

type EditorState = ReturnType<typeof useEditorStore.getState>;

/** Apply animated values to ALL scene graph nodes (including children in groups). */
function applyFrame(
  sg: ReturnType<typeof useSceneGraph>,
  timeline: EditorState['timeline'],
  ikChains: EditorState['ikChains'],
  frame: number
) {
  if (!timeline.tracks || timeline.tracks.length === 0) {
    // Even without animation tracks, evaluate IK chains (for interactive posing)
    if (ikChains.length > 0) {
      evaluateIKChains(ikChains, sg);
    }
    return;
  }
  // Every animated node's values, from one pass over the tracks
  for (const [nodeId, values] of evaluateTimelineAtFrame(timeline, frame)) {
    const node = sg.getNode(nodeId);
    if (!node) continue;
    const updated = applyAnimatedValues(node, values);
    if (updated !== node) {
      sg.updateNode(nodeId, updated);
    }
  }

  // After FK animation, evaluate IK chains
  if (ikChains.length > 0) {
    evaluateIKChains(ikChains, sg);
  }
}

export function usePlayback() {
  const controllerRef = useRef<PlaybackController | null>(null);
  const sceneGraph = useSceneGraph();
  const sceneGraphRef = useRef(sceneGraph);
  sceneGraphRef.current = sceneGraph;
  // True while this hook writes animated values, so those aren't taken for user edits
  const applyingRef = useRef(false);

  // Apply the timeline at a frame
  const applyAnimations = useCallback((frame: number) => {
    const sg = sceneGraphRef.current;
    // Before overwriting sequenced objects, keep what the user changed on them
    // (moved, scaled, ...) by shifting their rest poses. Skipped when the
    // sequence itself was replaced (undo, page switch, project load).
    useEditorStore.getState().flushSequenceEdits(sg);
    const { timeline, ikChains, animationSequence } = useEditorStore.getState();
    noteSequenceShown(timeline, frame, animationSequence);
    applyingRef.current = true;
    try {
      // Showing a frame isn't an edit: the project stays saved
      poseScene(() => applyFrame(sg, timeline, ikChains, frame));
    } finally {
      applyingRef.current = false;
    }
  }, []);

  // Absorb edits to sequenced objects shortly after they're made (a drag ends,
  // a field is committed) so saving or switching pages can't lose them
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = sceneGraph.on('nodeChanged', (event) => {
      if (applyingRef.current) return;
      const { animationSequence } = useEditorStore.getState();
      if (!animationSequence.restPoses[event.nodeId ?? '']) return;
      clearTimeout(timer);
      timer = setTimeout(() => useEditorStore.getState().flushSequenceEdits(sceneGraph), 150);
    });
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, [sceneGraph]);

  // Create controller + subscribe in one effect for StrictMode compatibility
  useEffect(() => {
    const state = useEditorStore.getState();
    const ctrl = new PlaybackController({
      duration: Math.max(1, state.timelineDuration),
      frameRate: state.frameRate,
      looping: state.isLooping,
      onFrameChange: (frame: number) => {
        useEditorStore.getState().setCurrentFrame(frame);
        // Apply animations directly from the playback callback (single evaluation)
        applyAnimations(frame);
      },
      onPlaybackEnd: () => useEditorStore.getState().setIsPlaying(false),
    });
    // Initialize work area and play end from store
    ctrl.setWorkArea(state.workAreaEnabled, state.workAreaStart, state.workAreaEnd);
    ctrl.setPlayEnd(getPlayEnd(state.timeline));
    controllerRef.current = ctrl;

    const unsub = useEditorStore.subscribe((curr, prev) => {
      if (curr.timelineDuration !== prev.timelineDuration) {
        ctrl.setDuration(Math.max(1, curr.timelineDuration));
      }
      if (curr.timeline !== prev.timeline) ctrl.setPlayEnd(getPlayEnd(curr.timeline));
      if (curr.frameRate !== prev.frameRate) {
        ctrl.setFrameRate(curr.frameRate);
      }
      if (curr.isLooping !== prev.isLooping) {
        ctrl.setLooping(curr.isLooping);
      }
      if (curr.workAreaEnabled !== prev.workAreaEnabled) {
        ctrl.setWorkAreaEnabled(curr.workAreaEnabled);
      }
      if (curr.workAreaStart !== prev.workAreaStart) {
        ctrl.setWorkAreaStart(curr.workAreaStart);
      }
      if (curr.workAreaEnd !== prev.workAreaEnd) {
        ctrl.setWorkAreaEnd(curr.workAreaEnd);
      }
      // Stop playback controller when store says not playing (e.g. page switch)
      if (!curr.isPlaying && prev.isPlaying && ctrl.isPlaying) {
        ctrl.pause();
      }
      // ...and start it when something other than this hook sets isPlaying
      // (Animation > Play, the sequence window's Play from start)
      if (curr.isPlaying && !prev.isPlaying && !ctrl.isPlaying) {
        ctrl.syncFrame(curr.currentFrame);
        ctrl.play();
      }
      // Apply animations for manual frame changes (scrubbing, stepping)
      // Only when NOT playing — playback applies via onFrameChange above
      if (curr.currentFrame !== prev.currentFrame && !ctrl.isPlaying) {
        // Keep controller in sync with store (e.g. timeline ruler click sets
        // currentFrame directly, bypassing the PlaybackController)
        ctrl.syncFrame(curr.currentFrame);
      }
      // Loading a project or switching pages replaces the timeline without
      // necessarily changing the current frame. Apply its values at the current
      // playhead so animations are visible immediately, including at frame 0.
      if (
        curr.timeline !== prev.timeline ||
        (curr.currentFrame !== prev.currentFrame && !ctrl.isPlaying)
      ) {
        applyAnimations(curr.currentFrame);
      }
    });

    return () => {
      unsub();
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, [applyAnimations]);

  const play = useCallback(() => {
    controllerRef.current?.play();
    useEditorStore.getState().setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    controllerRef.current?.pause();
    useEditorStore.getState().setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    const ctrl = controllerRef.current;
    if (!ctrl) return;
    if (ctrl.isPlaying) {
      ctrl.pause();
      useEditorStore.getState().setIsPlaying(false);
    } else {
      ctrl.play();
      useEditorStore.getState().setIsPlaying(true);
    }
  }, []);

  const stop = useCallback(() => {
    controllerRef.current?.stop(); // Calls _setFrame(0) → onFrameChange → setCurrentFrame(0)
    useEditorStore.getState().setIsPlaying(false);
  }, []);

  const nextFrame = useCallback(() => {
    controllerRef.current?.nextFrame();
  }, []);

  const prevFrame = useCallback(() => {
    controllerRef.current?.prevFrame();
  }, []);

  const goToStart = useCallback(() => {
    controllerRef.current?.goToStart();
  }, []);

  const goToEnd = useCallback(() => {
    controllerRef.current?.goToEnd();
  }, []);

  const goToFrame = useCallback((frame: number) => {
    controllerRef.current?.goToFrame(frame);
  }, []);

  return {
    play,
    pause,
    togglePlay,
    stop,
    nextFrame,
    prevFrame,
    goToStart,
    goToEnd,
    goToFrame,
  };
}
