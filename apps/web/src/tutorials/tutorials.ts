/**
 * Tutorials shipped with Quar Animator
 * Projects that teach the editor, one lesson per page: instructions on the
 * left of each artboard, a working example on the right to play with.
 */

import type { EasingFunction, Node, Timeline } from '@quar/types';
import {
  addKeyframe,
  applyAnimationPreset,
  captureRestPose,
  compileAnimationSequence,
  createAnimationSequence,
  getOrCreateTrack,
} from '@quar/animation';
import type { AnimationPresetId, AnimationSequenceStep, SequenceTrigger } from '@quar/animation';
import type { ProjectDataV2 } from '../services/projectSerializer';
import {
  CORAL,
  INK,
  MUTED,
  SKY,
  TEAL,
  VIOLET,
  TutorialNodes,
  artboard,
  ellipse,
  emptyTimeline,
  rectangle,
  star,
  text,
  tutorialProject,
} from './tutorialBuilder';
import type { TutorialPage } from './tutorialBuilder';

export interface Tutorial {
  /** Stable id: the project's id, and how its seeding is remembered. */
  id: string;
  name: string;
  build: (createdAt: string) => ProjectDataV2;
}

// Text column on the left of each page, example on the right (Y up)
const LEFT = -370;
const TITLE_TOP = 190;
const BODY_TOP = 130;
const BODY_WIDTH = 390;
const BODY_HEIGHT = 340;

function lesson(
  ids: TutorialNodes,
  name: string,
  title: string,
  body: string
): { board: Node; nodes: Node[] } {
  const board = artboard(ids, name);
  return {
    board,
    nodes: [
      board,
      text(ids, board.id, title, LEFT, TITLE_TOP, 740, 44, {
        size: 28,
        weight: 700,
        name: 'Title',
      }),
      text(ids, board.id, body, LEFT, BODY_TOP, BODY_WIDTH, BODY_HEIGHT, { name: 'Lesson' }),
    ],
  };
}

function key(
  timeline: Timeline,
  nodeId: string,
  property: string,
  frames: Array<[frame: number, value: number, easing?: EasingFunction]>
): void {
  const track = getOrCreateTrack<number>(timeline, nodeId, property);
  for (const [frame, value, easing] of frames) addKeyframe(track, frame, value, easing);
}

// ============================================================================
// Tutorial 1 · Draw & animate
// ============================================================================

function welcomePage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    'Welcome',
    'Welcome to Quar Animator',
    'This project is a short tour. Each page is one lesson: switch between them with the tabs above the canvas.\n\n' +
      'Press Space to play the animation on a page, and Space again to pause it. Everything here is yours to change, so move things around and recolor them.\n\n' +
      'When you are done, delete the project from the Projects page: hover its card and click the bin twice.'
  );
  const floor = rectangle(ids, board.id, 'Floor', 210, -150, 260, 6, MUTED, 3);
  const ball = ellipse(ids, board.id, 'Ball', 210, 110, 34, VIOLET);
  const timeline = emptyTimeline();
  // Falls, squashes on the floor, bounces back up: one bounce a second
  key(timeline, ball.id, 'transform.position.y', [
    [0, 110, 'easeInQuad'],
    [15, -113, 'linear'],
    [18, -118, 'easeOutQuad'],
    [21, -113, 'easeOutQuad'],
    [36, 110],
  ]);
  key(timeline, ball.id, 'transform.scale.x', [
    [0, 1],
    [14, 0.92],
    [18, 1.25],
    [22, 0.95],
    [30, 1],
  ]);
  key(timeline, ball.id, 'transform.scale.y', [
    [0, 1],
    [14, 1.1],
    [18, 0.75],
    [22, 1.08],
    [30, 1],
  ]);
  return { name: 'Welcome', nodes: [...nodes, floor, ball], timeline };
}

function shapesPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Shapes',
    'Draw shapes',
    'Pick a tool in the bar at the top, or press its key: V selects, R draws rectangles, O ellipses, P paths with the pen, T text and F artboards. Drag on the canvas to draw. Hold Shift for a square or circle, Alt to draw from the center.\n\n' +
      'Select a shape to change it in Properties on the right: position, size, rotation, fill and stroke. Drag a label such as X or W to scrub its value.\n\n' +
      'With the Text tool, click to type a line that grows as you type, or drag a box for text that wraps inside it, like this one.'
  );
  return {
    name: '1 · Shapes',
    nodes: [
      ...nodes,
      rectangle(ids, board.id, 'Rounded rectangle', 150, 70, 150, 110, SKY, 18),
      ellipse(ids, board.id, 'Circle', 290, 60, 55, CORAL),
      star(ids, board.id, 'Star', 220, -95, 70, TEAL),
    ],
  };
}

function keyframesPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Keyframes',
    'Animate with keyframes',
    'The timeline at the bottom shows each layer’s keyframes as diamonds. To animate something, move the playhead to a frame and change the object: with auto-keyframe on (press K), every change becomes a keyframe.\n\n' +
      'You can also click the diamond next to a property in Properties to set a keyframe by hand. Right-click a keyframe on the timeline to change its easing, and press G to shape the curves in the graph editor.\n\n' +
      'Step a frame with , and . and jump to the start or end with Home and End.'
  );
  const square = rectangle(ids, board.id, 'Square', 110, 60, 80, 80, VIOLET, 12);
  const spinner = star(ids, board.id, 'Star', 220, -110, 50, CORAL);
  const timeline = emptyTimeline();
  key(timeline, square.id, 'transform.position.x', [
    [0, 110, 'easeInOutCubic'],
    [60, 320, 'easeInOutCubic'],
    [120, 110],
  ]);
  key(timeline, square.id, 'transform.rotation', [
    [0, 0, 'easeInOutCubic'],
    [60, -180, 'easeInOutCubic'],
    [120, -360],
  ]);
  const color = getOrCreateTrack(timeline, square.id, 'fills.0.color');
  addKeyframe(color, 0, { ...VIOLET }, 'easeInOutCubic');
  addKeyframe(color, 60, { ...TEAL }, 'easeInOutCubic');
  addKeyframe(color, 120, { ...VIOLET });
  key(timeline, spinner.id, 'transform.rotation', [
    [0, 0],
    [149, -720],
  ]);
  return { name: '2 · Keyframes', nodes: [...nodes, square, spinner], timeline };
}

function exportPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · Export',
    'Share your animation',
    'Select an artboard by clicking its name, just above its top-left corner, then open Export in the menu bar. GIF, MP4, PNG sequence and sprite sheet exports render what is on that artboard; Lottie JSON plays on websites and in apps.\n\n' +
      'The color around artboards is the document background. With nothing selected, Properties shows it so you can set your own.'
  );
  const dots = [VIOLET, TEAL, CORAL].map((color, i) =>
    ellipse(ids, board.id, `Dot ${i + 1}`, 140 + i * 80, 0, 26, color)
  );
  const timeline = emptyTimeline();
  // A loading pulse, each dot a little after the one before
  dots.forEach((dot, i) => {
    const start = i * 8;
    for (const axis of ['x', 'y']) {
      key(timeline, dot.id, `transform.scale.${axis}`, [
        [start, 1, 'easeOutQuad'],
        [start + 12, 1.45, 'easeInQuad'],
        [start + 24, 1],
        [start + 60, 1],
      ]);
    }
  });
  return { name: '3 · Export', nodes: [...nodes, ...dots], timeline };
}

// ============================================================================
// Tutorial 2 · Motion presets & sequences
// ============================================================================

function presetsPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Presets',
    'One-click motion',
    'Select an object and look at Animation in Properties: Entrance, Emphasis, Loop and Exit effects. Pick one and it becomes ordinary keyframes on the timeline, so every one of them can still be changed.\n\n' +
      'Text has entrances of its own: Typewriter, By Word and By Line.\n\n' +
      'Each object on the right has a preset applied. Select one to see its keyframes.'
  );
  const popper = ellipse(ids, board.id, 'Pop in', 130, 95, 40, CORAL);
  const bouncer = rectangle(ids, board.id, 'Bounce', 290, 95, 80, 80, SKY, 14);
  const typed = text(ids, board.id, 'Typed letter by letter.', 60, -40, 320, 40, {
    size: 20,
    weight: 700,
    color: VIOLET,
    name: 'Typewriter',
  });
  const presets: Array<[Node, AnimationPresetId, number, number]> = [
    [popper, 'pop-in', 0, 20],
    [bouncer, 'bounce', 20, 30],
    [typed, 'typewriter', 50, 50],
  ];
  const timeline = presets.reduce(
    (current, [node, preset, start, duration]) =>
      applyAnimationPreset(current, node, preset, start, duration),
    emptyTimeline()
  );
  return { name: '1 · Presets', nodes: [...nodes, popper, bouncer, typed], timeline };
}

function sequencePage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Sequence',
    'Build a sequence',
    'The Animation Sequence window (Shift+A, or Animation Sequence in the View menu) lines effects up like slides in a presentation. Each step starts after the previous one, together with it, or after a step you choose.\n\n' +
      'Select an object, choose an effect and click Add step. Drag the steps to reorder them, and the timeline follows.\n\n' +
      'This page was built that way: open the window to see its steps.'
  );
  const heading = text(ids, board.id, 'Our plan', 60, 170, 300, 36, {
    size: 24,
    weight: 700,
    name: 'Heading',
  });
  const cards = ['Sketch', 'Animate', 'Ship'].map((label, i) =>
    rectangle(
      ids,
      board.id,
      `Card: ${label}`,
      110 + i * 100,
      40,
      84,
      110,
      [SKY, TEAL, VIOLET][i]!,
      12
    )
  );
  const labels = ['Sketch', 'Animate', 'Ship'].map((label, i) =>
    text(ids, board.id, label, 70 + i * 100, -30, 84, 24, {
      size: 14,
      weight: 700,
      align: 'center',
      color: INK,
      name: `Label: ${label}`,
    })
  );
  const badge = star(ids, board.id, 'Badge', 310, -110, 34, CORAL);

  const plan: Array<[Node, AnimationPresetId, SequenceTrigger, number]> = [
    [heading, 'slide-in', 'afterPrevious', 18],
    [cards[0]!, 'rise-in', 'afterPrevious', 15],
    [labels[0]!, 'fade-in', 'withPrevious', 15],
    [cards[1]!, 'rise-in', 'afterPrevious', 15],
    [labels[1]!, 'fade-in', 'withPrevious', 15],
    [cards[2]!, 'rise-in', 'afterPrevious', 15],
    [labels[2]!, 'fade-in', 'withPrevious', 15],
    [badge, 'pop-in', 'afterPrevious', 20],
  ];
  const sequence = createAnimationSequence();
  plan.forEach(([node, presetId, trigger, duration], i) => {
    sequence.restPoses[node.id] = captureRestPose(node);
    const step: AnimationSequenceStep = {
      id: `${node.id}-step-${i + 1}`,
      nodeId: node.id,
      presetId,
      trigger,
      delay: 0,
      duration,
    };
    sequence.steps.push(step);
  });
  const all = [...nodes, heading, ...cards, ...labels, badge];
  const byId = new Map(all.map((node) => [node.id, node]));
  const timeline = compileAnimationSequence(emptyTimeline(), sequence, (id) => byId.get(id));
  return { name: '2 · Sequence', nodes: all, timeline, sequence };
}

// ============================================================================
// Catalog
// ============================================================================

export const TUTORIALS: Tutorial[] = [
  {
    id: 'tutorial-draw-and-animate',
    name: 'Tutorial 1 · Draw & animate',
    build: (createdAt) => {
      const ids = new TutorialNodes('t1');
      return tutorialProject(
        'tutorial-draw-and-animate',
        'Tutorial 1 · Draw & animate',
        [welcomePage(ids), shapesPage(ids), keyframesPage(ids), exportPage(ids)],
        createdAt
      );
    },
  },
  {
    id: 'tutorial-presets-and-sequences',
    name: 'Tutorial 2 · Motion presets & sequences',
    build: (createdAt) => {
      const ids = new TutorialNodes('t2');
      return tutorialProject(
        'tutorial-presets-and-sequences',
        'Tutorial 2 · Motion presets & sequences',
        [presetsPage(ids), sequencePage(ids)],
        createdAt
      );
    },
  },
];

/** Whether a project is one of the tutorials (they're given ids of this form). */
export function isTutorialId(id: string): boolean {
  return id.startsWith('tutorial-');
}

/** A tutorial's place in the course; ones no longer in the catalog go last. */
export function tutorialOrder(id: string): number {
  const index = TUTORIALS.findIndex((tutorial) => tutorial.id === id);
  return index < 0 ? TUTORIALS.length : index;
}
