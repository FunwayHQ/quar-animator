/**
 * More tutorials: paths, text, rigging, groups/symbols/masks and timing.
 * Same layout as the first two: instructions on the left of each artboard,
 * something to try or watch on the right.
 */

import type { EasingFunction, Node } from '@quar/types';
import { applyAnimationPreset, createCubicBezier } from '@quar/animation';
import type { AnimationPresetId } from '@quar/animation';
import {
  CORAL,
  INK,
  MUTED,
  SKY,
  TEAL,
  VIOLET,
  TutorialNodes,
  bone,
  ellipse,
  emptyTimeline,
  group,
  key,
  lesson,
  looseText,
  path,
  rectangle,
  solid,
  star,
  symbolDefinition,
  symbolInstance,
  text,
  tutorialProject,
} from './tutorialBuilder';
import type { TutorialPage } from './tutorialBuilder';
import type { Tutorial } from './tutorials';

const LIGHT = { r: 214, g: 218, b: 226, a: 1 };

function caption(ids: TutorialNodes, parent: string, content: string, left: number, top: number) {
  return text(ids, parent, content, left, top, 140, 20, { size: 12, color: MUTED, name: content });
}

/** A leaf: two smooth points, top and bottom, bulging either way. */
function leafPoints(height: number, bulge: number) {
  const h = height / 2;
  return [
    [0, h, [-bulge, -h * 0.55], [bulge, -h * 0.55]],
    [0, -h, [bulge, h * 0.55], [-bulge, h * 0.55]],
  ] as Array<[number, number, [number, number], [number, number]]>;
}

// ============================================================================
// Tutorial 3 · Paths & shapes
// ============================================================================

function penPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Pen',
    'Draw with the pen',
    'Press P for the Pen tool. Click to place a corner point, or click and drag to pull out a curve (Alt/Option breaks the handles, Shift keeps to 45°). Click the first point again to close the shape, or press Enter to finish an open line. Backspace removes the last point; Escape throws the path away. With a path selected, the Pen adds and removes points on it, and carries on from an open end.\n\n' +
      'Try tracing the drop on the right: click its tip, drag down at its right side and up at its left, then click the tip to close the shape and give it a fill in Properties.'
  );
  return {
    name: '1 · Pen',
    nodes: [
      ...nodes,
      caption(ids, board.id, 'Trace this', 60, 175),
      path(ids, board.id, 'Outline to trace', 130, 40, dropPoints(), {
        stroke: LIGHT,
        strokeWidth: 2,
      }),
      caption(ids, board.id, 'Finished', 250, 175),
      path(ids, board.id, 'Drop', 300, 40, dropPoints(), { fill: TEAL }),
    ],
  };
}

/**
 * A drop as the Pen draws it: a clicked tip (a corner) and two dragged sides,
 * their handles mirrored as a drag makes them. Three points, since a click
 * on the first point closes a path only once it has three.
 */
function dropPoints() {
  return [
    [0, 100],
    [70, -30, [0, 70], [0, -70]],
    [-70, -30, [0, -70], [0, 70]],
  ] as Array<[number, number, [number, number]?, [number, number]?]>;
}

function pointsPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Points',
    'Reshape point by point',
    'Press A for Direct Selection and click a shape to see its points. Drag a point to move it; Shift+click, a marquee or Ctrl/Cmd+A picks several. Drag a handle or a segment to bend the curve (Alt/Option+drag: one handle alone). Alt/Option+click switches corner and smooth; double-click a segment adds a point; Delete removes the picked ones.\n\n' +
      'Shapes clicked with Direct Selection become paths, keeping their animation. Edit > Path reverses, simplifies, joins (Ctrl/Cmd+J) and cuts paths. Try it on the star.'
  );
  const wave = path(
    ids,
    board.id,
    'Wave',
    220,
    110,
    [
      [-150, 0, undefined, [40, 50]],
      [-50, 0, [-40, -50], [40, 50]],
      [50, 0, [-40, -50], [40, 50]],
      [150, 0, [-40, -50]],
    ],
    { stroke: SKY, strokeWidth: 6 },
    false
  );
  return {
    name: '2 · Points',
    nodes: [
      ...nodes,
      wave,
      star(ids, board.id, 'Star', 140, -70, 70, CORAL),
      path(ids, board.id, 'Blob', 300, -70, leafPoints(140, 90), { fill: VIOLET }),
    ],
  };
}

function combinePage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · Combine',
    'Combine shapes',
    'Select two or more shapes and pick Union, Subtract, Intersect or Exclude: in Properties, or in the Edit menu (Ctrl/Cmd+Shift+U, D, I or X). The result stays editable: the shapes live on inside the boolean group, and Flatten Boolean makes it a single path.\n\n' +
      'Subtract cuts the shapes above out of the bottom one. Try it on the pair on the left; the ring is a subtraction already.\n\n' +
      'Edit > Outline Stroke turns a stroke into a filled shape.'
  );
  const ring = group(ids, board.id, 'Ring (Subtract)');
  const ringGroup = { ...ring, booleanOp: 'subtract' as const, fills: solid(TEAL), strokes: [] };
  return {
    name: '3 · Combine',
    nodes: [
      ...nodes,
      caption(ids, board.id, 'Try a boolean', 60, 175),
      rectangle(ids, board.id, 'Square', 120, 80, 110, 110, SKY, 8),
      ellipse(ids, board.id, 'Circle', 170, 40, 55, CORAL),
      caption(ids, board.id, 'A subtraction', 250, 175),
      ringGroup,
      ellipse(ids, ringGroup.id, 'Outer', 310, 60, 70, TEAL),
      ellipse(ids, ringGroup.id, 'Hole', 310, 60, 40, TEAL),
    ],
  };
}

// ============================================================================
// Tutorial 4 · Text
// ============================================================================

function textBoxesPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Text boxes',
    'Three kinds of text box',
    'Press T and click to type a line that grows as you type: auto width. Drag a box instead and the text wraps inside it: fixed size. Enter starts a new line; Escape or clicking away finishes, and double-clicking text edits it again.\n\n' +
      'Drag a side handle to give a line a width to wrap at (auto height), or switch in Properties, under Resize: Auto width, Auto height, Fixed size. Resizing never stretches the letters.'
  );
  return {
    name: '1 · Text boxes',
    nodes: [
      ...nodes,
      caption(ids, board.id, 'Auto width', 60, 175),
      looseText(ids, board.id, 'One line, as long as you type', 60, 150, { size: 18, color: SKY }),
      caption(ids, board.id, 'Auto height', 60, 100),
      looseText(ids, board.id, 'Wraps at its width and grows down as you write more.', 60, 75, {
        size: 18,
        color: TEAL,
        width: 230,
      }),
      caption(ids, board.id, 'Fixed size', 60, -30),
      // The box, behind its text
      rectangle(ids, board.id, 'Box', 175, -95, 238, 86, { ...LIGHT, a: 0.35 }, 4),
      text(
        ids,
        board.id,
        'Wraps inside the box you drew, which keeps its size.',
        60,
        -55,
        230,
        80,
        {
          size: 18,
          color: VIOLET,
          name: 'Fixed size text',
        }
      ),
    ],
  };
}

function textStylePage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Style & reveal',
    'Style it, then reveal it',
    'Select text to change its Font, Font Size, Weight, Align, Line Height and Letter Spacing in Properties. Inter comes with the app; the other fonts in the list come from Google Fonts, and the first time you pick one the app asks before loading it.\n\n' +
      'Under Animation in Properties, text has three entrances of its own: Typewriter, By Word and By Line. Each example on the right uses one. Press Space to play them.'
  );
  const typed = text(ids, board.id, 'Typewriter: letter by letter.', 60, 160, 320, 30, {
    size: 18,
    weight: 700,
    color: SKY,
    name: 'Typewriter',
  });
  const words = text(ids, board.id, 'By Word: one word at a time.', 60, 90, 320, 30, {
    size: 18,
    weight: 700,
    color: TEAL,
    name: 'By Word',
  });
  const lines = text(ids, board.id, 'By Line shows\none line\nat a time.', 60, 20, 320, 100, {
    size: 18,
    weight: 700,
    color: VIOLET,
    name: 'By Line',
  });
  const presets: Array<[Node, AnimationPresetId, number, number]> = [
    [typed, 'typewriter', 0, 40],
    [words, 'word-reveal', 45, 40],
    [lines, 'line-reveal', 90, 40],
  ];
  const timeline = presets.reduce(
    (current, [node, preset, start, duration]) =>
      applyAnimationPreset(current, node, preset, start, duration),
    emptyTimeline()
  );
  return {
    name: '2 · Style & reveal',
    nodes: [
      ...nodes,
      // Each entrance starts hidden: the captions show where to look
      caption(ids, board.id, 'Typewriter', 60, 182),
      typed,
      caption(ids, board.id, 'By Word', 60, 112),
      words,
      caption(ids, board.id, 'By Line', 60, 42),
      lines,
    ],
    timeline,
  };
}

function outlinesPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · Outlines',
    'Turn text into shapes',
    'Edit > Convert to Path (Ctrl/Cmd+Shift+P) turns a text layer into a group with one path per letter. They are shapes from then on: reshape them with Direct Selection (A), color them one by one, or animate each letter on its own.\n\n' +
      'Converted letters no longer follow edits to the text, so keep a copy if you might change it. Try it on the word on the right.'
  );
  return {
    name: '3 · Outlines',
    nodes: [
      ...nodes,
      text(ids, board.id, 'Shape', 60, 60, 320, 110, {
        size: 96,
        weight: 700,
        color: CORAL,
        lineHeight: 1.1,
        name: 'Shape',
      }),
    ],
  };
}

// ============================================================================
// Tutorial 5 · Rigging
// ============================================================================

/** A three-bone arm from `origin`, with a rigid segment riding on each bone. */
function arm(ids: TutorialNodes, parent: string, x: number, y: number, segments: boolean) {
  const shoulder = bone(ids, parent, 'Upper arm', x, y, 90, 0);
  const elbow = bone(ids, shoulder.id, 'Forearm', 90, 0, 80, 0);
  const wrist = bone(ids, elbow.id, 'Hand', 80, 0, 40, 0);
  const nodes: Node[] = [shoulder, elbow, wrist];
  if (segments) {
    const shapes = [
      rectangle(ids, shoulder.id, 'Upper arm shape', 45, 0, 100, 34, SKY, 17),
      rectangle(ids, elbow.id, 'Forearm shape', 40, 0, 90, 28, TEAL, 14),
      ellipse(ids, wrist.id, 'Hand shape', 22, 0, 22, CORAL),
    ];
    // See-through, so the bones they ride on show
    for (const shape of shapes) shape.opacity = 0.7;
    nodes.push(...shapes);
  }
  return { shoulder, elbow, wrist, nodes };
}

function bonesPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Bones',
    'Build a skeleton',
    'Press J for the Bone tool and drag to draw a bone. Each drag after that starts at the last bone’s tip and adds its child, building a chain; press Escape to end it. Start a drag on any bone’s tip to branch from there.\n\n' +
      'Bones are rig helpers: you see them here, never in exports. Select a bone and drag just outside a corner of its box to rotate it, and its children follow. The arm on the right has shapes riding on its bones.'
  );
  const { shoulder, elbow, wrist, nodes: armNodes } = arm(ids, board.id, 70, 40, true);
  const timeline = emptyTimeline();
  key(timeline, shoulder.id, 'transform.rotation', [
    [0, -10, 'easeInOutQuad'],
    [45, 25, 'easeInOutQuad'],
    [90, -10],
  ]);
  key(timeline, elbow.id, 'transform.rotation', [
    [0, 10, 'easeInOutQuad'],
    [45, 70, 'easeInOutQuad'],
    [90, 10],
  ]);
  key(timeline, wrist.id, 'transform.rotation', [
    [0, 0, 'easeInOutQuad'],
    [45, 30, 'easeInOutQuad'],
    [90, 0],
  ]);
  return { name: '1 · Bones', nodes: [...nodes, ...armNodes], timeline };
}

function bindPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Bind',
    'Bend a shape with bones',
    'Select the long shape on the right and choose Rigging > Bind Selection to Bones (or right-click it: Bind to Bones). It is bound to every bone in the scene, with weights worked out from where the bones are.\n\n' +
      'Now rotate the second bone and the shape bends with it. To adjust how strongly each bone pulls, use the Weight Paint tool (W): [ and ] change the brush size and X switches between adding and removing.'
  );
  const { nodes: armNodes } = arm(ids, board.id, 70, 0, false);
  const limb = rectangle(ids, board.id, 'Limb', 180, 0, 230, 40, VIOLET, 20);
  return { name: '2 · Bind', nodes: [...nodes, limb, ...armNodes] };
}

function ikPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · IK & poses',
    'Pose with IK',
    'Press Space to see the wave on the right, made from bone rotations alone. Then select the last bone of the chain (here, the hand) and choose Rigging > Create IK Chain. A target appears at its tip: drag it, and the bones above follow, like pulling a hand.\n\n' +
      'To animate, press K for auto-keyframe, move the playhead and drag the target again: its position gets a keyframe. While the chain is on, the target decides where the bones point, whatever their keyframes say; clear Enabled under IK Chain in Properties to see the wave again.'
  );
  const { shoulder, elbow, wrist, nodes: armNodes } = arm(ids, board.id, 90, -80, true);
  shoulder.transform.rotation = 60;
  const timeline = emptyTimeline();
  key(timeline, shoulder.id, 'transform.rotation', [
    [0, 60, 'easeInOutQuad'],
    [30, 75, 'easeInOutQuad'],
    [60, 60],
  ]);
  key(timeline, elbow.id, 'transform.rotation', [
    [0, 30, 'easeInOutQuad'],
    [15, -10, 'easeInOutQuad'],
    [30, 30, 'easeInOutQuad'],
    [45, -10, 'easeInOutQuad'],
    [60, 30],
  ]);
  key(timeline, wrist.id, 'transform.rotation', [
    [0, 20, 'easeInOutQuad'],
    [15, -20, 'easeInOutQuad'],
    [30, 20, 'easeInOutQuad'],
    [45, -20, 'easeInOutQuad'],
    [60, 20],
  ]);
  return { name: '3 · IK & poses', nodes: [...nodes, ...armNodes], timeline };
}

// ============================================================================
// Tutorial 6 · Groups, symbols & masks
// ============================================================================

function groupsPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Groups',
    'Group things together',
    'Select two or more layers (Shift+click on the canvas, Ctrl/Cmd+click in Layers) and press Ctrl/Cmd+G to group them; Ctrl/Cmd+Shift+G ungroups. A group moves, scales and animates as one.\n\n' +
      'Double-click a group to work inside it, and press Escape to come back out. In Layers, drop a layer onto a group to put it inside. The flower on the right is a group that spins as one.'
  );
  const flower = group(ids, board.id, 'Flower');
  flower.transform.position = { x: 220, y: 20 };
  const petals = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    const petal = ellipse(
      ids,
      flower.id,
      `Petal ${i + 1}`,
      Math.cos(angle) * 55,
      Math.sin(angle) * 55,
      30,
      i % 2 ? VIOLET : SKY
    );
    petal.radiusX = 42;
    petal.transform.rotation = (i * 180) / 3;
    return petal;
  });
  const center = ellipse(ids, flower.id, 'Center', 0, 0, 30, CORAL);
  const timeline = emptyTimeline();
  key(timeline, flower.id, 'transform.rotation', [
    [0, 0],
    [149, -360],
  ]);
  return { name: '1 · Groups', nodes: [...nodes, flower, ...petals, center], timeline };
}

function symbolsPage(ids: TutorialNodes, badge: ReturnType<typeof badgeSymbol>): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Symbols',
    'Reuse with symbols',
    'Select some artwork and choose Edit > Create Symbol (Ctrl/Cmd+Shift+K): it becomes an instance of a new symbol, listed under Symbols on the left. Click a symbol there to add another instance in the middle of the canvas.\n\n' +
      'Double-click a symbol in that list to edit it, and every instance changes with it. To make one instance independent, select it and click Detach in Properties. The three badges on the right are one symbol.'
  );
  return {
    name: '2 · Symbols',
    nodes: [
      ...nodes,
      symbolInstance(ids, board.id, badge, 120, 90, 1),
      symbolInstance(ids, board.id, badge, 270, 60, 1.4, 15),
      symbolInstance(ids, board.id, badge, 190, -90, 0.8, -20),
    ],
  };
}

function badgeSymbol(prefix: string) {
  const ids = new TutorialNodes(prefix);
  const disc = ellipse(ids, '', 'Disc', 0, 0, 50, TEAL);
  const mark = star(ids, '', 'Star', 0, 0, 34, { r: 255, g: 255, b: 255, a: 1 });
  return symbolDefinition(`${prefix}-symbol`, 'Badge', [
    { ...disc, parent: null },
    { ...mark, parent: null },
  ]);
}

function masksPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · Masks',
    'Show through a mask',
    'Select two or more layers in Layers, right-click and pick Create Clip Mask, Create Alpha Mask or Create Luminance Mask. The topmost one becomes the mask: clip shows the rest only inside its shape, alpha uses its opacity, luminance its brightness.\n\n' +
      'Right-click the mask group in Layers to switch its kind or remove the mask. On the right, a round window clips stripes that slide past.'
  );
  const windowShape = ellipse(ids, '', 'Window', 220, 20, 110, INK);
  const masked = group(ids, board.id, 'Mask', { nodeId: windowShape.id, mode: 'clip' });
  windowShape.parent = masked.id;
  const colors = [SKY, TEAL, VIOLET, CORAL];
  // Wide enough that the window stays covered all the way as they slide 200 right
  const stripes = Array.from({ length: 12 }, (_, i) =>
    rectangle(ids, masked.id, `Stripe ${i + 1}`, -160 + i * 50, 20, 50, 260, colors[i % 4]!)
  );
  const timeline = emptyTimeline();
  for (const stripe of stripes) {
    const x = stripe.transform.position.x;
    key(timeline, stripe.id, 'transform.position.x', [
      [0, x],
      [149, x + 200],
    ]);
  }
  // The mask is the topmost layer in its group
  return { name: '3 · Masks', nodes: [...nodes, masked, ...stripes, windowShape], timeline };
}

// ============================================================================
// Tutorial 7 · Timing
// ============================================================================

function easingPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '1 · Easing',
    'Ease in, ease out',
    'Easing shapes how a move speeds up and slows down. Right-click a keyframe on the timeline and pick Linear, Ease In, Ease Out, Ease In/Out, a Back, Bounce or Elastic ease, or Custom Easing to draw your own curve.\n\n' +
      'The balls on the right travel the same distance in the same time; only their easing differs. Press Space to compare them.'
  );
  const easings: Array<[string, EasingFunction]> = [
    ['Linear', 'linear'],
    ['Ease In', 'easeInCubic'],
    ['Ease Out', 'easeOutCubic'],
    ['Ease In/Out', 'easeInOutCubic'],
    ['Bounce', 'easeOutBounce'],
  ];
  const timeline = emptyTimeline();
  const rows = easings.flatMap(([label, easing], i) => {
    const y = 150 - i * 70;
    const ball = ellipse(ids, board.id, label, 80, y - 30, 14, [SKY, TEAL, VIOLET, CORAL, SKY][i]!);
    key(timeline, ball.id, 'transform.position.x', [
      [0, 80, easing],
      [60, 360, easing],
      [120, 80],
    ]);
    return [caption(ids, board.id, label, 60, y), ball];
  });
  return { name: '1 · Easing', nodes: [...nodes, ...rows], timeline };
}

function graphPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '2 · Graph editor',
    'Shape the curves',
    'Press G to swap the dope sheet for the graph editor, where each animated property is a curve. Drag keyframes to change their time and value. A selected keyframe shows its handles: drag them to reshape the curve on either side.\n\n' +
      'Scroll to zoom in time, Ctrl/Cmd+scroll to zoom the values, double-click to fit the view, and Alt/Option+drag to pan. Select the rocket and press G to see its curves.'
  );
  const rocket = path(
    ids,
    board.id,
    'Rocket',
    220,
    -120,
    [
      [0, 50, [-24, 0], [24, 0]],
      [22, -30],
      [-22, -30],
    ],
    { fill: CORAL }
  );
  const timeline = emptyTimeline();
  // Only easings a cubic bezier draws show handles in the graph editor: the
  // in-out moves are custom curves drawn like Ease In/Out Cubic and Quad
  key(timeline, rocket.id, 'transform.position.y', [
    [0, -120, 'easeInCubic'],
    [70, 140, 'easeOutBack'],
    [110, 140, createCubicBezier(0.65, 0, 0.35, 1)],
    [149, -120],
  ]);
  key(timeline, rocket.id, 'transform.rotation', [
    [0, 0, createCubicBezier(0.45, 0, 0.55, 1)],
    [70, -12, createCubicBezier(0.45, 0, 0.55, 1)],
    [110, 12, createCubicBezier(0.45, 0, 0.55, 1)],
    [149, 0],
  ]);
  return { name: '2 · Graph editor', nodes: [...nodes, rocket], timeline };
}

function onionPage(ids: TutorialNodes): TutorialPage {
  const { board, nodes } = lesson(
    ids,
    '3 · Onion skin',
    'See the frames around this one',
    'Onion skinning shows faint copies of the frames before and after the playhead, so you can judge spacing. Press Shift+O to turn it on or off. The onion button in the timeline’s toolbar opens its settings with a click (how many frames, opacity, falloff) and toggles it with a right-click.\n\n' +
      'Turn it on here, then step with , and . to watch the ball’s arc.'
  );
  const ball = ellipse(ids, board.id, 'Ball', 70, -150, 20, VIOLET);
  const timeline = emptyTimeline();
  key(timeline, ball.id, 'transform.position.x', [
    [0, 70],
    [40, 360],
  ]);
  key(timeline, ball.id, 'transform.position.y', [
    [0, -150, 'easeOutQuad'],
    [20, 150, 'easeInQuad'],
    [40, -150],
  ]);
  return { name: '3 · Onion skin', nodes: [...nodes, ball], timeline };
}

// ============================================================================
// Catalog
// ============================================================================

function build(
  id: string,
  name: string,
  prefix: string,
  pages: (ids: TutorialNodes) => TutorialPage[]
): Tutorial {
  return {
    id,
    name,
    build: (createdAt) => tutorialProject(id, name, pages(new TutorialNodes(prefix)), createdAt),
  };
}

export const MORE_TUTORIALS: Tutorial[] = [
  {
    // 2: the Pen and Direct Selection's new keys, Edit > Path
    // 3: a three-point drop to trace, which a click on its tip closes
    // 4: Ctrl/Cmd and Alt/Option, as on both keyboards
    ...build('tutorial-paths-and-shapes', 'Tutorial 3 · Paths & shapes', 't3', (ids) => [
      penPage(ids),
      pointsPage(ids),
      combinePage(ids),
    ]),
    version: 4,
  },
  {
    // 2: Figma-style text editing keys, Google Fonts asked for on first pick
    // 3: Font Size named as Properties names it
    // 4: Ctrl/Cmd, as on both keyboards
    ...build('tutorial-text', 'Tutorial 4 · Text', 't4', (ids) => [
      textBoxesPage(ids),
      textStylePage(ids),
      outlinesPage(ids),
    ]),
    version: 4,
  },
  {
    // 2: the IK page says what's keyed (the target's position) and that a chain overrides the wave
    ...build('tutorial-rigging', 'Tutorial 5 · Rigging', 't5', (ids) => [
      bonesPage(ids),
      bindPage(ids),
      ikPage(ids),
    ]),
    version: 2,
  },
  {
    id: 'tutorial-groups-symbols-masks',
    name: 'Tutorial 6 · Groups, symbols & masks',
    // 2: Ctrl/Cmd, as on both keyboards
    version: 2,
    build: (createdAt) => {
      const ids = new TutorialNodes('t6');
      const badge = badgeSymbol('t6-badge');
      return tutorialProject(
        'tutorial-groups-symbols-masks',
        'Tutorial 6 · Groups, symbols & masks',
        [groupsPage(ids), symbolsPage(ids, badge), masksPage(ids)],
        createdAt,
        [badge]
      );
    },
  },
  {
    // 2: the rocket's every keyframe shows handles in the graph editor
    // 3: Ctrl/Cmd and Alt/Option, as on both keyboards
    ...build('tutorial-timing', 'Tutorial 7 · Timing', 't7', (ids) => [
      easingPage(ids),
      graphPage(ids),
      onionPage(ids),
    ]),
    version: 3,
  },
];
