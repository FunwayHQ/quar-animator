import { describe, it, expect, vi } from 'vitest';
import { Camera } from './Camera';

describe('Camera', () => {
  describe('initialization', () => {
    it('creates camera with default values', () => {
      const camera = new Camera();
      expect(camera.zoom).toBe(1);
      expect(camera.position).toEqual({ x: 0, y: 0 });
      expect(camera.rotation).toBe(0);
    });

    it('accepts custom configuration', () => {
      const camera = new Camera({
        minZoom: 0.5,
        maxZoom: 10,
      });
      camera.zoom = 0.1; // Below min
      expect(camera.zoom).toBe(0.5);
      camera.zoom = 20; // Above max
      expect(camera.zoom).toBe(10);
    });
  });

  describe('position', () => {
    it('gets and sets position', () => {
      const camera = new Camera();
      camera.position = { x: 100, y: 200 };
      expect(camera.position).toEqual({ x: 100, y: 200 });
    });

    it('returns copy of position', () => {
      const camera = new Camera();
      camera.position = { x: 100, y: 200 };
      const pos = camera.position;
      pos.x = 999;
      expect(camera.position.x).toBe(100);
    });
  });

  describe('zoom', () => {
    it('gets and sets zoom', () => {
      const camera = new Camera();
      camera.zoom = 2;
      expect(camera.zoom).toBe(2);
    });

    it('clamps zoom to min/max', () => {
      const camera = new Camera({ minZoom: 0.5, maxZoom: 4 });
      camera.zoom = 0.1;
      expect(camera.zoom).toBe(0.5);
      camera.zoom = 10;
      expect(camera.zoom).toBe(4);
    });
  });

  describe('rotation', () => {
    it('gets and sets rotation', () => {
      const camera = new Camera();
      camera.rotation = 45;
      expect(camera.rotation).toBe(45);
    });
  });

  describe('viewport', () => {
    it('sets viewport dimensions', () => {
      const camera = new Camera();
      camera.setViewport(1024, 768);
      expect(camera.viewportWidth).toBe(1024);
      expect(camera.viewportHeight).toBe(768);
    });
  });

  describe('coordinate transformations', () => {
    it('converts screen to world coordinates at default state', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      // Center of screen should map to world origin at zoom 1
      const worldPos = camera.screenToWorld({ x: 400, y: 300 });
      expect(worldPos.x).toBeCloseTo(0);
      expect(worldPos.y).toBeCloseTo(0);
    });

    it('converts world to screen coordinates', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      const screenPos = camera.worldToScreen({ x: 0, y: 0 });
      expect(screenPos.x).toBeCloseTo(400);
      expect(screenPos.y).toBeCloseTo(300);
    });

    it('transforms correctly with zoom', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;

      // At zoom 2, world coordinates should be scaled
      const screenPos = camera.worldToScreen({ x: 100, y: 100 });
      // The world point 100,100 should appear further from center
      expect(screenPos.x).toBeGreaterThan(400);
      expect(screenPos.y).toBeLessThan(300); // Y is flipped
    });

    it('round-trips screen->world->screen', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 1.5;
      camera.position = { x: 50, y: -30 };

      const originalScreen = { x: 123, y: 456 };
      const worldPos = camera.screenToWorld(originalScreen);
      const backToScreen = camera.worldToScreen(worldPos);

      expect(backToScreen.x).toBeCloseTo(originalScreen.x, 0);
      expect(backToScreen.y).toBeCloseTo(originalScreen.y, 0);
    });
  });

  describe('pan', () => {
    it('pans camera by screen delta', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      const initialPos = { ...camera.position };
      camera.pan({ x: 100, y: 50 });

      // Pan moves camera in opposite direction of screen drag
      expect(camera.position.x).toBeLessThan(initialPos.x);
      expect(camera.position.y).toBeLessThan(initialPos.y);
    });

    it('scales pan by zoom level', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      camera.zoom = 2;

      camera.pan({ x: 100, y: 0 });
      // At zoom 2, panning 100 screen pixels moves 50 world units
      expect(camera.position.x).toBeCloseTo(-50);
    });
  });

  describe('zoomAt', () => {
    it('zooms at cursor position', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      const cursorPos = { x: 400, y: 300 }; // Center
      const worldBefore = camera.screenToWorld(cursorPos);

      camera.zoomAt(cursorPos, 100); // Positive delta = zoom in

      const worldAfter = camera.screenToWorld(cursorPos);

      // World point under cursor should remain stationary
      expect(worldAfter.x).toBeCloseTo(worldBefore.x, 0);
      expect(worldAfter.y).toBeCloseTo(worldBefore.y, 0);
    });
  });

  describe('zoomTo', () => {
    it('zooms to specific level', () => {
      const camera = new Camera();
      camera.zoomTo(2);
      expect(camera.zoom).toBe(2);
    });

    it('clamps to min/max', () => {
      const camera = new Camera({ minZoom: 0.5, maxZoom: 4 });
      camera.zoomTo(10);
      expect(camera.zoom).toBe(4);
    });
  });

  describe('fitBounds', () => {
    it('fits camera to show bounds', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      camera.fitBounds({
        x: -500,
        y: -500,
        width: 1000,
        height: 1000,
      }, 0);

      // Camera should be centered on bounds
      expect(camera.position.x).toBeCloseTo(0);
      expect(camera.position.y).toBeCloseTo(0);
    });
  });

  describe('reset', () => {
    it('resets camera to default state', () => {
      const camera = new Camera();
      camera.position = { x: 100, y: 200 };
      camera.zoom = 3;
      camera.rotation = 45;

      camera.reset();

      expect(camera.position).toEqual({ x: 0, y: 0 });
      expect(camera.zoom).toBe(1);
      expect(camera.rotation).toBe(0);
    });
  });

  describe('matrices', () => {
    it('returns view matrix', () => {
      const camera = new Camera();
      const viewMatrix = camera.getViewMatrix();
      expect(viewMatrix).toBeDefined();
      expect(viewMatrix.a).toBeDefined();
    });

    it('returns projection matrix', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      const projMatrix = camera.getProjectionMatrix();
      expect(projMatrix).toBeDefined();
    });

    it('returns view-projection matrix', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      const vpMatrix = camera.getViewProjectionMatrix();
      expect(vpMatrix).toBeDefined();
    });

    it('returns inverse view-projection matrix', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);
      const invMatrix = camera.getInverseViewProjectionMatrix();
      expect(invMatrix).not.toBeNull();
    });
  });

  describe('getVisibleBounds', () => {
    it('returns visible world bounds', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      const bounds = camera.getVisibleBounds();

      // Bounds may have negative dimensions due to Y-axis flip
      expect(Math.abs(bounds.width)).toBeGreaterThan(0);
      expect(Math.abs(bounds.height)).toBeGreaterThan(0);
    });

    it('visible bounds shrink with zoom', () => {
      const camera = new Camera();
      camera.setViewport(800, 600);

      camera.zoom = 1;
      const bounds1 = camera.getVisibleBounds();

      camera.zoom = 2;
      const bounds2 = camera.getVisibleBounds();

      // Compare absolute values since Y-axis is flipped
      expect(Math.abs(bounds2.width)).toBeLessThan(Math.abs(bounds1.width));
      expect(Math.abs(bounds2.height)).toBeLessThan(Math.abs(bounds1.height));
    });
  });

  describe('getZoomPercentage', () => {
    it('returns zoom as percentage string', () => {
      const camera = new Camera();
      expect(camera.getZoomPercentage()).toBe('100%');

      camera.zoom = 2;
      expect(camera.getZoomPercentage()).toBe('200%');

      camera.zoom = 0.5;
      expect(camera.getZoomPercentage()).toBe('50%');
    });
  });

  describe('events', () => {
    it('emits change event on position change', () => {
      const camera = new Camera();
      const callback = vi.fn();

      camera.on('change', callback);
      camera.position = { x: 100, y: 100 };

      expect(callback).toHaveBeenCalled();
    });

    it('emits zoomChange event on zoom change', () => {
      const camera = new Camera();
      const callback = vi.fn();

      camera.on('zoomChange', callback);
      camera.zoom = 2;

      expect(callback).toHaveBeenCalled();
    });

    it('emits panChange event on pan', () => {
      const camera = new Camera();
      const callback = vi.fn();

      camera.on('panChange', callback);
      camera.pan({ x: 10, y: 10 });

      expect(callback).toHaveBeenCalled();
    });

    it('unsubscribes from events', () => {
      const camera = new Camera();
      const callback = vi.fn();

      const unsubscribe = camera.on('change', callback);
      unsubscribe();
      camera.position = { x: 100, y: 100 };

      expect(callback).not.toHaveBeenCalled();
    });
  });
});
