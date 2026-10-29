/**
 * Tests for useDirtyTracking: scene edits are unsaved changes, export frames aren't
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SceneGraph, createGroupNode } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';
import { useDirtyTracking } from './useDirtyTracking';
import { isPosingScene, poseScene } from '../stores/scenePosing';

describe('useDirtyTracking', () => {
  beforeEach(() => {
    useEditorStore.setState({ isDirty: false, isExporting: false });
  });

  it('marks the project dirty when the scene changes', () => {
    const sg = new SceneGraph();
    renderHook(() => useDirtyTracking(sg));

    sg.addNode(createGroupNode('g', 'Group'));
    expect(useEditorStore.getState().isDirty).toBe(true);

    useEditorStore.setState({ isDirty: false });
    sg.updateNode('g', { opacity: 0.5 });
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('leaves it clean while an export poses the scene', () => {
    const sg = new SceneGraph();
    sg.addNode(createGroupNode('g', 'Group'));
    renderHook(() => useDirtyTracking(sg));
    useEditorStore.setState({ isDirty: false, isExporting: true });

    sg.updateNode('g', { opacity: 0.25 });
    sg.updateNode('g', { opacity: 1 });

    expect(useEditorStore.getState().isDirty).toBe(false);
  });

  it('leaves it clean while playback, IK or physics pose the scene', () => {
    const sg = new SceneGraph();
    sg.addNode(createGroupNode('g', 'Group'));
    renderHook(() => useDirtyTracking(sg));
    useEditorStore.setState({ isDirty: false });

    poseScene(() => sg.updateNode('g', { opacity: 0.25 }));
    expect(useEditorStore.getState().isDirty).toBe(false);

    // An edit after posing still counts
    sg.updateNode('g', { opacity: 1 });
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('leaves it clean when another page is opened, until an edit there', () => {
    const sg = new SceneGraph();
    useEditorStore.getState().resetProject();
    sg.addNode(createGroupNode('on-page-1', 'Group'));
    const firstPage = useEditorStore.getState().activePageId;
    useEditorStore.getState().addPage(sg);
    sg.addNode(createGroupNode('on-page-2', 'Group'));
    const secondPage = useEditorStore.getState().activePageId;
    renderHook(() => useDirtyTracking(sg));
    useEditorStore.setState({ isDirty: false });

    useEditorStore.getState().switchPage(firstPage, sg);
    expect(sg.getNode('on-page-1')).toBeDefined();
    expect(useEditorStore.getState().isDirty).toBe(false);
    useEditorStore.getState().switchPage(secondPage, sg);
    expect(useEditorStore.getState().isDirty).toBe(false);

    sg.updateNode('on-page-2', { opacity: 0.5 });
    expect(useEditorStore.getState().isDirty).toBe(true);
    // Unsaved changes stay unsaved on another page
    useEditorStore.getState().switchPage(firstPage, sg);
    expect(useEditorStore.getState().isDirty).toBe(true);
  });

  it('stops listening when unmounted', () => {
    const sg = new SceneGraph();
    const { unmount } = renderHook(() => useDirtyTracking(sg));
    unmount();

    sg.addNode(createGroupNode('g', 'Group'));
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});

describe('poseScene', () => {
  it('counts as posing only while it runs, nested or thrown out of', () => {
    expect(isPosingScene()).toBe(false);
    poseScene(() => {
      poseScene(() => expect(isPosingScene()).toBe(true));
      expect(isPosingScene()).toBe(true);
    });
    expect(() =>
      poseScene(() => {
        throw new Error('solver failed');
      })
    ).toThrow('solver failed');
    expect(isPosingScene()).toBe(false);
  });

  it('returns what the pose returns', () => {
    expect(poseScene(() => 42)).toBe(42);
  });
});
