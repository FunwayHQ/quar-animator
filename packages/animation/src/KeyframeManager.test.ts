import { describe, it, expect, beforeEach } from 'vitest';
import type { Timeline } from '@quar/types';
import { KeyframeManager } from './KeyframeManager';
import { createTimeline } from './Timeline';

// ============================================================================
// Setup
// ============================================================================

let timeline: Timeline;
let mgr: KeyframeManager;

beforeEach(() => {
  timeline = createTimeline({ duration: 100 });
  mgr = new KeyframeManager(timeline);
});

// ============================================================================
// Creation
// ============================================================================

describe('addKeyframe', () => {
  it('creates a track and keyframe', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 0, 1);
    expect(kf.time).toBe(0);
    expect(kf.value).toBe(1);
    expect(timeline.tracks.length).toBe(1);
    expect(timeline.tracks[0].nodeId).toBe('node1');
    expect(timeline.tracks[0].property).toBe('opacity');
  });

  it('adds to existing track', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    expect(timeline.tracks.length).toBe(1);
    expect(timeline.tracks[0].keyframes.length).toBe(2);
  });

  it('creates separate tracks for different properties', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.addKeyframe('node1', 'transform.position.x', 0, 100);
    expect(timeline.tracks.length).toBe(2);
  });

  it('uses specified easing', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 0, 1, 'easeInOutCubic');
    expect(kf.easing).toBe('easeInOutCubic');
  });
});

describe('setKeyframeAtFrame', () => {
  it('creates new keyframe if none exists at frame', () => {
    const kf = mgr.setKeyframeAtFrame('node1', 'opacity', 5, 0.8);
    expect(kf.value).toBe(0.8);
    expect(kf.time).toBe(5);
  });

  it('updates existing keyframe value at same frame', () => {
    mgr.addKeyframe('node1', 'opacity', 5, 0.5);
    const kf = mgr.setKeyframeAtFrame('node1', 'opacity', 5, 0.9);
    expect(kf.value).toBe(0.9);
    expect(timeline.tracks[0].keyframes.length).toBe(1);
  });
});

// ============================================================================
// Editing
// ============================================================================

describe('moveKeyframe', () => {
  it('moves keyframe to new time', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    const result = mgr.moveKeyframe('node1', 'opacity', kf.id, 20);
    expect(result).toBe(true);
    expect(timeline.tracks[0].keyframes[0].time).toBe(20);
  });

  it('returns false for non-existent track', () => {
    const result = mgr.moveKeyframe('node1', 'opacity', 'fake-id', 20);
    expect(result).toBe(false);
  });

  it('clamps to frame 0', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    mgr.moveKeyframe('node1', 'opacity', kf.id, -5);
    expect(timeline.tracks[0].keyframes[0].time).toBe(0);
  });
});

describe('moveKeyframes', () => {
  it('moves multiple keyframes by delta', () => {
    const kf1 = mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    const kf2 = mgr.addKeyframe('node1', 'transform.position.x', 10, 100);
    const moved = mgr.moveKeyframes(
      [
        { nodeId: 'node1', property: 'opacity', keyframeId: kf1.id },
        { nodeId: 'node1', property: 'transform.position.x', keyframeId: kf2.id },
      ],
      5
    );
    expect(moved).toBe(2);
    expect(timeline.tracks[0].keyframes[0].time).toBe(15);
    expect(timeline.tracks[1].keyframes[0].time).toBe(15);
  });
});

describe('setKeyframeEasing', () => {
  it('sets easing on keyframe', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.setKeyframeEasing('node1', 'opacity', kf.id, 'easeInOutCubic');
    expect(timeline.tracks[0].keyframes[0].easing).toBe('easeInOutCubic');
  });

  it('returns false for non-existent keyframe', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    const result = mgr.setKeyframeEasing('node1', 'opacity', 'fake-id', 'easeInOutCubic');
    expect(result).toBe(false);
  });
});

// ============================================================================
// Deletion
// ============================================================================

describe('removeKeyframe', () => {
  it('removes a keyframe', () => {
    const kf = mgr.addKeyframe('node1', 'opacity', 0, 1);
    const result = mgr.removeKeyframe('node1', 'opacity', kf.id);
    expect(result).toBe(true);
    expect(timeline.tracks.length).toBe(0); // Track cleaned up since empty
  });

  it('returns false for non-existent', () => {
    const result = mgr.removeKeyframe('node1', 'opacity', 'fake');
    expect(result).toBe(false);
  });

  it('keeps track if keyframes remain', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    const kf2 = mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    mgr.removeKeyframe('node1', 'opacity', kf2.id);
    expect(timeline.tracks.length).toBe(1);
    expect(timeline.tracks[0].keyframes.length).toBe(1);
  });
});

describe('removeKeyframes', () => {
  it('removes multiple keyframes', () => {
    const kf1 = mgr.addKeyframe('node1', 'opacity', 0, 1);
    const kf2 = mgr.addKeyframe('node1', 'transform.position.x', 0, 100);
    const removed = mgr.removeKeyframes([
      { nodeId: 'node1', property: 'opacity', keyframeId: kf1.id },
      { nodeId: 'node1', property: 'transform.position.x', keyframeId: kf2.id },
    ]);
    expect(removed).toBe(2);
    expect(timeline.tracks.length).toBe(0);
  });
});

describe('removeAllKeyframesForNode', () => {
  it('removes all tracks for a node', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.addKeyframe('node1', 'transform.position.x', 0, 100);
    mgr.addKeyframe('node2', 'opacity', 0, 0.5);
    const removed = mgr.removeAllKeyframesForNode('node1');
    expect(removed).toBe(2);
    expect(timeline.tracks.length).toBe(1);
    expect(timeline.tracks[0].nodeId).toBe('node2');
  });
});

// ============================================================================
// Clipboard
// ============================================================================

describe('copyKeyframes / pasteKeyframes', () => {
  it('copies and pastes keyframes', () => {
    const kf1 = mgr.addKeyframe('node1', 'opacity', 10, 1);
    const kf2 = mgr.addKeyframe('node1', 'opacity', 20, 0.5);

    const clipboard = mgr.copyKeyframes([
      { nodeId: 'node1', property: 'opacity', keyframeId: kf1.id },
      { nodeId: 'node1', property: 'opacity', keyframeId: kf2.id },
    ]);

    expect(clipboard).not.toBeNull();
    expect(clipboard!.entries.length).toBe(2);
    // Times should be relative (0 and 10)
    expect(clipboard!.entries[0]!.time).toBe(0);
    expect(clipboard!.entries[1]!.time).toBe(10);

    // Paste at frame 50 on node2
    const pasted = mgr.pasteKeyframes(clipboard!, 'node2', 50);
    expect(pasted.length).toBe(2);
    expect(pasted[0].time).toBe(50);
    expect(pasted[1].time).toBe(60);
  });

  it('returns null for empty selection', () => {
    const clipboard = mgr.copyKeyframes([]);
    expect(clipboard).toBeNull();
  });

  it('deep clones values', () => {
    const color = { r: 255, g: 0, b: 0, a: 1 };
    const kf = mgr.addKeyframe('node1', 'fill.color', 0, color);
    const clipboard = mgr.copyKeyframes([
      { nodeId: 'node1', property: 'fill.color', keyframeId: kf.id },
    ]);
    // Mutate original
    color.r = 0;
    expect((clipboard!.entries[0]!.value as { r: number }).r).toBe(255);
  });
});

// ============================================================================
// Queries
// ============================================================================

describe('getKeyframeAt', () => {
  it('finds keyframe at exact frame', () => {
    mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    const kf = mgr.getKeyframeAt('node1', 'opacity', 10);
    expect(kf).not.toBeNull();
    expect(kf!.value).toBe(0.5);
  });

  it('returns null when no keyframe at frame', () => {
    mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    expect(mgr.getKeyframeAt('node1', 'opacity', 5)).toBeNull();
  });
});

describe('getKeyframesInRange', () => {
  it('returns keyframes in range', () => {
    mgr.addKeyframe('node1', 'opacity', 5, 1);
    mgr.addKeyframe('node1', 'opacity', 15, 0.5);
    mgr.addKeyframe('node1', 'opacity', 25, 0);
    const kfs = mgr.getKeyframesInRange('node1', 'opacity', 10, 20);
    expect(kfs.length).toBe(1);
    expect(kfs[0].time).toBe(15);
  });

  it('is inclusive of range boundaries', () => {
    mgr.addKeyframe('node1', 'opacity', 10, 1);
    mgr.addKeyframe('node1', 'opacity', 20, 0.5);
    const kfs = mgr.getKeyframesInRange('node1', 'opacity', 10, 20);
    expect(kfs.length).toBe(2);
  });
});

describe('getAllKeyframesForNode', () => {
  it('returns all keyframes across properties', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.addKeyframe('node1', 'transform.position.x', 0, 100);
    mgr.addKeyframe('node2', 'opacity', 0, 0.5);
    const all = mgr.getAllKeyframesForNode('node1');
    expect(all.length).toBe(2);
    expect(all[0]!.property).toBe('opacity');
    expect(all[1]!.property).toBe('transform.position.x');
  });
});

describe('hasKeyframes', () => {
  it('returns true when node has keyframes', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    expect(mgr.hasKeyframes('node1')).toBe(true);
  });

  it('returns false when node has no keyframes', () => {
    expect(mgr.hasKeyframes('node1')).toBe(false);
  });
});

describe('getKeyframeCount', () => {
  it('counts all keyframes', () => {
    mgr.addKeyframe('node1', 'opacity', 0, 1);
    mgr.addKeyframe('node1', 'opacity', 10, 0.5);
    mgr.addKeyframe('node1', 'transform.position.x', 0, 100);
    expect(mgr.getKeyframeCount()).toBe(3);
  });
});
