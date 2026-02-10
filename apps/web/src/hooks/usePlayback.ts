/**
 * usePlayback Hook
 * Manages PlaybackController lifecycle and syncs with editor store
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  PlaybackController,
  evaluateNodeAtFrame,
  applyAnimatedValues,
  getAnimatedNodes,
} from '@quar/animation';
import { useEditorStore } from '../stores/editorStore';
import { useSceneGraph } from '../contexts/SceneGraphContext';

export function usePlayback() {
  const controllerRef = useRef<PlaybackController | null>(null);
  const sceneGraph = useSceneGraph();
  const sceneGraphRef = useRef(sceneGraph);
  sceneGraphRef.current = sceneGraph;

  // Apply animated values from timeline to ALL scene graph nodes (including children in groups)
  const applyAnimations = useCallback((frame: number) => {
    const sg = sceneGraphRef.current;
    const { timeline } = useEditorStore.getState();
    if (!timeline.tracks || timeline.tracks.length === 0) return;
    // Get all unique animated node IDs from timeline tracks
    const animatedNodeIds = getAnimatedNodes(timeline);
    for (const nodeId of animatedNodeIds) {
      const node = sg.getNode(nodeId);
      if (!node) continue;
      const values = evaluateNodeAtFrame(timeline, nodeId, frame);
      if (values.size > 0) {
        const updated = applyAnimatedValues(node, values);
        if (updated !== node) {
          sg.updateNode(nodeId, updated);
        }
      }
    }
  }, []);

  // Create controller + subscribe in one effect for StrictMode compatibility
  useEffect(() => {
    const state = useEditorStore.getState();
    const ctrl = new PlaybackController({
      duration: state.timelineDuration,
      frameRate: state.frameRate,
      looping: state.isLooping,
      onFrameChange: (frame: number) => {
        useEditorStore.getState().setCurrentFrame(frame);
        // Apply animations directly from the playback callback (single evaluation)
        applyAnimations(frame);
      },
    });
    // Initialize work area from store
    ctrl.setWorkArea(state.workAreaEnabled, state.workAreaStart, state.workAreaEnd);
    controllerRef.current = ctrl;

    const unsub = useEditorStore.subscribe((curr, prev) => {
      if (curr.timelineDuration !== prev.timelineDuration) {
        ctrl.setDuration(curr.timelineDuration);
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
      // Apply animations for manual frame changes (scrubbing, stepping)
      // Only when NOT playing — playback applies via onFrameChange above
      if (curr.currentFrame !== prev.currentFrame && !ctrl.isPlaying) {
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
