/**
 * Tests for Project Serializer
 */

import { describe, it, expect } from 'vitest';
import { SceneGraph } from '@quar/core';
import { createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import { serializeProject, deserializeProject, validateProjectData } from './projectSerializer';
import type {
  ProjectData,
  ProjectDataV1,
  ProjectDataV2,
  EditorStateSnapshot,
} from './projectSerializer';

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
    it('should serialize as v2.0 format with pages', () => {
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

      expect(data.version).toBe('2.0');
      expect(data.name).toBe('Test Project');
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(data.pages).toHaveLength(1);
      expect(data.pages[0]!.sceneGraph.nodes).toHaveLength(1);
      expect(data.pages[0]!.sceneGraph.nodes[0]!.id).toBe('rect1');
      expect(data.settings.timelineDuration).toBe(300);
      expect(data.settings.frameRate).toBe(30);
    });

    it('should serialize multi-page projects', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            sceneGraphJSON: { nodes: [], rootNodeIds: [] },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
            selectedNodeIds: [],
            undoStack: [],
            redoStack: [],
          },
          {
            id: 'page-2',
            name: 'Page 2',
            sceneGraphJSON: {
              nodes: [makeTestNode('rect2')],
              rootNodeIds: ['rect2'],
            },
            timeline: createTimeline({ duration: 600, frameRate: 24 }),
            selectedNodeIds: [],
            undoStack: [],
            redoStack: [],
          },
        ],
        activePageId: 'page-1',
      };

      const data = serializeProject('Multi Page', sg, editorState);

      expect(data.pages).toHaveLength(2);
      expect(data.activePageId).toBe('page-1');
      // Active page should use live scene graph (has rect1)
      expect(data.pages[0]!.sceneGraph.nodes).toHaveLength(1);
      expect(data.pages[0]!.sceneGraph.nodes[0]!.id).toBe('rect1');
      // Inactive page should use stored snapshot
      expect(data.pages[1]!.sceneGraph.nodes).toHaveLength(1);
      expect(data.pages[1]!.sceneGraph.nodes[0]!.id).toBe('rect2');
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
      // Active page timeline should be a clone
      expect(data.pages[0]!.timeline).not.toBe(timeline);
    });
  });

  describe('validateProjectData', () => {
    it('should validate v1.0 format', () => {
      const v1: ProjectDataV1 = {
        version: '1.0',
        name: 'Test',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        sceneGraph: {
          nodes: [makeTestNode('rect1')],
          rootNodeIds: ['rect1'],
        },
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };
      expect(validateProjectData(v1)).toBe(true);
    });

    it('should validate v2.0 format', () => {
      const v2: ProjectDataV2 = {
        version: '2.0',
        name: 'Test',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            sceneGraph: { nodes: [makeTestNode('r1')], rootNodeIds: ['r1'] },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
          },
        ],
        activePageId: 'page-1',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };
      expect(validateProjectData(v2)).toBe(true);
    });

    it('should reject v2.0 with empty pages array', () => {
      const bad = {
        version: '2.0',
        pages: [],
        activePageId: 'x',
        settings: { timelineDuration: 300, frameRate: 30 },
      };
      expect(validateProjectData(bad)).toBe(false);
    });

    it('should reject v2.0 without activePageId', () => {
      const bad = {
        version: '2.0',
        pages: [
          {
            id: 'p1',
            name: 'Page 1',
            sceneGraph: { nodes: [], rootNodeIds: [] },
          },
        ],
        settings: { timelineDuration: 300, frameRate: 30 },
      };
      expect(validateProjectData(bad)).toBe(false);
    });

    it('should reject invalid data', () => {
      expect(validateProjectData(null)).toBe(false);
      expect(validateProjectData(42)).toBe(false);
      expect(validateProjectData({})).toBe(false);
    });
  });

  describe('v1.0 → v2.0 migration', () => {
    it('should migrate v1.0 project to v2.0 on deserialize', () => {
      const v1Data: ProjectDataV1 = {
        version: '1.0',
        name: 'Legacy Project',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        sceneGraph: {
          nodes: [makeTestNode('rect1', 10, 20)],
          rootNodeIds: ['rect1'],
        },
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(v1Data, sg, (state) => {
        appliedState = state;
      });

      // Scene graph should be loaded
      expect(sg.getNode('rect1')).toBeDefined();

      // Pages should be created
      const pages = appliedState.pages as any[];
      expect(pages).toHaveLength(1);
      expect(pages[0].name).toBe('Page 1');

      // Active page ID should be set
      expect(typeof appliedState.activePageId).toBe('string');
    });

    it('should migrate fill.* timeline tracks to fills.0.* on v1 projects', () => {
      const timeline = createTimeline({ duration: 300, frameRate: 30 });
      timeline.tracks = [
        {
          id: 't1',
          nodeId: 'rect1',
          property: 'fill.color.r',
          enabled: true,
          keyframes: [],
        },
        {
          id: 't2',
          nodeId: 'rect1',
          property: 'stroke.width',
          enabled: true,
          keyframes: [],
        },
      ];

      const v1Data: ProjectDataV1 = {
        version: '1.0',
        name: 'Legacy',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        sceneGraph: { nodes: [makeTestNode('rect1')], rootNodeIds: ['rect1'] },
        timeline,
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(v1Data, sg, (state) => {
        appliedState = state;
      });

      const tl = appliedState.timeline as any;
      expect(tl.tracks[0].property).toBe('fills.0.color.r');
      expect(tl.tracks[1].property).toBe('strokes.0.width');
    });
  });

  describe('deserializeProject (v2.0)', () => {
    it('should restore multi-page project', () => {
      const v2Data: ProjectDataV2 = {
        version: '2.0',
        name: 'Multi Page',
        createdAt: '2024-06-01',
        updatedAt: '2024-06-01',
        pages: [
          {
            id: 'page-a',
            name: 'Home',
            sceneGraph: {
              nodes: [makeTestNode('rect1', 10, 20)],
              rootNodeIds: ['rect1'],
            },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
          },
          {
            id: 'page-b',
            name: 'About',
            sceneGraph: {
              nodes: [makeTestNode('rect2', 30, 40)],
              rootNodeIds: ['rect2'],
            },
            timeline: createTimeline({ duration: 600, frameRate: 24 }),
          },
        ],
        activePageId: 'page-a',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(v2Data, sg, (state) => {
        appliedState = state;
      });

      // Active page's scene graph should be loaded
      expect(sg.getNode('rect1')).toBeDefined();
      expect(sg.getNode('rect2')).toBeUndefined();

      // Pages should be restored
      const pages = appliedState.pages as any[];
      expect(pages).toHaveLength(2);
      expect(pages[0].id).toBe('page-a');
      expect(pages[0].name).toBe('Home');
      expect(pages[1].id).toBe('page-b');
      expect(pages[1].name).toBe('About');

      expect(appliedState.activePageId).toBe('page-a');
    });

    it('should fallback to first page if activePageId is invalid', () => {
      const v2Data: ProjectDataV2 = {
        version: '2.0',
        name: 'Test',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        pages: [
          {
            id: 'page-x',
            name: 'Only Page',
            sceneGraph: {
              nodes: [makeTestNode('r1')],
              rootNodeIds: ['r1'],
            },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
          },
        ],
        activePageId: 'nonexistent',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(v2Data, sg, (state) => {
        appliedState = state;
      });

      expect(sg.getNode('r1')).toBeDefined();
      expect(appliedState.activePageId).toBe('page-x');
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

      expect(parsed.version).toBe('2.0');
      expect(parsed.name).toBe('Round Trip');
      expect((parsed as ProjectDataV2).pages[0]!.sceneGraph.nodes).toHaveLength(2);
      expect(parsed.settings.timelineDuration).toBe(120);
      expect(parsed.settings.frameRate).toBe(60);
      expect(parsed.settings.autoKeyframe).toBe(true);
      expect(parsed.settings.onionSkin.beforeCount).toBe(5);
      expect(parsed.settings.onionSkin.afterCount).toBe(2);
      expect(parsed.settings.onionSkin.opacity).toBe(0.8);
    });

    it('should round-trip multi-page project', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('active-rect'));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        pages: [
          {
            id: 'p1',
            name: 'Page A',
            sceneGraphJSON: { nodes: [], rootNodeIds: [] },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
            selectedNodeIds: [],
            undoStack: [],
            redoStack: [],
          },
          {
            id: 'p2',
            name: 'Page B',
            sceneGraphJSON: {
              nodes: [makeTestNode('inactive-rect')],
              rootNodeIds: ['inactive-rect'],
            },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
            selectedNodeIds: [],
            undoStack: [],
            redoStack: [],
          },
        ],
        activePageId: 'p1',
      };

      // Serialize
      const data = serializeProject('Multi', sg, editorState);
      const json = JSON.stringify(data);
      const parsed = JSON.parse(json) as ProjectDataV2;

      // Deserialize into fresh scene graph
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(parsed, newSg, (state) => {
        appliedState = state;
      });

      // Active page should be loaded
      expect(newSg.getNode('active-rect')).toBeDefined();

      // Both pages should be present
      const pages = appliedState.pages as any[];
      expect(pages).toHaveLength(2);
      expect(pages[0].name).toBe('Page A');
      expect(pages[1].name).toBe('Page B');
      expect(pages[1].sceneGraphJSON.nodes[0].id).toBe('inactive-rect');
    });
  });

  // ============================================================================
  // Symbol Serialization
  // ============================================================================

  describe('symbol serialization', () => {
    const testSymbol = {
      id: 'sym-1',
      name: 'Button',
      sceneGraphJSON: {
        nodes: [makeTestNode('sym-child-1')],
        rootNodeIds: ['sym-child-1'],
      },
    };

    it('serializeProject includes symbols array', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        symbols: [testSymbol],
      };

      const data = serializeProject('Test', sg, editorState);
      expect(data.symbols).toHaveLength(1);
      expect(data.symbols![0]!.id).toBe('sym-1');
      expect(data.symbols![0]!.name).toBe('Button');
    });

    it('deserializeProject restores symbols', () => {
      const data: ProjectDataV2 = {
        version: '2.0',
        name: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            sceneGraph: { nodes: [makeTestNode('r1')], rootNodeIds: ['r1'] },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
          },
        ],
        activePageId: 'page-1',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
        symbols: [testSymbol],
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(data, sg, (state) => {
        appliedState = state;
      });

      const symbols = appliedState.symbols as typeof data.symbols;
      expect(symbols).toHaveLength(1);
      expect(symbols![0]!.id).toBe('sym-1');
      expect(symbols![0]!.name).toBe('Button');
    });

    it('round-trip preserves symbols and instances', () => {
      const sg = new SceneGraph();
      const instNode = {
        id: 'inst-1',
        name: 'Button Instance',
        type: 'symbol-instance' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 100, y: 200 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        symbolId: 'sym-1',
        overrides: [],
      };
      sg.addNode(instNode);

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        symbols: [testSymbol],
      };

      const data = serializeProject('Test', sg, editorState);

      // Deserialize
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(data, newSg, (state) => {
        appliedState = state;
      });

      // Instance should exist in scene graph
      const restored = newSg.getNode('inst-1') as any;
      expect(restored).toBeDefined();
      expect(restored.type).toBe('symbol-instance');
      expect(restored.symbolId).toBe('sym-1');

      // Symbols should be restored
      const symbols = appliedState.symbols as typeof data.symbols;
      expect(symbols).toHaveLength(1);
    });

    it('empty symbols array handled', () => {
      const sg = new SceneGraph();

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        symbols: [],
      };

      const data = serializeProject('Test', sg, editorState);
      expect(data.symbols).toEqual([]);
    });

    it('deserialize without symbols field defaults to empty', () => {
      const data: ProjectDataV2 = {
        version: '2.0',
        name: 'Test',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            sceneGraph: { nodes: [makeTestNode('r1')], rootNodeIds: ['r1'] },
            timeline: createTimeline({ duration: 300, frameRate: 30 }),
          },
        ],
        activePageId: 'page-1',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
        // No symbols field
      };

      const sg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProject(data, sg, (state) => {
        appliedState = state;
      });

      expect(appliedState.symbols).toEqual([]);
    });
  });
});
