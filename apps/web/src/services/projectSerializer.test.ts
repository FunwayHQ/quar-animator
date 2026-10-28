/**
 * Tests for Project Serializer
 */

import { describe, it, expect, vi } from 'vitest';
import { SceneGraph, createGroupNode } from '@quar/core';
import { createAnimationSequence, createTimeline } from '@quar/animation';
import { DEFAULT_ONION_SKIN_SETTINGS } from '@quar/core';
import {
  serializeProject,
  serializeProjectToBinary,
  projectDataToBinary,
  deserializeProject,
  deserializeProjectFromBinary,
  validateProjectData,
} from './projectSerializer';
import type {
  ProjectData,
  ProjectDataV1,
  ProjectDataV2,
  EditorStateSnapshot,
} from './projectSerializer';
import type { IKChain, SmartBoneAction } from '@quar/types';

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

    it('migrates as .quar files are migrated when opened, keeping every field (F169)', () => {
      const v1Data: ProjectDataV1 = {
        version: '1.0',
        name: 'Legacy',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        sceneGraph: { nodes: [makeTestNode('rect1')], rootNodeIds: ['rect1'] },
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };
      // A v1 file can't hold symbols, but one written by hand or another tool might
      const symbol = {
        id: 'sym1',
        name: 'Star',
        sceneGraphJSON: { nodes: [], rootNodeIds: [] },
      };

      let appliedState: Record<string, unknown> = {};
      deserializeProject({ ...v1Data, symbols: [symbol] }, new SceneGraph(), (state) => {
        appliedState = state;
      });

      expect(appliedState.symbols).toEqual([symbol]);
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

  describe('projects without rigging data', () => {
    const project = (rigging?: object): ProjectDataV2 =>
      ({
        version: '2.0',
        name: 'From MCP',
        createdAt: '2024-06-01',
        updatedAt: '2024-06-01',
        pages: [
          {
            id: 'p',
            name: 'Page',
            sceneGraph: { nodes: [], rootNodeIds: [] },
            timeline: createTimeline({ duration: 30, frameRate: 30 }),
          },
        ],
        activePageId: 'p',
        settings: {
          timelineDuration: 30,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
        ...(rigging ? { rigging } : {}),
      }) as ProjectDataV2;
    const load = (data: ProjectDataV2) => {
      let applied: Record<string, unknown> = {};
      deserializeProject(data, new SceneGraph(), (state) => {
        applied = state;
      });
      return applied;
    };

    it('load with no wind instead of none at all', () => {
      expect(load(project()).globalWind).toEqual({
        strength: 0,
        direction: 0,
        turbulence: 0,
        frequency: 1,
        enabled: false,
      });
    });

    it('fill in wind settings saved only in part', () => {
      expect(
        load(project({ globalWind: { strength: 40, enabled: true } })).globalWind
      ).toMatchObject({ strength: 40, enabled: true, frequency: 1, turbulence: 0 });
    });
  });

  describe('skin bindings saved before meshBindLocal', () => {
    it('take their current transform as the bind one, on every page', () => {
      const skinData = {
        vertices: [],
        inverseBindMatrices: { bone: [1, 0, 0, 1, 0, 0] },
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 0,
      };
      const page = (id: string, x: number) => ({
        id,
        name: id,
        sceneGraph: {
          nodes: [{ ...makeTestNode(`mesh-${id}`, x, 20), skinData: structuredClone(skinData) }],
          rootNodeIds: [`mesh-${id}`],
        },
        timeline: createTimeline({ duration: 30, frameRate: 30 }),
      });
      const data: ProjectDataV2 = {
        version: '2.0',
        name: 'Rig',
        createdAt: '2024-06-01',
        updatedAt: '2024-06-01',
        pages: [page('a', 10), page('b', 70)],
        activePageId: 'a',
        settings: {
          timelineDuration: 30,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };
      const sg = new SceneGraph();
      let applied: Record<string, unknown> = {};
      deserializeProject(data, sg, (state) => {
        applied = state;
      });

      // The mesh's local matrix: its position, 0°, scale 1
      const active = sg.getNode('mesh-a') as unknown as { skinData: { meshBindLocal: number[] } };
      expect(active.skinData.meshBindLocal).toEqual([1, 0, 0, 1, 10, 20]);
      const other = (applied.pages as Array<{ sceneGraphJSON: { nodes: any[] } }>)[1]!
        .sceneGraphJSON.nodes[0];
      expect(other.skinData.meshBindLocal).toEqual([1, 0, 0, 1, 70, 20]);
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

  describe('damaged files', () => {
    /** A one-page project holding 'imported', with these tracks on its timeline. */
    function damagedProject(tracks: unknown): ProjectDataV2 {
      const timeline = createTimeline({ duration: 60, frameRate: 30 });
      return {
        version: '2.0',
        name: 'Damaged',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        pages: [
          {
            id: 'page-1',
            name: 'Page 1',
            sceneGraph: { nodes: [makeTestNode('imported')], rootNodeIds: ['imported'] },
            timeline: { ...timeline, tracks } as typeof timeline,
          },
        ],
        activePageId: 'page-1',
        settings: {
          timelineDuration: 60,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };
    }

    function appliedTracks(data: ProjectDataV2): unknown[] {
      let applied: Partial<EditorStateSnapshot> = {};
      deserializeProject(data, new SceneGraph(), (state) => {
        applied = state;
      });
      return applied.timeline?.tracks ?? [];
    }

    it('open without the timeline tracks that name no property', () => {
      const data = damagedProject([
        { id: 'nameless', nodeId: 'imported', keyframes: [] },
        null,
        { id: 'fill', nodeId: 'imported', property: 'fill.color', keyframes: [] },
      ]);

      expect(validateProjectData(data)).toBe(true);
      const tracks = appliedTracks(data);
      expect(tracks).toHaveLength(1);
      expect(tracks[0]).toMatchObject({ id: 'fill', property: 'fills.0.color' });
    });

    it('open with no tracks when the tracks are not a list', () => {
      expect(appliedTracks(damagedProject({ 0: 'not a track' }))).toEqual([]);
    });

    it.each([
      ['written as null', { steps: null, restPoses: null }],
      ['left out', { steps: [] }],
      ['not what they should be', { steps: 'none', restPoses: 3 }],
    ])('open with an empty sequence when its parts were %s', (_, sequence) => {
      const data = damagedProject([]);
      data.pages[0]!.animationSequence =
        sequence as unknown as ProjectDataV2['pages'][number]['animationSequence'];
      let applied: Partial<EditorStateSnapshot> = {};
      deserializeProject(data, new SceneGraph(), (state) => {
        applied = state;
      });

      expect(applied.animationSequence).toEqual({ steps: [], restPoses: {} });
      expect(applied.pages?.[0]?.animationSequence).toEqual({ steps: [], restPoses: {} });
    });

    it('keep a sequence that is whole as it was', () => {
      const data = damagedProject([]);
      const sequence = {
        steps: [
          {
            id: 's1',
            nodeId: 'imported',
            presetId: 'fade-in',
            trigger: 'afterPrevious',
            delay: 0,
            duration: 12,
          },
        ],
        restPoses: { imported: { opacity: 1 } },
      };
      data.pages[0]!.animationSequence =
        sequence as unknown as ProjectDataV2['pages'][number]['animationSequence'];
      let applied: Partial<EditorStateSnapshot> = {};
      deserializeProject(data, new SceneGraph(), (state) => {
        applied = state;
      });

      expect(applied.animationSequence).toEqual(sequence);
      expect(applied.animationSequence).not.toBe(sequence);
    });

    it('that cannot be opened leave the open project as it was', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('open-already'));
      // Stored projects aren't validated before they're opened
      const data = { ...damagedProject([]), settings: undefined } as unknown as ProjectDataV2;
      const applyEditorState = vi.fn();

      expect(() => deserializeProject(data, sg, applyEditorState)).toThrow();

      expect(sg.getNode('open-already')).toBeDefined();
      expect(sg.getNode('imported')).toBeUndefined();
      expect(applyEditorState).not.toHaveBeenCalled();
    });
  });

  describe('round-trip serialization', () => {
    it('preserves mask group settings when saving and loading a project', () => {
      const sceneGraph = new SceneGraph();
      const group = createGroupNode('masked', 'Masked content');
      group.maskNodeId = 'mask';
      group.maskMode = 'luminance';
      sceneGraph.addNode(group);
      sceneGraph.addNode(makeTestNode('content'), group.id);
      sceneGraph.addNode(makeTestNode('mask'), group.id);

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };
      const serialized = serializeProject('Masked project', sceneGraph, editorState);
      const loadedSceneGraph = new SceneGraph();
      deserializeProject(serialized, loadedSceneGraph, () => {});

      const loadedGroup = loadedSceneGraph.getNode('masked');
      expect(loadedGroup?.type).toBe('group');
      if (loadedGroup?.type !== 'group') throw new Error('Expected a loaded mask group');
      expect(loadedGroup.maskNodeId).toBe('mask');
      expect(loadedGroup.maskMode).toBe('luminance');
    });

    it('preserves durations longer than 300 frames when loading a project', () => {
      const sceneGraph = new SceneGraph();
      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 600, frameRate: 30 }),
        timelineDuration: 600,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };
      const serialized = serializeProject('Long Timeline', sceneGraph, editorState);
      const loadedSceneGraph = new SceneGraph();
      let loadedState: Record<string, unknown> = {};

      deserializeProject(serialized, loadedSceneGraph, (state) => {
        loadedState = state;
      });

      expect(serialized.settings.timelineDuration).toBe(600);
      expect(loadedState.timelineDuration).toBe(600);
      expect((loadedState.timeline as { duration: number }).duration).toBe(600);
    });

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
  // Rigging Serialization (IK chains + Smart Bone actions) — regression for F001
  // ============================================================================

  describe('rigging serialization', () => {
    const makeIKChain = (id: string): IKChain => ({
      id,
      name: 'chain',
      rootBoneId: 'bone-root',
      endEffectorBoneId: 'bone-tip',
      targetNodeId: 'target',
      maxIterations: 10,
      tolerance: 0.01,
      enabled: true,
    });

    const makeSmartBoneAction = (id: string): SmartBoneAction => ({
      id,
      name: 'action',
      driver: { boneId: 'bone-root', property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
      targets: [],
      enabled: true,
    });

    function makeRiggedState(): EditorStateSnapshot {
      return {
        timeline: createTimeline({ duration: 60, frameRate: 30 }),
        timelineDuration: 60,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        ikChains: [makeIKChain('ik1')],
        smartBoneActions: [makeSmartBoneAction('sba1')],
      };
    }

    it('serializes ikChains and smartBoneActions under rigging', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const data = serializeProject('Rigged', sg, makeRiggedState());

      expect(data.rigging?.ikChains).toHaveLength(1);
      expect(data.rigging?.ikChains?.[0]!.id).toBe('ik1');
      expect(data.rigging?.smartBoneActions).toHaveLength(1);
      expect(data.rigging?.smartBoneActions?.[0]!.id).toBe('sba1');
    });

    it('round-trips ikChains and smartBoneActions through JSON serialize/deserialize', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const data = serializeProject('Rigged', sg, makeRiggedState());
      const parsed = JSON.parse(JSON.stringify(data)) as ProjectData;

      const newSg = new SceneGraph();
      let applied: Record<string, unknown> = {};
      deserializeProject(parsed, newSg, (state) => {
        applied = state;
      });

      expect((applied.ikChains as IKChain[])[0]!.id).toBe('ik1');
      expect((applied.smartBoneActions as SmartBoneAction[])[0]!.id).toBe('sba1');
    });

    it('round-trips ikChains and smartBoneActions through the binary .quar path', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const binary = serializeProjectToBinary('Rigged', sg, makeRiggedState());

      const newSg = new SceneGraph();
      let applied: Record<string, unknown> = {};
      deserializeProjectFromBinary(binary, newSg, (state) => {
        applied = state;
      });

      expect((applied.ikChains as IKChain[])[0]!.id).toBe('ik1');
      expect((applied.smartBoneActions as SmartBoneAction[])[0]!.id).toBe('sba1');
    });

    it('defaults to empty arrays when a project has no rigging data', () => {
      const v2: ProjectDataV2 = {
        version: '2.0',
        name: 'No Rig',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        pages: [
          {
            id: 'p1',
            name: 'Page 1',
            sceneGraph: { nodes: [], rootNodeIds: [] },
            timeline: createTimeline({ duration: 60, frameRate: 30 }),
          },
        ],
        activePageId: 'p1',
        settings: {
          timelineDuration: 60,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
      };

      const newSg = new SceneGraph();
      let applied: Record<string, unknown> = {};
      deserializeProject(v2, newSg, (state) => {
        applied = state;
      });

      expect(applied.ikChains).toEqual([]);
      expect(applied.smartBoneActions).toEqual([]);
    });
  });

  // ============================================================================
  // Symbol Serialization
  // ============================================================================

  describe('symbol serialization', () => {
    it('saves the page’s layers it’s given, when the scene graph holds a symbol’s', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('in-symbol'));
      const data = serializeProject('Test', sg, {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        pageScene: { nodes: [makeTestNode('on-page')], rootNodeIds: ['on-page'] },
      });
      expect(data.pages[0]!.sceneGraph.rootNodeIds).toEqual(['on-page']);
    });

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

  // ============================================================================
  // v3.0 Binary Format
  // ============================================================================

  describe('v3.0 binary format', () => {
    it('serializeProjectToBinary returns ArrayBuffer', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const binary = serializeProjectToBinary('Binary Test', sg, editorState);
      expect(binary).toBeInstanceOf(ArrayBuffer);
      expect(binary.byteLength).toBeGreaterThan(0);

      // Check magic bytes
      const view = new DataView(binary);
      expect(view.getUint32(0, true)).toBe(0x52415551); // "QUAR"
    });

    it('projectDataToBinary writes already serialized data as it is (F167)', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 42, 84));
      const data = serializeProject(
        'Saved Once',
        sg,
        {
          timeline: createTimeline({ duration: 300, frameRate: 30 }),
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
        '2020-02-02T00:00:00.000Z'
      );

      const parsed = deserializeProjectFromBinary(
        projectDataToBinary(data),
        new SceneGraph(),
        () => undefined
      );

      expect(parsed.name).toBe('Saved Once');
      expect(parsed.createdAt).toBe(data.createdAt);
      expect(parsed.updatedAt).toBe(data.updatedAt);
    });

    it('deserializeProjectFromBinary with binary input', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1', 42, 84));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: true,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const binary = serializeProjectToBinary('Binary Project', sg, editorState);

      // Deserialize from binary
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      const parsed = deserializeProjectFromBinary(binary, newSg, (state) => {
        appliedState = state;
      });

      expect(newSg.getNode('rect1')).toBeDefined();
      expect(parsed.name).toBe('Binary Project');
      expect(appliedState.timelineDuration).toBe(300);
      expect(appliedState.autoKeyframe).toBe(true);
    });

    it('deserializeProjectFromBinary with legacy JSON string', () => {
      const v2Data: ProjectDataV2 = {
        version: '2.0',
        name: 'Legacy JSON',
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

      const jsonStr = JSON.stringify(v2Data);
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      const parsed = deserializeProjectFromBinary(jsonStr, newSg, (state) => {
        appliedState = state;
      });

      expect(newSg.getNode('r1')).toBeDefined();
      expect(parsed.version).toBe('3.0');
    });

    it('binary round-trip preserves all data', () => {
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
          beforeCount: 3,
        },
        symbols: [
          {
            id: 'sym-1',
            name: 'TestSymbol',
            sceneGraphJSON: {
              nodes: [makeTestNode('sym-child')],
              rootNodeIds: ['sym-child'],
            },
          },
        ],
      };

      const binary = serializeProjectToBinary('Full Round Trip', sg, editorState);

      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProjectFromBinary(binary, newSg, (state) => {
        appliedState = state;
      });

      expect(newSg.getNode('rect1')).toBeDefined();
      expect(newSg.getNode('rect2')).toBeDefined();
      expect(appliedState.timelineDuration).toBe(120);
      expect(appliedState.frameRate).toBe(60);
      expect(appliedState.autoKeyframe).toBe(true);
      expect((appliedState.symbols as any[])![0].id).toBe('sym-1');
    });

    it('binary format is smaller than JSON for image-heavy projects', () => {
      const sg = new SceneGraph();
      // Create a node with a fake 1KB base64 image
      const fakeBase64 = 'A'.repeat(1000);
      const imageNode = {
        id: 'img1',
        name: 'img1',
        type: 'image' as const,
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal' as const,
        src: `data:image/png;base64,${fakeBase64}`,
        width: 100,
        height: 100,
        naturalWidth: 100,
        naturalHeight: 100,
        cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
      };
      sg.addNode(imageNode);

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      const jsonData = serializeProject('Size Test', sg, editorState);
      const jsonSize = JSON.stringify(jsonData).length;
      const binarySize = serializeProjectToBinary('Size Test', sg, editorState).byteLength;

      // Binary should be smaller (base64 → raw bytes = ~33% savings on image data)
      expect(binarySize).toBeLessThan(jsonSize);
    });

    it('validateProjectData accepts v3.0 format', () => {
      const v3 = {
        version: '3.0',
        name: 'V3 Project',
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
      expect(validateProjectData(v3)).toBe(true);
    });

    it('storage round-trip with binary (save → load simulation)', () => {
      const sg = new SceneGraph();
      sg.addNode(makeTestNode('rect1'));

      const editorState: EditorStateSnapshot = {
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
      };

      // Simulate save: serialize to binary
      const binary = serializeProjectToBinary('Storage Test', sg, editorState);

      // Simulate load: deserialize from binary
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProjectFromBinary(binary, newSg, (state) => {
        appliedState = state;
      });

      expect(newSg.getNode('rect1')).toBeDefined();
      expect(appliedState.timelineDuration).toBe(300);
    });

    it('legacy string storage can be loaded', () => {
      const v2Data: ProjectDataV2 = {
        version: '2.0',
        name: 'Old Stored',
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

      // Simulate loading from old string storage
      const storedString = JSON.stringify(v2Data);
      const newSg = new SceneGraph();
      let appliedState: Record<string, unknown> = {};
      deserializeProjectFromBinary(storedString, newSg, (state) => {
        appliedState = state;
      });

      expect(newSg.getNode('r1')).toBeDefined();
    });
  });

  describe('document background', () => {
    const state = (documentBackground?: { r: number; g: number; b: number; a: number }) =>
      ({
        timeline: createTimeline({ duration: 60, frameRate: 30 }),
        timelineDuration: 60,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        ...(documentBackground && { documentBackground }),
      }) as EditorStateSnapshot;

    it('saves the background and reads it back, through the binary format too', () => {
      const color = { r: 240, g: 236, b: 228, a: 1 };
      const binary = serializeProjectToBinary('Paper', new SceneGraph(), state(color));
      let applied: Record<string, unknown> = {};
      deserializeProjectFromBinary(binary, new SceneGraph(), (s) => {
        applied = s;
      });

      expect(applied.documentBackground).toEqual(color);
    });

    it('gives files without one the default canvas color', () => {
      const data = JSON.parse(
        JSON.stringify(serializeProject('Old', new SceneGraph(), state()))
      ) as ProjectData;
      expect('backgroundColor' in data.settings).toBe(false);

      let applied: Record<string, unknown> = {};
      deserializeProject(data, new SceneGraph(), (s) => {
        applied = s;
      });
      expect(applied.documentBackground).toEqual({ r: 26, g: 26, b: 26, a: 1 });
    });
  });

  // ============================================================================
  // Sounds
  // ============================================================================

  describe('sounds', () => {
    const sound = (id: string) => ({
      id,
      name: `${id} name`,
      src: `data:audio/wav;base64,${btoa(`bytes of ${id}`)}`,
      duration: 2.5,
    });
    const clip = (id: string, soundId: string) => ({
      id,
      soundId,
      start: 12,
      offset: 0.5,
      duration: 1.5,
      gain: 0.8,
    });
    const page = (id: string, timeline: ReturnType<typeof createTimeline>) => ({
      id,
      name: id,
      sceneGraphJSON: { nodes: [], rootNodeIds: [] },
      timeline,
      animationSequence: createAnimationSequence(),
      selectedNodeIds: [],
      undoStack: [],
      redoStack: [],
    });

    it('keeps the clips on every timeline, and the sounds they play, through a .quar file', () => {
      const active = createTimeline({
        sounds: [clip('c1', 'voice')],
        artboards: { board: { duration: 90, sounds: [clip('c2', 'music')] } },
      });
      const other = createTimeline({ sounds: [{ ...clip('c3', 'bell'), muted: true }] });
      const editorState: EditorStateSnapshot = {
        timeline: active,
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        pages: [page('p1', active), page('p2', other)],
        activePageId: 'p1',
        sounds: [sound('voice'), sound('music'), sound('bell'), sound('unused')],
      };

      const scene = new SceneGraph();
      scene.addNode({
        ...makeTestNode('board'),
        type: 'artboard',
        fills: [],
        clipContent: true,
      } as never);
      // Each sound is a binary buffer in the file, not base64 text
      const binary = serializeProjectToBinary('Talk', scene, editorState);
      const text = new TextDecoder('latin1').decode(binary);
      expect(text).not.toContain(btoa('bytes of voice'));
      expect(text).toContain('bytes of voice');

      let applied: Record<string, unknown> = {};
      deserializeProjectFromBinary(binary, new SceneGraph(), (s) => {
        applied = s;
      });
      // One no clip plays isn't kept
      expect(applied.sounds).toEqual([sound('voice'), sound('music'), sound('bell')]);
      const timeline = applied.timeline as ReturnType<typeof createTimeline>;
      expect(timeline.sounds).toEqual([clip('c1', 'voice')]);
      expect(timeline.artboards?.board?.sounds).toEqual([clip('c2', 'music')]);
      const pages = applied.pages as Array<{ timeline: ReturnType<typeof createTimeline> }>;
      expect(pages[1]!.timeline.sounds).toEqual([{ ...clip('c3', 'bell'), muted: true }]);
    });

    it('drops a deleted artboard’s timeline, and the sounds only it played', () => {
      const sg = new SceneGraph();
      sg.addNode({
        ...makeTestNode('kept'),
        type: 'artboard',
        fills: [],
        clipContent: true,
      } as never);
      const timeline = createTimeline({
        artboards: {
          kept: { duration: 60, sounds: [clip('c1', 'voice')] },
          deleted: { duration: 90, sounds: [clip('c2', 'music')] },
        },
      });
      const data = serializeProject('Deck', sg, {
        timeline,
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        sounds: [sound('voice'), sound('music')],
      });
      expect(Object.keys(data.pages[0]!.timeline.artboards ?? {})).toEqual(['kept']);
      expect(data.sounds?.map((s) => s.id)).toEqual(['voice']);
    });

    it('leaves out clips and sounds a damaged file got wrong', () => {
      const data = {
        version: '2.0',
        name: 'Damaged',
        createdAt: '',
        updatedAt: '',
        pages: [
          {
            id: 'p1',
            name: 'Page 1',
            sceneGraph: { nodes: [], rootNodeIds: [] },
            timeline: {
              ...createTimeline(),
              sounds: [
                { id: 'ok', soundId: 's', start: 3.4, duration: 1 },
                { id: 'no-length', soundId: 's', start: 0 },
                { soundId: 's', start: 0, duration: 1 },
                null,
              ],
              artboards: { a: { duration: 60, sounds: 'not a list' } },
            },
          },
        ],
        activePageId: 'p1',
        settings: {
          timelineDuration: 300,
          frameRate: 30,
          autoKeyframe: false,
          onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
        },
        sounds: [
          sound('s'),
          { id: 'picture', src: 'data:image/png;base64,AAAA', duration: 1 },
          { id: 'no-length', src: 'data:audio/wav;base64,AAAA' },
          { src: 'data:audio/wav;base64,AAAA', duration: 1 },
        ],
      } as unknown as ProjectData;

      let applied: Record<string, unknown> = {};
      deserializeProject(data, new SceneGraph(), (s) => {
        applied = s;
      });
      const timeline = applied.timeline as ReturnType<typeof createTimeline>;
      // Whole frames; an offset and a volume where they're missing
      expect(timeline.sounds).toEqual([
        { id: 'ok', soundId: 's', start: 3, offset: 0, duration: 1, gain: 1 },
      ]);
      expect(timeline.artboards?.a?.sounds).toEqual([]);
      expect(applied.sounds).toEqual([sound('s')]);
    });

    it('opens an older file with no sounds', () => {
      const data = JSON.parse(
        JSON.stringify(
          serializeProject('Old', new SceneGraph(), {
            timeline: createTimeline(),
            timelineDuration: 300,
            frameRate: 30,
            autoKeyframe: false,
            onionSkin: { ...DEFAULT_ONION_SKIN_SETTINGS },
          })
        )
      ) as ProjectDataV2;
      delete data.sounds;

      let applied: Record<string, unknown> = {};
      deserializeProject(data, new SceneGraph(), (s) => {
        applied = s;
      });
      expect(applied.sounds).toEqual([]);
    });
  });
});
