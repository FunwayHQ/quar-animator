import { describe, it, expect, beforeEach } from 'vitest';
import { SelectionManager } from './SelectionManager';
import { SceneGraph } from '../SceneGraph';
import type { BoneNode } from '@quar/types';

function createBoneNode(id: string, length: number, x = 0, y = 0): BoneNode {
  return {
    id,
    name: `Bone ${id}`,
    type: 'bone',
    parent: null,
    children: [],
    transform: {
      position: { x, y },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0, y: 0 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    length,
    boneStyle: 'octahedral',
    boneColor: '#E0E0E0',
  };
}

describe('SelectionManager - bone bounds', () => {
  let selectionManager: SelectionManager;
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    selectionManager = new SelectionManager();
    sceneGraph = new SceneGraph();
  });

  it('calculates bounds for a bone node', () => {
    const bone = createBoneNode('b1', 100, 50, 50);
    sceneGraph.addNode(bone);

    const bounds = selectionManager.getSelectionBounds(new Set(['b1']), sceneGraph);
    expect(bounds).not.toBeNull();
    // Bone extends along +X from position with small height
    expect(bounds!.rect.width).toBeGreaterThan(0);
    expect(bounds!.rect.height).toBeGreaterThan(0);
  });

  it('bone bounds start at origin (anchor 0,0)', () => {
    const bone = createBoneNode('b1', 80, 0, 0);
    sceneGraph.addNode(bone);

    const bounds = selectionManager.getSelectionBounds(new Set(['b1']), sceneGraph);
    expect(bounds).not.toBeNull();
    // Width should include the bone length
    expect(bounds!.rect.width).toBeGreaterThanOrEqual(80);
  });

  it('calculates bounds for bone at non-zero position', () => {
    const bone = createBoneNode('b1', 50, 100, 200);
    sceneGraph.addNode(bone);

    const bounds = selectionManager.getSelectionBounds(new Set(['b1']), sceneGraph);
    expect(bounds).not.toBeNull();
    // Bounds center should be near the bone's center
    expect(bounds!.center.x).toBeGreaterThan(100);
    expect(bounds!.center.y).toBeCloseTo(200, 0);
  });
});
