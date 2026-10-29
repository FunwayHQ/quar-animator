/**
 * Brush profiles made with Create Profile from Selection are the document's:
 * kept with it (so saved), and gone with it when another project begins.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SceneGraph, createDefaultTransform } from '@quar/core';
import type { PolygonNode } from '@quar/types';
import { useEditorStore } from './editorStore';
import { BUILT_IN_BRUSH_PROFILES } from '../services/brushProfiles';

/** A long thin diamond: thin at the ends, widest in the middle. */
function diamond(): PolygonNode {
  return {
    id: 'diamond',
    name: 'Diamond',
    type: 'polygon',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), scale: { x: 4, y: 1 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides: 4,
    radius: 50,
    fills: [],
    strokes: [],
  };
}

describe('custom brush profiles', () => {
  let sceneGraph: SceneGraph;

  beforeEach(() => {
    useEditorStore.getState().resetProject();
    sceneGraph = new SceneGraph();
    sceneGraph.addNode(diamond());
    useEditorStore.setState({ selectedNodeIds: new Set(['diamond']), isDirty: false });
  });

  it('are made part of the document, which then has something to save', () => {
    const profile = useEditorStore
      .getState()
      .createBrushProfileFromSelection(sceneGraph, 'Diamond Taper');

    expect(profile).not.toBeNull();
    const { brushProfiles, isDirty } = useEditorStore.getState();
    expect(brushProfiles.at(-1)).toEqual(profile);
    expect(isDirty).toBe(true);
  });

  it('go with the project when a new one begins: the built-in ones stay', () => {
    useEditorStore.getState().createBrushProfileFromSelection(sceneGraph, 'Diamond Taper');

    useEditorStore.getState().resetProject();

    expect(useEditorStore.getState().brushProfiles).toEqual(BUILT_IN_BRUSH_PROFILES);
  });
});
