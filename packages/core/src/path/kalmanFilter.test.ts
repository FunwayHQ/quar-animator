import { describe, it, expect } from 'vitest';
import { KalmanFilter1D, KalmanFilter2D, smoothingToKalmanParams } from './kalmanFilter';

// ============================================================================
// KalmanFilter1D
// ============================================================================

describe('KalmanFilter1D', () => {
  it('has initial state position=0, velocity=0', () => {
    const kf = new KalmanFilter1D(1, 1);
    expect(kf.position).toBe(0);
    expect(kf.velocity).toBe(0);
  });

  it('first update initializes position to measurement value', () => {
    const kf = new KalmanFilter1D(1, 1);
    const result = kf.update(42);
    expect(result).toBe(42);
    expect(kf.position).toBe(42);
    expect(kf.velocity).toBe(0);
  });

  it('static input convergence: repeated same measurement converges', () => {
    const kf = new KalmanFilter1D(1, 1);
    const target = 50;
    let lastOutput = 0;

    for (let i = 0; i < 100; i++) {
      kf.predict(1 / 60);
      lastOutput = kf.update(target);
    }

    // After many iterations with constant input, output should be very close
    expect(lastOutput).toBeCloseTo(target, 1);
  });

  it('tracks linear motion (constant velocity input)', () => {
    const kf = new KalmanFilter1D(1, 0.1);
    const dt = 1 / 60;
    const speed = 100; // units per second

    // Feed linearly increasing measurements
    for (let i = 0; i < 120; i++) {
      const measurement = speed * i * dt;
      kf.predict(dt);
      kf.update(measurement);
    }

    // After convergence, velocity estimate should be close to actual speed
    // and position should track the input
    const expectedPos = speed * 120 * dt;
    // Kalman filter has inherent lag; allow up to 5% error
    expect(Math.abs(kf.position - expectedPos)).toBeLessThan(expectedPos * 0.05);
    expect(kf.velocity).toBeGreaterThan(0);
  });

  it('reduces noise: output variance is less than input variance', () => {
    const kf = new KalmanFilter1D(0.1, 10);
    const dt = 1 / 60;
    const trueValue = 100;
    const noiseAmplitude = 20;

    // Seed a deterministic pseudo-random sequence
    const measurements: number[] = [];
    const outputs: number[] = [];

    // Generate noisy measurements using a simple pattern
    for (let i = 0; i < 200; i++) {
      const noise = noiseAmplitude * Math.sin(i * 7.3) * Math.cos(i * 13.1);
      measurements.push(trueValue + noise);
    }

    // Filter them
    for (let i = 0; i < measurements.length; i++) {
      kf.predict(dt);
      outputs.push(kf.update(measurements[i]));
    }

    // Compute variance of last 100 measurements vs last 100 outputs
    const lastN = 100;
    const measureSlice = measurements.slice(-lastN);
    const outputSlice = outputs.slice(-lastN);

    const variance = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      return arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length;
    };

    const inputVar = variance(measureSlice);
    const outputVar = variance(outputSlice);

    // Filtered output should have lower variance than noisy input
    expect(outputVar).toBeLessThan(inputVar);
  });

  it('reset() returns filter to uninitialized state', () => {
    const kf = new KalmanFilter1D(1, 1);

    // Use the filter
    kf.update(100);
    kf.predict(1 / 60);
    kf.update(110);

    expect(kf.position).not.toBe(0);

    // Reset
    kf.reset();
    expect(kf.position).toBe(0);
    expect(kf.velocity).toBe(0);

    // After reset, first update should initialize again
    const result = kf.update(77);
    expect(result).toBe(77);
    expect(kf.position).toBe(77);
    expect(kf.velocity).toBe(0);
  });

  it('predict before any update returns 0 (uninitialized)', () => {
    const kf = new KalmanFilter1D(1, 1);
    const result = kf.predict(1 / 60);
    expect(result).toBe(0);
    expect(kf.position).toBe(0);
    expect(kf.velocity).toBe(0);
  });

  it('variable dt: larger dt produces larger prediction step', () => {
    // Initialize two filters identically
    const kf1 = new KalmanFilter1D(1, 1);
    const kf2 = new KalmanFilter1D(1, 1);

    // Initialize both with same measurements to build velocity
    for (let i = 0; i < 30; i++) {
      kf1.predict(1 / 60);
      kf1.update(i * 2);
      kf2.predict(1 / 60);
      kf2.update(i * 2);
    }

    // Both should be in the same state now
    expect(kf1.position).toBeCloseTo(kf2.position, 10);
    expect(kf1.velocity).toBeCloseTo(kf2.velocity, 10);

    // Predict with different dt values
    const pos1 = kf1.predict(0.01); // small dt
    const pos2 = kf2.predict(0.1); // large dt (10x)

    // With positive velocity, larger dt should produce a further-ahead position
    // Both started from same position with positive velocity
    expect(pos2).toBeGreaterThan(pos1);
  });
});

// ============================================================================
// KalmanFilter2D
// ============================================================================

describe('KalmanFilter2D', () => {
  it('first filter call returns the measurement (initialization)', () => {
    const kf = new KalmanFilter2D(1, 1);
    const result = kf.filter({ x: 100, y: 200 }, 1 / 60);

    // First call: predict does nothing (uninitialized), update initializes
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
  });

  it('tracks circular motion', () => {
    const kf = new KalmanFilter2D(1, 0.1);
    const dt = 1 / 60;
    const radius = 100;
    const angularSpeed = Math.PI; // radians per second

    // Run for several revolutions to let filter converge
    let lastResult = { x: 0, y: 0 };
    const totalFrames = 300;

    for (let i = 0; i < totalFrames; i++) {
      const t = i * dt;
      const angle = angularSpeed * t;
      const measurement = {
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      };
      lastResult = kf.filter(measurement, dt);
    }

    // After convergence, the filtered output should be close to the actual circle
    const finalT = totalFrames * dt;
    const finalAngle = angularSpeed * finalT;
    const expectedX = radius * Math.cos(finalAngle);
    const expectedY = radius * Math.sin(finalAngle);

    // Allow some lag from the filter, but should be in the right ballpark
    const distance = Math.sqrt((lastResult.x - expectedX) ** 2 + (lastResult.y - expectedY) ** 2);
    expect(distance).toBeLessThan(radius * 0.3); // within 30% of radius
  });

  it('X and Y channels are independent', () => {
    const kf = new KalmanFilter2D(1, 1);
    const dt = 1 / 60;

    // Feed constant X, varying Y
    const constantX = 50;
    const results: { x: number; y: number }[] = [];

    for (let i = 0; i < 60; i++) {
      const measurement = { x: constantX, y: i * 5 };
      results.push(kf.filter(measurement, dt));
    }

    // After convergence, X should stay near constantX
    const lastResult = results[results.length - 1];
    expect(lastResult.x).toBeCloseTo(constantX, 0);

    // Y should be tracking the increasing input (not stuck at constantX)
    expect(lastResult.y).toBeGreaterThan(100);
  });

  it('reset resets both X and Y channels', () => {
    const kf = new KalmanFilter2D(1, 1);

    // Use the filter
    kf.filter({ x: 100, y: 200 }, 1 / 60);
    kf.filter({ x: 110, y: 210 }, 1 / 60);

    // Reset
    kf.reset();

    // After reset, first call should initialize to the new measurement
    const result = kf.filter({ x: 5, y: 10 }, 1 / 60);
    expect(result.x).toBe(5);
    expect(result.y).toBe(10);
  });

  it('handles very small dt without blowing up', () => {
    const kf = new KalmanFilter2D(1, 1);
    const tinyDt = 0.0001;

    // Initialize
    kf.filter({ x: 0, y: 0 }, tinyDt);

    // Feed several measurements with tiny dt
    let result = { x: 0, y: 0 };
    for (let i = 0; i < 50; i++) {
      result = kf.filter({ x: 100, y: 100 }, tinyDt);
    }

    // Should produce finite values, moving toward 100
    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(result.x).toBeGreaterThan(0);
    expect(result.y).toBeGreaterThan(0);
  });

  it('handles large dt without blowing up', () => {
    const kf = new KalmanFilter2D(1, 1);
    const largeDt = 1.0; // 1 second

    // Initialize
    kf.filter({ x: 0, y: 0 }, largeDt);

    // Feed measurement with large dt
    const result = kf.filter({ x: 100, y: 200 }, largeDt);

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
  });
});

// ============================================================================
// smoothingToKalmanParams
// ============================================================================

describe('smoothingToKalmanParams', () => {
  it('smoothing=0 → processNoise=100, measurementNoise=0.01', () => {
    const params = smoothingToKalmanParams(0);
    expect(params.processNoise).toBeCloseTo(100, 5);
    expect(params.measurementNoise).toBeCloseTo(0.01, 5);
  });

  it('smoothing=50 → processNoise=1, measurementNoise=1 (crossover)', () => {
    const params = smoothingToKalmanParams(50);
    // 10^(2 - 4*0.5) = 10^0 = 1
    expect(params.processNoise).toBeCloseTo(1, 5);
    // 10^(-2 + 4*0.5) = 10^0 = 1
    expect(params.measurementNoise).toBeCloseTo(1, 5);
  });

  it('smoothing=100 → processNoise=0.01, measurementNoise=100', () => {
    const params = smoothingToKalmanParams(100);
    expect(params.processNoise).toBeCloseTo(0.01, 5);
    expect(params.measurementNoise).toBeCloseTo(100, 5);
  });

  it('clamps negative smoothing to 0', () => {
    const params = smoothingToKalmanParams(-50);
    const paramsZero = smoothingToKalmanParams(0);
    expect(params.processNoise).toBeCloseTo(paramsZero.processNoise, 10);
    expect(params.measurementNoise).toBeCloseTo(paramsZero.measurementNoise, 10);
  });

  it('clamps smoothing > 100 to 100', () => {
    const params = smoothingToKalmanParams(200);
    const params100 = smoothingToKalmanParams(100);
    expect(params.processNoise).toBeCloseTo(params100.processNoise, 10);
    expect(params.measurementNoise).toBeCloseTo(params100.measurementNoise, 10);
  });
});
