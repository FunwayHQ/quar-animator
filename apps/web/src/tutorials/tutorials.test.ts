/**
 * Tests for the tutorial projects: valid, loadable, and laid out on their pages
 */

import { describe, it, expect } from 'vitest';
import type { Node, TextNode } from '@quar/types';
import {
  SceneGraph,
  getTextLocalBounds,
  getTextNodeLines,
  parseQuarFile,
  writeQuarFile,
} from '@quar/core';
import { deserializeProject, validateProjectData } from '../services/projectSerializer';
import type { ProjectData, ProjectDataV2 } from '../services/projectSerializer';
import { TUTORIALS } from './tutorials';
import { PAGE_HEIGHT, PAGE_WIDTH } from './tutorialBuilder';

const built = TUTORIALS.map((tutorial) => ({
  tutorial,
  data: tutorial.build('2026-10-20T00:00:00.000Z'),
}));

describe.each(built)('$tutorial.name', ({ tutorial, data }) => {
  it('is a valid project that loads like a saved one', () => {
    expect(validateProjectData(data)).toBe(true);
    expect(data.name).toBe(tutorial.name);

    const reloaded = parseQuarFile(writeQuarFile(data as unknown as Record<string, unknown>));
    const sg = new SceneGraph();
    let pages: unknown[] = [];
    deserializeProject(reloaded as unknown as ProjectData, sg, (state) => {
      pages = state.pages ?? [];
    });
    expect(pages).toHaveLength(data.pages.length);
    expect(sg.getRootNodes().map((n) => n.type)).toEqual(['artboard']);
  });

  it('has one artboard a page, holding everything else', () => {
    for (const page of data.pages) {
      const nodes = page.sceneGraph.nodes;
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const [board] = nodes;
      expect(board!.type).toBe('artboard');
      expect(page.sceneGraph.rootNodeIds).toEqual([board!.id]);
      for (const node of nodes.slice(1)) {
        // Every parent exists and lists the node as its child, up to the artboard
        let current: Node | undefined = node;
        while (current?.parent) {
          const parent = byId.get(current.parent);
          expect(parent?.children).toContain(current.id);
          current = parent;
        }
        expect(current).toBe(board);
      }
    }
  });

  it('draws every symbol instance from a symbol the project has', () => {
    const symbolIds = new Set((data.symbols ?? []).map((symbol) => symbol.id));
    for (const page of data.pages) {
      for (const node of page.sceneGraph.nodes) {
        if (node.type === 'symbol-instance') expect(symbolIds.has(node.symbolId)).toBe(true);
      }
    }
  });

  it('masks groups with one of their own children', () => {
    for (const page of data.pages) {
      for (const node of page.sceneGraph.nodes) {
        if (node.type === 'group' && node.maskNodeId) {
          expect(node.children.at(-1)).toBe(node.maskNodeId);
        }
      }
    }
  });

  it('writes only characters the bundled Inter (Latin) can draw', () => {
    for (const page of data.pages) {
      for (const node of page.sceneGraph.nodes) {
        if (node.type !== 'text') continue;
        // Basic Latin, Latin-1, and the curly quotes and dashes of General Punctuation
        expect(node.content).toMatch(
          /^[\n\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2026]*$/
        );
      }
    }
  });

  it('gives every node an id of its own', () => {
    const ids = data.pages.flatMap((page) => page.sceneGraph.nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('animates only nodes on the same page, within the timeline', () => {
    for (const page of data.pages) {
      const ids = new Set(page.sceneGraph.nodes.map((node) => node.id));
      for (const track of page.timeline.tracks) {
        expect(ids.has(track.nodeId)).toBe(true);
        for (const keyframe of track.keyframes) {
          expect(keyframe.time).toBeGreaterThanOrEqual(0);
          expect(keyframe.time).toBeLessThan((data as ProjectDataV2).settings.timelineDuration);
        }
      }
      for (const step of page.animationSequence?.steps ?? []) {
        expect(ids.has(step.nodeId)).toBe(true);
      }
    }
  });

  it('keeps its text inside the page, in boxes the text fits', () => {
    const halfW = PAGE_WIDTH / 2;
    const halfH = PAGE_HEIGHT / 2;
    for (const page of data.pages) {
      for (const node of page.sceneGraph.nodes.filter(
        (n): n is Node & TextNode => n.type === 'text'
      )) {
        const box = getTextLocalBounds(node);
        const { x, y } = node.transform.position;
        expect(x + box.x).toBeGreaterThanOrEqual(-halfW);
        expect(x + box.x + box.width).toBeLessThanOrEqual(halfW);
        expect(y + box.y).toBeGreaterThanOrEqual(-halfH);
        expect(y + box.y + box.height).toBeLessThanOrEqual(halfH);
        // Measured generously (no font here: 0.6 em a character), the lines fit
        const lines = getTextNodeLines(node).length;
        const height = lines * node.fontSize * node.lineHeight;
        if (node.textResize === 'fixed') {
          expect(height).toBeLessThanOrEqual(node.boxHeight! + 1);
        } else {
          expect(y + box.y + box.height - height).toBeGreaterThanOrEqual(-halfH);
        }
      }
    }
  });
});

describe('what the lessons say', () => {
  const pageOf = (id: string, name: string) => {
    const page = built
      .find(({ tutorial }) => tutorial.id === id)!
      .data.pages.find((p) => p.name === name);
    expect(page, `${id}: ${name}`).toBeDefined();
    return page!;
  };
  const lessonOf = (page: ProjectDataV2['pages'][number]) =>
    (page.sceneGraph.nodes.find((n) => n.name === 'Lesson') as Node & TextNode).content;

  it('IK: dragging the target keys its position, and while the chain is on it overrides the wave', () => {
    const page = pageOf('tutorial-rigging', '3 · IK & poses');
    const lesson = lessonOf(page);
    // Dragging an IK target with auto-keyframe keys the target only, not the bones' rotations
    expect(lesson).not.toMatch(/rotations and the target get keyframes/);
    expect(lesson).toContain('drag the target again: its position gets a keyframe');
    // The wave is the bones' own rotation keyframes, seen before a chain is made
    expect(lesson.indexOf('Press Space')).toBeLessThan(lesson.indexOf('Create IK Chain'));
    expect(lesson).toContain('clear Enabled under IK Chain in Properties to see the wave again');
    const bones = page.sceneGraph.nodes.filter((n) => n.type === 'bone');
    expect(bones).toHaveLength(3);
    for (const bone of bones) {
      expect(
        page.timeline.tracks.some(
          (track) => track.nodeId === bone.id && track.property === 'transform.rotation'
        )
      ).toBe(true);
    }
    expect(page.sceneGraph.nodes.some((n) => n.type === 'ik-target')).toBe(false);
  });
});

describe('the tutorial catalog', () => {
  it('has stable, distinct ids', () => {
    const ids = TUTORIALS.map((tutorial) => tutorial.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('tutorial-'))).toBe(true);
  });

  it('builds the same nodes every time', () => {
    const [first] = TUTORIALS;
    const ids = (data: ProjectDataV2) =>
      data.pages.flatMap((page) => page.sceneGraph.nodes.map((node) => node.id));
    expect(ids(first!.build('a'))).toEqual(ids(first!.build('b')));
  });

  it('builds the sequence page as Animation Sequence steps compiled into keyframes', () => {
    const sequencePage = built[1]!.data.pages.find((page) => page.animationSequence?.steps.length);
    expect(sequencePage).toBeDefined();
    const steps = sequencePage!.animationSequence!.steps;
    const tagged = sequencePage!.timeline.tracks.flatMap((track) =>
      track.keyframes.filter((keyframe) => keyframe.sequenceStepId !== undefined)
    );
    expect(new Set(tagged.map((keyframe) => keyframe.sequenceStepId))).toEqual(
      new Set(steps.map((step) => step.id))
    );
  });
});
