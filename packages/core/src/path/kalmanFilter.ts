/**
 * Kalman Filter for pointer input stabilization.
 *
 * Two independent 1D Kalman filters (X/Y) with a constant-velocity model.
 * State: [position, velocity], measurement: position only.
 */

import type { Vector2 } from '@quar/types';

// ============================================================================
// 1D Kalman Filter
// ============================================================================

/**
 * 1D Kalman filter with constant-velocity state model.
 * State vector: [position, velocity]
 */
export class KalmanFilter1D {
  private x: number = 0; // position
  private v: number = 0; // velocity
  private pXX: number = 1; // covariance pos-pos
  private pXV: number = 0; // covariance pos-vel
  private pVV: number = 1; // covariance vel-vel
  private readonly q: number; // process noise
  private readonly r: number; // measurement noise
  private initialized = false;

  constructor(processNoise: number, measurementNoise: number) {
    this.q = processNoise;
    this.r = measurementNoise;
  }

  /**
   * Prediction step: advance state by dt.
   * x' = x + v*dt
   * P' = F*P*F^T + Q
   */
  predict(dt: number): number {
    if (!this.initialized) return this.x;

    // State prediction
    this.x += this.v * dt;

    // Covariance prediction
    // F = [[1, dt], [0, 1]]
    // P' = F*P*F^T + Q*dt
    const qDt = this.q * dt;
    this.pXX += 2 * dt * this.pXV + dt * dt * this.pVV + qDt;
    this.pXV += dt * this.pVV;
    this.pVV += qDt;

    return this.x;
  }

  /**
   * Update step: incorporate a measurement.
   * Returns the filtered position.
   */
  update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.v = 0;
      this.pXX = 1;
      this.pXV = 0;
      this.pVV = 1;
      this.initialized = true;
      return this.x;
    }

    // Innovation (measurement residual)
    const y = measurement - this.x;

    // Innovation covariance: S = H*P*H^T + R = pXX + R
    const s = this.pXX + this.r;

    if (Math.abs(s) < 1e-12) return this.x;

    // Kalman gain: K = P*H^T / S = [pXX/s, pXV/s]
    const kX = this.pXX / s;
    const kV = this.pXV / s;

    // State update
    this.x += kX * y;
    this.v += kV * y;

    // Covariance update: P = (I - K*H)*P
    const newPXX = this.pXX - kX * this.pXX;
    const newPXV = this.pXV - kX * this.pXV;
    const newPVV = this.pVV - kV * this.pXV;

    this.pXX = newPXX;
    this.pXV = newPXV;
    this.pVV = newPVV;

    return this.x;
  }

  /**
   * Reset the filter state.
   */
  reset(): void {
    this.x = 0;
    this.v = 0;
    this.pXX = 1;
    this.pXV = 0;
    this.pVV = 1;
    this.initialized = false;
  }

  /** Current estimated position */
  get position(): number {
    return this.x;
  }

  /** Current estimated velocity */
  get velocity(): number {
    return this.v;
  }
}

// ============================================================================
// 2D Kalman Filter
// ============================================================================

/**
 * 2D Kalman filter — two independent 1D filters for X and Y channels.
 */
export class KalmanFilter2D {
  private filterX: KalmanFilter1D;
  private filterY: KalmanFilter1D;

  constructor(processNoise: number, measurementNoise: number) {
    this.filterX = new KalmanFilter1D(processNoise, measurementNoise);
    this.filterY = new KalmanFilter1D(processNoise, measurementNoise);
  }

  /**
   * Filter a 2D measurement.
   * @param measurement The raw input position
   * @param dt Time delta since last measurement (seconds)
   * @returns Filtered position
   */
  filter(measurement: Vector2, dt: number): Vector2 {
    this.filterX.predict(dt);
    this.filterY.predict(dt);

    return {
      x: this.filterX.update(measurement.x),
      y: this.filterY.update(measurement.y),
    };
  }

  /**
   * Reset both channels.
   */
  reset(): void {
    this.filterX.reset();
    this.filterY.reset();
  }
}

// ============================================================================
// Smoothing → Noise Mapping
// ============================================================================

/**
 * Map a smoothing value (0-100) to Kalman filter noise parameters.
 *
 * smoothing=0  → high process noise, low measurement noise → raw/responsive
 * smoothing=100 → low process noise, high measurement noise → very smooth
 */
export function smoothingToKalmanParams(smoothing: number): {
  processNoise: number;
  measurementNoise: number;
} {
  const s = Math.max(0, Math.min(100, smoothing)) / 100;
  return {
    processNoise: Math.pow(10, 2 - 4 * s),
    measurementNoise: Math.pow(10, -2 + 4 * s),
  };
}
