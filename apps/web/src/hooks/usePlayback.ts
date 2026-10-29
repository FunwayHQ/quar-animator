/**
 * usePlayback Hook
 * Manages PlaybackController lifecycle and syncs with editor store
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  PlaybackController,
  playbackEndFrame,
  evaluateTimelineAtFrame,
  applyAnimatedValues,
  scopedTimeline,
  lastSoundFrame,
  lastVideoFrame,
} from '@quar/animation';
import { inTimelineScope, type ScopeLookup } from '@quar/core';
import type { VideoClip } from '@quar/types';
import { evaluateIKChains } from '@quar/rigging';
import { useEditorStore } from '../stores/editorStore';
import { noteSequenceShown } from '../stores/sequenceActions';
import { useSceneGraph } from '../contexts/SceneGraphContext';
import { isPosingScene, poseScene } from '../stores/scenePosing';

/**
 * Where playing stops or loops: the last keyframe, or the last frame a sound
 * or a video (`lastVideo`, see videoEndInView) plays on if that's later,
 * when they reach past frame 0; otherwise the end of the timeline. Stepping
 * and seeking aren't limited by it, so new keyframes can be set after the
 * last one.
 */
export function getPlayEnd(
  timeline: ReturnType<typeof useEditorStore.getState>['timeline'],
  lastVideo = -1
) {
  const lastKeyframe =
    timeline.tracks?.reduce(
      (lastFrame, track) =>
        track.keyframes?.reduce(
          (trackLastFrame, keyframe) => Math.max(trackLastFrame, keyframe.time),
          lastFrame
        ) ?? lastFrame,
      -1
    ) ?? -1;
  const last = Math.max(
    lastKeyframe,
    lastSoundFrame(timeline.sounds, timeline.frameRate),
    lastVideo
  );
  return last >= 1 ? Math.ceil(last) : null;
}

/** The clips of the video layers playing on the timeline in view. */
function videoClipsInView(sceneGraph: ScopeLookup, scope: string | null): VideoClip[] {
  const inScope = inTimelineScope(sceneGraph, scope);
  const clips: VideoClip[] = [];
  for (const root of sceneGraph.getRootNodes()) {
    for (const node of [root, ...sceneGraph.getDescendants(root.id)]) {
      if (node.type === 'video' && inScope(node.id)) clips.push(node.clip);
    }
  }
  return clips;
}

/** The last frame a video layer on the timeline in view plays on (-1 with none). */
export function videoEndInView(
  sceneGraph: ScopeLookup,
  scope: string | null,
  frameRate: number
): number {
  return lastVideoFrame(videoClipsInView(sceneGraph, scope), frameRate);
}

type EditorState = ReturnType<typeof useEditorStore.getState>;

/**
 * The frame End goes to, the end of the animation, as the playback
 * controller's goToEnd() works it out (playbackEndFrame): the last keyframe
 * or sound of the timeline in view, kept inside the work area while it's
 * on. For the menus, which have no controller of their own.
 */
export function getAnimationEnd(
  state: Pick<
    EditorState,
    | 'timeline'
    | 'timelineScope'
    | 'timelineDuration'
    | 'workAreaEnabled'
    | 'workAreaStart'
    | 'workAreaEnd'
  >,
  sceneGraph: ScopeLookup
): number {
  const last = Math.max(0, state.timelineDuration - 1);
  const range = state.workAreaEnabled
    ? { start: state.workAreaStart, end: Math.min(state.workAreaEnd, last) }
    : { start: 0, end: last };
  const { timeline, timelineScope: scope } = state;
  const inView = scopedTimeline(timeline, scope, inTimelineScope(sceneGraph, scope));
  const lastVideo = videoEndInView(sceneGraph, scope, timeline.frameRate);
  return playbackEndFrame(range, getPlayEnd(inView, lastVideo));
}

/**
 * The frame Home goes to, the start of the animation, as the playback
 * controller's goToStart() works it out: the work area's start while it's
 * on, else frame 0. For the menus, which have no controller of their own.
 */
export function getAnimationStart(
  state: Pick<EditorState, 'timelineDuration' | 'workAreaEnabled' | 'workAreaStart'>
): number {
  if (!state.workAreaEnabled) return 0;
  return Math.max(0, Math.min(Math.round(state.workAreaStart), state.timelineDuration - 1));
}

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

  // The timeline in view on its own (an artboard's layers, or the page's
  // loose ones): kept until the timeline, the scope or the layers change
  const layersChangedRef = useRef(0);
  const scopedRef = useRef<{
    timeline: EditorState['timeline'];
    scope: string | null;
    layers: number;
    scoped: EditorState['timeline'];
  } | null>(null);
  useEffect(() => {
    const changed = () => {
      layersChangedRef.current++;
    };
    const stops = (['nodeAdded', 'nodeRemoved', 'nodeMoved', 'graphReplaced'] as const).map(
      (type) => sceneGraph.on(type, changed)
    );
    return () => stops.forEach((stop) => stop());
  }, [sceneGraph]);
  const scopedOf = useCallback((timeline: EditorState['timeline'], scope: string | null) => {
    const known = scopedRef.current;
    if (
      known?.timeline === timeline &&
      known.scope === scope &&
      known.layers === layersChangedRef.current
    ) {
      return known.scoped;
    }
    const sg = sceneGraphRef.current;
    const scoped = scopedTimeline(timeline, scope, inTimelineScope(sg, scope));
    scopedRef.current = { timeline, scope, layers: layersChangedRef.current, scoped };
    return scoped;
  }, []);

  // Apply the timeline in view at a frame (the other artboards stay as they are)
  const applyAnimations = useCallback(
    (frame: number) => {
      const sg = sceneGraphRef.current;
      // Before overwriting sequenced objects, keep what the user changed on them
      // (moved, scaled, ...) by shifting their rest poses. Skipped when the
      // sequence itself was replaced (undo, page switch, project load).
      useEditorStore.getState().flushSequenceEdits(sg);
      const { timeline, timelineScope, ikChains, animationSequence } = useEditorStore.getState();
      noteSequenceShown(timeline, frame, animationSequence);
      applyingRef.current = true;
      try {
        // Showing a frame isn't an edit: the project stays saved
        poseScene(() => applyFrame(sg, scopedOf(timeline, timelineScope), ikChains, frame));
      } finally {
        applyingRef.current = false;
      }
    },
    [scopedOf]
  );

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
    // Where playing ends: the timeline in view's keyframes and sounds, and its videos
    const playEnd = (now: EditorState) =>
      getPlayEnd(
        scopedOf(now.timeline, now.timelineScope),
        videoEndInView(sceneGraphRef.current, now.timelineScope, now.frameRate)
      );
    // Initialize work area and play end from store
    ctrl.setWorkArea(state.workAreaEnabled, state.workAreaStart, state.workAreaEnd);
    ctrl.setPlayEnd(playEnd(state));
    controllerRef.current = ctrl;

    const unsub = useEditorStore.subscribe((curr, prev) => {
      if (curr.timelineDuration !== prev.timelineDuration) {
        ctrl.setDuration(Math.max(1, curr.timelineDuration));
      }
      if (
        curr.timeline !== prev.timeline ||
        curr.timelineScope !== prev.timelineScope ||
        curr.frameRate !== prev.frameRate
      ) {
        ctrl.setPlayEnd(playEnd(curr));
      }
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
      // Another timeline in view: its layers at the playhead
      if (
        curr.timeline !== prev.timeline ||
        curr.timelineScope !== prev.timelineScope ||
        (curr.currentFrame !== prev.currentFrame && !ctrl.isPlaying)
      ) {
        applyAnimations(curr.currentFrame);
      }
    });

    // A video's clip is on its layer: moved, trimmed, looped or sped up, or the
    // layer added, removed or moved into another timeline, playing ends elsewhere
    const sg = sceneGraphRef.current;
    const replayEnd = () => ctrl.setPlayEnd(playEnd(useEditorStore.getState()));
    const stops = [
      sg.on('nodeChanged', (event) => {
        if (applyingRef.current || isPosingScene()) return;
        if (sg.getNode(event.nodeId ?? '')?.type === 'video') replayEnd();
      }),
      ...(['nodeAdded', 'nodeRemoved', 'nodeMoved', 'graphReplaced'] as const).map((type) =>
        sg.on(type, replayEnd)
      ),
    ];

    return () => {
      unsub();
      stops.forEach((stop) => stop());
      ctrl.dispose();
      controllerRef.current = null;
    };
  }, [applyAnimations, scopedOf]);

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
