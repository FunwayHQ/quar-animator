import { describe, it, expect } from 'vitest';
import { vec2, mat3, rect, clamp, lerp, inverseLerp, degToRad, radToDeg, EPSILON } from './math';

describe('vec2', () => {
  describe('create', () => {
    it('creates vector with default values', () => {
      const v = vec2.create();
      expect(v).toEqual({ x: 0, y: 0 });
    });

    it('creates vector with specified values', () => {
      const v = vec2.create(3, 4);
      expect(v).toEqual({ x: 3, y: 4 });
    });
  });

  describe('clone', () => {
    it('creates independent copy', () => {
      const v1 = { x: 1, y: 2 };
      const v2 = vec2.clone(v1);
      v2.x = 10;
      expect(v1.x).toBe(1);
      expect(v2.x).toBe(10);
    });
  });

  describe('add', () => {
    it('adds two vectors', () => {
      const result = vec2.add({ x: 1, y: 2 }, { x: 3, y: 4 });
      expect(result).toEqual({ x: 4, y: 6 });
    });
  });

  describe('subtract', () => {
    it('subtracts two vectors', () => {
      const result = vec2.subtract({ x: 5, y: 7 }, { x: 2, y: 3 });
      expect(result).toEqual({ x: 3, y: 4 });
    });
  });

  describe('multiply', () => {
    it('multiplies vector by scalar', () => {
      const result = vec2.multiply({ x: 2, y: 3 }, 4);
      expect(result).toEqual({ x: 8, y: 12 });
    });
  });

  describe('divide', () => {
    it('divides vector by scalar', () => {
      const result = vec2.divide({ x: 10, y: 20 }, 2);
      expect(result).toEqual({ x: 5, y: 10 });
    });
  });

  describe('dot', () => {
    it('calculates dot product', () => {
      const result = vec2.dot({ x: 2, y: 3 }, { x: 4, y: 5 });
      expect(result).toBe(23); // 2*4 + 3*5
    });
  });

  describe('cross', () => {
    it('calculates cross product (2D)', () => {
      const result = vec2.cross({ x: 2, y: 3 }, { x: 4, y: 5 });
      expect(result).toBe(-2); // 2*5 - 3*4
    });
  });

  describe('length', () => {
    it('calculates vector length', () => {
      const result = vec2.length({ x: 3, y: 4 });
      expect(result).toBe(5);
    });
  });

  describe('normalize', () => {
    it('normalizes vector to unit length', () => {
      const result = vec2.normalize({ x: 3, y: 4 });
      expect(result.x).toBeCloseTo(0.6);
      expect(result.y).toBeCloseTo(0.8);
    });

    it('returns zero vector for zero input', () => {
      const result = vec2.normalize({ x: 0, y: 0 });
      expect(result).toEqual({ x: 0, y: 0 });
    });
  });

  describe('distance', () => {
    it('calculates distance between points', () => {
      const result = vec2.distance({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(result).toBe(5);
    });
  });

  describe('lerp', () => {
    it('interpolates between vectors', () => {
      const result = vec2.lerp({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5);
      expect(result).toEqual({ x: 5, y: 10 });
    });
  });

  describe('rotate', () => {
    it('rotates vector by angle', () => {
      const result = vec2.rotate({ x: 1, y: 0 }, Math.PI / 2);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(1);
    });
  });

  describe('angle', () => {
    it('returns angle of vector', () => {
      expect(vec2.angle({ x: 1, y: 0 })).toBeCloseTo(0);
      expect(vec2.angle({ x: 0, y: 1 })).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('equals', () => {
    it('compares vectors within epsilon', () => {
      expect(vec2.equals({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
      expect(vec2.equals({ x: 1, y: 2 }, { x: 1.0001, y: 2 })).toBe(true);
      expect(vec2.equals({ x: 1, y: 2 }, { x: 2, y: 2 })).toBe(false);
    });
  });
});

describe('mat3', () => {
  describe('identity', () => {
    it('creates identity matrix', () => {
      const m = mat3.identity();
      expect(m).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
    });
  });

  describe('multiply', () => {
    it('multiplies two matrices', () => {
      const a = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 };
      const b = mat3.identity();
      const result = mat3.multiply(a, b);
      expect(result).toEqual(a);
    });

    it('applies transformations correctly', () => {
      const scale = { a: 2, b: 0, c: 0, d: 2, tx: 0, ty: 0 };
      const translate = { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 };
      const result = mat3.multiply(scale, translate);
      expect(result.tx).toBe(20); // 10 * 2
      expect(result.ty).toBe(40); // 20 * 2
    });
  });

  describe('translate', () => {
    it('translates matrix', () => {
      const m = mat3.translate(mat3.identity(), 5, 10);
      expect(m.tx).toBe(5);
      expect(m.ty).toBe(10);
    });
  });

  describe('scale', () => {
    it('scales matrix', () => {
      const m = mat3.scale(mat3.identity(), 2, 3);
      expect(m.a).toBe(2);
      expect(m.d).toBe(3);
    });
  });

  describe('rotate', () => {
    it('rotates matrix', () => {
      const m = mat3.rotate(mat3.identity(), Math.PI / 2);
      expect(m.a).toBeCloseTo(0);
      expect(m.b).toBeCloseTo(1);
      expect(m.c).toBeCloseTo(-1);
      expect(m.d).toBeCloseTo(0);
    });
  });

  describe('invert', () => {
    it('inverts matrix', () => {
      const m = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 };
      const inv = mat3.invert(m);
      expect(inv).not.toBeNull();
      if (inv) {
        expect(inv.a).toBeCloseTo(0.5);
        expect(inv.d).toBeCloseTo(0.5);
        expect(inv.tx).toBeCloseTo(-5);
        expect(inv.ty).toBeCloseTo(-10);
      }
    });

    it('returns null for singular matrix', () => {
      const m = { a: 0, b: 0, c: 0, d: 0, tx: 0, ty: 0 };
      expect(mat3.invert(m)).toBeNull();
    });
  });

  describe('transformPoint', () => {
    it('transforms point by matrix', () => {
      const m = { a: 2, b: 0, c: 0, d: 2, tx: 10, ty: 20 };
      const result = mat3.transformPoint(m, { x: 5, y: 5 });
      expect(result).toEqual({ x: 20, y: 30 }); // 5*2+10, 5*2+20
    });
  });

  describe('toFloat32Array', () => {
    it('converts to column-major Float32Array', () => {
      const m = mat3.identity();
      const arr = mat3.toFloat32Array(m);
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(9);
      expect(arr[0]).toBe(1); // a
      expect(arr[4]).toBe(1); // d
      expect(arr[8]).toBe(1); // 1 for homogeneous
    });
  });
});

describe('rect', () => {
  describe('create', () => {
    it('creates rect with default values', () => {
      const r = rect.create();
      expect(r).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it('creates rect with specified values', () => {
      const r = rect.create(10, 20, 100, 50);
      expect(r).toEqual({ x: 10, y: 20, width: 100, height: 50 });
    });
  });

  describe('fromPoints', () => {
    it('creates rect from two corner points', () => {
      const r = rect.fromPoints({ x: 10, y: 20 }, { x: 50, y: 70 });
      expect(r).toEqual({ x: 10, y: 20, width: 40, height: 50 });
    });

    it('handles reversed points', () => {
      const r = rect.fromPoints({ x: 50, y: 70 }, { x: 10, y: 20 });
      expect(r).toEqual({ x: 10, y: 20, width: 40, height: 50 });
    });
  });

  describe('contains', () => {
    it('returns true for point inside rect', () => {
      const r = rect.create(0, 0, 100, 100);
      expect(rect.contains(r, { x: 50, y: 50 })).toBe(true);
    });

    it('returns false for point outside rect', () => {
      const r = rect.create(0, 0, 100, 100);
      expect(rect.contains(r, { x: 150, y: 50 })).toBe(false);
    });
  });

  describe('intersects', () => {
    it('returns true for overlapping rects', () => {
      const r1 = rect.create(0, 0, 100, 100);
      const r2 = rect.create(50, 50, 100, 100);
      expect(rect.intersects(r1, r2)).toBe(true);
    });

    it('returns false for non-overlapping rects', () => {
      const r1 = rect.create(0, 0, 100, 100);
      const r2 = rect.create(200, 200, 100, 100);
      expect(rect.intersects(r1, r2)).toBe(false);
    });
  });

  describe('center', () => {
    it('returns center point', () => {
      const r = rect.create(0, 0, 100, 50);
      expect(rect.center(r)).toEqual({ x: 50, y: 25 });
    });
  });
});

// ============================================================================
// X1-1: EPSILON and division-by-zero guard tests
// ============================================================================

describe('EPSILON constant', () => {
  it('should be exported and positive', () => {
    expect(EPSILON).toBeDefined();
    expect(EPSILON).toBeGreaterThan(0);
    expect(EPSILON).toBe(1e-10);
  });
});

describe('vec2 division-by-zero guards', () => {
  it('throws on divide by zero', () => {
    expect(() => vec2.divide({ x: 10, y: 20 }, 0)).toThrow('Division by zero');
  });

  it('throws on divide by near-zero value', () => {
    expect(() => vec2.divide({ x: 10, y: 20 }, 1e-12)).toThrow('Division by zero');
  });

  it('allows divide by small but non-zero value', () => {
    const result = vec2.divide({ x: 10, y: 20 }, 0.001);
    expect(result.x).toBeCloseTo(10000);
    expect(result.y).toBeCloseTo(20000);
  });

  it('normalize returns zero for near-zero vector', () => {
    const result = vec2.normalize({ x: 1e-12, y: 1e-12 });
    expect(result).toEqual({ x: 0, y: 0 });
  });
});

describe('mat3 singular matrix guards', () => {
  it('invert returns null for near-singular matrix', () => {
    const m = { a: 1e-12, b: 0, c: 0, d: 1e-12, tx: 10, ty: 20 };
    expect(mat3.invert(m)).toBeNull();
  });

  it('decompose handles zero-scale matrix gracefully', () => {
    const m = { a: 0, b: 0, c: 0, d: 1, tx: 5, ty: 10 };
    const result = mat3.decompose(m);
    expect(result.position).toEqual({ x: 5, y: 10 });
    expect(result.scale.x).toBe(0);
    expect(result.rotation).toBe(0);
  });
});

describe('inverseLerp guards', () => {
  it('returns 0 for equal range endpoints', () => {
    expect(inverseLerp(5, 5, 5)).toBe(0);
  });

  it('returns 0 for near-equal range endpoints', () => {
    expect(inverseLerp(5, 5 + 1e-12, 5)).toBe(0);
  });

  it('returns correct value for valid range', () => {
    expect(inverseLerp(0, 100, 50)).toBeCloseTo(0.5);
    expect(inverseLerp(0, 100, 0)).toBeCloseTo(0);
    expect(inverseLerp(0, 100, 100)).toBeCloseTo(1);
  });
});

describe('utility functions', () => {
  describe('clamp', () => {
    it('clamps value within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });
  });

  describe('lerp', () => {
    it('interpolates between values', () => {
      expect(lerp(0, 100, 0)).toBe(0);
      expect(lerp(0, 100, 1)).toBe(100);
      expect(lerp(0, 100, 0.5)).toBe(50);
    });
  });

  describe('degToRad', () => {
    it('converts degrees to radians', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI);
      expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
    });
  });

  describe('radToDeg', () => {
    it('converts radians to degrees', () => {
      expect(radToDeg(Math.PI)).toBeCloseTo(180);
      expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
    });
  });
});
