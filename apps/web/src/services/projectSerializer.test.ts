/**
 * Tests for Project Serializer
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { serializeProject, deserializeProject } from './projectSerializer';
import type { ProjectData, EditorStateSnapshot } from './projectSerializer';

function makeTestNode(id: string, x = 0, y = 0) {
  return {
    id,
    name: id,
    type: 'rectangle' as const,
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal' as const,
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
    fills: [],
    strokes: [],
  };
}

describe('ProjectSerializer', () => {
  describe('serializeProject', () => {
    it('should serialize scene graph and editor state', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 50, 100));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const data = serializeProject('Test Project', sg, editorState);

      expect(data.version).toBe('1.0');
      expect(data.name).toBe('Test Project');
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(data.sceneGraph.nodes).toHaveLength(1);
      expect(data.sceneGraph.nodes[0].id).toBe('rect1');
      expect(data.sceneGraph.rootNodeIds).toEqual(['rect1']);
      expect(data.settings.timelineDuration).toBe(300);
      expect(data.settings.frameRate).toBe(30);
      expect(data.settings.autoKeyframe).toBe(false);
    });

    it('should preserve existing createdAt', () => {
      const sg = new SceneGraph();
      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const existingDate = '2024-01-15T10:00:00.000Z';
      const data = serializeProject('Test', sg, editorState, existingDate);
      expect(data.createdAt).toBe(existingDate);
    });

    it('should deep clone timeline data', () => {
      const sg = new SceneGraph();
      const timeline = createTimeline({ duration: 300, frameRate: 30 });
      const editorState: EditorStateSnapshot = {
        timeline,
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const data = serializeProject('Test', sg, editorState);
      // Modifying original should not affect serialized data
      expect(data.timeline).not.toBe(timeline);
    });
  });

  describe('deserializeProject', () => {
    it('should restore scene graph and editor state', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 50, 100));
      sg.addNode(makeTestNode('rect2', 200, 300));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 600, frameRate: 24 }),
        timelineDuration: 600,
        frameRate: 24,
        autoKeyframe: true,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS, enabled: true },
      };

      // Serialize
      const data = serializeProject('Test', sg, editorState);

      // Clear scene graph
      const newSg = new SceneGraph();

      // Deserialize into new scene graph
      let appliedState: Record<string, unknown> = {};
      deserializeProject(data, newSg, (state) => {
        appliedState = state;
      });

      // Verify scene graph
      expect(newSg.getNodeCount()).toBe(2);
      expect(newSg.getNode('rect1')).toBeDefined();
      expect(newSg.getNode('rect2')).toBeDefined();

      // Verify editor state
      expect(appliedState.timelineDuration).toBe(600);
      expect(appliedState.frameRate).toBe(24);
      expect(appliedState.autoKeyframe).toBe(true);
      expect(appliedState.currentFrame).toBe(0);
      expect((appliedState.onionSkin as any).enabled).toBe(true);
    });

    it('should round-trip preserve node positions', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 123, 456));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const data = serializeProject('Test', sg, editorState);
      const newSg = new SceneGraph();
      deserializeProject(data, newSg, () => {});

      const node = newSg.getNode('rect1');
      expect(node?.transform.position.x).toBe(123);
      expect(node?.transform.position.y).toBe(456);
    });
  });

  describe('round-trip serialization', () => {
    it('should preserve all data through serialize/deserialize cycle', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 10, 20));
      sg.addNode(makeTestNode('rect2', 30, 40));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 120, frameRate: 60 }),
        timelineDuration: 120,
        frameRate: 60,
        autoKeyframe: true,
        onionSkin: {
          ...DEFAULT_ONION_SKIN_SETTINGS,
          enabled: true,
          beforeCount: 5,
          afterCount: 2,
          opacity: 0.8,
        },
      };

      const serialized = serializeProject('Round Trip', sg, editorState);
      const json = JSON.stringify(serialized);
      const parsed: ProjectData = JSON.parse(json);

      expect(parsed.version).toBe('1.0');
      expect(parsed.name).toBe('Round Trip');
      expect(parsed.sceneGraph.nodes).toHaveLength(2);
      expect(parsed.settings.timelineDuration).toBe(120);
      expect(parsed.settings.frameRate).toBe(60);
      expect(parsed.settings.autoKeyframe).toBe(true);
      expect(parsed.settings.onionSkin.beforeCount).toBe(5);
      expect(parsed.settings.onionSkin.afterCount).toBe(2);
      expect(parsed.settings.onionSkin.opacity).toBe(0.8);
    });
  });
});
