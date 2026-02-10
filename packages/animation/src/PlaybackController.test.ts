/**
 * Tests for PlaybackController
 */

import { describe, it, expect, vi } from 'vitest';
import { PlaybackController } from './PlaybackController';
import type { PlaybackOptions } from './PlaybackController';

// ============================================================================
// Helpers
// ============================================================================

function createFakeTimer() {
  let nextId = 1;
  let callback: FrameRequestCallback | null = null;
  let currentId = 0;

  return {
    requestFrame: (cb: FrameRequestCallback): number => {
      callback = cb;
      currentId = nextId++;
      return currentId;
    },
    cancelFrame: vi.fn((id: number) => {
      if (id === currentId) {
        callback = null;
      }
    }),
    tick: (timestamp: number) => {
      const cb = callback;
      callback = null;
      cb?.(timestamp);
    },
    get pending(): boolean {
      return callback !== null;
    },
  };
}

function createController(overrides: Partial<PlaybackOptions> = {}, timer = createFakeTimer()) {
  const onFrameChange = vi.fn();
  const controller = new PlaybackController({
    duration: 300,
    frameRate: 30,
    looping: false,
    onFrameChange,
    requestFrame: timer.requestFrame,
    cancelFrame: timer.cancelFrame,
    ...overrides,
  });
  return { controller, timer, onFrameChange };
}

// ============================================================================
// Constructor & Defaults
// ============================================================================

describe('PlaybackController constructor', () => {
  it('should initialize with default state', () => {
    const { controller } = createController();
    expect(controller.currentFrame).toBe(0);
    expect(controller.isPlaying).toBe(false);
    expect(controller.duration).toBe(300);
    expect(controller.frameRate).toBe(30);
    expect(controller.looping).toBe(false);
  });

  it('should clamp frameRate to min 1', () => {
    const { controller } = createController({ frameRate: 0 });
    expect(controller.frameRate).toBe(1);
  });

  it('should clamp frameRate to max 120', () => {
    const { controller } = createController({ frameRate: 200 });
    expect(controller.frameRate).toBe(120);
  });

  it('should clamp duration to min 1', () => {
    const { controller } = createController({ duration: 0 });
    expect(controller.duration).toBe(1);
  });
});

// ============================================================================
// Play / Pause / Toggle / Stop
// ============================================================================

describe('play/pause/toggle/stop', () => {
  it('play() should set isPlaying to true', () => {
    const { controller } = createController();
    controller.play();
    expect(controller.isPlaying).toBe(true);
  });

  it('pause() should set isPlaying to false', () => {
    const { controller } = createController();
    controller.play();
    controller.pause();
    expect(controller.isPlaying).toBe(false);
  });

  it('togglePlay() should toggle playing state', () => {
    const { controller } = createController();
    controller.togglePlay();
    expect(controller.isPlaying).toBe(true);
    controller.togglePlay();
    expect(controller.isPlaying).toBe(false);
  });

  it('stop() should pause and go to frame 0', () => {
    const { controller, timer } = createController();
    controller.play();
    // Advance a few frames
    timer.tick(0);
    timer.tick(100); // 3 frames at 30fps (33.3ms/frame)
    expect(controller.currentFrame).toBeGreaterThan(0);
    controller.stop();
    expect(controller.isPlaying).toBe(false);
    expect(controller.currentFrame).toBe(0);
  });

  it('play() should be idempotent when already playing', () => {
    const { controller, timer } = createController();
    controller.play();
    controller.play(); // Should not restart
    expect(controller.isPlaying).toBe(true);
    expect(timer.pending).toBe(true);
  });

  it('pause() should be idempotent when already paused', () => {
    const { controller } = createController();
    controller.pause(); // Already paused
    expect(controller.isPlaying).toBe(false);
  });
});

// ============================================================================
// Frame Navigation
// ============================================================================

describe('frame navigation', () => {
  it('goToFrame() should set the current frame', () => {
    const { controller, onFrameChange } = createController();
    controller.goToFrame(50);
    expect(controller.currentFrame).toBe(50);
    expect(onFrameChange).toHaveBeenCalledWith(50);
  });

  it('goToFrame() should clamp to valid range', () => {
    const { controller } = createController();
    controller.goToFrame(-10);
    expect(controller.currentFrame).toBe(0);
    controller.goToFrame(500);
    expect(controller.currentFrame).toBe(299); // duration - 1
  });

  it('goToFrame() should round fractional frames', () => {
    const { controller } = createController();
    controller.goToFrame(10.7);
    expect(controller.currentFrame).toBe(11);
  });

  it('nextFrame() should advance by 1', () => {
    const { controller } = createController();
    controller.nextFrame();
    expect(controller.currentFrame).toBe(1);
  });

  it('nextFrame() should clamp at end', () => {
    const { controller } = createController({ duration: 5 });
    controller.goToFrame(4);
    controller.nextFrame();
    expect(controller.currentFrame).toBe(4); // duration - 1
  });

  it('prevFrame() should go back by 1', () => {
    const { controller } = createController();
    controller.goToFrame(10);
    controller.prevFrame();
    expect(controller.currentFrame).toBe(9);
  });

  it('prevFrame() should clamp at 0', () => {
    const { controller } = createController();
    controller.prevFrame();
    expect(controller.currentFrame).toBe(0);
  });

  it('goToStart() should set frame to 0', () => {
    const { controller } = createController();
    controller.goToFrame(100);
    controller.goToStart();
    expect(controller.currentFrame).toBe(0);
  });

  it('goToEnd() should set frame to duration - 1', () => {
    const { controller } = createController();
    controller.goToEnd();
    expect(controller.currentFrame).toBe(299);
  });
});

// ============================================================================
// Playback Advancement (rAF simulation)
// ============================================================================

describe('playback advancement', () => {
  it('should advance frames based on elapsed time', () => {
    const { controller, timer } = createController({ frameRate: 30 });
    controller.play();
    timer.tick(0); // First tick initializes timestamp
    timer.tick(33.34); // ~1 frame at 30fps
    expect(controller.currentFrame).toBe(1);
  });

  it('should advance multiple frames for large time gaps', () => {
    const { controller, timer } = createController({ frameRate: 30 });
    controller.play();
    timer.tick(0);
    timer.tick(100); // 100ms / 33.3ms = ~3 frames, but accumulator yields 2 complete frames
    expect(controller.currentFrame).toBeGreaterThanOrEqual(2);
  });

  it('should pause at last frame when not looping', () => {
    const { controller, timer } = createController({
      duration: 5,
      frameRate: 30,
      looping: false,
    });
    controller.play();
    timer.tick(0);
    // Advance enough to reach the end (5 frames * 33.3ms = 166.5ms)
    timer.tick(200);
    expect(controller.currentFrame).toBe(4); // duration - 1
    expect(controller.isPlaying).toBe(false);
  });

  it('should loop to frame 0 when looping is enabled', () => {
    const { controller, timer } = createController({
      duration: 5,
      frameRate: 30,
      looping: true,
    });
    controller.play();
    timer.tick(0);
    // Advance past end (5 frames at 33.3ms = 166.5ms)
    timer.tick(200);
    // Should have wrapped around
    expect(controller.currentFrame).toBeLessThan(5);
    expect(controller.isPlaying).toBe(true);
  });

  it('should call onFrameChange on frame advancement', () => {
    const { controller, timer, onFrameChange } = createController({ frameRate: 30 });
    controller.play();
    timer.tick(0);
    timer.tick(33.34);
    expect(onFrameChange).toHaveBeenCalledWith(1);
  });
});

// ============================================================================
// Duration / Frame Rate / Looping Setters
// ============================================================================

describe('setters', () => {
  it('setDuration() should update duration', () => {
    const { controller } = createController();
    controller.setDuration(600);
    expect(controller.duration).toBe(600);
  });

  it('setDuration() should clamp current frame if beyond new duration', () => {
    const { controller } = createController();
    controller.goToFrame(200);
    controller.setDuration(100);
    expect(controller.currentFrame).toBe(99);
  });

  it('setDuration() should enforce minimum of 1', () => {
    const { controller } = createController();
    controller.setDuration(0);
    expect(controller.duration).toBe(1);
  });

  it('setFrameRate() should update frame rate', () => {
    const { controller } = createController();
    controller.setFrameRate(60);
    expect(controller.frameRate).toBe(60);
  });

  it('setFrameRate() should clamp to 1-120', () => {
    const { controller } = createController();
    controller.setFrameRate(0);
    expect(controller.frameRate).toBe(1);
    controller.setFrameRate(200);
    expect(controller.frameRate).toBe(120);
  });

  it('setLooping() should update looping flag', () => {
    const { controller } = createController();
    controller.setLooping(true);
    expect(controller.looping).toBe(true);
    controller.setLooping(false);
    expect(controller.looping).toBe(false);
  });
});

// ============================================================================
// Dispose
// ============================================================================

// ============================================================================
// Work Area
// ============================================================================

describe('work area', () => {
  it('should be disabled by default with start=0', () => {
    const { controller } = createController();
    expect(controller.workAreaEnabled).toBe(false);
    expect(controller.workAreaStart).toBe(0);
    expect(controller.workAreaEnd).toBe(299); // duration - 1
  });

  it('setWorkArea() should enable and set bounds', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 50, 150);
    expect(controller.workAreaEnabled).toBe(true);
    expect(controller.workAreaStart).toBe(50);
    expect(controller.workAreaEnd).toBe(150);
  });

  it('setWorkArea() should enforce start < end', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 100, 50);
    // start should be clamped to end - 1
    expect(controller.workAreaStart).toBe(49);
    expect(controller.workAreaEnd).toBe(50);
  });

  it('setWorkAreaStart/End should update individually', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 10, 200);
    controller.setWorkAreaStart(30);
    expect(controller.workAreaStart).toBe(30);
    controller.setWorkAreaEnd(250);
    expect(controller.workAreaEnd).toBe(250);
  });

  it('playback should stop at workAreaEnd (non-looping)', () => {
    const { controller, timer } = createController({
      duration: 300,
      frameRate: 30,
      looping: false,
    });
    controller.setWorkArea(true, 0, 3);
    controller.play();
    timer.tick(0);
    // Advance enough to reach end (3 frames at 33.3ms = ~100ms)
    timer.tick(150);
    expect(controller.currentFrame).toBe(3);
    expect(controller.isPlaying).toBe(false);
  });

  it('playback should loop to workAreaStart (looping)', () => {
    const { controller, timer } = createController({
      duration: 300,
      frameRate: 30,
      looping: true,
    });
    controller.setWorkArea(true, 10, 13);
    controller.goToFrame(10);
    controller.play();
    timer.tick(0);
    // Advance past end (4 frames * 33.3ms = 133ms, but one to init)
    timer.tick(200);
    expect(controller.currentFrame).toBeGreaterThanOrEqual(10);
    expect(controller.currentFrame).toBeLessThanOrEqual(13);
    expect(controller.isPlaying).toBe(true);
  });

  it('goToStart() should go to workAreaStart when enabled', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 50, 200);
    controller.goToFrame(100);
    controller.goToStart();
    expect(controller.currentFrame).toBe(50);
  });

  it('goToEnd() should go to workAreaEnd when enabled', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 50, 200);
    controller.goToEnd();
    expect(controller.currentFrame).toBe(200);
  });

  it('stop() should go to workAreaStart when enabled', () => {
    const { controller, timer } = createController();
    controller.setWorkArea(true, 20, 100);
    controller.play();
    timer.tick(0);
    timer.tick(100);
    controller.stop();
    expect(controller.isPlaying).toBe(false);
    expect(controller.currentFrame).toBe(20);
  });

  it('nextFrame() should clamp at workAreaEnd', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 0, 5);
    controller.goToFrame(5);
    controller.nextFrame();
    expect(controller.currentFrame).toBe(5);
  });

  it('prevFrame() should clamp at workAreaStart', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 10, 50);
    controller.goToFrame(10);
    controller.prevFrame();
    expect(controller.currentFrame).toBe(10);
  });

  it('goToFrame() should be unrestricted (can seek outside work area)', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 50, 200);
    controller.goToFrame(10);
    expect(controller.currentFrame).toBe(10);
    controller.goToFrame(250);
    expect(controller.currentFrame).toBe(250);
  });

  it('play() should auto-rewind from workAreaEnd', () => {
    const { controller } = createController({ looping: false });
    controller.setWorkArea(true, 50, 100);
    controller.goToFrame(100);
    controller.play();
    // Should have rewound to 50
    expect(controller.currentFrame).toBe(50);
    expect(controller.isPlaying).toBe(true);
  });

  it('disabling work area should restore full range behavior', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 50, 100);
    controller.setWorkAreaEnabled(false);
    controller.goToStart();
    expect(controller.currentFrame).toBe(0);
    controller.goToEnd();
    expect(controller.currentFrame).toBe(299);
  });

  it('setDuration() should shrink work area if needed', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 100, 250);
    controller.setDuration(150);
    expect(controller.workAreaEnd).toBe(149); // clamped to duration - 1
    expect(controller.workAreaStart).toBe(100); // still valid
  });

  it('setDuration() should shrink both start and end if needed', () => {
    const { controller } = createController();
    controller.setWorkArea(true, 200, 250);
    controller.setDuration(50);
    expect(controller.workAreaEnd).toBe(49);
    expect(controller.workAreaStart).toBeLessThan(49);
  });
});

// ============================================================================
// Dispose
// ============================================================================

describe('dispose', () => {
  it('should cancel pending frame on dispose', () => {
    const { controller, timer } = createController();
    controller.play();
    controller.dispose();
    expect(timer.cancelFrame).toHaveBeenCalled();
    expect(controller.isPlaying).toBe(false);
  });

  it('should prevent play after dispose', () => {
    const { controller } = createController();
    controller.dispose();
    controller.play();
    expect(controller.isPlaying).toBe(false);
  });

  it('should stop ticking after dispose', () => {
    const { controller, timer, onFrameChange } = createController();
    controller.play();
    timer.tick(0);
    controller.dispose();
    onFrameChange.mockClear();
    // Try to tick after dispose - should do nothing
    timer.tick(100);
    expect(onFrameChange).not.toHaveBeenCalled();
  });
});
