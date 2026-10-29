/**
 * Tests for the keyframes of layers the Eraser cuts
 */

import { describe, it, expect } from 'vitest';
import { createKeyframe, createTimeline, createTrack } from '@quar/animation';
import type { Timeline } from '@quar/types';
import { tracksAfterErase } from './eraseTracks';

function animated(): Timeline {
  return {
    ...createTimeline(),
    tracks: [
      createTrack('card', 'transform.position.x', [createKeyframe(0, 0), createKeyframe(30, 200)]),
      createTrack('card', 'opacity', [createKeyframe(0, 1), createKeyframe(30, 0.5)]),
      createTrack('card', 'fills.0.color', [createKeyframe(0, { r: 255, g: 0, b: 0, a: 1 })]),
      createTrack('card', 'width', [createKeyframe(0, 100), createKeyframe(30, 300)]),
      createTrack('card', 'cornerRadius.0', [createKeyframe(0, 4)]),
      createTrack('card', 'points', [createKeyframe(0, [])]),
      createTrack('card', 'points.2.position.x', [createKeyframe(0, 5)]),
      createTrack('other', 'width', [createKeyframe(0, 50)]),
    ],
  };
}

const propertiesOf = (timeline: Timeline, nodeId: string) =>
  timeline.tracks.filter((track) => track.nodeId === nodeId).map((track) => track.property);

describe('tracksAfterErase', () => {
  it("keeps a cut layer's keyframes, but not those that shaped its old outline", () => {
    const next = tracksAfterErase(animated(), [{ id: 'card', copies: [] }]);

    expect(propertiesOf(next, 'card')).toEqual([
      'transform.position.x',
      'opacity',
      'fills.0.color',
    ]);
    // Other layers keep theirs, whatever they are
    expect(propertiesOf(next, 'other')).toEqual(['width']);
  });

  it('gives each piece cut off the same keyframes, as tracks of its own', () => {
    const before = animated();
    const next = tracksAfterErase(before, [{ id: 'card', copies: ['card-2', 'card-3'] }]);

    expect(propertiesOf(next, 'card-2')).toEqual(propertiesOf(next, 'card'));
    expect(propertiesOf(next, 'card-3')).toEqual(propertiesOf(next, 'card'));
    const original = next.tracks.find((t) => t.nodeId === 'card' && t.property === 'opacity')!;
    const copy = next.tracks.find((t) => t.nodeId === 'card-2' && t.property === 'opacity')!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.keyframes.map((kf) => [kf.time, kf.value])).toEqual([
      [0, 1],
      [30, 0.5],
    ]);
    expect(copy.keyframes[0]!.id).not.toBe(original.keyframes[0]!.id);
  });

  it('changes nothing for layers with no keyframes', () => {
    const timeline = animated();
    expect(tracksAfterErase(timeline, [{ id: 'still', copies: ['still-2'] }])).toBe(timeline);
  });
});
