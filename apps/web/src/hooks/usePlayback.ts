/**
 * usePlayback Hook
 * Manages PlaybackController lifecycle and syncs with editor store
 */

import { useEffect, useRef, useCallback } from 'react';
import { PlaybackController, evaluateNodeAtFrame, applyAnimatedValues } from '@quar/animation';
import { useEditorStore } from '../stores/editorStore';
import { useSceneGraph } from '../contexts/SceneGraphContext';

export function usePlayback() {
  const controllerRef = useRef<PlaybackController | null>(null);
  const sceneGraph = useSceneGraph();
  const sceneGraphRef = useRef(sceneGraph);
  sceneGraphRef.current = sceneGraph;

  // Apply animated values from timeline to scene graph nodes
  const applyAnimations = useCallback((frame: number) => {
    const sg = sceneGraphRef.current;
    const { timeline } = useEditorStore.getState();
    if (!timeline.tracks || timeline.tracks.length === 0) return;
    const rootNodes = sg.getRootNodes();
    for (const node of rootNodes) {
      const values = evaluateNodeAtFrame(timeline, node.id, frame);
      if (values.size > 0) {
        const updated = applyAnimatedValues(node, values);
        if (updated !== node) {
          sg.updateNode(node.id, updated);
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
      },
    });
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
      if (curr.currentFrame !== prev.currentFrame) {
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
    controllerRef.current?.stop();
    useEditorStore.getState().setIsPlaying(false);
    useEditorStore.getState().setCurrentFrame(0);
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
