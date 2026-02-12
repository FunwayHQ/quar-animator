import { describe, it, expect } from 'vitest';
import {
  getAnimatableProperties,
  detectInterpolationType,
  BONE_ANIMATABLE_PROPERTIES,
} from './PropertyBinding';

describe('PropertyBinding - bone properties', () => {
  describe('getAnimatableProperties', () => {
    it('returns common + bone properties for bone type', () => {
      const props = getAnimatableProperties('bone');
      const paths = props.map((p) => p.path);

      // Common properties
      expect(paths).toContain('transform.position.x');
      expect(paths).toContain('transform.position.y');
      expect(paths).toContain('transform.rotation');
      expect(paths).toContain('opacity');

      // Bone-specific properties
      expect(paths).toContain('length');
      expect(paths).toContain('angleMin');
      expect(paths).toContain('angleMax');
    });

    it('does NOT include fill/stroke for bone type', () => {
      const props = getAnimatableProperties('bone');
      const paths = props.map((p) => p.path);

      expect(paths).not.toContain('fills.0.color');
      expect(paths).not.toContain('strokes.0.width');
    });
  });

  describe('BONE_ANIMATABLE_PROPERTIES', () => {
    it('contains length, angleMin, angleMax', () => {
      const paths = BONE_ANIMATABLE_PROPERTIES.map((p) => p.path);
      expect(paths).toEqual(['length', 'angleMin', 'angleMax']);
    });

    it('all use number interpolation type', () => {
      for (const prop of BONE_ANIMATABLE_PROPERTIES) {
        expect(prop.interpolationType).toBe('number');
      }
    });
  });

  describe('detectInterpolationType', () => {
    it('detects length as number', () => {
      expect(detectInterpolationType('length')).toBe('number');
    });

    it('detects angleMin as number', () => {
      expect(detectInterpolationType('angleMin')).toBe('number');
    });

    it('detects angleMax as number', () => {
      expect(detectInterpolationType('angleMax')).toBe('number');
    });
  });
});
