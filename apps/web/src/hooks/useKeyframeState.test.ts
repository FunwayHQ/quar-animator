import { describe, it, expect } from 'vitest';
import { createTimeline, addKeyframe, getOrCreateTrack } from '@quar/animation';
import { getKeyframeState } from './useKeyframeState';

describe('getKeyframeState', () => {
  it('returns none when timeline is null', () => {
    expect(getKeyframeState(null, 'node1', 'opacity', 0)).toBe('none');
  });

  it('returns none when no track exists', () => {
    const timeline = createTimeline({ duration: 300, frameRate: 30 });
    expect(getKeyframeState(timeline, 'node1', 'opacity', 0)).toBe('none');
  });

  it('returns active when keyframe at current frame', () => {
    const timeline = createTimeline({ duration: 300, frameRate: 30 });
    const track = getOrCreateTrack(timeline, 'node1', 'opacity');
    addKeyframe(track, 10, 0.5, 'linear');

    expect(getKeyframeState(timeline, 'node1', 'opacity', 10)).toBe('active');
  });

  it('returns inactive when keyframes exist elsewhere', () => {
    const timeline = createTimeline({ duration: 300, frameRate: 30 });
    const track = getOrCreateTrack(timeline, 'node1', 'opacity');
    addKeyframe(track, 10, 0.5, 'linear');

    expect(getKeyframeState(timeline, 'node1', 'opacity', 5)).toBe('inactive');
  });
});
