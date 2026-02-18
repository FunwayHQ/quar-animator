/**
 * Tests for quarFormat - Binary .quar encode/decode and image extraction/restoration
 */

import { describe, it, expect } from 'vitest';
import {
  encodeQuarBinary,
  decodeQuarBinary,
  extractImageBuffers,
  restoreImageBuffers,
  isQuarBinary,
  QUAR_MAGIC,
  FORMAT_VERSION,
} from './quarFormat';
import type { QuarFile, QuarBuffer } from './quarFormat';

// ============================================================================
// Helpers
// ============================================================================

/** Create a tiny 1x1 red pixel PNG as base64 */
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

/** Create a tiny JPEG-like base64 string */
const TINY_JPEG_BASE64 = '/9j/4AAQSkZJRg==';
const TINY_JPEG_DATA_URI = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;

function makeImageNode(id: string, src: string) {
  return {
    id,
    name: id,
    type: 'image',
    src,
    width: 100,
    height: 100,
    transform: { position: { x: 0, y: 0 }, rotation: 0 },
  };
}

// ============================================================================
// encodeQuarBinary / decodeQuarBinary round-trip
// ============================================================================

describe('quarFormat', () => {
  describe('encodeQuarBinary / decodeQuarBinary', () => {
    it('should round-trip with 0 buffers', () => {
      const file: QuarFile = {
        json: { version: '3.0', name: 'Empty Project' },
        buffers: [],
      };

      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);

      expect(decoded.json).toEqual(file.json);
      expect(decoded.buffers).toHaveLength(0);
    });

    it('should round-trip with 1 buffer', () => {
      const bufData = new Uint8Array([1, 2, 3, 4, 5]);
      const file: QuarFile = {
        json: { version: '3.0', name: 'With Image' },
        buffers: [{ data: bufData, mimeType: 'image/png' }],
      };

      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);

      expect(decoded.json).toEqual(file.json);
      expect(decoded.buffers).toHaveLength(1);
      expect(decoded.buffers[0]!.mimeType).toBe('image/png');
      expect(Array.from(decoded.buffers[0]!.data)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should round-trip with 3 buffers', () => {
      const file: QuarFile = {
        json: { version: '3.0', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
        buffers: [
          { data: new Uint8Array([10, 20, 30]), mimeType: 'image/png' },
          { data: new Uint8Array([40, 50]), mimeType: 'image/jpeg' },
          { data: new Uint8Array([60]), mimeType: 'image/svg+xml' },
        ],
      };

      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);

      expect(decoded.json).toEqual(file.json);
      expect(decoded.buffers).toHaveLength(3);
      expect(decoded.buffers[0]!.mimeType).toBe('image/png');
      expect(decoded.buffers[1]!.mimeType).toBe('image/jpeg');
      expect(decoded.buffers[2]!.mimeType).toBe('image/svg+xml');
      expect(Array.from(decoded.buffers[2]!.data)).toEqual([60]);
    });

    it('should write correct magic bytes', () => {
      const file: QuarFile = { json: {}, buffers: [] };
      const binary = encodeQuarBinary(file);
      const view = new DataView(binary);

      expect(view.getUint32(0, true)).toBe(QUAR_MAGIC);
      // Verify ASCII: Q=0x51, U=0x55, A=0x41, R=0x52
      const bytes = new Uint8Array(binary);
      expect(bytes[0]).toBe(0x51); // Q
      expect(bytes[1]).toBe(0x55); // U
      expect(bytes[2]).toBe(0x41); // A
      expect(bytes[3]).toBe(0x52); // R
    });

    it('should write correct version number', () => {
      const file: QuarFile = { json: {}, buffers: [] };
      const binary = encodeQuarBinary(file);
      const view = new DataView(binary);

      expect(view.getUint32(4, true)).toBe(FORMAT_VERSION);
    });

    it('should handle large buffer (>64KB)', () => {
      const largeData = new Uint8Array(100_000);
      for (let i = 0; i < largeData.length; i++) {
        largeData[i] = i & 0xff;
      }

      const file: QuarFile = {
        json: { name: 'large' },
        buffers: [{ data: largeData, mimeType: 'image/png' }],
      };

      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);

      expect(decoded.buffers[0]!.data.length).toBe(100_000);
      // Spot check some bytes
      expect(decoded.buffers[0]!.data[0]).toBe(0);
      expect(decoded.buffers[0]!.data[255]).toBe(255);
      expect(decoded.buffers[0]!.data[256]).toBe(0);
    });

    it('should handle empty JSON object', () => {
      const file: QuarFile = { json: {}, buffers: [] };
      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);
      expect(decoded.json).toEqual({});
    });

    it('should preserve complex nested JSON', () => {
      const file: QuarFile = {
        json: {
          deeply: {
            nested: {
              array: [1, 'two', { three: true }],
              nullVal: null,
            },
          },
        },
        buffers: [],
      };

      const binary = encodeQuarBinary(file);
      const decoded = decodeQuarBinary(binary);
      expect(decoded.json).toEqual(file.json);
    });
  });

  // ============================================================================
  // Error handling
  // ============================================================================

  describe('decodeQuarBinary error handling', () => {
    it('should throw on invalid magic', () => {
      const buf = new ArrayBuffer(16);
      const view = new DataView(buf);
      view.setUint32(0, 0x12345678, true);

      expect(() => decodeQuarBinary(buf)).toThrow('wrong magic bytes');
    });

    it('should throw on truncated header', () => {
      const buf = new ArrayBuffer(8); // too small for 16-byte header
      expect(() => decodeQuarBinary(buf)).toThrow('too small');
    });

    it('should throw on truncated JSON chunk', () => {
      const buf = new ArrayBuffer(20);
      const view = new DataView(buf);
      view.setUint32(0, QUAR_MAGIC, true);
      view.setUint32(4, FORMAT_VERSION, true);
      view.setUint32(8, 0, true); // flags
      view.setUint32(12, 999, true); // JSON length = 999 but buffer is only 20 bytes

      expect(() => decodeQuarBinary(buf)).toThrow('JSON chunk extends beyond');
    });

    it('should throw on corrupted JSON', () => {
      // Build a valid header with garbage JSON
      const garbageJson = new Uint8Array([0xff, 0xfe, 0xfd]);
      const totalSize = 16 + garbageJson.length + 4;
      const buf = new ArrayBuffer(totalSize);
      const view = new DataView(buf);
      const bytes = new Uint8Array(buf);

      view.setUint32(0, QUAR_MAGIC, true);
      view.setUint32(4, FORMAT_VERSION, true);
      view.setUint32(8, 0, true);
      view.setUint32(12, garbageJson.length, true);
      bytes.set(garbageJson, 16);
      view.setUint32(16 + garbageJson.length, 0, true); // buffer count

      expect(() => decodeQuarBinary(buf)).toThrow('corrupted JSON');
    });

    it('should throw on truncated buffer data', () => {
      const jsonStr = '{}';
      const jsonBytes = new TextEncoder().encode(jsonStr);
      // Header(16) + json + bufferCount(4) + bufDataLen(4) + mimeLen(4)
      // But don't include actual buffer data
      const totalSize = 16 + jsonBytes.length + 4 + 8;
      const buf = new ArrayBuffer(totalSize);
      const view = new DataView(buf);
      const bytes = new Uint8Array(buf);

      let offset = 0;
      view.setUint32(offset, QUAR_MAGIC, true);
      offset += 4;
      view.setUint32(offset, FORMAT_VERSION, true);
      offset += 4;
      view.setUint32(offset, 0, true);
      offset += 4;
      view.setUint32(offset, jsonBytes.length, true);
      offset += 4;
      bytes.set(jsonBytes, offset);
      offset += jsonBytes.length;
      view.setUint32(offset, 1, true); // 1 buffer
      offset += 4;
      view.setUint32(offset, 999, true); // data length = 999 (way beyond)

      expect(() => decodeQuarBinary(buf)).toThrow(/truncated/);
    });
  });

  // ============================================================================
  // extractImageBuffers
  // ============================================================================

  describe('extractImageBuffers', () => {
    it('should extract data URIs from src fields', () => {
      const json = {
        pages: [
          {
            sceneGraph: {
              nodes: [makeImageNode('img1', TINY_PNG_DATA_URI)],
            },
          },
        ],
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(1);
      expect(result.buffers[0]!.mimeType).toBe('image/png');
      // Verify the JSON now references the buffer
      const pages = (result.json as any).pages;
      expect(pages[0].sceneGraph.nodes[0].src).toBe('buffer:0');
    });

    it('should handle multiple images', () => {
      const json = {
        pages: [
          {
            sceneGraph: {
              nodes: [
                makeImageNode('img1', TINY_PNG_DATA_URI),
                makeImageNode('img2', TINY_JPEG_DATA_URI),
              ],
            },
          },
        ],
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(2);
      expect(result.buffers[0]!.mimeType).toBe('image/png');
      expect(result.buffers[1]!.mimeType).toBe('image/jpeg');
    });

    it('should return empty buffers when no images', () => {
      const json = {
        version: '3.0',
        name: 'No Images',
        pages: [
          {
            sceneGraph: {
              nodes: [{ id: 'rect1', type: 'rectangle', width: 100 }],
            },
          },
        ],
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(0);
    });

    it('should preserve non-image data URIs', () => {
      const json = {
        nodes: [
          {
            id: 'n1',
            src: 'data:text/plain;base64,SGVsbG8=', // not image/*
          },
        ],
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(0);
      expect((result.json as any).nodes[0].src).toBe('data:text/plain;base64,SGVsbG8=');
    });

    it('should dedup identical data URIs', () => {
      const json = {
        nodes: [
          { id: 'a', src: TINY_PNG_DATA_URI },
          { id: 'b', src: TINY_PNG_DATA_URI },
        ],
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(1);
      expect((result.json as any).nodes[0].src).toBe('buffer:0');
      expect((result.json as any).nodes[1].src).toBe('buffer:0');
    });

    it('should handle null and undefined values', () => {
      const json = { a: null, b: undefined, c: [null, { d: null }] };
      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(0);
    });

    it('should handle deeply nested images', () => {
      const json = {
        level1: {
          level2: {
            level3: {
              nodes: [{ id: 'deep', src: TINY_PNG_DATA_URI }],
            },
          },
        },
      };

      const result = extractImageBuffers(json);
      expect(result.buffers).toHaveLength(1);
      expect((result.json as any).level1.level2.level3.nodes[0].src).toBe('buffer:0');
    });
  });

  // ============================================================================
  // restoreImageBuffers
  // ============================================================================

  describe('restoreImageBuffers', () => {
    it('should restore buffer references to data URIs', () => {
      const buffers: QuarBuffer[] = [
        {
          data: new Uint8Array([1, 2, 3]),
          mimeType: 'image/png',
        },
      ];

      const json = {
        nodes: [{ id: 'img1', src: 'buffer:0' }],
      };

      const restored = restoreImageBuffers(json, buffers) as any;
      expect(restored.nodes[0].src).toMatch(/^data:image\/png;base64,/);
    });

    it('should handle multiple buffer references', () => {
      const buffers: QuarBuffer[] = [
        { data: new Uint8Array([1]), mimeType: 'image/png' },
        { data: new Uint8Array([2]), mimeType: 'image/jpeg' },
      ];

      const json = {
        nodes: [
          { id: 'a', src: 'buffer:0' },
          { id: 'b', src: 'buffer:1' },
        ],
      };

      const restored = restoreImageBuffers(json, buffers) as any;
      expect(restored.nodes[0].src).toMatch(/^data:image\/png;base64,/);
      expect(restored.nodes[1].src).toMatch(/^data:image\/jpeg;base64,/);
    });

    it('should leave non-buffer src values unchanged', () => {
      const json = {
        nodes: [{ id: 'n1', src: 'https://example.com/image.png' }],
      };

      const restored = restoreImageBuffers(json, []) as any;
      expect(restored.nodes[0].src).toBe('https://example.com/image.png');
    });

    it('should leave out-of-range buffer refs unchanged', () => {
      const json = {
        nodes: [{ id: 'n1', src: 'buffer:99' }],
      };

      const restored = restoreImageBuffers(json, []) as any;
      expect(restored.nodes[0].src).toBe('buffer:99');
    });
  });

  // ============================================================================
  // extractImageBuffers → restoreImageBuffers round-trip
  // ============================================================================

  describe('extract + restore round-trip', () => {
    it('should preserve original data URIs', () => {
      const original = {
        pages: [
          {
            sceneGraph: {
              nodes: [
                makeImageNode('img1', TINY_PNG_DATA_URI),
                makeImageNode('img2', TINY_JPEG_DATA_URI),
              ],
            },
          },
        ],
      };

      const { json, buffers } = extractImageBuffers(original);
      const restored = restoreImageBuffers(json, buffers) as any;

      expect(restored.pages[0].sceneGraph.nodes[0].src).toBe(TINY_PNG_DATA_URI);
      expect(restored.pages[0].sceneGraph.nodes[1].src).toBe(TINY_JPEG_DATA_URI);
    });

    it('should preserve MIME types through round-trip', () => {
      const original = {
        nodes: [
          { id: 'a', src: TINY_PNG_DATA_URI },
          { id: 'b', src: TINY_JPEG_DATA_URI },
        ],
      };

      const { json, buffers } = extractImageBuffers(original);
      expect(buffers[0]!.mimeType).toBe('image/png');
      expect(buffers[1]!.mimeType).toBe('image/jpeg');

      const restored = restoreImageBuffers(json, buffers) as any;
      expect(restored.nodes[0].src).toContain('data:image/png;base64,');
      expect(restored.nodes[1].src).toContain('data:image/jpeg;base64,');
    });
  });

  // ============================================================================
  // isQuarBinary
  // ============================================================================

  describe('isQuarBinary', () => {
    it('should detect binary .quar files', () => {
      const file: QuarFile = { json: { name: 'test' }, buffers: [] };
      const binary = encodeQuarBinary(file);
      expect(isQuarBinary(binary)).toBe(true);
    });

    it('should reject non-.quar data', () => {
      const buf = new ArrayBuffer(16);
      expect(isQuarBinary(buf)).toBe(false);
    });

    it('should reject too-small buffers', () => {
      const buf = new ArrayBuffer(2);
      expect(isQuarBinary(buf)).toBe(false);
    });

    it('should reject JSON string as ArrayBuffer', () => {
      const json = '{"version":"2.0"}';
      const encoder = new TextEncoder();
      const buf = encoder.encode(json).buffer;
      expect(isQuarBinary(buf)).toBe(false);
    });
  });
});
