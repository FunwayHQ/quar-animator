import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode, EllipseNode, GroupNode } from '@quar/types';
import { LayerPanel } from './LayerPanel';
import { useEditorStore } from '../../stores/editorStore';
import type { ReactNode } from 'react';

// ============================================================================
// Test Helpers
// ============================================================================

function createTestRect(id: string, name: string): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [
      {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'round',
        join: 'round',
        visible: true,
      },
    ],
  };
}

function createTestEllipse(id: string, name: string): EllipseNode {
  return {
    id,
    name,
    type: 'ellipse',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: 50,
    radiusY: 30,
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [
      {
        color: { r: 0, g: 0, b: 0, a: 1 },
        width: 2,
        opacity: 1,
        cap: 'round',
        join: 'round',
        visible: true,
      },
    ],
  };
}

function createTestGroup(id: string, name: string): GroupNode {
  return {
    id,
    name,
    type: 'group',
    parent: null,
    children: [],
    transform: createDefaultTransform(),
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
  };
}

// Helper component to capture SceneGraph from context for test manipulation
function SceneGraphCapture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  const sg = useSceneGraph();
  onCapture(sg);
  return null;
}

function renderWithProvider(ui: ReactNode) {
  return render(<SceneGraphProvider>{ui}</SceneGraphProvider>);
}

// ============================================================================
// Tests
// ============================================================================

describe('LayerPanel', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
  });

  it('renders the panel title', () => {
    renderWithProvider(<LayerPanel />);
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument();
  });

  it('shows empty state when no layers exist', () => {
    renderWithProvider(<LayerPanel />);
    expect(screen.getByTestId('layer-empty')).toBeInTheDocument();
    expect(screen.getByText('No layers yet')).toBeInTheDocument();
  });

  it('renders layers from SceneGraph', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    expect(sg).not.toBeNull();

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      sg!.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
    });

    expect(screen.getByText('Rectangle 1')).toBeInTheDocument();
    expect(screen.getByText('Ellipse 1')).toBeInTheDocument();
  });

  it('updates when nodes are added or removed', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    expect(screen.getByTestId('layer-empty')).toBeInTheDocument();

    act(() => {
      sg!.addNode(createTestRect('rect1', 'My Rectangle'));
    });

    expect(screen.getByText('My Rectangle')).toBeInTheDocument();
    expect(screen.queryByTestId('layer-empty')).not.toBeInTheDocument();

    act(() => {
      sg!.removeNode('rect1');
    });

    expect(screen.queryByText('My Rectangle')).not.toBeInTheDocument();
    expect(screen.getByTestId('layer-empty')).toBeInTheDocument();
  });

  it('selects a layer on click', async () => {
    const user = userEvent.setup();
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'My Rectangle'));
    });

    const layerRow = screen.getByTestId('layer-row-rect1');
    await user.click(layerRow);

    expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
  });

  it('has visibility and lock toggle buttons', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
    });

    expect(screen.getAllByTitle('Toggle visibility').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByTitle('Toggle lock').length).toBeGreaterThanOrEqual(1);
  });

  it('toggles visibility via sceneGraph', async () => {
    const user = userEvent.setup();
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
    });

    expect(sg!.getNode('rect1')!.visible).toBe(true);

    const visibilityButton = screen.getByTitle('Toggle visibility');
    await user.click(visibilityButton);

    expect(sg!.getNode('rect1')!.visible).toBe(false);
  });

  it('toggles lock via sceneGraph', async () => {
    const user = userEvent.setup();
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <LayerPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
    });

    expect(sg!.getNode('rect1')!.locked).toBe(false);

    const lockButton = screen.getByTitle('Toggle lock');
    await user.click(lockButton);

    expect(sg!.getNode('rect1')!.locked).toBe(true);
  });

  // ========================================================================
  // Multi-Selection Tests
  // ========================================================================

  describe('multi-selection', () => {
    it('Ctrl+click toggles selection', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
        sg!.addNode(createTestRect('rect3', 'Rect 3'));
      });

      // Click rect1
      await user.click(screen.getByTestId('layer-row-rect1'));
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(1);

      // Ctrl+click rect2 to add
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');

      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
      expect(useEditorStore.getState().selectedNodeIds.has('rect2')).toBe(true);
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);

      // Ctrl+click rect1 to toggle off
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{/Control}');

      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(false);
      expect(useEditorStore.getState().selectedNodeIds.has('rect2')).toBe(true);
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(1);
    });

    it('Shift+click selects a range', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
        sg!.addNode(createTestRect('rect3', 'Rect 3'));
        sg!.addNode(createTestRect('rect4', 'Rect 4'));
      });

      // Click rect1 to set anchor
      await user.click(screen.getByTestId('layer-row-rect1'));
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(1);

      // Shift+click rect3 to select range 1-3
      await user.keyboard('{Shift>}');
      await user.click(screen.getByTestId('layer-row-rect3'));
      await user.keyboard('{/Shift}');

      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.has('rect1')).toBe(true);
      expect(sel.has('rect2')).toBe(true);
      expect(sel.has('rect3')).toBe(true);
      expect(sel.has('rect4')).toBe(false);
    });

    it('plain click replaces multi-selection with single', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      // Select both via Ctrl+click
      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);

      // Plain click on rect1 should replace selection
      await user.click(screen.getByTestId('layer-row-rect1'));
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(1);
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
    });
  });

  // ========================================================================
  // Selection Range Store Tests
  // ========================================================================

  describe('selectRange store action', () => {
    it('selects range between anchor and target', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('a', 'A'));
        sg!.addNode(createTestRect('b', 'B'));
        sg!.addNode(createTestRect('c', 'C'));
        sg!.addNode(createTestRect('d', 'D'));
      });

      // Set anchor by selecting 'b'
      act(() => useEditorStore.getState().setSelection(['b']));
      expect(useEditorStore.getState().lastSelectedNodeId).toBe('b');

      // selectRange to 'd'
      act(() => useEditorStore.getState().selectRange('d', sg!));
      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.has('b')).toBe(true);
      expect(sel.has('c')).toBe(true);
      expect(sel.has('d')).toBe(true);
      expect(sel.has('a')).toBe(false);
    });

    it('selects range in reverse direction', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('a', 'A'));
        sg!.addNode(createTestRect('b', 'B'));
        sg!.addNode(createTestRect('c', 'C'));
      });

      // Set anchor to 'c'
      act(() => useEditorStore.getState().setSelection(['c']));

      // selectRange to 'a' (reverse)
      act(() => useEditorStore.getState().selectRange('a', sg!));
      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.has('a')).toBe(true);
      expect(sel.has('b')).toBe(true);
      expect(sel.has('c')).toBe(true);
    });

    it('selects single node if no anchor exists', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('a', 'A'));
        sg!.addNode(createTestRect('b', 'B'));
      });

      // No anchor (freshly cleared)
      act(() => useEditorStore.getState().clearSelection());

      act(() => useEditorStore.getState().selectRange('b', sg!));
      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.size).toBe(1);
      expect(sel.has('b')).toBe(true);
    });
  });

  // ========================================================================
  // lastSelectedNodeId tracking
  // ========================================================================

  describe('lastSelectedNodeId tracking', () => {
    it('setSelection sets lastSelectedNodeId to last item', () => {
      act(() => useEditorStore.getState().setSelection(['a', 'b', 'c']));
      expect(useEditorStore.getState().lastSelectedNodeId).toBe('c');
    });

    it('addToSelection sets lastSelectedNodeId', () => {
      act(() => useEditorStore.getState().setSelection(['a']));
      act(() => useEditorStore.getState().addToSelection('b'));
      expect(useEditorStore.getState().lastSelectedNodeId).toBe('b');
    });

    it('toggleSelection sets lastSelectedNodeId when adding', () => {
      act(() => useEditorStore.getState().clearSelection());
      act(() => useEditorStore.getState().toggleSelection('x'));
      expect(useEditorStore.getState().lastSelectedNodeId).toBe('x');
    });

    it('clearSelection clears lastSelectedNodeId', () => {
      act(() => useEditorStore.getState().setSelection(['a']));
      act(() => useEditorStore.getState().clearSelection());
      expect(useEditorStore.getState().lastSelectedNodeId).toBe(null);
    });

    it('setSelection with empty array clears lastSelectedNodeId', () => {
      act(() => useEditorStore.getState().setSelection(['a']));
      act(() => useEditorStore.getState().setSelection([]));
      expect(useEditorStore.getState().lastSelectedNodeId).toBe(null);
    });
  });

  // ========================================================================
  // Multi-Select Context Menu Tests
  // ========================================================================

  describe('multi-select context menu', () => {
    it('right-click on unselected node replaces selection', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      // Select rect1
      await user.click(screen.getByTestId('layer-row-rect1'));
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);

      // Right-click rect2 (not selected) → should replace selection
      fireEvent.contextMenu(screen.getByTestId('layer-row-rect2'));
      expect(useEditorStore.getState().selectedNodeIds.has('rect2')).toBe(true);
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(false);
    });

    it('right-click on selected node keeps multi-selection', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      // Select both via Ctrl+click
      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);

      // Right-click rect1 (already selected) → should keep multi-selection
      fireEvent.contextMenu(screen.getByTestId('layer-row-rect1'));
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);
    });

    it('shows batch labels in multi-select context menu', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
        sg!.addNode(createTestRect('rect3', 'Rect 3'));
      });

      // Select rect1 and rect2
      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');

      // Right-click to open context menu
      fireEvent.contextMenu(screen.getByTestId('layer-row-rect1'));

      // Should show batch labels
      expect(screen.getByText('Duplicate 2 Layers')).toBeInTheDocument();
      expect(screen.getByText('Delete 2 Layers')).toBeInTheDocument();
      expect(screen.getByText('Hide 2 Layers')).toBeInTheDocument();
      expect(screen.getByText('Lock 2 Layers')).toBeInTheDocument();
    });

    it('rename is disabled in multi-select context menu', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');

      fireEvent.contextMenu(screen.getByTestId('layer-row-rect1'));

      const renameItem = screen.getByTestId('context-menu-item-rename');
      expect(renameItem).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows Show label when some layers are hidden', async () => {
      const user = userEvent.setup();
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      // Hide rect1
      act(() => {
        sg!.updateNode('rect1', { visible: false });
      });

      // Select both
      await user.click(screen.getByTestId('layer-row-rect1'));
      await user.keyboard('{Control>}');
      await user.click(screen.getByTestId('layer-row-rect2'));
      await user.keyboard('{/Control}');

      fireEvent.contextMenu(screen.getByTestId('layer-row-rect1'));

      // Since not all are visible, should show "Show"
      expect(screen.getByText('Show 2 Layers')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Group / Ungroup Tests
  // ========================================================================

  describe('groupSelection', () => {
    it('creates a group containing selected nodes', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
        sg!.addNode(createTestRect('rect3', 'Rect 3'));
      });

      act(() => useEditorStore.getState().setSelection(['rect1', 'rect2']));
      act(() => useEditorStore.getState().groupSelection(sg!));

      // Selection should be the new group
      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.size).toBe(1);
      const groupId = [...sel][0];
      const group = sg!.getNode(groupId);
      expect(group).toBeDefined();
      expect(group!.type).toBe('group');
      expect(group!.children).toContain('rect1');
      expect(group!.children).toContain('rect2');
      // rect3 should remain a root node
      expect(sg!.getNode('rect3')!.parent).toBeNull();
    });

    it('preserves scene-graph order of children', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('a', 'A'));
        sg!.addNode(createTestRect('b', 'B'));
        sg!.addNode(createTestRect('c', 'C'));
      });

      // Select in reverse order; grouping should still order as a, b, c
      act(() => useEditorStore.getState().setSelection(['c', 'a', 'b']));
      act(() => useEditorStore.getState().groupSelection(sg!));

      const groupId = [...useEditorStore.getState().selectedNodeIds][0];
      const group = sg!.getNode(groupId);
      expect(group!.children).toEqual(['a', 'b', 'c']);
    });

    it('does nothing with fewer than 2 selected', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
      });

      act(() => useEditorStore.getState().setSelection(['rect1']));
      act(() => useEditorStore.getState().groupSelection(sg!));

      // Selection should remain unchanged
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
      // No group created
      const roots = sg!.getRootNodes();
      expect(roots.length).toBe(1);
      expect(roots[0].type).toBe('rectangle');
    });

    it('selects the new group after grouping', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      act(() => useEditorStore.getState().setSelection(['rect1', 'rect2']));
      act(() => useEditorStore.getState().groupSelection(sg!));

      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.size).toBe(1);
      const groupId = [...sel][0];
      expect(sg!.getNode(groupId)!.type).toBe('group');
    });
  });

  describe('ungroupSelection', () => {
    it('dissolves group and moves children to parent', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      const group = createTestGroup('group1', 'Group');

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(group);
        sg!.addNode(createTestRect('child1', 'Child 1'), 'group1');
        sg!.addNode(createTestRect('child2', 'Child 2'), 'group1');
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      act(() => useEditorStore.getState().setSelection(['group1']));
      act(() => useEditorStore.getState().ungroupSelection(sg!));

      // Group should be removed
      expect(sg!.getNode('group1')).toBeUndefined();
      // Children should be root nodes
      expect(sg!.getNode('child1')!.parent).toBeNull();
      expect(sg!.getNode('child2')!.parent).toBeNull();
      // Other root nodes should still exist
      expect(sg!.getNode('rect1')).toBeDefined();
      expect(sg!.getNode('rect2')).toBeDefined();
    });

    it('selects the former children after ungrouping', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      const group = createTestGroup('group1', 'Group');

      act(() => {
        sg!.addNode(group);
        sg!.addNode(createTestRect('child1', 'Child 1'), 'group1');
        sg!.addNode(createTestRect('child2', 'Child 2'), 'group1');
      });

      act(() => useEditorStore.getState().setSelection(['group1']));
      act(() => useEditorStore.getState().ungroupSelection(sg!));

      const sel = useEditorStore.getState().selectedNodeIds;
      expect(sel.has('child1')).toBe(true);
      expect(sel.has('child2')).toBe(true);
      expect(sel.has('group1')).toBe(false);
    });

    it('does nothing on non-group nodes', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
      });

      act(() => useEditorStore.getState().setSelection(['rect1']));
      act(() => useEditorStore.getState().ungroupSelection(sg!));

      // rect1 should still exist, selection unchanged
      expect(sg!.getNode('rect1')).toBeDefined();
      expect(useEditorStore.getState().selectedNodeIds.has('rect1')).toBe(true);
    });
  });

  describe('group/ungroup context menu', () => {
    it('shows Group and Ungroup items in context menu', async () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
      });

      // Single selection context menu
      fireEvent.contextMenu(screen.getByTestId('layer-row-rect1'));

      expect(screen.getByText('Group')).toBeInTheDocument();
      expect(screen.getByText('Ungroup')).toBeInTheDocument();
    });
  });

  // ========================================================================
  // Drag-and-Drop Tests
  // ========================================================================

  describe('drag-and-drop', () => {
    it('does not initiate drag below threshold', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      act(() => {
        sg!.addNode(createTestRect('rect1', 'Rect 1'));
        sg!.addNode(createTestRect('rect2', 'Rect 2'));
      });

      const row = screen.getByTestId('layer-row-rect1');

      // Pointer down + tiny move (below threshold)
      fireEvent.pointerDown(row, { clientX: 100, clientY: 50, button: 0 });
      // Move only 2px (below 5px threshold)
      const content = row.closest('[class*="content"]')!;
      fireEvent.pointerMove(content, { clientX: 101, clientY: 51 });

      // Row should NOT have dragging class
      expect(row.className).not.toContain('dragging');
    });

    it('getTopLevelDragIds deduplicates children', () => {
      let sg: SceneGraph | null = null;

      render(
        <SceneGraphProvider>
          <SceneGraphCapture onCapture={(s) => (sg = s)} />
          <LayerPanel />
        </SceneGraphProvider>
      );

      const group = createTestGroup('group1', 'Group');
      const child = createTestRect('child1', 'Child');

      act(() => {
        sg!.addNode(group);
        sg!.addNode(child, 'group1');
      });

      // Verify parent-child relationship
      const groupNode = sg!.getNode('group1')!;
      expect(groupNode.children).toContain('child1');

      // Test the store-level selection (both parent and child selected)
      act(() => {
        useEditorStore.getState().setSelection(['group1', 'child1']);
      });
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);
    });
  });
});
