import { describe, expect, it } from 'vitest';
import type { PathNode, RectangleNode, TextNode } from '@quar/types';
import { addKeyframe, createTimeline, getOrCreateTrack } from './Timeline';
import { applyAnimationPreset, createAnimationPresetKeyframes } from './AnimationPresets';
import { evaluateTrack } from './PropertyBinding';

function makeNode(): RectangleNode {
  return {
    id: 'rect1',
    name: 'Rectangle',
    type: 'rectangle',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 80 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

function makeTextNode(): TextNode {
  return {
    ...makeNode(),
    id: 'text1',
    name: 'Text',
    type: 'text',
    content: 'Hi 🌟',
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  };
}

function makePathNode(): PathNode {
  return {
    ...makeNode(),
    id: 'path1',
    name: 'Path',
    type: 'path',
    points: [
      { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
      { position: { x: 100, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
    ],
    closed: false,
  };
}

describe('animation presets', () => {
  it('creates entrance keyframes from the node’s current values', () => {
    const preset = createAnimationPresetKeyframes(makeNode(), 'rise-in', 10, 24);

    expect(preset.keyframes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'opacity', time: 10, value: 0 }),
        expect.objectContaining({ property: 'opacity', time: 34, value: 0.8 }),
        expect.objectContaining({ property: 'transform.position.y', time: 10, value: 32 }),
        expect.objectContaining({ property: 'transform.position.y', time: 34, value: 80 }),
      ])
    );
  });

  it('creates typewriter and draw-on keyframes for compatible node types', () => {
    const typewriter = createAnimationPresetKeyframes(makeTextNode(), 'typewriter', 4, 12);
    expect(typewriter.keyframes).toEqual([
      { property: 'visibleCharacters', time: 4, value: 0, easing: 'linear' },
      { property: 'visibleCharacters', time: 16, value: 4, easing: 'linear' },
    ]);
    expect(typewriter.baseValues.get('visibleCharacters')).toBe(4);

    const drawOn = createAnimationPresetKeyframes(makePathNode(), 'draw-on', 8, 12);
    expect(drawOn.keyframes.map(({ property, time, value }) => [property, time, value])).toEqual([
      ['strokeProgress', 8, 0],
      ['strokeProgress', 20, 1],
    ]);
    expect(drawOn.baseValues.get('strokeProgress')).toBe(1);

    expect(createAnimationPresetKeyframes(makeNode(), 'typewriter', 0, 12).keyframes).toEqual([]);
    expect(createAnimationPresetKeyframes(makeNode(), 'draw-on', 0, 12).keyframes).toEqual([]);
  });

  it('creates multi-beat emphasis and exit motion', () => {
    const node = makeNode();
    const pulse = createAnimationPresetKeyframes(node, 'pulse', 5, 24);
    const pulseScaleX = pulse.keyframes.filter(
      (keyframe) => keyframe.property === 'transform.scale.x'
    );
    expect(pulseScaleX.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [5, 1],
      [17, 1.12],
      [29, 1],
    ]);

    const slideOut = createAnimationPresetKeyframes(node, 'slide-out', 5, 24);
    expect(slideOut.keyframes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'opacity', time: 29, value: 0 }),
        expect.objectContaining({ property: 'transform.position.x', time: 29, value: 164 }),
      ])
    );
  });

  it('creates a drop with a landing overshoot and supports directional intensity', () => {
    const node = makeNode();
    const drop = createAnimationPresetKeyframes(node, 'drop-in', 0, 24);
    const dropY = drop.keyframes.filter((keyframe) => keyframe.property === 'transform.position.y');
    expect(dropY.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 144],
      [18, 72],
      [24, 80],
    ]);

    const slideFromBottom = createAnimationPresetKeyframes(node, 'slide-in', 10, 24, {
      direction: 'bottom',
      intensity: 1.5,
    });
    expect(
      slideFromBottom.keyframes
        .filter((keyframe) => keyframe.property === 'transform.position.y')
        .map((keyframe) => [keyframe.time, keyframe.value])
    ).toEqual([
      [10, -16],
      [34, 80],
    ]);

    const bounceRight = createAnimationPresetKeyframes(node, 'bounce', 0, 24, {
      direction: 'right',
      intensity: 1.5,
    });
    expect(
      bounceRight.keyframes
        .filter((keyframe) => keyframe.property === 'transform.position.x')
        .map((keyframe) => keyframe.value)
    ).toEqual([100, 136, 100, 115, 100]);
  });

  it('keys full spins in 120° steps', () => {
    const node = makeNode();
    const spinIn = createAnimationPresetKeyframes(node, 'spin-in', 0, 24);
    const spinOut = createAnimationPresetKeyframes(node, 'spin-out', 0, 24);
    const spinInValues = spinIn.keyframes
      .filter((keyframe) => keyframe.property === 'transform.rotation')
      .map((keyframe) => keyframe.value);
    const spinOutValues = spinOut.keyframes
      .filter((keyframe) => keyframe.property === 'transform.rotation')
      .map((keyframe) => keyframe.value);

    expect(spinInValues).toEqual([0, -120, -240, -360]);
    expect(spinOutValues).toEqual([0, 120, 240, 360]);
    expect(
      spinInValues.slice(1).map((value, index) => Math.abs(value - spinInValues[index]!))
    ).toEqual([120, 120, 120]);
  });

  it('creates wobble, heartbeat, and a float cycle that returns to its start pose', () => {
    const node = makeNode();
    const wobble = createAnimationPresetKeyframes(node, 'wobble', 0, 24);
    expect(
      wobble.keyframes
        .filter((keyframe) => keyframe.property === 'transform.rotation')
        .map((keyframe) => keyframe.value)
    ).toEqual([0, -12, 9, -4, 0]);

    const heartbeat = createAnimationPresetKeyframes(node, 'heartbeat', 0, 24);
    expect(
      heartbeat.keyframes
        .filter((keyframe) => keyframe.property === 'transform.scale.x')
        .map((keyframe) => keyframe.value)
    ).toEqual([1, 1.12, 1, 1.18, 1]);

    const float = createAnimationPresetKeyframes(node, 'float', 0, 24);
    expect(
      float.keyframes
        .filter((keyframe) => keyframe.property === 'transform.position.y')
        .map((keyframe) => keyframe.value)
    ).toEqual([80, 92, 80, 68, 80]);
  });

  it('creates text reveal beats by word and by line, preserving Unicode character counts', () => {
    const text = { ...makeTextNode(), content: 'Hi 🌟 there' };
    const byWord = createAnimationPresetKeyframes(text, 'word-reveal', 0, 12);
    expect(byWord.keyframes.map(({ time, value }) => [time, value])).toEqual([
      [0, 0],
      [3, 0],
      [4, 3],
      [7, 3],
      [8, 5],
      [11, 5],
      [12, 10],
    ]);

    const byLine = createAnimationPresetKeyframes(
      { ...text, content: 'One\nTwo' },
      'line-reveal',
      0,
      12
    );
    expect(byLine.keyframes.map(({ time, value }) => [time, value])).toEqual([
      [0, 0],
      [5, 0],
      [6, 4],
      [11, 4],
      [12, 7],
    ]);
    expect(byLine.baseValues.get('visibleCharacters')).toBe(7);
  });

  it('reveals text wrapped in a box line by line, as it is set', () => {
    // No font here: 24px text is estimated at 14.4 a character, so a box 80
    // wide holds one five-letter word a line
    const wrapped = {
      ...makeTextNode(),
      content: 'Hello there world',
      textResize: 'auto-height' as const,
      boxWidth: 80,
    };
    const byLine = createAnimationPresetKeyframes(wrapped, 'line-reveal', 0, 12);

    const stops = [...new Set(byLine.keyframes.map(({ value }) => value))];
    expect(stops).toEqual([0, 6, 12, 17]);
  });

  it('creates zoom, flash, rubber-band, and directional exit keyframes', () => {
    const node = makeNode();
    const zoomIn = createAnimationPresetKeyframes(node, 'zoom-in', 0, 12);
    expect(
      zoomIn.keyframes.find(
        (keyframe) => keyframe.property === 'transform.scale.x' && keyframe.time === 0
      )?.value
    ).toBeCloseTo(0.45);
    expect(
      zoomIn.keyframes.find(
        (keyframe) => keyframe.property === 'transform.scale.x' && keyframe.time === 12
      )?.value
    ).toBe(1);
    expect(
      zoomIn.keyframes.find((keyframe) => keyframe.property === 'opacity' && keyframe.time === 12)
        ?.value
    ).toBe(0.8);

    const zoomOut = createAnimationPresetKeyframes(node, 'zoom-out', 0, 12);
    expect(
      zoomOut.keyframes
        .filter((keyframe) => keyframe.property === 'transform.scale.x')
        .map((keyframe) => keyframe.value)
    ).toEqual([1, 1.28]);

    const flash = createAnimationPresetKeyframes(node, 'flash', 0, 12);
    expect(
      flash.keyframes
        .filter((keyframe) => keyframe.property === 'opacity')
        .map((keyframe) => keyframe.value)
    ).toEqual([0.8, 0.36, 0.8, 0.36, 0.8]);

    const rubberBand = createAnimationPresetKeyframes(node, 'rubber-band', 0, 12);
    expect(
      rubberBand.keyframes
        .filter((keyframe) => keyframe.property === 'transform.scale.x')
        .map((keyframe) => keyframe.value)
    ).toEqual([1, 1.24, 0.88, 1.054, 1]);

    const riseOut = createAnimationPresetKeyframes(node, 'rise-out', 0, 12);
    expect(
      riseOut.keyframes.filter((keyframe) => keyframe.property === 'transform.position.y')
    ).toEqual([
      expect.objectContaining({ time: 0, value: 80 }),
      expect.objectContaining({ time: 12, value: 144 }),
    ]);
    expect(
      riseOut.keyframes.find((keyframe) => keyframe.property === 'opacity' && keyframe.time === 12)
        ?.value
    ).toBe(0);

    const dropOut = createAnimationPresetKeyframes(node, 'drop-out', 0, 12);
    expect(
      dropOut.keyframes.filter((keyframe) => keyframe.property === 'transform.position.y')
    ).toEqual([
      expect.objectContaining({ time: 0, value: 80 }),
      expect.objectContaining({ time: 12, value: 16 }),
    ]);
  });

  it('creates seamless sway, breathing, and orbit cycles', () => {
    const node = makeNode();
    const sway = createAnimationPresetKeyframes(node, 'sway', 0, 24);
    expect(
      sway.keyframes
        .filter((keyframe) => keyframe.property === 'transform.rotation')
        .map((keyframe) => keyframe.value)
    ).toEqual([0, -8, 8, -8, 0]);

    const breathing = createAnimationPresetKeyframes(node, 'breathing', 0, 24);
    expect(
      breathing.keyframes
        .filter((keyframe) => keyframe.property === 'transform.scale.x')
        .map((keyframe) => keyframe.value)
    ).toEqual([1, 1.06, 1.12, 1.06, 1]);

    const orbit = createAnimationPresetKeyframes(node, 'orbit', 0, 24);
    const orbitX = orbit.keyframes.filter(
      (keyframe) => keyframe.property === 'transform.position.x'
    );
    const orbitY = orbit.keyframes.filter(
      (keyframe) => keyframe.property === 'transform.position.y'
    );
    expect(orbitX).toHaveLength(25);
    expect(orbitY).toHaveLength(25);
    expect(orbitX[0]?.value).toBeCloseTo(100);
    expect(orbitY[0]?.value).toBeCloseTo(80);
    expect(orbitX.at(-1)?.value).toBeCloseTo(100);
    expect(orbitY.at(-1)?.value).toBeCloseTo(80);
  });

  it('keeps earlier keyframes, replaces future ones on affected properties, and leaves other tracks intact', () => {
    const node = makeNode();
    const timeline = createTimeline({ duration: 30 });
    const xTrack = getOrCreateTrack<number>(timeline, node.id, 'transform.position.x');
    addKeyframe(xTrack, 0, 90);
    addKeyframe(xTrack, 20, 120);
    const opacityTrack = getOrCreateTrack<number>(timeline, node.id, 'opacity');
    addKeyframe(opacityTrack, 0, 0.5);
    const unrelatedTrack = getOrCreateTrack<number>(timeline, 'other', 'opacity');
    addKeyframe(unrelatedTrack, 20, 0.25);

    const updated = applyAnimationPreset(timeline, node, 'slide-in', 10, 24);

    const updatedX = updated.tracks.find(
      (track) => track.nodeId === node.id && track.property === 'transform.position.x'
    )!;
    expect(updatedX.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 90],
      [10, 36],
      [34, 100],
    ]);
    expect(
      updated.tracks.find((track) => track.nodeId === node.id && track.property === 'opacity')
        ?.keyframes
    ).toHaveLength(3);
    expect(
      updated.tracks.find((track) => track.nodeId === 'other' && track.property === 'opacity')
        ?.keyframes
    ).toHaveLength(1);
    expect(timeline.duration).toBe(30);
    expect(updated.duration).toBe(35);
  });

  it('keeps an entrance applied after frame zero hidden until it begins', () => {
    const node = makeNode();
    const updated = applyAnimationPreset(createTimeline({ duration: 30 }), node, 'fade-in', 12, 24);
    const opacityTrack = updated.tracks.find((track) => track.property === 'opacity')!;

    // Held at the start value — no fade-out from the original 0.8 towards frame 12
    expect(opacityTrack.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 0],
      [12, 0],
      [36, 0.8],
    ]);
    expect(evaluateTrack(opacityTrack, 6)).toBe(0);

    const rise = applyAnimationPreset(createTimeline({ duration: 30 }), node, 'rise-in', 12, 24);
    for (const track of rise.tracks) {
      expect(evaluateTrack(track, 6)).toBe(evaluateTrack(track, 12));
    }
  });

  it('keeps the original look until an emphasis or exit applied after frame zero begins', () => {
    const node = makeNode();
    for (const presetId of ['pulse', 'fade-out', 'shake'] as const) {
      const updated = applyAnimationPreset(
        createTimeline({ duration: 30 }),
        node,
        presetId,
        12,
        24
      );
      for (const track of updated.tracks) {
        const [first, second] = track.keyframes;
        expect(first!.time).toBe(0);
        expect(first!.value).toBe(second!.value);
      }
    }
  });
});
