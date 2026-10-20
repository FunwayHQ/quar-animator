/**
 * Tests for useDirtyTracking: scene edits are unsaved changes, export frames aren't
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { SceneGraph, createGroupNode } from '@quar/core';
import { useEditorStore } from '../stores/editorStore';
import { useDirtyTracking } from './useDirtyTracking';

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

  it('stops listening when unmounted', () => {
    const sg = new SceneGraph();
    const { unmount } = renderHook(() => useDirtyTracking(sg));
    unmount();

    sg.addNode(createGroupNode('g', 'Group'));
    expect(useEditorStore.getState().isDirty).toBe(false);
  });
});
