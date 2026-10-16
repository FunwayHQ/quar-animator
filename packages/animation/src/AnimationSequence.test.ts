import { describe, expect, it } from 'vitest';
import type { Node, RectangleNode, TextNode, Timeline } from '@quar/types';
import { addKeyframe, createTimeline, getOrCreateTrack } from './Timeline';
import { evaluateNodeAtFrame } from './PropertyBinding';
import {
  captureRestPose,
  compileAnimationSequence,
  createAnimationSequence,
  moveSequenceStep,
  normalizeSequence,
  removeSequenceStep,
  scheduleSequence,
  type AnimationSequence,
  type AnimationSequenceStep,
} from './AnimationSequence';

function makeRect(id = 'rect1', opacity = 0.8): RectangleNode {
  return {
    id,
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
    opacity,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [],
    strokes: [],
  };
}

function makeText(id = 'text1'): TextNode {
  return {
    ...makeRect(id),
    type: 'text',
    name: 'Text',
    content: 'Hello',
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
  };
}

let stepCounter = 0;
function step(partial: Partial<AnimationSequenceStep>): AnimationSequenceStep {
  stepCounter++;
  return {
    id: `s${stepCounter}`,
    nodeId: 'rect1',
    presetId: 'fade-in',
    trigger: 'afterPrevious',
    delay: 0,
    duration: 24,
    ...partial,
  };
}

function sequenceOf(...steps: AnimationSequenceStep[]): AnimationSequence {
  return { steps, restPoses: {} };
}

function nodesById(...nodes: Node[]) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  return (id: string) => map.get(id);
}

function valueAt(timeline: Timeline, nodeId: string, property: string, frame: number) {
  return evaluateNodeAtFrame(timeline, nodeId, frame).get(property);
}

describe('scheduleSequence', () => {
  it('chains "after previous" steps end to end, adding delays', () => {
    const schedule = scheduleSequence(
      sequenceOf(step({ id: 'a' }), step({ id: 'b', delay: 6 }), step({ id: 'c', duration: 12 }))
    );
    expect(schedule.map(({ number, start, end }) => ({ number, start, end }))).toEqual([
      { number: 1, start: 0, end: 24 },
      { number: 2, start: 30, end: 54 },
      { number: 3, start: 54, end: 66 },
    ]);
  });

  it('starts "with previous" steps together with the previous one', () => {
    const schedule = scheduleSequence(
      sequenceOf(
        step({ id: 'a', delay: 10 }),
        step({ id: 'b', trigger: 'withPrevious' }),
        step({ id: 'c', trigger: 'withPrevious', delay: 4 })
      )
    );
    expect(schedule.map((entry) => entry.start)).toEqual([10, 10, 14]);
  });

  it('times "after #N" and "with #N" against a chosen earlier step', () => {
    const schedule = scheduleSequence(
      sequenceOf(
        step({ id: 'a', duration: 30 }),
        step({ id: 'b', duration: 10 }),
        step({ id: 'c', trigger: 'with', targetStepId: 'a', delay: 5 }),
        step({ id: 'd', trigger: 'after', targetStepId: 'a' })
      )
    );
    expect(schedule.map((entry) => entry.start)).toEqual([0, 30, 5, 30]);
  });

  it('falls back to the previous step when the target is missing or later', () => {
    const schedule = scheduleSequence(
      sequenceOf(
        step({ id: 'a' }),
        step({ id: 'b', trigger: 'after', targetStepId: 'gone' }),
        step({ id: 'c', trigger: 'with', targetStepId: 'd' }),
        step({ id: 'd' })
      )
    );
    expect(schedule.map((entry) => entry.start)).toEqual([0, 24, 24, 48]);
  });

  it('uses the frames a preset actually spans', () => {
    const [entry] = scheduleSequence(sequenceOf(step({ duration: 2 })));
    expect(entry).toMatchObject({ start: 0, end: 4, cycleFrames: 4 });
  });

  it('repeats loop presets a set number of times', () => {
    const [loop, next] = scheduleSequence(
      sequenceOf(step({ presetId: 'float', duration: 20, repeat: 3 }), step({}))
    );
    expect(loop).toMatchObject({ start: 0, end: 60, cycles: 3 });
    expect(next!.start).toBe(60);
  });

  it('ignores repeat on non-loop presets', () => {
    const [entry] = scheduleSequence(sequenceOf(step({ presetId: 'pulse', repeat: 4 })));
    expect(entry!.cycles).toBe(1);
  });

  it('repeats "until end" loops to the timeline end but releases dependents after one cycle', () => {
    const [loop, next] = scheduleSequence(
      sequenceOf(step({ presetId: 'sway', duration: 20, repeat: 'untilEnd' }), step({})),
      120
    );
    expect(next!.start).toBe(20);
    expect(loop).toMatchObject({ start: 0, cycles: 5, end: 100, release: 20 });
  });
});

describe('compileAnimationSequence', () => {
  const emptyTimeline = () => createTimeline({ duration: 60, frameRate: 30 });

  it('writes tagged preset keyframes with stable ids', () => {
    const sequence = sequenceOf(step({ id: 'fade' }));
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    const opacity = timeline.tracks.find((track) => track.property === 'opacity')!;
    expect(opacity.keyframes.map((kf) => [kf.time, kf.value, kf.sequenceStepId, kf.id])).toEqual([
      [0, 0, 'fade', 'seq_fade_opacity_0'],
      [24, 0.8, 'fade', 'seq_fade_opacity_24'],
    ]);
  });

  it('keeps an entrance object hidden until its step starts', () => {
    const sequence = sequenceOf(step({ id: 'a', presetId: 'pulse' }), step({ id: 'b' }));
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    expect(valueAt(timeline, 'rect1', 'opacity', 0)).toBe(0);
    expect(valueAt(timeline, 'rect1', 'opacity', 23)).toBe(0);
    expect(valueAt(timeline, 'rect1', 'opacity', 48)).toBeCloseTo(0.8);
  });

  it('is idempotent and replaces keyframes from the previous compile', () => {
    const sequence = sequenceOf(step({ id: 'a' }), step({ id: 'b', presetId: 'shake' }));
    const getNode = nodesById(makeRect());
    const once = compileAnimationSequence(emptyTimeline(), sequence, getNode);
    const twice = compileAnimationSequence(once, sequence, getNode);
    expect(twice.tracks.map((track) => [track.id, track.keyframes])).toEqual(
      once.tracks.map((track) => [track.id, track.keyframes])
    );

    const withoutShake = compileAnimationSequence(once, removeSequenceStep(sequence, 'b'), getNode);
    expect(withoutShake.tracks.map((track) => track.property)).toEqual(['opacity']);
  });

  it('animates from the stored rest pose, not the live (evaluated) node', () => {
    // Playback left the node at frame 0 of its fade: opacity 0
    const live = makeRect('rect1', 0);
    const sequence: AnimationSequence = {
      steps: [step({ id: 'a' })],
      restPoses: { rect1: captureRestPose(makeRect('rect1', 0.8)) },
    };
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(live));
    expect(valueAt(timeline, 'rect1', 'opacity', 24)).toBeCloseTo(0.8);
  });

  it('shares one track between an entrance and a later exit on the same property', () => {
    const sequence = sequenceOf(
      step({ id: 'in', presetId: 'fade-in' }),
      step({ id: 'out', presetId: 'fade-out', delay: 20 })
    );
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    expect(timeline.tracks.filter((track) => track.property === 'opacity')).toHaveLength(1);
    expect(valueAt(timeline, 'rect1', 'opacity', 34)).toBeCloseTo(0.8); // held between
    expect(valueAt(timeline, 'rect1', 'opacity', 68)).toBe(0); // gone after the exit
  });

  it('lets a later step own its time range where steps overlap', () => {
    const sequence = sequenceOf(
      step({ id: 'shake', presetId: 'shake', duration: 40 }),
      step({ id: 'slide', presetId: 'slide-in', trigger: 'withPrevious', delay: 10 })
    );
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    const x = timeline.tracks.find((track) => track.property === 'transform.position.x')!;
    const inSlideRange = x.keyframes.filter((kf) => kf.time >= 10 && kf.time <= 34);
    expect(inSlideRange.every((kf) => kf.sequenceStepId === 'slide')).toBe(true);
    expect(x.keyframes.some((kf) => kf.sequenceStepId === 'shake' && kf.time > 34)).toBe(true);
  });

  it('keeps hand-made keyframes outside step ranges and on other properties', () => {
    const timeline = emptyTimeline();
    addKeyframe(getOrCreateTrack(timeline, 'rect1', 'opacity'), 50, 0.3);
    addKeyframe(getOrCreateTrack(timeline, 'rect1', 'opacity'), 10, 0.5);
    addKeyframe(getOrCreateTrack(timeline, 'rect1', 'transform.rotation'), 5, 45);

    const compiled = compileAnimationSequence(
      timeline,
      sequenceOf(step({ id: 'a' })),
      nodesById(makeRect())
    );
    const opacity = compiled.tracks.find((track) => track.property === 'opacity')!;
    expect(opacity.keyframes.map((kf) => [kf.time, kf.sequenceStepId])).toEqual([
      [0, 'a'],
      [24, 'a'],
      [50, undefined],
    ]);
    const rotation = compiled.tracks.find((track) => track.property === 'transform.rotation')!;
    expect(rotation.keyframes).toHaveLength(1);
  });

  it('repeats loop keyframes for every cycle', () => {
    const sequence = sequenceOf(step({ presetId: 'float', duration: 20, repeat: 3 }));
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    const y = timeline.tracks.find((track) => track.property === 'transform.position.y')!;
    expect(y.keyframes.at(-1)!.time).toBe(60);
    expect(y.keyframes.filter((kf) => kf.value === 80).map((kf) => kf.time)).toEqual([
      0, 10, 20, 30, 40, 50, 60,
    ]);
  });

  it('skips steps whose node is missing or does not support the preset', () => {
    const sequence = sequenceOf(
      step({ id: 'a', nodeId: 'gone' }),
      step({ id: 'b', presetId: 'typewriter' }),
      step({ id: 'c', nodeId: 'text1', presetId: 'typewriter' })
    );
    const timeline = compileAnimationSequence(
      emptyTimeline(),
      sequence,
      nodesById(makeRect(), makeText())
    );
    expect(timeline.tracks.map((track) => [track.nodeId, track.property])).toEqual([
      ['text1', 'visibleCharacters'],
    ]);
  });

  it('extends the timeline to fit the sequence', () => {
    const sequence = sequenceOf(step({}), step({}), step({ duration: 30 }));
    const timeline = compileAnimationSequence(emptyTimeline(), sequence, nodesById(makeRect()));
    expect(timeline.duration).toBe(79);
  });

  it('leaves an empty sequence a no-op apart from removing old managed keyframes', () => {
    const timeline = emptyTimeline();
    const compiled = compileAnimationSequence(
      timeline,
      createAnimationSequence(),
      nodesById(makeRect())
    );
    expect(compiled.tracks).toEqual([]);
    expect(compiled.duration).toBe(60);
  });
});

describe('sequence editing helpers', () => {
  it('captures the rest pose of a node', () => {
    expect(captureRestPose(makeRect())).toEqual({
      opacity: 0.8,
      'transform.position.x': 100,
      'transform.position.y': 80,
      'transform.rotation': 0,
      'transform.scale.x': 1,
      'transform.scale.y': 1,
    });
  });

  it('turns references to a removed step into after/with previous', () => {
    const sequence = sequenceOf(
      step({ id: 'a' }),
      step({ id: 'b' }),
      step({ id: 'c', trigger: 'after', targetStepId: 'b' }),
      step({ id: 'd', trigger: 'with', targetStepId: 'b' }),
      step({ id: 'e', trigger: 'with', targetStepId: 'a' })
    );
    const result = removeSequenceStep(sequence, 'b');
    expect(result.steps.map((s) => [s.id, s.trigger, s.targetStepId])).toEqual([
      ['a', 'afterPrevious', undefined],
      ['c', 'afterPrevious', undefined],
      ['d', 'withPrevious', undefined],
      ['e', 'with', 'a'],
    ]);
  });

  it('repairs references that a reorder makes point forward', () => {
    const sequence = sequenceOf(
      step({ id: 'a' }),
      step({ id: 'b', trigger: 'after', targetStepId: 'a' })
    );
    const moved = moveSequenceStep(sequence, 1, 0);
    expect(moved.steps.map((s) => [s.id, s.trigger])).toEqual([
      ['b', 'afterPrevious'],
      ['a', 'afterPrevious'],
    ]);
  });

  it('drops rest poses of nodes that no longer have steps', () => {
    const sequence: AnimationSequence = {
      steps: [step({ nodeId: 'rect1' })],
      restPoses: { rect1: { opacity: 1 }, rect2: { opacity: 1 } },
    };
    expect(Object.keys(normalizeSequence(sequence).restPoses)).toEqual(['rect1']);
  });
});
