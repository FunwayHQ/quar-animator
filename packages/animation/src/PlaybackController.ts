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

  // Work area (loop region)
  private _workAreaEnabled: boolean = false;
  private _workAreaStart: number = 0;
  private _workAreaEnd: number = -1; // -1 = use duration - 1

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

  get workAreaEnabled(): boolean {
    return this._workAreaEnabled;
  }

  get workAreaStart(): number {
    return this._workAreaStart;
  }

  get workAreaEnd(): number {
    return this._workAreaEnd < 0 ? this._duration - 1 : this._workAreaEnd;
  }

  private get _effectiveStart(): number {
    return this._workAreaEnabled ? this._workAreaStart : 0;
  }

  private get _effectiveEnd(): number {
    if (!this._workAreaEnabled) return this._duration - 1;
    const end = this._workAreaEnd < 0 ? this._duration - 1 : this._workAreaEnd;
    return Math.min(end, this._duration - 1);
  }

  setWorkArea(enabled: boolean, start?: number, end?: number): void {
    this._workAreaEnabled = enabled;
    if (start !== undefined) this._workAreaStart = Math.max(0, Math.round(start));
    if (end !== undefined) this._workAreaEnd = Math.max(0, Math.round(end));
    // Enforce start < end
    if (this._workAreaEnd >= 0 && this._workAreaStart >= this._workAreaEnd) {
      this._workAreaStart = Math.max(0, this._workAreaEnd - 1);
    }
  }

  setWorkAreaEnabled(enabled: boolean): void {
    this._workAreaEnabled = enabled;
  }

  setWorkAreaStart(start: number): void {
    this._workAreaStart = Math.max(0, Math.round(start));
    if (this._workAreaEnd >= 0 && this._workAreaStart >= this._workAreaEnd) {
      this._workAreaStart = Math.max(0, this._workAreaEnd - 1);
    }
  }

  setWorkAreaEnd(end: number): void {
    this._workAreaEnd = Math.max(0, Math.round(end));
    if (this._workAreaEnd <= this._workAreaStart) {
      this._workAreaEnd = this._workAreaStart + 1;
    }
  }

  play(): void {
    if (this._disposed || this._playing) return;
    // Auto-rewind to effective start if at the effective end
    if (!this._looping && this._currentFrame >= this._effectiveEnd) {
      this._setFrame(this._effectiveStart);
    }
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
    this._setFrame(this._effectiveStart);
  }

  goToFrame(frame: number): void {
    this._setFrame(this._clampFrame(frame));
  }

  nextFrame(): void {
    const next = this._currentFrame + 1;
    const max = this._effectiveEnd;
    this._setFrame(Math.min(this._clampFrame(next), max));
  }

  prevFrame(): void {
    const prev = this._currentFrame - 1;
    const min = this._effectiveStart;
    this._setFrame(Math.max(this._clampFrame(prev), min));
  }

  goToStart(): void {
    this._setFrame(this._effectiveStart);
  }

  goToEnd(): void {
    this._setFrame(this._effectiveEnd);
  }

  setDuration(duration: number): void {
    this._duration = Math.max(1, duration);
    // Shrink work area bounds if they exceed new duration
    if (this._workAreaEnd >= 0 && this._workAreaEnd >= this._duration) {
      this._workAreaEnd = this._duration - 1;
    }
    if (this._workAreaStart >= this._duration) {
      this._workAreaStart = Math.max(0, this._duration - 2);
    }
    if (this._workAreaEnd >= 0 && this._workAreaStart >= this._workAreaEnd) {
      this._workAreaStart = Math.max(0, this._workAreaEnd - 1);
    }
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

    // Limit iterations to prevent frame-catching burst after tab backgrounding
    const MAX_CATCHUP_FRAMES = 10;
    let iterations = 0;

    const effectiveEnd = this._effectiveEnd;
    const effectiveStart = this._effectiveStart;

    while (this._accumulator >= msPerFrame && iterations < MAX_CATCHUP_FRAMES) {
      iterations++;
      this._accumulator -= msPerFrame;
      const nextFrame = this._currentFrame + 1;

      if (nextFrame > effectiveEnd) {
        if (this._looping) {
          this._setFrame(effectiveStart);
        } else {
          this._setFrame(effectiveEnd);
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
