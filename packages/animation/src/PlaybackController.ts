/**
 * PlaybackController - Framework-agnostic rAF-based playback engine
 */

export interface PlaybackOptions {
  duration: number;
  frameRate: number;
  looping: boolean;
  onFrameChange?: (frame: number) => void;
  requestFrame?: (cb: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}

export class PlaybackController {
  private _currentFrame: number = 0;
  private _duration: number;
  private _frameRate: number;
  private _looping: boolean;
  private _playing: boolean = false;
  private _lastTimestamp: number = -1;
  private _accumulator: number = 0;
  private _rafId: number = 0;
  private _onFrameChange: ((frame: number) => void) | undefined;
  private _requestFrame: (cb: FrameRequestCallback) => number;
  private _cancelFrame: (id: number) => void;
  private _disposed: boolean = false;

  constructor(options: PlaybackOptions) {
    this._duration = Math.max(1, options.duration);
    this._frameRate = Math.max(1, Math.min(120, options.frameRate));
    this._looping = options.looping;
    this._onFrameChange = options.onFrameChange;
    this._requestFrame = options.requestFrame ?? requestAnimationFrame.bind(window);
    this._cancelFrame = options.cancelFrame ?? cancelAnimationFrame.bind(window);
  }

  get currentFrame(): number {
    return this._currentFrame;
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  get duration(): number {
    return this._duration;
  }

  get frameRate(): number {
    return this._frameRate;
  }

  get looping(): boolean {
    return this._looping;
  }

  play(): void {
    if (this._disposed || this._playing) return;
    this._playing = true;
    this._lastTimestamp = -1;
    this._accumulator = 0;
    this._scheduleFrame();
  }

  pause(): void {
    if (!this._playing) return;
    this._playing = false;
    this._cancelPendingFrame();
  }

  togglePlay(): void {
    if (this._playing) {
      this.pause();
    } else {
      this.play();
    }
  }

  stop(): void {
    this.pause();
    this._setFrame(0);
  }

  goToFrame(frame: number): void {
    this._setFrame(this._clampFrame(frame));
  }

  nextFrame(): void {
    this._setFrame(this._clampFrame(this._currentFrame + 1));
  }

  prevFrame(): void {
    this._setFrame(this._clampFrame(this._currentFrame - 1));
  }

  goToStart(): void {
    this._setFrame(0);
  }

  goToEnd(): void {
    this._setFrame(this._duration - 1);
  }

  setDuration(duration: number): void {
    this._duration = Math.max(1, duration);
    if (this._currentFrame >= this._duration) {
      this._setFrame(this._duration - 1);
    }
  }

  setFrameRate(frameRate: number): void {
    this._frameRate = Math.max(1, Math.min(120, frameRate));
  }

  setLooping(looping: boolean): void {
    this._looping = looping;
  }

  dispose(): void {
    this._disposed = true;
    this._cancelPendingFrame();
    this._playing = false;
  }

  // Internal tick driven by rAF
  private _tick = (timestamp: number): void => {
    if (!this._playing || this._disposed) return;

    if (this._lastTimestamp < 0) {
      this._lastTimestamp = timestamp;
      this._scheduleFrame();
      return;
    }

    const delta = timestamp - this._lastTimestamp;
    this._lastTimestamp = timestamp;
    const msPerFrame = 1000 / this._frameRate;

    this._accumulator += delta;

    while (this._accumulator >= msPerFrame) {
      this._accumulator -= msPerFrame;
      const nextFrame = this._currentFrame + 1;

      if (nextFrame >= this._duration) {
        if (this._looping) {
          this._setFrame(0);
        } else {
          this._setFrame(this._duration - 1);
          this.pause();
          return;
        }
      } else {
        this._setFrame(nextFrame);
      }
    }

    this._scheduleFrame();
  };

  private _scheduleFrame(): void {
    this._rafId = this._requestFrame(this._tick);
  }

  private _cancelPendingFrame(): void {
    if (this._rafId) {
      this._cancelFrame(this._rafId);
      this._rafId = 0;
    }
  }

  private _setFrame(frame: number): void {
    if (frame === this._currentFrame) return;
    this._currentFrame = frame;
    this._onFrameChange?.(frame);
  }

  private _clampFrame(frame: number): number {
    return Math.max(0, Math.min(this._duration - 1, Math.round(frame)));
  }
}
