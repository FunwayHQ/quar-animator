/**
 * Tests for quarMigration - parseQuarFile, writeQuarFile, migration chain
 */

import { describe, it, expect } from 'vitest';
import {
  parseQuarFile,
  writeQuarFile,
  writeQuarBlob,
  migrateV1ToV2,
  migrateV2ToV3,
  migrateToLatest,
} from './quarMigration';
import { encodeQuarBinary, decodeQuarBinary, QUAR_MAGIC, FORMAT_VERSION } from './quarFormat';
import type { QuarFile } from './quarFormat';
import v1Migration from './__fixtures__/v1-migration.json';

// ============================================================================
// Helpers
// ============================================================================

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function makeV1Project() {
  return {
    version: '1.0',
    name: 'Legacy Project',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    sceneGraph: {
      nodes: [
        {
          id: 'rect1',
          name: 'rect1',
          type: 'rectangle',
          transform: { position: { x: 10, y: 20 }, rotation: 0, scale: { x: 1, y: 1 } },
        },
      ],
      rootNodeIds: ['rect1'],
    },
    timeline: { id: 'tl1', tracks: [], duration: 300, frameRate: 30 },
    settings: {
      timelineDuration: 300,
      frameRate: 30,
      autoKeyframe: false,
      onionSkin: { enabled: false },
    },
  };
}

function makeV2Project() {
  return {
    version: '2.0',
    name: 'V2 Project',
    createdAt: '2024-06-01T00:00:00.000Z',
    updatedAt: '2024-06-01T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        name: 'Page 1',
        sceneGraph: {
          nodes: [
            {
              id: 'rect1',
              name: 'rect1',
              type: 'rectangle',
              transform: { position: { x: 0, y: 0 }, rotation: 0 },
            },
          ],
          rootNodeIds: ['rect1'],
        },
        timeline: { id: 'tl1', tracks: [], duration: 300, frameRate: 30 },
      },
    ],
    activePageId: 'page-1',
    settings: {
      timelineDuration: 300,
      frameRate: 30,
      autoKeyframe: false,
      onionSkin: { enabled: false },
    },
    symbols: [],
  };
}

function makeV2ProjectWithImage() {
  const v2 = makeV2Project();
  v2.pages[0].sceneGraph.nodes.push({
    id: 'img1',
    name: 'Photo',
    type: 'image',
    src: TINY_PNG_DATA_URI,
    width: 100,
    height: 100,
    transform: { position: { x: 50, y: 50 }, rotation: 0 },
  } as any);
  v2.pages[0].sceneGraph.rootNodeIds.push('img1');
  return v2;
}

// ============================================================================
// migrateV1ToV2
// ============================================================================

describe('quarMigration', () => {
  describe('migrateV1ToV2', () => {
    it('should wrap single-page data into pages array', () => {
      const v1 = makeV1Project();
      const v2 = migrateV1ToV2(v1 as any);

      expect(v2.version).toBe('2.0');
      expect(v2.pages as any[]).toHaveLength(1);
      expect((v2.pages as any[])[0].name).toBe('Page 1');
      expect((v2.pages as any[])[0].sceneGraph).toBe(v1.sceneGraph);
    });

    it('should preserve name and timestamps', () => {
      const v1 = makeV1Project();
      const v2 = migrateV1ToV2(v1 as any);

      expect(v2.name).toBe('Legacy Project');
      expect(v2.createdAt).toBe('2024-01-01T00:00:00.000Z');
    });

    // The MCP tool (tools/quar-mcp, Python) migrates v1 files too: both are
    // tested against the same fixture so they stay in agreement (F169)
    it('migrates the shared fixture as the MCP tool does', () => {
      const v2 = migrateV1ToV2(structuredClone(v1Migration.v1));
      const [page, ...rest] = v2.pages as { id: string }[];

      // The page id is made up by each migration
      expect(rest).toHaveLength(0);
      expect(v2.activePageId).toBe(page?.id);
      expect({ ...v2, pages: [{ ...page, id: 'PAGE_ID' }], activePageId: 'PAGE_ID' }).toEqual(
        v1Migration.v2
      );
    });
  });

  // ============================================================================
  // migrateV2ToV3
  // ============================================================================

  describe('migrateV2ToV3', () => {
    it('should set version to 3.0', () => {
      const v2 = makeV2Project();
      const v3 = migrateV2ToV3(v2 as any);
      expect(v3.version).toBe('3.0');
    });

    it('should preserve all existing fields', () => {
      const v2 = makeV2Project();
      const v3 = migrateV2ToV3(v2 as any);

      expect(v3.name).toBe('V2 Project');
      expect(v3.pages as any[]).toHaveLength(1);
      expect(v3.activePageId).toBe('page-1');
      expect((v3.settings as any).timelineDuration).toBe(300);
      expect(v3.symbols).toEqual([]);
    });
  });

  // ============================================================================
  // migrateToLatest
  // ============================================================================

  describe('migrateToLatest', () => {
    it('should migrate v1 through chain to v3', () => {
      const v1 = makeV1Project();
      const latest = migrateToLatest(v1 as any);

      expect(latest.version).toBe('3.0');
      expect(latest.pages as any[]).toHaveLength(1);
    });

    it('should migrate v2 to v3', () => {
      const v2 = makeV2Project();
      const latest = migrateToLatest(v2 as any);

      expect(latest.version).toBe('3.0');
      expect(latest.name).toBe('V2 Project');
    });

    it('should return v3 as-is', () => {
      const v3 = { version: '3.0', name: 'Already V3' };
      const latest = migrateToLatest(v3);

      expect(latest.version).toBe('3.0');
      expect(latest.name).toBe('Already V3');
      expect(latest).toBe(v3); // same reference
    });
  });

  // ============================================================================
  // parseQuarFile
  // ============================================================================

  describe('parseQuarFile', () => {
    it('should parse v3 binary input', () => {
      const v2 = makeV2Project();
      const binary = writeQuarFile(v2 as any);
      const parsed = parseQuarFile(binary);

      expect(parsed.version).toBe('3.0');
      expect(parsed.name).toBe('V2 Project');
    });

    it('should parse v2 JSON string input and auto-migrate', () => {
      const v2 = makeV2Project();
      const jsonStr = JSON.stringify(v2);
      const parsed = parseQuarFile(jsonStr);

      expect(parsed.version).toBe('3.0');
      expect(parsed.pages as any[]).toHaveLength(1);
    });

    it('should parse v1 JSON string input (double migration)', () => {
      const v1 = makeV1Project();
      const jsonStr = JSON.stringify(v1);
      const parsed = parseQuarFile(jsonStr);

      expect(parsed.version).toBe('3.0');
      expect(parsed.pages as any[]).toHaveLength(1);
      expect((parsed.pages as any[])[0].sceneGraph.nodes).toHaveLength(1);
    });

    it('should restore images from binary format', () => {
      const v2 = makeV2ProjectWithImage();
      const binary = writeQuarFile(v2 as any);
      const parsed = parseQuarFile(binary);

      const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      const imageNode = nodes.find((n: any) => n.type === 'image');
      expect(imageNode.src).toBe(TINY_PNG_DATA_URI);
    });

    it('should parse ArrayBuffer containing JSON text (legacy binary load)', () => {
      const v2 = makeV2Project();
      const jsonStr = JSON.stringify(v2);
      const encoder = new TextEncoder();
      const binary = encoder.encode(jsonStr).buffer;

      const parsed = parseQuarFile(binary);
      expect(parsed.version).toBe('3.0');
    });

    it('should throw on invalid JSON string', () => {
      expect(() => parseQuarFile('not valid json {')).toThrow('failed to parse JSON');
    });

    it('should throw on corrupted binary', () => {
      const garbage = new ArrayBuffer(32);
      const view = new DataView(garbage);
      view.setUint32(0, QUAR_MAGIC, true);
      view.setUint32(4, FORMAT_VERSION, true);
      view.setUint32(8, 0, true);
      view.setUint32(12, 999, true); // bad JSON length

      expect(() => parseQuarFile(garbage)).toThrow();
    });

    it('should throw on unrecognized binary format', () => {
      const buf = new Uint8Array([0x00, 0x00, 0x00, 0x00]).buffer;
      expect(() => parseQuarFile(buf)).toThrow('not a recognized format');
    });
  });

  // ============================================================================
  // writeQuarFile
  // ============================================================================

  describe('writeQuarFile', () => {
    it('should produce valid binary', () => {
      const v2 = makeV2Project();
      const binary = writeQuarFile(v2 as any);

      const view = new DataView(binary);
      expect(view.getUint32(0, true)).toBe(QUAR_MAGIC);
      expect(view.getUint32(4, true)).toBe(FORMAT_VERSION);
    });

    it('should extract images into buffers', () => {
      const v2 = makeV2ProjectWithImage();
      const binary = writeQuarFile(v2 as any);

      // Decode to check buffers were created
      const decoded = decodeQuarBinary(binary);
      expect(decoded.buffers.length).toBeGreaterThan(0);
      expect(decoded.buffers[0].mimeType).toBe('image/png');
    });

    it('should round-trip: writeQuarFile → parseQuarFile', () => {
      const v2 = makeV2Project();
      const binary = writeQuarFile(v2 as any);
      const parsed = parseQuarFile(binary);

      expect(parsed.version).toBe('3.0');
      expect(parsed.name).toBe('V2 Project');
      expect((parsed.pages as any[])[0].sceneGraph.nodes[0].id).toBe('rect1');
    });

    it('should round-trip with images: writeQuarFile → parseQuarFile', () => {
      const v2 = makeV2ProjectWithImage();
      const binary = writeQuarFile(v2 as any);
      const parsed = parseQuarFile(binary);

      const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
      const imageNode = nodes.find((n: any) => n.type === 'image');
      expect(imageNode.src).toBe(TINY_PNG_DATA_URI);
    });

    it('should handle empty project', () => {
      const project = {
        version: '3.0',
        name: 'Empty',
        pages: [{ id: 'p1', name: 'Page 1', sceneGraph: { nodes: [], rootNodeIds: [] } }],
        activePageId: 'p1',
        settings: { timelineDuration: 300, frameRate: 30 },
      };

      const binary = writeQuarFile(project);
      const parsed = parseQuarFile(binary);
      expect(parsed.name).toBe('Empty');
    });
  });

  // ==========================================================================
  // Files kept whole (a video's)
  // ==========================================================================

  describe('files kept whole', () => {
    /** A Blob's bytes, read as the browser reads a dropped file */
    const bytesOf = (blob: Blob) =>
      new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = () => reject(reader.error ?? new Error('unreadable'));
        reader.readAsArrayBuffer(blob);
      });
    const videoBytes = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0xff, 0x2b, 0x2f]);
    const withVideo = () => ({
      ...makeV2ProjectWithImage(),
      videos: [
        {
          id: 'v1',
          name: 'Clip',
          mimeType: 'video/mp4',
          file: new Blob([videoBytes], { type: 'video/mp4' }),
        },
      ],
    });

    it('writes a file as a buffer of its own, its bytes and type as they are, and reads it back', async () => {
      const binary = (await bytesOf(writeQuarBlob(withVideo()))).buffer as ArrayBuffer;

      // The picture's buffer, then the video's, which its entry names
      const decoded = decodeQuarBinary(binary);
      expect(decoded.buffers.map((buffer) => buffer.mimeType)).toEqual(['image/png', 'video/mp4']);
      expect(decoded.buffers[1]!.data).toEqual(videoBytes);
      expect((decoded.json.videos as any[])[0].file).toBe('buffer:1');

      const parsed = parseQuarFile(binary);
      const file = (parsed.videos as any[])[0].file as Blob;
      expect(file).toBeInstanceOf(Blob);
      expect(file.type).toBe('video/mp4');
      expect(await bytesOf(file)).toEqual(videoBytes);
      // Pictures come back as data URIs, as ever
      const image = (parsed.pages as any[])[0].sceneGraph.nodes.find((n: any) => n.id === 'img1');
      expect(image.src).toBe(TINY_PNG_DATA_URI);
    });

    it('writes what writeQuarFile writes for a project without files', async () => {
      const project = makeV2ProjectWithImage();
      expect(await bytesOf(writeQuarBlob(project))).toEqual(new Uint8Array(writeQuarFile(project)));
    });

    it('leaves files out of writeQuarFile, which keeps the rest', () => {
      const binary = writeQuarFile(withVideo());
      expect(decodeQuarBinary(binary).buffers.map((buffer) => buffer.mimeType)).toEqual([
        'image/png',
      ]);
      expect((parseQuarFile(binary).videos as any[])[0]).toEqual({
        id: 'v1',
        name: 'Clip',
        mimeType: 'video/mp4',
      });
    });

    it('leaves a file reference naming no buffer as it is', () => {
      const binary = encodeQuarBinary({
        json: { ...makeV2Project(), version: '3.0', videos: [{ id: 'v1', file: 'buffer:7' }] },
        buffers: [],
      });
      expect((parseQuarFile(binary).videos as any[])[0].file).toBe('buffer:7');
    });
  });
});
