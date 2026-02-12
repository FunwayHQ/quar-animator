import { describe, it, expect } from 'vitest';
import { getAnimatableProperties } from './PropertyBinding';

describe('PropertyBinding - ik-target properties', () => {
  describe('getAnimatableProperties', () => {
    it('returns only common properties for ik-target type', () => {
      const props = getAnimatableProperties('ik-target');
      const paths = props.map((p) => p.path);

      // Common properties should be present
      expect(paths).toContain('transform.position.x');
      expect(paths).toContain('transform.position.y');
      expect(paths).toContain('transform.rotation');
      expect(paths).toContain('opacity');
    });

    it('does NOT include fill/stroke/bone properties for ik-target', () => {
      const props = getAnimatableProperties('ik-target');
      const paths = props.map((p) => p.path);

      // No fill/stroke
      expect(paths).not.toContain('fills.0.color');
      expect(paths).not.toContain('strokes.0.width');
      // No bone-specific
      expect(paths).not.toContain('length');
      expect(paths).not.toContain('angleMin');
      expect(paths).not.toContain('angleMax');
    });

    it('includes scale properties from COMMON', () => {
      const props = getAnimatableProperties('ik-target');
      const paths = props.map((p) => p.path);

      expect(paths).toContain('transform.scale.x');
      expect(paths).toContain('transform.scale.y');
    });
  });
});
