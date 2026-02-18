/**
 * Performance benchmarks for .quar binary format
 * Uses performance.now() to verify operations complete within time budgets
 */

import { describe, it, expect } from 'vitest';
import { writeQuarFile, parseQuarFile } from './quarMigration';
import {
  encodeQuarBinary,
  decodeQuarBinary,
  extractImageBuffers,
  restoreImageBuffers,
} from './quarFormat';

// ============================================================================
// Helpers
// ============================================================================

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const TINY_PNG_DATA_URI = `data:image/png;base64,${TINY_PNG_BASE64}`;

function makeRect(id: string, x = 0, y = 0) {
  return {
    id,
    name: id,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: Math.random() * 360,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100 + Math.random() * 200,
    height: 100 + Math.random() * 200,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 } }],
    strokes: [{ color: { r: 0, g: 0, b: 0, a: 1 }, width: 2 }],
  };
}

function makeImageNode(id: string, sizeKB: number) {
  // Create a base64 string that's approximately sizeKB in size
  const rawSize = Math.ceil(sizeKB * 1024);
  const base64Size = Math.ceil((rawSize * 4) / 3);
  const base64 = 'A'.repeat(base64Size);
  return {
    id,
    name: id,
    type: 'image',
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
    src: `data:image/png;base64,${base64}`,
    width: 1920,
    height: 1080,
    naturalWidth: 1920,
    naturalHeight: 1080,
    cornerRadius: [0, 0, 0, 0],
  };
}

function makeKeyframe(id: string, frame: number, value: number) {
  return {
    id,
    frame,
    value,
    easing:
      frame % 3 === 0 ? 'linear' : { type: 'cubicBezier', x1: 0.25, y1: 0.1, x2: 0.25, y2: 1.0 },
  };
}

function makeProject(nodeCount: number) {
  const nodes = [];
  const rootIds = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push(makeRect(`rect-${i}`, i * 10, i * 5));
    rootIds.push(`rect-${i}`);
  }

  return {
    version: '2.0',
    name: 'Benchmark Project',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    pages: [
      {
        id: 'page-1',
        name: 'Page 1',
        sceneGraph: { nodes, rootNodeIds: rootIds },
        timeline: { id: 'tl-1', tracks: [], duration: 300, frameRate: 30 },
      },
    ],
    activePageId: 'page-1',
    settings: {
      timelineDuration: 300,
      frameRate: 30,
      autoKeyframe: false,
      onionSkin: { enabled: false },
    },
  };
}

// ============================================================================
// Benchmarks
// ============================================================================

describe('Format Performance Benchmarks', () => {
  it('serialize 200 shapes: < 100ms', () => {
    const project = makeProject(200);

    const start = performance.now();
    const binary = writeQuarFile(project);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(binary.byteLength).toBeGreaterThan(0);
  });

  it('deserialize 200 shapes: < 100ms', () => {
    const project = makeProject(200);
    const binary = writeQuarFile(project);

    const start = performance.now();
    const parsed = parseQuarFile(binary);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect((parsed.pages as any[])[0].sceneGraph.nodes).toHaveLength(200);
  });

  it('serialize with 10 images (~100KB each): < 500ms', () => {
    const project = makeProject(5);
    for (let i = 0; i < 10; i++) {
      (project.pages[0].sceneGraph.nodes as any[]).push(makeImageNode(`img-${i}`, 100));
      project.pages[0].sceneGraph.rootNodeIds.push(`img-${i}`);
    }

    const start = performance.now();
    const binary = writeQuarFile(project);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect(binary.byteLength).toBeGreaterThan(0);
  });

  it('deserialize with 10 images (~100KB each): < 500ms', () => {
    const project = makeProject(5);
    for (let i = 0; i < 10; i++) {
      (project.pages[0].sceneGraph.nodes as any[]).push(makeImageNode(`img-${i}`, 100));
      project.pages[0].sceneGraph.rootNodeIds.push(`img-${i}`);
    }
    const binary = writeQuarFile(project);

    const start = performance.now();
    const parsed = parseQuarFile(binary);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    expect((parsed.pages as any[])[0].sceneGraph.nodes).toHaveLength(15);
  });

  it('serialize 1000 keyframes across 50 tracks: < 200ms', () => {
    const project = makeProject(50);
    const tracks = [];
    for (let t = 0; t < 50; t++) {
      const keyframes = [];
      for (let k = 0; k < 20; k++) {
        keyframes.push(makeKeyframe(`kf-${t}-${k}`, k * 5, Math.random() * 500));
      }
      tracks.push({
        id: `track-${t}`,
        nodeId: `rect-${t}`,
        property: 'transform.position.x',
        enabled: true,
        keyframes,
      });
    }
    (project.pages[0] as any).timeline.tracks = tracks;

    const start = performance.now();
    const binary = writeQuarFile(project);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(200);
    expect(binary.byteLength).toBeGreaterThan(0);
  });

  it('round-trip preserves data integrity at scale (500 nodes)', () => {
    const project = makeProject(500);

    const binary = writeQuarFile(project);
    const parsed = parseQuarFile(binary);

    const nodes = (parsed.pages as any[])[0].sceneGraph.nodes;
    expect(nodes).toHaveLength(500);

    // Spot-check a few nodes for data integrity
    expect(nodes[0].id).toBe('rect-0');
    expect(nodes[249].id).toBe('rect-249');
    expect(nodes[499].id).toBe('rect-499');
    expect(nodes[100].transform.position.x).toBe(1000);
    expect(typeof nodes[200].width).toBe('number');
  });

  it('binary format smaller than JSON for image projects', () => {
    const project = makeProject(5);
    for (let i = 0; i < 5; i++) {
      (project.pages[0].sceneGraph.nodes as any[]).push(makeImageNode(`img-${i}`, 50));
      project.pages[0].sceneGraph.rootNodeIds.push(`img-${i}`);
    }

    const jsonSize = JSON.stringify(project).length;
    const binarySize = writeQuarFile(project).byteLength;

    // Binary should be smaller due to base64 → raw bytes conversion
    expect(binarySize).toBeLessThan(jsonSize);

    // Calculate savings percentage
    const savings = ((jsonSize - binarySize) / jsonSize) * 100;
    expect(savings).toBeGreaterThan(10); // At least 10% savings
  });

  it('no duplicate buffers during conversion (memory efficient)', () => {
    const project = makeProject(2);
    // Add same image twice (should be deduped)
    const img = makeImageNode('img-shared', 50);
    (project.pages[0].sceneGraph.nodes as any[]).push(
      { ...img, id: 'img-a' },
      { ...img, id: 'img-b' }
    );

    const binary = writeQuarFile(project);
    const decoded = decodeQuarBinary(binary);

    // Both images use the same data URI, so should be deduped to 1 buffer
    expect(decoded.buffers.length).toBe(1);
  });

  it('v1→v3 migration chain with complex project: < 300ms', () => {
    const v1 = {
      version: '1.0',
      name: 'Complex Legacy',
      createdAt: '2023-01-01',
      updatedAt: '2023-01-01',
      sceneGraph: {
        nodes: Array.from({ length: 100 }, (_, i) => makeRect(`r-${i}`, i * 10, i * 5)),
        rootNodeIds: Array.from({ length: 100 }, (_, i) => `r-${i}`),
      },
      timeline: {
        id: 'tl',
        tracks: Array.from({ length: 20 }, (_, t) => ({
          id: `t-${t}`,
          nodeId: `r-${t}`,
          property: 'transform.position.x',
          enabled: true,
          keyframes: Array.from({ length: 10 }, (_, k) => ({
            id: `kf-${t}-${k}`,
            frame: k * 10,
            value: k * 50,
            easing: 'linear',
          })),
        })),
        duration: 300,
        frameRate: 30,
      },
      settings: {
        timelineDuration: 300,
        frameRate: 30,
        autoKeyframe: false,
        onionSkin: { enabled: false },
      },
    };

    const jsonStr = JSON.stringify(v1);

    const start = performance.now();
    const parsed = parseQuarFile(jsonStr);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(300);
    expect(parsed.version).toBe('3.0');
    expect(parsed.pages as any[]).toHaveLength(1);
  });

  it('extractImageBuffers + restoreImageBuffers round-trip is fast with many images', () => {
    const json: Record<string, unknown> = {
      pages: [
        {
          sceneGraph: {
            nodes: Array.from({ length: 20 }, (_, i) => ({
              id: `img-${i}`,
              src: TINY_PNG_DATA_URI,
            })),
          },
        },
      ],
    };

    const start = performance.now();
    const { json: extracted, buffers } = extractImageBuffers(json);
    const restored = restoreImageBuffers(extracted, buffers);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(buffers.length).toBe(1); // Deduped
    const nodes = (restored as any).pages[0].sceneGraph.nodes;
    expect(nodes[0].src).toBe(TINY_PNG_DATA_URI);
    expect(nodes[19].src).toBe(TINY_PNG_DATA_URI);
  });
});
