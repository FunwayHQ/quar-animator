import { describe, it, expect } from 'vitest';
import {
  getActiveGroup,
  getBoneVisibility,
  getActiveSkinSnapshots,
  applySkinSnapshots,
  evaluateVitruvianControllers,
  type VitruvianSceneGraph,
} from './vitruvianBones';
import type { VitruvianController, BoneGroup, SkinData } from '@quar/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkinData(vertexCount = 4): SkinData {
  return {
    vertices: Array.from({ length: vertexCount }, () => ({
      influences: [{ boneId: 'bone-1', weight: 1 }],
    })),
    inverseBindMatrices: { 'bone-1': [1, 0, 0, 1, 0, 0] },
    meshBindMatrix: [1, 0, 0, 1, 0, 0],
    vertexCount,
  };
}

function makeGroup(overrides: Partial<BoneGroup> = {}): BoneGroup {
  return {
    id: 'group-1',
    name: 'Group 1',
    boneIds: ['bone-a', 'bone-b'],
    skinSnapshots: [],
    ...overrides,
  };
}

function makeController(overrides: Partial<VitruvianController> = {}): VitruvianController {
  return {
    id: 'ctrl-1',
    name: 'Controller 1',
    groups: [
      makeGroup({ id: 'group-1', name: 'Extended', boneIds: ['bone-a', 'bone-b'] }),
      makeGroup({ id: 'group-2', name: 'Foreshortened', boneIds: ['bone-c', 'bone-d'] }),
    ],
    activeGroupId: 'group-1',
    enabled: true,
    ...overrides,
  };
}

function makeSG(): VitruvianSceneGraph & { updates: Map<string, Record<string, unknown>> } {
  const updates = new Map<string, Record<string, unknown>>();
  return {
    updates,
    getNode(_id: string) {
      return { type: 'rectangle', skinData: makeSkinData() };
    },
    updateNode(id: string, data: Record<string, unknown>) {
      updates.set(id, data);
    },
  };
}

// ---------------------------------------------------------------------------
// getActiveGroup
// ---------------------------------------------------------------------------

describe('getActiveGroup', () => {
  it('returns active group when enabled', () => {
    const ctrl = makeController();
    const group = getActiveGroup(ctrl);
    expect(group).toBeDefined();
    expect(group!.id).toBe('group-1');
  });

  it('returns undefined when disabled', () => {
    const ctrl = makeController({ enabled: false });
    expect(getActiveGroup(ctrl)).toBeUndefined();
  });

  it('returns undefined when activeGroupId not found', () => {
    const ctrl = makeController({ activeGroupId: 'nonexistent' });
    expect(getActiveGroup(ctrl)).toBeUndefined();
  });

  it('returns second group when selected', () => {
    const ctrl = makeController({ activeGroupId: 'group-2' });
    const group = getActiveGroup(ctrl);
    expect(group!.id).toBe('group-2');
    expect(group!.boneIds).toEqual(['bone-c', 'bone-d']);
  });
});

// ---------------------------------------------------------------------------
// getBoneVisibility
// ---------------------------------------------------------------------------

describe('getBoneVisibility', () => {
  it('hides bones not in active group', () => {
    const ctrl = makeController({ activeGroupId: 'group-1' });
    const hidden = getBoneVisibility([ctrl]);
    // group-1 has bone-a, bone-b → visible
    // group-2 has bone-c, bone-d → hidden
    expect(hidden.has('bone-a')).toBe(false);
    expect(hidden.has('bone-b')).toBe(false);
    expect(hidden.has('bone-c')).toBe(true);
    expect(hidden.has('bone-d')).toBe(true);
  });

  it('returns empty set when disabled', () => {
    const ctrl = makeController({ enabled: false });
    const hidden = getBoneVisibility([ctrl]);
    expect(hidden.size).toBe(0);
  });

  it('handles multiple controllers', () => {
    const ctrl1 = makeController({
      id: 'ctrl-1',
      groups: [
        makeGroup({ id: 'g1', boneIds: ['bone-1'] }),
        makeGroup({ id: 'g2', boneIds: ['bone-2'] }),
      ],
      activeGroupId: 'g1',
    });
    const ctrl2 = makeController({
      id: 'ctrl-2',
      groups: [
        makeGroup({ id: 'g3', boneIds: ['bone-3'] }),
        makeGroup({ id: 'g4', boneIds: ['bone-4'] }),
      ],
      activeGroupId: 'g4',
    });
    const hidden = getBoneVisibility([ctrl1, ctrl2]);
    expect(hidden.has('bone-1')).toBe(false); // active in ctrl1
    expect(hidden.has('bone-2')).toBe(true); // inactive in ctrl1
    expect(hidden.has('bone-3')).toBe(true); // inactive in ctrl2
    expect(hidden.has('bone-4')).toBe(false); // active in ctrl2
  });

  it('returns empty set with no controllers', () => {
    expect(getBoneVisibility([]).size).toBe(0);
  });

  it('hides all managed bones when activeGroupId not found', () => {
    const ctrl = makeController({ activeGroupId: 'nonexistent' });
    const hidden = getBoneVisibility([ctrl]);
    // All bones from all groups should be hidden since no active group
    expect(hidden.has('bone-a')).toBe(true);
    expect(hidden.has('bone-b')).toBe(true);
    expect(hidden.has('bone-c')).toBe(true);
    expect(hidden.has('bone-d')).toBe(true);
  });

  it('does not affect bones outside any controller', () => {
    const ctrl = makeController();
    const hidden = getBoneVisibility([ctrl]);
    // bone-xyz is not managed by any controller
    expect(hidden.has('bone-xyz')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getActiveSkinSnapshots
// ---------------------------------------------------------------------------

describe('getActiveSkinSnapshots', () => {
  it('returns snapshots from active group', () => {
    const skinData = makeSkinData();
    const ctrl = makeController({
      groups: [
        makeGroup({
          id: 'group-1',
          skinSnapshots: [{ nodeId: 'mesh-1', skinData }],
        }),
        makeGroup({ id: 'group-2', skinSnapshots: [] }),
      ],
      activeGroupId: 'group-1',
    });
    const snapshots = getActiveSkinSnapshots(ctrl);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.nodeId).toBe('mesh-1');
  });

  it('returns empty array when disabled', () => {
    const ctrl = makeController({ enabled: false });
    expect(getActiveSkinSnapshots(ctrl)).toEqual([]);
  });

  it('returns empty array when no active group', () => {
    const ctrl = makeController({ activeGroupId: 'nonexistent' });
    expect(getActiveSkinSnapshots(ctrl)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// applySkinSnapshots
// ---------------------------------------------------------------------------

describe('applySkinSnapshots', () => {
  it('updates nodes with skin data from snapshots', () => {
    const sg = makeSG();
    const skinData = makeSkinData(8);
    applySkinSnapshots([{ nodeId: 'mesh-1', skinData }], sg);
    expect(sg.updates.get('mesh-1')).toEqual({ skinData });
  });

  it('skips missing nodes', () => {
    const sg = makeSG();
    sg.getNode = () => undefined;
    applySkinSnapshots([{ nodeId: 'missing', skinData: makeSkinData() }], sg);
    expect(sg.updates.size).toBe(0);
  });

  it('handles multiple snapshots', () => {
    const sg = makeSG();
    applySkinSnapshots(
      [
        { nodeId: 'mesh-1', skinData: makeSkinData(4) },
        { nodeId: 'mesh-2', skinData: makeSkinData(6) },
      ],
      sg
    );
    expect(sg.updates.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// evaluateVitruvianControllers
// ---------------------------------------------------------------------------

describe('evaluateVitruvianControllers', () => {
  it('returns hidden bone IDs', () => {
    const ctrl = makeController({ activeGroupId: 'group-1' });
    const hidden = evaluateVitruvianControllers([ctrl]);
    expect(hidden.has('bone-c')).toBe(true);
    expect(hidden.has('bone-d')).toBe(true);
    expect(hidden.has('bone-a')).toBe(false);
  });

  it('applies skin snapshots when sceneGraph provided', () => {
    const sg = makeSG();
    const skinData = makeSkinData();
    const ctrl = makeController({
      groups: [
        makeGroup({
          id: 'group-1',
          skinSnapshots: [{ nodeId: 'mesh-1', skinData }],
        }),
        makeGroup({ id: 'group-2' }),
      ],
      activeGroupId: 'group-1',
    });
    evaluateVitruvianControllers([ctrl], sg);
    expect(sg.updates.get('mesh-1')).toEqual({ skinData });
  });

  it('does not apply snapshots without sceneGraph', () => {
    const ctrl = makeController({
      groups: [
        makeGroup({
          id: 'group-1',
          skinSnapshots: [{ nodeId: 'mesh-1', skinData: makeSkinData() }],
        }),
        makeGroup({ id: 'group-2' }),
      ],
      activeGroupId: 'group-1',
    });
    // Should not throw
    const hidden = evaluateVitruvianControllers([ctrl]);
    expect(hidden).toBeDefined();
  });

  it('skips disabled controllers', () => {
    const sg = makeSG();
    const ctrl = makeController({
      enabled: false,
      groups: [
        makeGroup({
          id: 'group-1',
          skinSnapshots: [{ nodeId: 'mesh-1', skinData: makeSkinData() }],
        }),
      ],
    });
    evaluateVitruvianControllers([ctrl], sg);
    expect(sg.updates.size).toBe(0);
  });

  it('handles empty controllers array', () => {
    const hidden = evaluateVitruvianControllers([]);
    expect(hidden.size).toBe(0);
  });

  it('handles controller with no groups', () => {
    const ctrl = makeController({ groups: [], activeGroupId: 'none' });
    const hidden = evaluateVitruvianControllers([ctrl]);
    expect(hidden.size).toBe(0);
  });
});
