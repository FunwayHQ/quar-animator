/**
 * Integration tests for .quar binary format
 * Full round-trip workflows testing serialization → deserialization
 */

import { describe, it, expect } from 'vitest';
import { isQuarBinary, QUAR_MAGIC, encodeQuarBinary, decodeQuarBinary } from './quarFormat';
import { writeQuarFile, parseQuarFile } from './quarMigration';

// ============================================================================
// Helpers
// ============================================================================

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

const TINY_JPEG_BASE64 = '/9j/4AAQSkZJRg==';
const TINY_JPEG_DATA_URI = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

function makeNode(id: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    type,
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
    blendMode: 'normal',
    ...extra,
  };
}

function makeRect(id: string, x = 0, y = 0) {
  return makeNode(id, 'rectangle', {
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    width: 100,
    height: 100,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } }],
    strokes: [],
  });
}

function makeEllipse(id: string) {
  return makeNode(id, 'ellipse', {
    radiusX: 50,
    radiusY: 50,
    fills: [{ type: 'solid', color: { r: 0, g: 255, b: 0, a: 1 } }],
    strokes: [],
  });
}

function makePathNode(id: string) {
  return makeNode(id, 'path', {
    points: [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: { x: 10, y: 10 }, type: 'smooth' },
      {
        position: { x: 100, y: 100 },
        handleIn: { x: -10, y: -10 },
        handleOut: null,
        type: 'corner',
      },
    ],
    closed: true,
    fills: [],
    strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 }],
  });
}

function makePolygon(id: string) {
  return makeNode(id, 'polygon', {
    sides: 6,
    radius: 50,
    innerRadius: 0,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 255, a: 1 } }],
    strokes: [],
  });
}

function makeTextNode(id: string) {
  return makeNode(id, 'text', {
    content: 'Hello World',
    fontFamily: 'Arial',
    fontSize: 16,
    fontWeight: '400',
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 } }],
  });
}

function makeImageNode(id: string, src = TINY_PNG_DATA_URI) {
  return makeNode(id, 'image', {
    src,
    width: 200,
    height: 150,
    naturalWidth: 200,
    naturalHeight: 150,
    cornerRadius: [0, 0, 0, 0],
  });
}

function makeGroupNode(id: string, childIds: string[]) {
  return makeNode(id, 'group', { children: childIds });
}

function makeArtboard(id: string) {
  return makeNode(id, 'artboard', {
    width: 1920,
    height: 1080,
    fills: [{ type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 } }],
    clipContent: true,
  });
}

function makeV2Project(
  nodes: Record<string, unknown>[] = [],
  rootNodeIds: string[] = [],
  extra: Record<string, unknown> = {}
) {
  return {
    version: '2.0',
    name: 'Integration Test',
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T12:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        name: 'Page 1',
        sceneGraph: { nodes, rootNodeIds },
        timeline: {
          id: 'tl-1',
          tracks: [],
          duration: 300,
          frameRate: 30,
        },
      },
    ],
    activePageId: 'page-1',
    settings: {
      timelineDuration: 300,
      frameRate: 30,
      autoKeyframe: false,
      onionSkin: { enabled: false },
    },
    ...extra,
  };
}

// ============================================================================
// Integration Tests
// ============================================================================

describe('Format Integration Tests', () => {
  describe('Shape round-trips', () => {
    it('should round-trip project with rectangles', () => {
      const project = makeV2Project([makeRect('r1', 10, 20), makeRect('r2', 30, 40)], ['r1', 'r2']);

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      expect(nodes).toHaveLength(2);
      expect(nodes[0].id).toBe('r1');
      expect(nodes[0].transform.position.x).toBe(10);
      expect(nodes[0].width).toBe(100);
      expect(nodes[1].id).toBe('r2');
      expect(nodes[1].transform.position.y).toBe(40);
    });

    it('should round-trip project with mixed node types', () => {
      const nodes = [
        makeRect('rect1'),
        makeEllipse('ell1'),
        makePathNode('path1'),
        makePolygon('poly1'),
        makeTextNode('text1'),
        makeGroupNode('group1', ['rect1', 'ell1']),
        makeArtboard('art1'),
      ];
      const rootIds = ['rect1', 'ell1', 'path1', 'poly1', 'text1', 'group1', 'art1'];
      const project = makeV2Project(nodes, rootIds);

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const restoredNodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      expect(restoredNodes).toHaveLength(7);

      // Verify each type is preserved
      const types = restoredNodes.map((n: any) => n.type);
      expect(types).toContain('rectangle');
      expect(types).toContain('ellipse');
      expect(types).toContain('path');
      expect(types).toContain('polygon');
      expect(types).toContain('text');
      expect(types).toContain('group');
      expect(types).toContain('artboard');
    });
  });

  describe('Animation round-trips', () => {
    it('should round-trip project with keyframes and easing', () => {
      const project = makeV2Project([makeRect('r1')], ['r1']);
      (project.pages[0] as any).timeline = {
        id: 'tl-1',
        tracks: [
          {
            id: 'track-1',
            nodeId: 'r1',
            property: 'transform.position.x',
            enabled: true,
            keyframes: [
              { id: 'kf-1', frame: 0, value: 0, easing: 'linear' },
              {
                id: 'kf-2',
                frame: 30,
                value: 200,
                easing: { type: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 },
              },
              { id: 'kf-3', frame: 60, value: 400, easing: 'easeInOutCubic' },
            ],
          },
          {
            id: 'track-2',
            nodeId: 'r1',
            property: 'opacity',
            enabled: true,
            keyframes: [
              { id: 'kf-4', frame: 0, value: 1, easing: 'linear' },
              { id: 'kf-5', frame: 30, value: 0.5, easing: 'easeOutQuad' },
            ],
          },
        ],
        duration: 300,
        frameRate: 30,
      };

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const timeline = (parsed.pages as any[])[0].timeline;
      expect(timeline.tracks).toHaveLength(2);
      expect(timeline.tracks[0].keyframes).toHaveLength(3);
      expect(timeline.tracks[0].keyframes[1].value).toBe(200);
      expect(timeline.tracks[0].keyframes[1].easing).toEqual({
        type: 'cubicBezier',
        x1: 0.25,
        y1: 0.1,
        x2: 0.25,
        y2: 1.0,
      });
      expect(timeline.tracks[1].keyframes[1].easing).toBe('easeOutQuad');
    });
  });

  describe('Image round-trips', () => {
    it('should round-trip project with images correctly', () => {
      const project = makeV2Project(
        [makeImageNode('img1', TINY_PNG_DATA_URI), makeImageNode('img2', TINY_JPEG_DATA_URI)],
        ['img1', 'img2']
      );

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      expect(nodes[0].src).toBe(TINY_PNG_DATA_URI);
      expect(nodes[1].src).toBe(TINY_JPEG_DATA_URI);
    });

    it('should store images as binary buffers (not base64 in JSON)', () => {
      const project = makeV2Project([makeImageNode('img1')], ['img1']);

      const binary = writeQuarFile(project);
      const decoded = decodeQuarBinary(binary);

      // JSON chunk should NOT contain the base64 data
      const jsonStr = JSON.stringify(decoded.json);
      expect(jsonStr).not.toContain(TINY_PNG_BASE64);

      // Instead, it should have buffer references
      expect(jsonStr).toContain('buffer:0');

      // And the actual image data should be in buffers
      expect(decoded.buffers).toHaveLength(1);
      expect(decoded.buffers[0]!.mimeType).toBe('image/png');
    });
  });

  describe('Multi-page round-trips', () => {
    it('should round-trip multi-page project', () => {
      const project = {
        ...makeV2Project([makeRect('r1')], ['r1']),
        pages: [
          {
            id: 'page-1',
            name: 'Home',
            sceneGraph: { nodes: [makeRect('r1')], rootNodeIds: ['r1'] },
            timeline: { id: 'tl-1', tracks: [], duration: 300, frameRate: 30 },
          },
          {
            id: 'page-2',
            name: 'About',
            sceneGraph: { nodes: [makeEllipse('e1')], rootNodeIds: ['e1'] },
            timeline: { id: 'tl-2', tracks: [], duration: 600, frameRate: 24 },
          },
          {
            id: 'page-3',
            name: 'Contact',
            sceneGraph: { nodes: [], rootNodeIds: [] },
            timeline: { id: 'tl-3', tracks: [], duration: 150, frameRate: 30 },
          },
        ],
        activePageId: 'page-2',
      };

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const pages = parsed.pages as any[];
      expect(pages).toHaveLength(3);
      expect(pages[0].name).toBe('Home');
      expect(pages[1].name).toBe('About');
      expect(pages[2].name).toBe('Contact');
      expect(pages[1].sceneGraph.nodes[0].type).toBe('ellipse');
    });
  });

  describe('Symbol round-trips', () => {
    it('should round-trip project with symbols and instances', () => {
      const symbolDef = {
        id: 'sym-1',
        name: 'Button',
        sceneGraphJSON: {
          nodes: [makeRect('sym-rect')],
          rootNodeIds: ['sym-rect'],
        },
      };

      const instance = makeNode('inst-1', 'symbol-instance', {
        symbolId: 'sym-1',
        overrides: [{ nodeId: 'sym-rect', properties: { opacity: 0.5 } }],
      });

      const project = makeV2Project([instance], ['inst-1'], {
        symbols: [symbolDef],
      });

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      // Verify symbols
      const symbols = parsed.symbols as any[];
      expect(symbols).toHaveLength(1);
      expect(symbols[0].id).toBe('sym-1');
      expect(symbols[0].name).toBe('Button');

      // Verify instance
      const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      expect(nodes[0].type).toBe('symbol-instance');
      expect(nodes[0].symbolId).toBe('sym-1');
      expect(nodes[0].overrides[0].properties.opacity).toBe(0.5);
    });
  });

  describe('Rigging data round-trips', () => {
    it('should round-trip project with bones and IK data', () => {
      const boneNode = makeNode('bone-1', 'bone', {
        length: 100,
        parentBoneId: null,
      });

      const ikTarget = makeNode('ik-target-1', 'ik-target', {
        chainId: 'chain-1',
      });

      const project = makeV2Project([boneNode, ikTarget], ['bone-1', 'ik-target-1'], {
        rigging: {
          vitruvianControllers: [
            {
              id: 'vc-1',
              name: 'Arms',
              boneGroups: [{ id: 'bg-1', name: 'T-Pose', boneIds: ['bone-1'] }],
              activeGroupId: 'bg-1',
            },
          ],
          dynamicChains: [
            {
              id: 'dc-1',
              boneIds: ['bone-1'],
              gravity: 9.8,
              damping: 0.5,
              stiffness: 0.8,
            },
          ],
          globalWind: { strength: 5, direction: 90, turbulence: 0.3 },
        },
      });

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const rigging = parsed.rigging as any;
      expect(rigging.vitruvianControllers).toHaveLength(1);
      expect(rigging.vitruvianControllers[0].name).toBe('Arms');
      expect(rigging.dynamicChains).toHaveLength(1);
      expect(rigging.dynamicChains[0].gravity).toBe(9.8);
      expect(rigging.globalWind.strength).toBe(5);
    });
  });

  describe('Guides round-trips', () => {
    it('should round-trip project with guides', () => {
      const project = makeV2Project([makeRect('r1')], ['r1']);
      (project.settings as any).guides = [
        { id: 'g1', axis: 'horizontal', position: 100 },
        { id: 'g2', axis: 'vertical', position: 200 },
      ];

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const guides = (parsed.settings as any).guides;
      expect(guides).toHaveLength(2);
      expect(guides[0].axis).toBe('horizontal');
      expect(guides[0].position).toBe(100);
      expect(guides[1].axis).toBe('vertical');
    });
  });

  describe('Effects round-trips', () => {
    it('should round-trip project with effects (drop shadow, blur)', () => {
      const nodeWithEffects = makeRect('r1');
      (nodeWithEffects as any).effects = [
        {
          type: 'dropShadow',
          color: { r: 0, g: 0, b: 0, a: 0.5 },
          offsetX: 5,
          offsetY: 5,
          blur: 10,
        },
        { type: 'layerBlur', radius: 3 },
      ];

      const project = makeV2Project([nodeWithEffects], ['r1']);

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const effects = (parsed.pages as any[])[0].sceneGraph.nodes[0].effects;
      expect(effects).toHaveLength(2);
      expect(effects[0].type).toBe('dropShadow');
      expect(effects[0].blur).toBe(10);
      expect(effects[1].type).toBe('layerBlur');
      expect(effects[1].radius).toBe(3);
    });
  });

  describe('Empty project', () => {
    it('should round-trip an empty project', () => {
      const project = makeV2Project([], []);

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      expect(parsed.name).toBe('Integration Test');
      expect((parsed.pages as any[])[0].sceneGraph.nodes).toHaveLength(0);
    });
  });

  describe('Version migration through binary', () => {
    it('should migrate v1 format input to v3 output', () => {
      const v1 = {
        version: '1.0',
        name: 'V1 Project',
        createdAt: '2023-01-01',
        updatedAt: '2023-01-01',
        sceneGraph: { nodes: [makeRect('r1')], rootNodeIds: ['r1'] },
        timeline: { id: 'tl', tracks: [], duration: 300, frameRate: 30 },
        settings: { timelineDuration: 300, frameRate: 30, autoKeyframe: false, onionSkin: {} },
      };

      const jsonStr = JSON.stringify(v1);
      const parsed = parseQuarFile(jsonStr);

      expect(parsed.version).toBe('3.0');
      expect(parsed.pages as any[]).toHaveLength(1);
      expect((parsed.pages as any[])[0].sceneGraph.nodes[0].id).toBe('r1');
    });

    it('should migrate v2 format input to v3 output', () => {
      const v2 = makeV2Project([makeRect('r1')], ['r1']);
      const jsonStr = JSON.stringify(v2);
      const parsed = parseQuarFile(jsonStr);

      expect(parsed.version).toBe('3.0');
    });
  });

  describe('Error handling', () => {
    it('should throw on corrupted binary', () => {
      const garbage = new ArrayBuffer(32);
      const view = new DataView(garbage);
      view.setUint32(0, QUAR_MAGIC, true);
      view.setUint32(4, 3, true); // version
      view.setUint32(8, 0, true); // flags
      view.setUint32(12, 99999, true); // impossible JSON length

      expect(() => parseQuarFile(garbage)).toThrow();
    });

    it('should throw on truncated file', () => {
      // Valid header but nothing else
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      view.setUint32(0, QUAR_MAGIC, true);
      view.setUint32(4, 3, true);
      view.setUint32(8, 0, true);
      view.setUint32(12, 100, true); // says 100 bytes of JSON, but file is only 16 bytes

      expect(() => parseQuarFile(buf)).toThrow();
    });

    it('should throw on wrong magic bytes', () => {
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      view.setUint32(0, 0xdeadbeef, true);

      expect(() => parseQuarFile(buf)).toThrow();
    });
  });

  describe('Large project', () => {
    it('should round-trip 100+ node project', () => {
      const nodes = [];
      const rootIds = [];
      for (let i = 0; i < 120; i++) {
        const node = makeRect(`rect-${i}`, i * 10, i * 10);
        nodes.push(node);
        rootIds.push(`rect-${i}`);
      }

      const project = makeV2Project(nodes, rootIds);
      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);

      const restoredNodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      expect(restoredNodes).toHaveLength(120);
      expect(restoredNodes[99].id).toBe('rect-99');
      expect(restoredNodes[99].transform.position.x).toBe(990);
    });
  });

  describe('Binary size comparison', () => {
    it('should produce smaller files than JSON for image-heavy projects', () => {
      // Create a project with multiple images
      const nodes = [];
      const rootIds = [];
      for (let i = 0; i < 5; i++) {
        nodes.push(makeImageNode(`img-${i}`, TINY_PNG_DATA_URI));
        rootIds.push(`img-${i}`);
      }

      const project = makeV2Project(nodes, rootIds);
      const jsonSize = JSON.stringify(project).length;
      const binarySize = writeQuarFile(project).byteLength;

      // Binary should be smaller because base64 → raw bytes saves ~33%
      expect(binarySize).toBeLessThan(jsonSize);
    });
  });
});
