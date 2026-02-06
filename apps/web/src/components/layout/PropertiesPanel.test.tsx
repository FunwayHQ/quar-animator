import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode } from '@quar/types';
import { PropertiesPanel } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';
import type { ReactNode } from 'react';

// ============================================================================
// Test Helpers
// ============================================================================

function SceneGraphCapture({ onCapture }: { onCapture: (sg: SceneGraph) => void }) {
  const sg = useSceneGraph();
  onCapture(sg);
  return null;
}

function renderWithProvider(ui: ReactNode) {
  return render(<SceneGraphProvider>{ui}</SceneGraphProvider>);
}

function createTestRect(id: string, name: string): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 150, y: 200 }, rotation: 45 },
    visible: true,
    locked: false,
    opacity: 0.8,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fill: { type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1 },
    stroke: {
      color: { r: 255, g: 0, b: 0, a: 1 },
      width: 2,
      opacity: 1,
      cap: 'round',
      join: 'round',
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('PropertiesPanel', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
  });

  it('renders the panel title', () => {
    renderWithProvider(<PropertiesPanel />);
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();
  });

  it('shows empty state when nothing is selected', () => {
    renderWithProvider(<PropertiesPanel />);
    expect(screen.getByText('Select an object to view properties')).toBeInTheDocument();
  });

  it('shows transform section when node is selected', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByText('Transform')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Rotation')).toBeInTheDocument();
  });

  it('displays actual node position values', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Position is 150, 200
    expect(screen.getByDisplayValue('150')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200')).toBeInTheDocument();
  });

  it('displays actual node size', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Width 100, Height 50
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50')).toBeInTheDocument();
  });

  it('displays rotation with degree symbol', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByDisplayValue('45\u00B0')).toBeInTheDocument();
  });

  it('displays appearance section with fill and stroke colors', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Fill')).toBeInTheDocument();
    expect(screen.getByText('Stroke')).toBeInTheDocument();
    expect(screen.getByText('Opacity')).toBeInTheDocument();

    // Fill color: rgb(100, 149, 237) = #6495ED
    expect(screen.getByDisplayValue('#6495ED')).toBeInTheDocument();
    // Stroke color: rgb(255, 0, 0) = #FF0000
    expect(screen.getByDisplayValue('#FF0000')).toBeInTheDocument();
  });

  it('displays opacity from node', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Opacity is 0.8 = 80%
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('80');
    expect(screen.getByDisplayValue('80%')).toBeInTheDocument();
  });

  it('hides properties when selection is cleared', () => {
    let sg: SceneGraph | null = null;

    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <PropertiesPanel />
      </SceneGraphProvider>
    );

    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByText('Transform')).toBeInTheDocument();

    act(() => {
      useEditorStore.getState().clearSelection();
    });

    expect(screen.getByText('Select an object to view properties')).toBeInTheDocument();
    expect(screen.queryByText('Transform')).not.toBeInTheDocument();
  });
});
