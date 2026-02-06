/**
 * Tests for Timeline management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createTimeline,
  createTrack,
  createKeyframe,
  findTrack,
  getOrCreateTrack,
  addKeyframe,
  removeKeyframe,
  moveKeyframe,
  findSurroundingKeyframes,
  interpolateValue,
  interpolators,
  addMarker,
  removeMarker,
  getTracksByNode,
  getKeyframeCount,
  getAnimatedNodes,
  frameToTime,
  timeToFrame,
  formatTimecode,
} from './Timeline';
import type { Timeline, PropertyTrack } from '@quar/types';

// ============================================================================
// createTimeline
// ============================================================================

describe('createTimeline', () => {
  it('should create a timeline with default values', () => {
    const tl = createTimeline();
    expect(tl.name).toBe('Main Timeline');
    expect(tl.duration).toBe(300);
    expect(tl.frameRate).toBe(30);
    expect(tl.tracks).toEqual([]);
    expect(tl.markers).toEqual([]);
    expect(tl.id).toMatch(/^timeline_/);
  });

  it('should create a timeline with custom values', () => {
    const tl = createTimeline({
      name: 'Custom',
      duration: 600,
      frameRate: 60,
    });
    expect(tl.name).toBe('Custom');
    expect(tl.duration).toBe(600);
    expect(tl.frameRate).toBe(60);
  });

  it('should accept a custom id', () => {
    const tl = createTimeline({ id: 'my-timeline' });
    expect(tl.id).toBe('my-timeline');
  });

  it('should accept pre-existing tracks', () => {
    const track = createTrack<number>('node1', 'opacity');
    const tl = createTimeline({ tracks: [track] });
    expect(tl.tracks).toHaveLength(1);
  });
});

// ============================================================================
// createTrack
// ============================================================================

describe('createTrack', () => {
  it('should create a track with nodeId and property', () => {
    const track = createTrack('node1', 'transform.position.x');
    expect(track.nodeId).toBe('node1');
    expect(track.property).toBe('transform.position.x');
    expect(track.keyframes).toEqual([]);
    expect(track.id).toMatch(/^track_/);
  });

  it('should create a track with initial keyframes', () => {
    const kf = createKeyframe(0, 100);
    const track = createTrack('node1', 'opacity', [kf]);
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].value).toBe(100);
  });
});

// ============================================================================
// findTrack / getOrCreateTrack
// ============================================================================

describe('findTrack', () => {
  let timeline: Timeline;

  beforeEach(() => {
    timeline = createTimeline();
    const track = createTrack('node1', 'opacity');
    timeline.tracks.push(track);
  });

  it('should find an existing track', () => {
    const track = findTrack(timeline, 'node1', 'opacity');
    expect(track).toBeDefined();
    expect(track!.nodeId).toBe('node1');
  });

  it('should return undefined for non-existing track', () => {
    const track = findTrack(timeline, 'node2', 'opacity');
    expect(track).toBeUndefined();
  });

  it('should return undefined when property does not match', () => {
    const track = findTrack(timeline, 'node1', 'position.x');
    expect(track).toBeUndefined();
  });
});

describe('getOrCreateTrack', () => {
  let timeline: Timeline;

  beforeEach(() => {
    timeline = createTimeline();
  });

  it('should create a new track if not found', () => {
    const track = getOrCreateTrack<number>(timeline, 'node1', 'opacity');
    expect(track).toBeDefined();
    expect(timeline.tracks).toHaveLength(1);
  });

  it('should return existing track if found', () => {
    getOrCreateTrack<number>(timeline, 'node1', 'opacity');
    const track2 = getOrCreateTrack<number>(timeline, 'node1', 'opacity');
    expect(timeline.tracks).toHaveLength(1);
    expect(track2.nodeId).toBe('node1');
  });
});

// ============================================================================
// Keyframe Operations
// ============================================================================

describe('createKeyframe', () => {
  it('should create a keyframe with default linear easing', () => {
    const kf = createKeyframe(10, 42);
    expect(kf.time).toBe(10);
    expect(kf.value).toBe(42);
    expect(kf.easing).toBe('linear');
    expect(kf.id).toMatch(/^kf_/);
  });

  it('should create a keyframe with custom easing', () => {
    const kf = createKeyframe(5, 'hello', 'easeInQuad');
    expect(kf.easing).toBe('easeInQuad');
  });
});

describe('addKeyframe', () => {
  let track: PropertyTrack<number>;

  beforeEach(() => {
    track = createTrack<number>('node1', 'opacity');
  });

  it('should add a keyframe to an empty track', () => {
    addKeyframe(track, 0, 1);
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].time).toBe(0);
    expect(track.keyframes[0].value).toBe(1);
  });

  it('should maintain sorted order by time', () => {
    addKeyframe(track, 30, 1);
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 20, 0.75);
    expect(track.keyframes.map((kf) => kf.time)).toEqual([10, 20, 30]);
  });

  it('should replace existing keyframe at same time', () => {
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 10, 0.8);
    expect(track.keyframes).toHaveLength(1);
    expect(track.keyframes[0].value).toBe(0.8);
  });

  it('should return the created keyframe', () => {
    const kf = addKeyframe(track, 0, 1);
    expect(kf.time).toBe(0);
    expect(kf.value).toBe(1);
  });

  it('should append at end when time is largest', () => {
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 30, 1);
    expect(track.keyframes).toHaveLength(3);
    expect(track.keyframes[2].time).toBe(30);
  });
});

describe('removeKeyframe', () => {
  let track: PropertyTrack<number>;

  beforeEach(() => {
    track = createTrack<number>('node1', 'opacity');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 20, 1);
  });

  it('should remove an existing keyframe', () => {
    const kfId = track.keyframes[1].id;
    const removed = removeKeyframe(track, kfId);
    expect(removed).toBe(true);
    expect(track.keyframes).toHaveLength(2);
  });

  it('should return false for non-existing keyframe', () => {
    const removed = removeKeyframe(track, 'nonexistent');
    expect(removed).toBe(false);
    expect(track.keyframes).toHaveLength(3);
  });
});

describe('moveKeyframe', () => {
  let track: PropertyTrack<number>;

  beforeEach(() => {
    track = createTrack<number>('node1', 'opacity');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 20, 1);
  });

  it('should move a keyframe to a new time', () => {
    const kfId = track.keyframes[1].id;
    const moved = moveKeyframe(track, kfId, 15);
    expect(moved).toBe(true);
    expect(track.keyframes.map((kf) => kf.time)).toEqual([0, 15, 20]);
  });

  it('should maintain sorted order after move', () => {
    const kfId = track.keyframes[0].id;
    moveKeyframe(track, kfId, 25);
    expect(track.keyframes.map((kf) => kf.time)).toEqual([10, 20, 25]);
  });

  it('should return false for non-existing keyframe', () => {
    const moved = moveKeyframe(track, 'nonexistent', 5);
    expect(moved).toBe(false);
  });
});

// ============================================================================
// findSurroundingKeyframes
// ============================================================================

describe('findSurroundingKeyframes', () => {
  let track: PropertyTrack<number>;

  beforeEach(() => {
    track = createTrack<number>('node1', 'opacity');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 10, 0.5);
    addKeyframe(track, 20, 1);
  });

  it('should find surrounding keyframes for time between keyframes', () => {
    const [before, after] = findSurroundingKeyframes(track, 5);
    expect(before!.time).toBe(0);
    expect(after!.time).toBe(10);
  });

  it('should return keyframe at exact time as before', () => {
    const [before, after] = findSurroundingKeyframes(track, 10);
    expect(before!.time).toBe(10);
    expect(after!.time).toBe(20);
  });

  it('should return last keyframe with no after when past end', () => {
    const [before, after] = findSurroundingKeyframes(track, 25);
    expect(before!.time).toBe(20);
    expect(after).toBeNull();
  });

  it('should return null before with first keyframe after when before start', () => {
    const [before, after] = findSurroundingKeyframes(
      createTrack<number>('node1', 'opacity', [createKeyframe(10, 0.5)]),
      5
    );
    expect(before).toBeNull();
    expect(after!.time).toBe(10);
  });

  it('should return [null, null] for empty track', () => {
    const emptyTrack = createTrack<number>('node1', 'opacity');
    const [before, after] = findSurroundingKeyframes(emptyTrack, 5);
    expect(before).toBeNull();
    expect(after).toBeNull();
  });
});

// ============================================================================
// interpolateValue
// ============================================================================

describe('interpolateValue', () => {
  describe('number interpolation', () => {
    let track: PropertyTrack<number>;

    beforeEach(() => {
      track = createTrack<number>('node1', 'opacity');
      addKeyframe(track, 0, 0);
      addKeyframe(track, 10, 1);
    });

    it('should interpolate between two keyframes', () => {
      const val = interpolateValue(track, 5, interpolators.number);
      expect(val).toBeCloseTo(0.5, 5);
    });

    it('should return first keyframe value at its time', () => {
      const val = interpolateValue(track, 0, interpolators.number);
      expect(val).toBe(0);
    });

    it('should return last keyframe value past end', () => {
      const val = interpolateValue(track, 15, interpolators.number);
      expect(val).toBe(1);
    });

    it('should return undefined for empty track', () => {
      const emptyTrack = createTrack<number>('node1', 'opacity');
      const val = interpolateValue(emptyTrack, 5, interpolators.number);
      expect(val).toBeUndefined();
    });

    it('should return after value when before start', () => {
      const t = createTrack<number>('node1', 'opacity', [createKeyframe(10, 0.5)]);
      const val = interpolateValue(t, 5, interpolators.number);
      expect(val).toBe(0.5);
    });
  });

  describe('vector2 interpolation', () => {
    it('should interpolate vector2 values', () => {
      const track = createTrack<{ x: number; y: number }>('node1', 'position');
      addKeyframe(track, 0, { x: 0, y: 0 });
      addKeyframe(track, 10, { x: 100, y: 200 });
      const val = interpolateValue(track, 5, interpolators.vector2);
      expect(val!.x).toBeCloseTo(50, 5);
      expect(val!.y).toBeCloseTo(100, 5);
    });
  });

  describe('color interpolation', () => {
    it('should interpolate color values', () => {
      const track = createTrack<{ r: number; g: number; b: number; a: number }>(
        'node1',
        'fill.color'
      );
      addKeyframe(track, 0, { r: 0, g: 0, b: 0, a: 0 });
      addKeyframe(track, 10, { r: 255, g: 255, b: 255, a: 1 });
      const val = interpolateValue(track, 5, interpolators.color);
      expect(val!.r).toBe(128); // Math.round(127.5)
      expect(val!.g).toBe(128);
      expect(val!.b).toBe(128);
      expect(val!.a).toBeCloseTo(0.5, 5);
    });
  });

  describe('discrete interpolation', () => {
    it('should snap to the before value (no interpolation)', () => {
      const track = createTrack<string>('node1', 'visibility');
      addKeyframe(track, 0, 'visible');
      addKeyframe(track, 10, 'hidden');
      const val = interpolateValue(track, 5, interpolators.discrete);
      expect(val).toBe('visible');
    });

    it('should snap to exact keyframe value at keyframe time', () => {
      const track = createTrack<string>('node1', 'visibility');
      addKeyframe(track, 0, 'visible');
      addKeyframe(track, 10, 'hidden');
      const val = interpolateValue(track, 10, interpolators.discrete);
      expect(val).toBe('hidden');
    });
  });
});

// ============================================================================
// Marker Operations
// ============================================================================

describe('addMarker', () => {
  let timeline: Timeline;

  beforeEach(() => {
    timeline = createTimeline();
  });

  it('should add a marker with default color', () => {
    const marker = addMarker(timeline, 30, 'Hit');
    expect(marker.time).toBe(30);
    expect(marker.name).toBe('Hit');
    expect(marker.color).toBe('#FF6B6B');
    expect(timeline.markers).toHaveLength(1);
  });

  it('should add a marker with custom color', () => {
    const marker = addMarker(timeline, 10, 'Start', '#00FF00');
    expect(marker.color).toBe('#00FF00');
  });

  it('should maintain markers sorted by time', () => {
    addMarker(timeline, 30, 'C');
    addMarker(timeline, 10, 'A');
    addMarker(timeline, 20, 'B');
    expect(timeline.markers.map((m) => m.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('removeMarker', () => {
  let timeline: Timeline;

  beforeEach(() => {
    timeline = createTimeline();
    addMarker(timeline, 10, 'A');
    addMarker(timeline, 20, 'B');
  });

  it('should remove an existing marker', () => {
    const markerId = timeline.markers[0].id;
    const removed = removeMarker(timeline, markerId);
    expect(removed).toBe(true);
    expect(timeline.markers).toHaveLength(1);
  });

  it('should return false for non-existing marker', () => {
    const removed = removeMarker(timeline, 'nonexistent');
    expect(removed).toBe(false);
    expect(timeline.markers).toHaveLength(2);
  });
});

// ============================================================================
// Timeline Utilities
// ============================================================================

describe('getTracksByNode', () => {
  it('should return tracks for a given node', () => {
    const timeline = createTimeline();
    timeline.tracks.push(createTrack('node1', 'opacity'));
    timeline.tracks.push(createTrack('node1', 'position.x'));
    timeline.tracks.push(createTrack('node2', 'opacity'));

    const tracks = getTracksByNode(timeline, 'node1');
    expect(tracks).toHaveLength(2);
  });

  it('should return empty array for unknown node', () => {
    const timeline = createTimeline();
    const tracks = getTracksByNode(timeline, 'unknown');
    expect(tracks).toHaveLength(0);
  });
});

describe('getKeyframeCount', () => {
  it('should count all keyframes across tracks', () => {
    const timeline = createTimeline();
    const track1 = createTrack<number>('node1', 'opacity');
    addKeyframe(track1, 0, 0);
    addKeyframe(track1, 10, 1);
    const track2 = createTrack<number>('node2', 'opacity');
    addKeyframe(track2, 0, 1);
    timeline.tracks.push(track1, track2);

    expect(getKeyframeCount(timeline)).toBe(3);
  });

  it('should return 0 for empty timeline', () => {
    const timeline = createTimeline();
    expect(getKeyframeCount(timeline)).toBe(0);
  });
});

describe('getAnimatedNodes', () => {
  it('should return set of node IDs with keyframes', () => {
    const timeline = createTimeline();
    const track1 = createTrack<number>('node1', 'opacity');
    addKeyframe(track1, 0, 0);
    const track2 = createTrack<number>('node2', 'opacity');
    addKeyframe(track2, 0, 1);
    const track3 = createTrack<number>('node3', 'opacity'); // No keyframes
    timeline.tracks.push(track1, track2, track3);

    const nodes = getAnimatedNodes(timeline);
    expect(nodes.size).toBe(2);
    expect(nodes.has('node1')).toBe(true);
    expect(nodes.has('node2')).toBe(true);
    expect(nodes.has('node3')).toBe(false);
  });
});

describe('frameToTime', () => {
  it('should convert frame 0 to time 0', () => {
    expect(frameToTime(0, 30)).toBe(0);
  });

  it('should convert frame 30 to 1 second at 30fps', () => {
    expect(frameToTime(30, 30)).toBeCloseTo(1, 5);
  });

  it('should convert frame 60 to 1 second at 60fps', () => {
    expect(frameToTime(60, 60)).toBeCloseTo(1, 5);
  });

  it('should handle fractional frames', () => {
    expect(frameToTime(15, 30)).toBeCloseTo(0.5, 5);
  });
});

describe('timeToFrame', () => {
  it('should convert 0 seconds to frame 0', () => {
    expect(timeToFrame(0, 30)).toBe(0);
  });

  it('should convert 1 second to frame 30 at 30fps', () => {
    expect(timeToFrame(1, 30)).toBe(30);
  });

  it('should round to nearest frame', () => {
    expect(timeToFrame(0.5, 30)).toBe(15);
  });

  it('should convert 1 second to frame 60 at 60fps', () => {
    expect(timeToFrame(1, 60)).toBe(60);
  });
});

describe('formatTimecode', () => {
  it('should format frame 0 as 00:00:00', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00');
  });

  it('should format 30 frames at 30fps as 00:01:00', () => {
    expect(formatTimecode(30, 30)).toBe('00:01:00');
  });

  it('should format 15 frames at 30fps as 00:00:15', () => {
    expect(formatTimecode(15, 30)).toBe('00:00:15');
  });

  it('should format 1800 frames at 30fps as 01:00:00', () => {
    expect(formatTimecode(1800, 30)).toBe('01:00:00');
  });

  it('should format mixed time correctly', () => {
    // 1 minute + 5 seconds + 10 frames = 60*30 + 5*30 + 10 = 1800 + 150 + 10 = 1960
    expect(formatTimecode(1960, 30)).toBe('01:05:10');
  });

  it('should format 300 frames at 30fps as 00:10:00', () => {
    expect(formatTimecode(300, 30)).toBe('00:10:00');
  });
});
