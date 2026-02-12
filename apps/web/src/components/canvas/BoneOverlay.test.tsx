/**
 * Tests for BoneOverlay IK target rendering
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { BoneOverlay } from './BoneOverlay';
import type { BoneNode, IKTargetNode, IKChain, Matrix3 } from '@quar/types';
import type { Camera } from '@quar/core';

function createMockCamera(): Camera {
  return {
    worldToScreen: (pos: { x: number; y: number }) => ({ x: pos.x, y: -pos.y }),
    getZoom: () => 1,
  } as any;
}

function createMockSceneGraph(nodes: Map<string, any>) {
  return {
    getWorldTransform: (id: string): Matrix3 => {
      const node = nodes.get(id);
      if (!node) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
      const pos = node.transform?.position || { x: 0, y: 0 };
      return { a: 1, b: 0, c: 0, d: 1, tx: pos.x, ty: pos.y };
    },
    getNode: (id: string) => nodes.get(id),
  } as any;
}

function createBone(id: string, name: string, x: number, y: number, length = 50): BoneNode {
  return {
    id,
    name,
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
    angle: 0,
    angleMin: -180,
    angleMax: 180,
    boneColor: '#888888',
  } as BoneNode;
}

function createIKTarget(
  id: string,
  name: string,
  chainId: string,
  x: number,
  y: number,
  type: 'effector' | 'pole' = 'effector'
): IKTargetNode {
  return {
    id,
    name,
    type: 'ik-target',
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
    ikChainId: chainId,
    targetType: type,
  };
}

describe('BoneOverlay', () => {
  it('renders bone markers', () => {
    const bone = createBone('bone1', 'Root', 100, 200, 50);
    const nodes = new Map<string, any>([['bone1', bone]]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        selectedNodeIds={new Set()}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should have circles for joint and tip
    const circles = svg!.querySelectorAll('circle');
    expect(circles.length).toBeGreaterThanOrEqual(2);
  });

  it('renders IK effector target as crosshair with circle', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const target = createIKTarget('ikt1', 'IK Target', 'chain1', 100, 50, 'effector');
    const nodes = new Map<string, any>([
      ['bone1', bone],
      ['ikt1', target],
    ]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        ikTargetNodes={[target]}
        selectedNodeIds={new Set()}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Effector targets render circles (outer ring) and lines (crosshair)
    const lines = svg!.querySelectorAll('line');
    expect(lines.length).toBeGreaterThanOrEqual(2); // crosshair has 2 lines
  });

  it('renders IK pole target as diamond', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const poleTarget = createIKTarget('ikp1', 'Pole Target', 'chain1', 50, 100, 'pole');
    const nodes = new Map<string, any>([
      ['bone1', bone],
      ['ikp1', poleTarget],
    ]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        ikTargetNodes={[poleTarget]}
        selectedNodeIds={new Set()}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Pole targets render as a polygon (diamond shape) or path
    const polygons = svg!.querySelectorAll('polygon');
    expect(polygons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders dashed line from end effector tip to IK target', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const target = createIKTarget('ikt1', 'IK Target', 'chain1', 100, 50, 'effector');
    const chain: IKChain = {
      id: 'chain1',
      name: 'Test Chain',
      rootBoneId: 'bone1',
      endEffectorBoneId: 'bone1',
      targetNodeId: 'ikt1',
      maxIterations: 10,
      tolerance: 0.5,
      enabled: true,
    };
    const nodes = new Map<string, any>([
      ['bone1', bone],
      ['ikt1', target],
    ]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        ikTargetNodes={[target]}
        ikChains={[chain]}
        selectedNodeIds={new Set()}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    // Should render a dashed line
    const dashedLines = svg!.querySelectorAll('line[stroke-dasharray]');
    expect(dashedLines.length).toBeGreaterThanOrEqual(1);
  });

  it('applies selection highlight to selected IK target', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const target = createIKTarget('ikt1', 'IK Target', 'chain1', 100, 50, 'effector');
    const nodes = new Map<string, any>([
      ['bone1', bone],
      ['ikt1', target],
    ]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        ikTargetNodes={[target]}
        selectedNodeIds={new Set(['ikt1'])}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    // Selected targets should have the accent color (violet #A855F7)
    const accentElements = svg!.querySelectorAll('[stroke="#A855F7"]');
    expect(accentElements.length).toBeGreaterThanOrEqual(1);
  });

  it('skips chain lines for disabled chains', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const target = createIKTarget('ikt1', 'IK Target', 'chain1', 100, 50, 'effector');
    const chain: IKChain = {
      id: 'chain1',
      name: 'Test Chain',
      rootBoneId: 'bone1',
      endEffectorBoneId: 'bone1',
      targetNodeId: 'ikt1',
      maxIterations: 10,
      tolerance: 0.5,
      enabled: false, // Disabled
    };
    const nodes = new Map<string, any>([
      ['bone1', bone],
      ['ikt1', target],
    ]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay
        boneNodes={[bone]}
        ikTargetNodes={[target]}
        ikChains={[chain]}
        selectedNodeIds={new Set()}
        camera={createMockCamera()}
        sceneGraph={sg}
      />
    );

    const svg = container.querySelector('svg');
    // No dashed chain lines for disabled chains
    const dashedLines = svg!.querySelectorAll('line[stroke-dasharray]');
    expect(dashedLines.length).toBe(0);
  });

  it('returns null when no camera provided', () => {
    const bone = createBone('bone1', 'Root', 0, 0, 50);
    const nodes = new Map<string, any>([['bone1', bone]]);
    const sg = createMockSceneGraph(nodes);

    const { container } = render(
      <BoneOverlay boneNodes={[bone]} selectedNodeIds={new Set()} camera={null} sceneGraph={sg} />
    );

    expect(container.querySelector('svg')).not.toBeInTheDocument();
  });
});
