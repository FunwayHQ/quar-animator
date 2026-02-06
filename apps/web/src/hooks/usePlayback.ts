/**
 * usePlayback Hook
 * Manages PlaybackController lifecycle and syncs with editor store
 */

import { useEffect, useRef, useCallback } from 'react';
import { PlaybackController } from '@quar/animation';
import { useEditorStore } from '../stores/editorStore';

export function usePlayback() {
  const controllerRef = useRef<PlaybackController | null>(null);

  // Use refs for store values to avoid recreating controller on every change
  const storeRef = useRef(useEditorStore.getState());
  useEffect(() => {
    return useEditorStore.subscribe((state) => {
      storeRef.current = state;
    });
  }, []);

  // Create controller once
  if (!controllerRef.current) {
    const state = useEditorStore.getState();
    controllerRef.current = new PlaybackController({
      duration: state.timelineDuration,
      frameRate: state.frameRate,
      looping: state.isLooping,
      onFrameChange: (frame: number) => {
        useEditorStore.getState().setCurrentFrame(frame);
      },
    });
  }

  // Sync store changes → controller
  useEffect(() => {
    return useEditorStore.subscribe((state, prevState) => {
      const ctrl = controllerRef.current;
      if (!ctrl) return;

      if (state.timelineDuration !== prevState.timelineDuration) {
        ctrl.setDuration(state.timelineDuration);
      }
      if (state.frameRate !== prevState.frameRate) {
        ctrl.setFrameRate(state.frameRate);
      }
      if (state.isLooping !== prevState.isLooping) {
        ctrl.setLooping(state.isLooping);
      }
    });
  }, []);

  // Dispose on unmount
  useEffect(() => {
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

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
