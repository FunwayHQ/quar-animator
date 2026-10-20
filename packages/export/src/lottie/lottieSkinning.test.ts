import { describe, it, expect } from 'vitest';
import { SceneGraph, createBendMesh, shapeOutline, boundOutline } from '@quar/core';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import {
  bindVertexPositions,
  computeAutoWeights,
  computeFKChain,
  createBoneNode,
  createSkinBinding,
} from '@quar/rigging';
import type { LottieShapeKeyframe, LottieShapeVertices } from './lottieTypes';
import type { Node, RectangleNode, SkinData } from '@quar/types';
import { bakeSkinnedOutlines } from './lottieSkinning';
import { nodeToLottieShapes } from './lottieConverter';
import { analyzeLottieExport } from './lottieExporter';

function rect(): RectangleNode {
  return {
    id: 'arm',
    name: 'Arm',
    type: 'rectangle',
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
    width: 200,
    height: 40,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 255, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

/** A 200 × 40 arm bound, with a bending mesh, to two bones; the elbow bends 90° over 10 frames. */
function riggedArm() {
  const sg = new SceneGraph();
  sg.addNode(createBoneNode('upper', 'Upper', { x: -100, y: 0 }, 100));
  sg.addNode(createBoneNode('lower', 'Lower', { x: 100, y: 0 }, 100), 'upper');
  sg.addNode(rect());
  const mesh = createBendMesh(shapeOutline(sg.getNode('arm')!)!.vertices);
  const skin = createSkinBinding('arm', ['upper', 'lower'], mesh.vertices.length / 2, sg)!;
  const world = sg.getWorldTransform('arm');
  const positions = new Float32Array(mesh.vertices.length);
  for (let i = 0; i < mesh.vertices.length; i += 2) {
    positions[i] = world.a * mesh.vertices[i]! + world.c * mesh.vertices[i + 1]! + world.tx;
    positions[i + 1] = world.b * mesh.vertices[i]! + world.d * mesh.vertices[i + 1]! + world.ty;
  }
  const weighted = computeAutoWeights(skin, positions, computeFKChain('upper', sg));
  const skinData: SkinData = {
    ...weighted,
    bindVertices: bindVertexPositions(mesh.vertices),
    bendMesh: true,
  };
  sg.updateNode('arm', { skinData } as Partial<Node>);

  const timeline = createTimeline({ duration: 30, frameRate: 30 });
  const elbow = getOrCreateTrack<number>(timeline, 'lower', 'transform.rotation');
  addKeyframe(elbow, 0, 0);
  addKeyframe(elbow, 10, 90);
  return { sg, timeline, outlineCount: mesh.outlineVertexCount };
}

describe('Lottie export of shapes bound to bones', () => {
  it('bakes the outline as the bones bend it, frame by frame', () => {
    const { sg, timeline, outlineCount } = riggedArm();
    const { paths } = bakeSkinnedOutlines(sg, timeline, { frameRate: 30 }, 0, 10);
    const path = paths.get('arm')!;
    expect(path.ks.a).toBe(1);
    const keys = path.ks.k as LottieShapeKeyframe[];
    expect(keys).toHaveLength(11);

    const atRest = keys[0]!.s[0];
    const bent = keys[10]!.s[0];
    expect(atRest.v).toHaveLength(outlineCount);
    // At rest: the outline in the layer's space (Lottie y down)
    const outline = boundOutline(sg.getNode('arm')!)!.vertices;
    atRest.v.forEach(([x, y], i) => {
      expect(x).toBeCloseTo(outline[i * 2]!, 1);
      expect(y).toBeCloseTo(-outline[i * 2 + 1]!, 1);
    });
    // Bent: the far end has swung up from x = 100 toward the elbow's column
    const farX = (frame: LottieShapeVertices) => Math.max(...frame.v.map(([x]) => x));
    expect(farX(bent)).toBeLessThan(farX(atRest) - 50);
    // Up is negative y in Lottie
    expect(Math.min(...bent.v.map(([, y]) => y))).toBeLessThan(-60);
  });

  it('leaves out the frames where the outline holds still', () => {
    const { sg, timeline } = riggedArm();
    const { paths } = bakeSkinnedOutlines(sg, timeline, { frameRate: 30 }, 0, 29);
    const keys = paths.get('arm')!.ks.k as LottieShapeKeyframe[];
    // Frames 0–10 move; 11–29 hold the bent pose: one keyframe ends the hold
    expect(keys.map((key) => key.t)).toEqual([...Array.from({ length: 11 }, (_, i) => i), 29]);
    expect(keys[10]!.e![0]).toEqual(keys[11]!.s[0]);
  });

  it('draws the baked outline with the shape’s own fill', () => {
    const { sg, timeline } = riggedArm();
    const { paths } = bakeSkinnedOutlines(sg, timeline, { frameRate: 30 }, 0, 10);
    const shapes = nodeToLottieShapes(sg.getNode('arm')!, timeline, 400, undefined, {
      skinnedPaths: paths,
    })!;
    expect(shapes[0]).toBe(paths.get('arm'));
    expect(shapes.some((item) => item.ty === 'fl')).toBe(true);
    // Not drawn as a rectangle primitive too
    expect(shapes.some((item) => item.ty === 'rc')).toBe(false);
  });

  it('leaves unbound scenes alone, and reports bound images', () => {
    const sg = new SceneGraph();
    sg.addNode(rect());
    sg.addNode({
      ...rect(),
      id: 'photo',
      type: 'image',
      src: 'data:,',
      naturalWidth: 10,
      naturalHeight: 10,
      skinData: {
        vertices: [],
        inverseBindMatrices: {},
        meshBindMatrix: [1, 0, 0, 1, 0, 0],
        vertexCount: 0,
      },
    } as unknown as Node);
    const timeline = createTimeline({ duration: 10, frameRate: 30 });
    const baked = bakeSkinnedOutlines(sg, timeline, undefined, 0, 5);
    expect(baked.paths.size).toBe(0);
    expect(baked.unbentImageIds).toEqual(['photo']);
    expect(analyzeLottieExport(sg.getRootNodes()).unbentImageCount).toBe(1);
  });
});
