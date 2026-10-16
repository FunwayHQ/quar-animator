import { describe, it, expect } from 'vitest';
import type { PathPoint, TextNode, Timeline } from '@quar/types';
import { addKeyframe, createTimeline, getOrCreateTrack } from '@quar/animation';
import { nodeToLottieShapes } from './lottieConverter';
import { exportToLottieJson } from './lottieExporter';
import type { TextOutlineGlyph, TextOutlineProvider } from './lottieText';
import type { LottieShapeGroup, LottieShapeItem, LottieShapeTransform } from './lottieTypes';

function square(x: number): PathPoint[] {
  return [
    [x, 0],
    [x + 10, 0],
    [x + 10, 10],
    [x, 10],
  ].map(([px, py]) => ({
    position: { x: px!, y: py! },
    handleIn: null,
    handleOut: null,
    type: 'corner' as const,
  }));
}

// "A B" — the space has no outline, so glyphs are characters 0 and 2
const glyphs: TextOutlineGlyph[] = [
  { charIndex: 0, subpaths: [square(0)] },
  { charIndex: 2, subpaths: [square(30)] },
];
const outlines: TextOutlineProvider = () => glyphs;

function makeText(overrides: Partial<TextNode> = {}): TextNode {
  return {
    id: 'text1',
    name: 'Title',
    type: 'text',
    parent: null,
    children: [],
    transform: {
      position: { x: 100, y: 100 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      skew: { x: 0, y: 0 },
    },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    content: 'A B',
    fontFamily: 'Inter',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fills: [{ type: 'solid', color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
    ...overrides,
  };
}

const groups = (items: LottieShapeItem[] | null) => (items ?? []) as LottieShapeGroup[];
const groupOpacity = (group: LottieShapeGroup) =>
  (group.it.find((item) => item.ty === 'tr') as LottieShapeTransform).o;

describe('text → Lottie', () => {
  const empty: Timeline = createTimeline({ duration: 60, frameRate: 30 });

  it('exports glyph outlines as one group with an even-odd fill', () => {
    const [group] = groups(
      nodeToLottieShapes(makeText(), empty, 1000, undefined, { textOutlines: outlines })
    );
    expect(group!.nm).toBe('Text');
    expect(group!.it.filter((item) => item.ty === 'sh')).toHaveLength(2);
    expect(group!.it.find((item) => item.ty === 'fl')).toMatchObject({ r: 2 });
  });

  it('flips glyph outlines to Lottie’s Y-down space', () => {
    const [group] = groups(
      nodeToLottieShapes(makeText(), empty, 1000, undefined, { textOutlines: outlines })
    );
    const path = group!.it.find((item) => item.ty === 'sh') as { ks: { k: { v: number[][] } } };
    expect(path.ks.k.v[2]).toEqual([10, -10]);
  });

  it('leaves out characters a static reveal hides', () => {
    const [group] = groups(
      nodeToLottieShapes(makeText({ visibleCharacters: 1 }), empty, 1000, undefined, {
        textOutlines: outlines,
      })
    );
    expect(group!.it.filter((item) => item.ty === 'sh')).toHaveLength(1);
  });

  it('turns each glyph on when a Typewriter reveal reaches it', () => {
    const timeline = createTimeline({ duration: 60, frameRate: 30 });
    const track = getOrCreateTrack<number>(timeline, 'text1', 'visibleCharacters');
    addKeyframe(track, 0, 0);
    addKeyframe(track, 30, 3); // one character every 10 frames

    const [first, second] = groups(
      nodeToLottieShapes(makeText(), timeline, 1000, undefined, { textOutlines: outlines })
    );
    expect(groupOpacity(first!)).toEqual({
      a: 1,
      k: [
        { t: 0, s: [0], h: 1 },
        { t: 10, s: [100] },
      ],
    });
    // Character 2 ("B") appears once three characters are visible
    expect(groupOpacity(second!)).toEqual({
      a: 1,
      k: [
        { t: 0, s: [0], h: 1 },
        { t: 30, s: [100] },
      ],
    });
  });

  it('is skipped when no outlines are available (font not loaded)', () => {
    expect(nodeToLottieShapes(makeText(), empty, 1000, undefined, {})).toBeNull();
    expect(
      nodeToLottieShapes(makeText(), empty, 1000, undefined, { textOutlines: () => null })
    ).toBeNull();
  });

  it('exports text layers through exportToLottieJson', () => {
    const animation = exportToLottieJson([makeText()], empty, {
      width: 400,
      height: 300,
      textOutlines: outlines,
    });
    expect(animation.layers).toHaveLength(1);
    expect(animation.layers[0]!.nm).toBe('Title');
  });
});
