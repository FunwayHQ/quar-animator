import { describe, it, expect } from 'vitest';
import type {
  Node,
  RectangleNode,
  EllipseNode,
  GroupNode,
  Timeline,
  Transform,
  Fill,
} from '@quar/types';
import { exportToLottieJson, exportLottieBlob, analyzeLottieExport } from './lottieExporter';
import {
  compileAnimationSequence,
  createClipFromTracks,
  createTimeline,
  addKeyframe,
  getOrCreateTrack,
  restPoseForKeyframes,
  type AnimationSequence,
} from '@quar/animation';

// ============================================================================
// Helpers
// ============================================================================

const defaultTransform: Transform = {
  position: { x: 100, y: 200 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  anchor: { x: 0.5, y: 0.5 },
  skew: { x: 0, y: 0 },
};

const solidFill: Fill = {
  type: 'solid',
  color: { r: 255, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
};

const emptyTimeline: Timeline = {
  id: 'tl-1',
  name: 'Timeline',
  duration: 60,
  frameRate: 30,
  tracks: [],
  markers: [],
};

function makeRect(id: string = 'r1', name: string = 'Rect'): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [solidFill],
    strokes: [],
  };
}

function makeEllipse(id: string = 'e1', name: string = 'Ellipse'): EllipseNode {
  return {
    id,
    name,
    type: 'ellipse',
    parent: null,
    children: [],
    transform: defaultTransform,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: 50,
    radiusY: 30,
    fills: [solidFill],
    strokes: [],
  };
}

// ============================================================================
// exportToLottieJson
// ============================================================================

describe('exportToLottieJson', () => {
  it('creates valid top-level structure', () => {
    const result = exportToLottieJson([], emptyTimeline, { width: 800, height: 600 });
    expect(result.v).toBe('5.7.4');
    expect(result.fr).toBe(30);
    expect(result.ip).toBe(0);
    expect(result.op).toBe(60);
    expect(result.w).toBe(800);
    expect(result.h).toBe(600);
    expect(result.ddd).toBe(0);
    expect(result.layers).toEqual([]);
  });

  it('converts rectangle nodes to layers', () => {
    const nodes: Node[] = [makeRect()];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].ty).toBe(4);
    expect(result.layers[0].nm).toBe('Rect');
  });

  it('layer in/out points match the composition window (F056)', () => {
    const nodes: Node[] = [makeRect()];
    const result = exportToLottieJson(nodes, emptyTimeline, {
      width: 800,
      height: 600,
      startFrame: 30,
      endFrame: 90,
    });
    expect(result.ip).toBe(30);
    expect(result.op).toBe(91);
    // The layer window must span the whole comp, else frames 60..90 go blank.
    expect(result.layers[0].ip).toBe(30);
    expect(result.layers[0].op).toBe(91);
  });

  it('respects custom options', () => {
    const result = exportToLottieJson([], emptyTimeline, {
      width: 1920,
      height: 1080,
      startFrame: 10,
      endFrame: 50,
      frameRate: 60,
      name: 'My Animation',
    });
    expect(result.fr).toBe(60);
    expect(result.ip).toBe(10);
    expect(result.op).toBe(51);
    expect(result.w).toBe(1920);
    expect(result.h).toBe(1080);
    expect(result.nm).toBe('My Animation');
  });

  it('skips invisible nodes', () => {
    const visible = makeRect('r1', 'Visible');
    const hidden = makeRect('r2', 'Hidden');
    hidden.visible = false;
    const result = exportToLottieJson([visible, hidden], emptyTimeline, {
      width: 800,
      height: 600,
    });
    expect(result.layers).toHaveLength(1);
    expect(result.layers[0].nm).toBe('Visible');
  });

  it('reverses node order for Lottie render order', () => {
    const nodes: Node[] = [makeRect('r1', 'Bottom'), makeRect('r2', 'Top')];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    // Bottom node should come first in Lottie layers (reversed)
    expect(result.layers[0].nm).toBe('Top');
    expect(result.layers[1].nm).toBe('Bottom');
  });

  it('assigns sequential layer indices', () => {
    const nodes: Node[] = [makeRect('r1'), makeEllipse('e1')];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    expect(result.layers[0].ind).toBe(0);
    expect(result.layers[1].ind).toBe(1);
  });
});

// ============================================================================
// exportLottieBlob
// ============================================================================

describe('exportLottieBlob', () => {
  it('returns a JSON blob', () => {
    const blob = exportLottieBlob([makeRect()], emptyTimeline, { width: 800, height: 600 });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('application/json');
    expect(blob.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// analyzeLottieExport
// ============================================================================

function makeBone(id: string): Node {
  return { ...makeRect(id, 'Bone'), type: 'bone' } as unknown as Node;
}

describe('analyzeLottieExport', () => {
  it('counts supported node types', () => {
    const nodes: Node[] = [makeRect(), makeEllipse()];
    const analysis = analyzeLottieExport(nodes);
    expect(analysis.supportedCount).toBe(2);
    expect(analysis.unsupportedCount).toBe(0);
    expect(analysis.unsupportedTypes).toEqual([]);
  });

  it('identifies unsupported types', () => {
    const analysis = analyzeLottieExport([makeRect(), makeBone('b1')]);
    expect(analysis.supportedCount).toBe(1);
    expect(analysis.unsupportedCount).toBe(1);
    expect(analysis.unsupportedTypes).toContain('bone');
  });

  it('counts text as supported (exported as glyph outlines)', () => {
    const text = {
      ...makeRect(),
      id: 't1',
      type: 'text',
      content: 'Hello',
    } as unknown as Node;
    expect(analyzeLottieExport([text]).unsupportedCount).toBe(0);
  });

  it('returns empty counts for empty array', () => {
    const analysis = analyzeLottieExport([]);
    expect(analysis.supportedCount).toBe(0);
    expect(analysis.unsupportedCount).toBe(0);
    expect(analysis.unsupportedTypes).toEqual([]);
  });

  it('deduplicates unsupported types', () => {
    const analysis = analyzeLottieExport([makeBone('b1'), makeBone('b2')]);
    expect(analysis.unsupportedCount).toBe(2);
    expect(analysis.unsupportedTypes).toHaveLength(1); // deduplicated
  });

  it('counts group as supported', () => {
    const group = {
      id: 'g1',
      name: 'Group',
      type: 'group' as const,
      parent: null,
      children: [],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal' as const,
    };
    const analysis = analyzeLottieExport([group, makeRect()]);
    expect(analysis.supportedCount).toBe(2);
    expect(analysis.unsupportedCount).toBe(0);
  });

  it('reports unsupported descendants nested inside groups', () => {
    const textNode: Node = { ...makeBone('nested-bone'), parent: 'nested-group' };
    const group: GroupNode = {
      id: 'nested-group',
      name: 'Group',
      type: 'group',
      parent: null,
      children: [textNode.id],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    };

    const analysis = analyzeLottieExport([group], (id) =>
      id === textNode.id ? textNode : undefined
    );
    expect(analysis.supportedCount).toBe(1);
    expect(analysis.unsupportedCount).toBe(1);
    expect(analysis.unsupportedTypes).toEqual(['bone']);
  });
});

// ============================================================================
// Additional exportLottieBlob tests
// ============================================================================

describe('exportLottieBlob - additional', () => {
  it('produces parseable JSON round-trip', async () => {
    const blob = exportLottieBlob([makeRect()], emptyTimeline, { width: 800, height: 600 });
    const text = await blob.text();
    const parsed = JSON.parse(text);
    expect(parsed.v).toBe('5.7.4');
    expect(parsed.layers).toHaveLength(1);
    expect(parsed.w).toBe(800);
    expect(parsed.h).toBe(600);
  });
});

// ============================================================================
// Additional exportToLottieJson tests
// ============================================================================

describe('exportToLottieJson - additional', () => {
  it('uses timeline defaults when options omitted', () => {
    const timeline: Timeline = {
      ...emptyTimeline,
      duration: 120,
      frameRate: 24,
    };
    const result = exportToLottieJson([], timeline, { width: 400, height: 300 });
    expect(result.op).toBe(120);
    expect(result.fr).toBe(24);
    expect(result.ip).toBe(0);
    expect(result.nm).toBe('Quar Animation');
  });

  it('handles multiple node types', () => {
    const nodes: Node[] = [makeRect(), makeEllipse()];
    const result = exportToLottieJson(nodes, emptyTimeline, { width: 800, height: 600 });
    expect(result.layers).toHaveLength(2);
  });
});

// ============================================================================
// Mask groups
// ============================================================================

describe('exportToLottieJson - masks', () => {
  function makeMaskGroup(mode: 'clip' | 'alpha' | 'luminance'): Node[] {
    const group: GroupNode = {
      id: 'masked',
      name: 'Mask',
      type: 'group',
      parent: null,
      children: ['content', 'mask'],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 0.5,
      blendMode: 'normal',
      maskNodeId: 'mask',
      maskMode: mode,
    };
    return [
      group,
      { ...makeRect('content', 'Content'), parent: group.id },
      { ...makeEllipse('mask', 'Mask shape'), parent: group.id },
    ];
  }

  function resolverFor(nodes: Node[]) {
    const map = new Map(nodes.map((n) => [n.id, n]));
    return (id: string) => map.get(id);
  }

  it('exports a root mask group as a matte layer above the masked content', () => {
    const nodes = makeMaskGroup('clip');
    const result = exportToLottieJson(
      [nodes[0]!],
      emptyTimeline,
      { width: 800, height: 600 },
      resolverFor(nodes)
    );

    expect(result.layers).toHaveLength(2);
    const [matte, content] = result.layers;
    expect(matte!.td).toBe(1);
    expect(matte!.shapes).toHaveLength(1);
    expect(matte!.shapes![0]!.nm).toBe('Mask shape');
    // Group opacity applies once, on the content layer.
    expect(matte!.ks.o).toEqual({ a: 0, k: 100 });
    expect(content!.tt).toBe(1);
    expect(content!.shapes).toHaveLength(1);
    expect(content!.shapes![0]!.nm).toBe('Content');
    expect(new Set(result.layers.map((l) => l.ind)).size).toBe(2);
  });

  it('uses a luma matte for luminance masks', () => {
    const nodes = makeMaskGroup('luminance');
    const result = exportToLottieJson(
      [nodes[0]!],
      emptyTimeline,
      { width: 800, height: 600 },
      resolverFor(nodes)
    );
    expect(result.layers[1]!.tt).toBe(3);
  });

  it('never draws the mask source of a nested mask group', () => {
    const nodes = makeMaskGroup('alpha');
    const outer: GroupNode = {
      id: 'outer',
      name: 'Outer',
      type: 'group',
      parent: null,
      children: ['masked'],
      transform: defaultTransform,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
    };
    nodes[0] = { ...nodes[0]!, parent: 'outer' };
    const result = exportToLottieJson(
      [outer],
      emptyTimeline,
      { width: 800, height: 600 },
      resolverFor([outer, ...nodes])
    );

    const json = JSON.stringify(result);
    expect(json).toContain('"Content"');
    expect(json).not.toContain('"Mask shape"');
  });
});

describe('Animation Sequence export', () => {
  it('exports sequence steps — presets and clips of own keyframes — as Lottie keyframes', () => {
    const rect = makeRect('r1');
    // Hand-made move: x 100 → 300 over 20 frames, captured as a clip
    const own = createTimeline({ duration: 120, frameRate: 30 });
    addKeyframe(getOrCreateTrack(own, 'r1', 'transform.position.x'), 0, 100);
    addKeyframe(getOrCreateTrack(own, 'r1', 'transform.position.x'), 20, 300);
    const pose = restPoseForKeyframes(rect, own.tracks);
    const { clip } = createClipFromTracks(own.tracks, pose)!;
    const sequence: AnimationSequence = {
      steps: [
        {
          id: 'fade',
          nodeId: 'r1',
          presetId: 'fade-in',
          trigger: 'afterPrevious',
          delay: 0,
          duration: 24,
        },
        { id: 'move', nodeId: 'r1', clip, trigger: 'afterPrevious', delay: 6, duration: 20 },
      ],
      restPoses: { r1: pose },
    };
    const timeline = compileAnimationSequence(
      createTimeline({ duration: 120, frameRate: 30 }),
      sequence,
      (id) => (id === 'r1' ? rect : undefined)
    );

    const layer = exportToLottieJson([rect], timeline, { width: 800, height: 600 }).layers[0]!;
    const opacity = layer.ks.o as { a: number; k: Array<{ t: number; s: number[] }> };
    expect(opacity.a).toBe(1);
    expect(opacity.k.map((kf) => [kf.t, kf.s[0]])).toEqual([
      [0, 0],
      [24, 100],
    ]);
    const position = JSON.stringify(layer.ks.p);
    expect(position).toContain('"a":1');
    // The clip plays after the fade plus its delay: frames 30–50
    expect(position).toMatch(/"t":30\b/);
    expect(position).toMatch(/"t":50\b/);
  });
});
