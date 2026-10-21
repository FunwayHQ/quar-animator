/**
 * Showcase animation for the marketing video (not part of the app).
 * Loaded into the dev server with a dynamic import, it builds a 1920×1080
 * project and saves it to the browser's projects as "showcase".
 */

import type { Color, Fill, Gradient, Node, PathPoint, Timeline } from '@quar/types';
import { writeQuarFile } from '@quar/core';
import { addKeyframe, getOrCreateTrack } from '@quar/animation';
import {
  TutorialNodes,
  artboard,
  ellipse,
  group,
  key,
  path,
  rectangle,
  star,
  text,
  tutorialProject,
  emptyTimeline,
} from '../../apps/web/src/tutorials/tutorialBuilder';
import { saveProject } from '../../apps/web/src/services/projectStorage';

const W = 1920;
const H = 1080;
const FRAMES = 240; // 8 s at 30 fps

const c = (hex: string, a = 1): Color => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
  a,
});

function gradientFill(gradient: Gradient, opacity = 1): Fill[] {
  return [{ type: 'gradient', gradient, opacity, visible: true }];
}

function linear(
  stops: [number, string, number?][],
  start = { x: 0, y: 1 },
  end = { x: 1, y: 0 }
): Gradient {
  return {
    type: 'linear',
    stops: stops.map(([offset, hex, a]) => ({ offset, color: c(hex, a ?? 1) })),
    start,
    end,
  };
}

function radial(stops: [number, string, number?][], focal?: { x: number; y: number }): Gradient {
  return {
    type: 'radial',
    stops: stops.map(([offset, hex, a]) => ({ offset, color: c(hex, a ?? 1) })),
    center: { x: 0.5, y: 0.5 },
    radius: 0.5,
    ...(focal ? { focal } : {}),
  };
}

/** A closed blob of n points around the origin, every other one pulled in by `pinch`. */
function blobPoints(n: number, radius: number, pinch: number, smooth: boolean): PathPoint[] {
  const points: PathPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * pinch;
    const tangent = { x: -Math.sin(angle), y: Math.cos(angle) };
    const handle = smooth ? (Math.PI * 2 * r) / n / 3 : 0;
    points.push({
      position: { x: Math.cos(angle) * r, y: Math.sin(angle) * r },
      handleIn: smooth ? { x: -tangent.x * handle, y: -tangent.y * handle } : null,
      handleOut: smooth ? { x: tangent.x * handle, y: tangent.y * handle } : null,
      type: smooth ? 'smooth' : 'corner',
    });
  }
  return points;
}

export function buildShowcase() {
  const ids = new TutorialNodes('showcase');
  const timeline: Timeline = { ...emptyTimeline(), duration: FRAMES, frameRate: 30 };
  const nodes: Node[] = [];

  // Artboard and background
  const board = { ...artboard(ids, 'Showcase', c('#0b0a1d')), width: W, height: H };
  nodes.push(board);
  const bg = rectangle(ids, board.id, 'Backdrop', 0, 0, W, H, c('#000000'));
  bg.fills = gradientFill(
    linear([
      [0, '#1b0b3d'],
      [0.55, '#0b0a1d'],
      [1, '#04203a'],
    ])
  );
  nodes.push(bg);

  // Glowing orbs, highlights off-center (radial focal points), drifting
  const orbs: Array<[string, number, number, number, string, number]> = [
    ['Violet orb', -640, 260, 330, '#a855f7', 0.55],
    ['Teal orb', 700, -300, 300, '#14b8a6', 0.45],
    ['Coral orb', 420, 380, 220, '#f97316', 0.35],
  ];
  orbs.forEach(([name, x, y, r, hex, opacity], i) => {
    const orb = ellipse(ids, board.id, name, x, y, r, c(hex));
    orb.fills = gradientFill(
      radial(
        [
          [0, '#ffffff', 0.9],
          [0.25, hex, 0.9],
          [1, hex, 0],
        ],
        { x: 0.35, y: 0.65 }
      ),
      opacity
    );
    nodes.push(orb);
    const dx = i % 2 === 0 ? 90 : -110;
    key(timeline, orb.id, 'transform.position.x', [
      [0, x, 'easeInOutQuad'],
      [120, x + dx, 'easeInOutQuad'],
      [FRAMES, x],
    ]);
    key(timeline, orb.id, 'transform.position.y', [
      [0, y, 'easeInOutQuad'],
      [120, y - dx * 0.6, 'easeInOutQuad'],
      [FRAMES, y],
    ]);
    key(timeline, orb.id, 'opacity', [
      [0, 0, 'easeOutCubic'],
      [36 + i * 8, 1],
    ]);
  });

  // A swoosh drawing itself on
  const swoosh = path(
    ids,
    board.id,
    'Swoosh',
    0,
    0,
    [
      [-860, -120, undefined, [260, 300]],
      [-120, 60, [-260, -40], [300, 50]],
      [560, -40, [-240, 90], [200, -60]],
      [880, 180, [-160, -120], undefined],
    ],
    { stroke: c('#ffffff'), strokeWidth: 10 },
    false
  );
  swoosh.strokes = [
    {
      color: c('#ffffff'),
      width: 10,
      opacity: 0.9,
      cap: 'round',
      join: 'round',
      visible: true,
      gradient: linear(
        [
          [0, '#14b8a6'],
          [0.5, '#a855f7'],
          [1, '#f472b6'],
        ],
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 }
      ),
    },
  ];
  swoosh.strokeProgress = 0;
  nodes.push(swoosh);
  key(timeline, swoosh.id, 'strokeProgress', [
    [12, 0, 'easeInOutCubic'],
    [78, 1],
  ]);

  // Morphing blob behind the logo
  const blob = path(ids, board.id, 'Blob', 0, 110, [], {}, true);
  blob.points = blobPoints(10, 230, 0.86, true);
  blob.fills = gradientFill(
    radial(
      [
        [0, '#f472b6', 0.55],
        [1, '#7c3aed', 0],
      ],
      { x: 0.4, y: 0.6 }
    )
  );
  nodes.push(blob);
  const morph = getOrCreateTrack<PathPoint[]>(timeline, blob.id, 'points');
  addKeyframe(morph, 0, blobPoints(10, 230, 0.86, true), 'easeInOutCubic');
  addKeyframe(morph, 70, blobPoints(10, 250, 0.62, true), 'easeInOutCubic');
  addKeyframe(morph, 140, blobPoints(10, 235, 0.9, true), 'easeInOutCubic');
  addKeyframe(morph, FRAMES, blobPoints(10, 245, 0.7, true));
  key(timeline, blob.id, 'transform.rotation', [
    [0, 0],
    [FRAMES, 60],
  ]);
  key(timeline, blob.id, 'transform.scale.x', [
    [0, 0, 'easeOutBack'],
    [40, 1],
  ]);
  key(timeline, blob.id, 'transform.scale.y', [
    [0, 0, 'easeOutBack'],
    [40, 1],
  ]);

  // Ring of stars popping in one after another, turning slowly
  const ring = group(ids, board.id, 'Star ring');
  ring.transform = { ...ring.transform, position: { x: 0, y: 110 } };
  nodes.push(ring);
  const colors = ['#fde68a', '#f472b6', '#67e8f9', '#c4b5fd'];
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const s = star(
      ids,
      ring.id,
      `Star ${i + 1}`,
      Math.cos(angle) * 300,
      Math.sin(angle) * 300,
      22,
      c(colors[i % 4]!)
    );
    nodes.push(s);
    const at = 44 + i * 4;
    key(timeline, s.id, 'transform.scale.x', [
      [0, 0],
      [at, 0, 'easeOutBack'],
      [at + 16, 1],
    ]);
    key(timeline, s.id, 'transform.scale.y', [
      [0, 0],
      [at, 0, 'easeOutBack'],
      [at + 16, 1],
    ]);
    key(timeline, s.id, 'transform.rotation', [
      [at, -90, 'easeOutCubic'],
      [at + 30, 0],
    ]);
  }
  key(timeline, ring.id, 'transform.rotation', [
    [0, -20],
    [FRAMES, 40],
  ]);

  // Logo tile spinning in, a white star on it
  const tile = rectangle(ids, board.id, 'Logo tile', 0, 110, 230, 230, c('#a855f7'), 58);
  tile.fills = gradientFill(
    linear([
      [0, '#7c3aed'],
      [1, '#ec4899'],
    ])
  );
  nodes.push(tile);
  key(timeline, tile.id, 'transform.rotation', [
    [18, -200, 'easeOutBack'],
    [62, 0],
  ]);
  key(timeline, tile.id, 'transform.scale.x', [
    [0, 0],
    [18, 0, 'easeOutBack'],
    [62, 1],
    [200, 1, 'easeInOutQuad'],
    [212, 1.08, 'easeInOutQuad'],
    [224, 1],
  ]);
  key(timeline, tile.id, 'transform.scale.y', [
    [0, 0],
    [18, 0, 'easeOutBack'],
    [62, 1],
    [200, 1, 'easeInOutQuad'],
    [212, 1.08, 'easeInOutQuad'],
    [224, 1],
  ]);
  const mark = star(ids, board.id, 'Mark', 0, 110, 72, c('#ffffff'));
  nodes.push(mark);
  key(timeline, mark.id, 'transform.rotation', [
    [40, -144, 'easeOutElastic'],
    [100, 0],
  ]);
  key(timeline, mark.id, 'transform.scale.x', [
    [0, 0],
    [40, 0, 'easeOutElastic'],
    [100, 1],
  ]);
  key(timeline, mark.id, 'transform.scale.y', [
    [0, 0],
    [40, 0, 'easeOutElastic'],
    [100, 1],
  ]);

  // Title typed on, tagline sliding up
  const title = text(ids, board.id, 'QUAR Animator', -700, -240, 1400, 170, {
    size: 132,
    weight: 700,
    color: c('#ffffff'),
    align: 'center',
    lineHeight: 1.1,
    name: 'Title',
  });
  title.visibleCharacters = 0;
  nodes.push(title);
  key(timeline, title.id, 'visibleCharacters', [
    [96, 0],
    [140, 13],
  ]);

  const tagline = text(
    ids,
    board.id,
    'Free 2D animation, right in your browser',
    -700,
    -405,
    1400,
    70,
    {
      size: 46,
      color: c('#c4b5fd'),
      align: 'center',
      name: 'Tagline',
    }
  );
  nodes.push(tagline);
  const taglineY = tagline.transform.position.y;
  key(timeline, tagline.id, 'opacity', [
    [0, 0],
    [142, 0, 'easeOutCubic'],
    [172, 1],
  ]);
  key(timeline, tagline.id, 'transform.position.y', [
    [142, taglineY - 40, 'easeOutCubic'],
    [172, taglineY],
  ]);

  const project = tutorialProject(
    'showcase',
    'QUAR Showcase',
    [{ name: 'Showcase', nodes, timeline }],
    new Date().toISOString()
  );
  project.settings.timelineDuration = FRAMES;
  return project;
}

/** Save the showcase among the browser's projects (id "showcase"). */
export async function install(): Promise<string> {
  const project = buildShowcase();
  await saveProject(
    'showcase',
    'QUAR Showcase',
    writeQuarFile(project as unknown as Record<string, unknown>)
  );
  return 'showcase';
}
