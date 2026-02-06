import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode, EllipseNode } from '@quar/types';
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
    fill: { type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1 },
    stroke: {
      color: { r: 0, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round',
      join: 'round',
    },
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
    fill: { type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1 },
    stroke: {
      color: { r: 0, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round',
      join: 'round',
    },
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
});
