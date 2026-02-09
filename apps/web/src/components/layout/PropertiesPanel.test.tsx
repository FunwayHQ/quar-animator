import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import { createTimeline } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type { RectangleNode, EllipseNode, PolygonNode } from '@quar/types';
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
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [
      {
        color: { r: 255, g: 0, b: 0, a: 1 },
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
    transform: { ...createDefaultTransform(), position: { x: 100, y: 100 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    radiusX: 60,
    radiusY: 40,
    fills: [{ type: 'solid', color: { r: 200, g: 100, b: 50, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function createTestPolygon(id: string, name: string): PolygonNode {
  return {
    id,
    name,
    type: 'polygon',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 100, y: 100 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    sides: 5,
    radius: 50,
    fills: [{ type: 'solid', color: { r: 50, g: 200, b: 100, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
  };
}

function renderWithSceneGraph() {
  let sg: SceneGraph | null = null;
  render(
    <SceneGraphProvider>
      <SceneGraphCapture onCapture={(s) => (sg = s)} />
      <PropertiesPanel />
    </SceneGraphProvider>
  );
  return sg!;
}

// ============================================================================
// Tests
// ============================================================================

describe('PropertiesPanel', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
    // Reset aspect ratio lock between tests
    if (useEditorStore.getState().aspectRatioLocked) {
      useEditorStore.getState().toggleAspectRatioLock();
    }
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
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByText('Transform')).toBeInTheDocument();
    expect(screen.getByText('Position')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Rotation')).toBeInTheDocument();
  });

  it('displays actual node position values', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Position is 150, 200 (displayed with 1 decimal)
    expect(screen.getByDisplayValue('150.0')).toBeInTheDocument();
    expect(screen.getByDisplayValue('200.0')).toBeInTheDocument();
  });

  it('displays actual node size', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Width 100, Height 50 (displayed with 1 decimal)
    expect(screen.getByDisplayValue('100.0')).toBeInTheDocument();
    expect(screen.getByDisplayValue('50.0')).toBeInTheDocument();
  });

  it('displays rotation with degree symbol', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByDisplayValue('45.0\u00B0')).toBeInTheDocument();
  });

  it('displays appearance section with fill and stroke colors', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
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
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Opacity is 0.8 = 80%
    const slider = screen.getByRole('slider');
    expect(slider).toHaveValue('80');
    expect(screen.getByDisplayValue('80%')).toBeInTheDocument();
  });

  it('hides properties when selection is cleared', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    expect(screen.getByText('Transform')).toBeInTheDocument();

    act(() => {
      useEditorStore.getState().clearSelection();
    });

    expect(screen.getByText('Select an object to view properties')).toBeInTheDocument();
    expect(screen.queryByText('Transform')).not.toBeInTheDocument();
  });

  // ============================================================================
  // Sprint 8: Editable Size W/H
  // ============================================================================

  describe('editable size', () => {
    it('should update rectangle width when W input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const widthInput = screen.getByDisplayValue('100.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '200' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.width).toBe(200);
    });

    it('should update rectangle height when H input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const heightInput = screen.getByDisplayValue('50.0');
      act(() => {
        fireEvent.change(heightInput, { target: { value: '75' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.height).toBe(75);
    });

    it('should update ellipse radiusX when W input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
        useEditorStore.getState().setSelection(['ellipse1']);
      });

      // Ellipse W = radiusX * 2 = 120
      const widthInput = screen.getByDisplayValue('120.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '160' } });
      });

      const updatedNode = sg.getNode('ellipse1') as EllipseNode;
      expect(updatedNode.radiusX).toBe(80); // 160 / 2
    });

    it('should update ellipse radiusY when H input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
        useEditorStore.getState().setSelection(['ellipse1']);
      });

      // Ellipse H = radiusY * 2 = 80
      const heightInput = screen.getByDisplayValue('80.0');
      act(() => {
        fireEvent.change(heightInput, { target: { value: '100' } });
      });

      const updatedNode = sg.getNode('ellipse1') as EllipseNode;
      expect(updatedNode.radiusY).toBe(50); // 100 / 2
    });

    it('should not accept invalid size values', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const widthInput = screen.getByDisplayValue('100.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: 'abc' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.width).toBe(100); // Unchanged
    });

    it('should not accept zero or negative size', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const widthInput = screen.getByDisplayValue('100.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '0' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.width).toBe(100); // Unchanged
    });
  });

  // ============================================================================
  // Sprint 8: Fill/Stroke Color Editing
  // ============================================================================

  describe('color editing', () => {
    it('should update fill color when hex text is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const fillInput = screen.getByDisplayValue('#6495ED');
      act(() => {
        fireEvent.change(fillInput, { target: { value: '#FF0000' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.fills[0]?.color.r).toBe(255);
      expect(updatedNode.fills[0]?.color.g).toBe(0);
      expect(updatedNode.fills[0]?.color.b).toBe(0);
    });

    it('should update stroke color when hex text is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const strokeInput = screen.getByDisplayValue('#FF0000');
      act(() => {
        fireEvent.change(strokeInput, { target: { value: '#00FF00' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.strokes[0]?.color.r).toBe(0);
      expect(updatedNode.strokes[0]?.color.g).toBe(255);
      expect(updatedNode.strokes[0]?.color.b).toBe(0);
    });

    it('should not update fill with invalid hex', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const fillInput = screen.getByDisplayValue('#6495ED');
      act(() => {
        fireEvent.change(fillInput, { target: { value: 'not-a-color' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.fills[0]?.color.r).toBe(100); // Unchanged
    });

    it('should have fill color swatch', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('fill-swatch')).toBeInTheDocument();
    });

    it('should have stroke color swatch', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('stroke-swatch')).toBeInTheDocument();
    });

    it('should open color picker on fill swatch click', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const swatch = screen.getByTestId('fill-swatch');
      act(() => {
        fireEvent.click(swatch);
      });

      expect(screen.getByTestId('color-picker')).toBeInTheDocument();
    });

    it('should update fill when hex input changes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      // Fill color is #6495ED
      const fillInput = screen.getByDisplayValue('#6495ED');
      act(() => {
        fireEvent.change(fillInput, { target: { value: '#00FF00' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.fills[0]?.color.g).toBe(255);
    });
  });

  // ============================================================================
  // Sprint 8: Aspect Ratio Lock
  // ============================================================================

  describe('aspect ratio lock', () => {
    it('should show aspect ratio lock button', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('aspect-ratio-lock')).toBeInTheDocument();
    });

    it('should toggle aspect ratio lock on click', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(useEditorStore.getState().aspectRatioLocked).toBe(false);

      act(() => {
        fireEvent.click(screen.getByTestId('aspect-ratio-lock'));
      });

      expect(useEditorStore.getState().aspectRatioLocked).toBe(true);
    });

    it('should auto-compute H when W changes with lock on', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      // Lock aspect ratio (100 x 50, ratio = 2:1)
      act(() => {
        useEditorStore.getState().toggleAspectRatioLock();
      });

      const widthInput = screen.getByDisplayValue('100.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '200' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.width).toBe(200);
      expect(updatedNode.height).toBe(100); // 200 * (50/100) = 100
    });

    it('should auto-compute W when H changes with lock on', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      // Lock aspect ratio (100 x 50, ratio = 2:1)
      act(() => {
        useEditorStore.getState().toggleAspectRatioLock();
      });

      const heightInput = screen.getByDisplayValue('50.0');
      act(() => {
        fireEvent.change(heightInput, { target: { value: '100' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.height).toBe(100);
      expect(updatedNode.width).toBe(200); // 100 * (100/50) = 200
    });

    it('should not auto-compute when lock is off', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      // Lock is off by default
      const widthInput = screen.getByDisplayValue('100.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '200' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.width).toBe(200);
      expect(updatedNode.height).toBe(50); // Unchanged
    });
  });

  // ============================================================================
  // Sprint 8: Scrub Labels
  // ============================================================================

  describe('scrub labels', () => {
    it('should render scrub labels for X and Y', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('scrub-label-X')).toBeInTheDocument();
      expect(screen.getByTestId('scrub-label-Y')).toBeInTheDocument();
    });

    it('should render scrub labels for W and H', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getAllByTestId('scrub-label-W').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId('scrub-label-H')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Sprint 11: Keyframe Indicators
  // ============================================================================

  describe('keyframe indicators', () => {
    beforeEach(() => {
      // Reset timeline between tests
      useEditorStore.setState({
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        currentFrame: 0,
      });
    });

    it('should render keyframe indicator for position X', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');
      expect(indicators.length).toBeGreaterThanOrEqual(1);
    });

    it('should show active when keyframe exists at current frame', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'transform.position.x', 0, 150);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');
      // First indicator is position X - should be filled (active)
      expect(indicators[0].style.background).toBe('var(--color-keyframe-active)');
    });

    it('should show inactive when keyframes exist elsewhere', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'transform.position.x', 10, 200);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');
      // First indicator should be inactive (accent border, transparent bg)
      expect(indicators[0].style.background).toBe('transparent');
      expect(indicators[0].style.border).toContain('var(--color-accent-primary)');
    });

    it('should show none when no keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');
      // Should be outline-only (none)
      expect(indicators[0].style.background).toBe('transparent');
      expect(indicators[0].style.border).toContain('var(--color-text-disabled)');
    });

    it('should toggle keyframe when indicator is clicked', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');

      // Click to add keyframe
      act(() => {
        fireEvent.click(indicators[0]);
      });

      expect(useEditorStore.getState().timeline.tracks.length).toBe(1);
      expect(useEditorStore.getState().timeline.tracks[0].property).toBe('transform.position.x');

      // Click again to remove keyframe
      act(() => {
        fireEvent.click(indicators[0]);
      });

      // Track should be cleaned up (auto-cleanup of empty tracks)
      expect(useEditorStore.getState().timeline.tracks.length).toBe(0);
    });
  });

  // ============================================================================
  // Sprint 11: Rotation ScrubLabel
  // ============================================================================

  describe('rotation scrub label', () => {
    it('should render rotation scrub label R', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('scrub-label-R')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Corner Radius
  // ============================================================================

  describe('corner radius', () => {
    it('should show corner radius section for rectangles', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByTestId('corner-radius-section')).toBeInTheDocument();
      expect(screen.getByText('Corner Radius')).toBeInTheDocument();
    });

    it('should show corner radius section for polygons', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestPolygon('poly1', 'Polygon 1'));
        useEditorStore.getState().setSelection(['poly1']);
      });

      expect(screen.getByTestId('corner-radius-section')).toBeInTheDocument();
    });

    it('should not show corner radius section for ellipses', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
        useEditorStore.getState().setSelection(['ellipse1']);
      });

      expect(screen.queryByTestId('corner-radius-section')).not.toBeInTheDocument();
    });

    it('should update rectangle corner radius', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const input = screen.getByTestId('corner-radius-input');
      act(() => {
        fireEvent.change(input, { target: { value: '15' } });
      });

      const updatedNode = sg.getNode('rect1') as RectangleNode;
      expect(updatedNode.cornerRadius).toEqual([15, 15, 15, 15]);
    });

    it('should toggle corner radius lock and show per-corner inputs', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const lockBtn = screen.getByTestId('corner-radius-lock');
      act(() => {
        fireEvent.click(lockBtn);
      });

      // Should now show TL, TR, BL, BR scrub labels
      expect(screen.getByTestId('scrub-label-TL')).toBeInTheDocument();
      expect(screen.getByTestId('scrub-label-TR')).toBeInTheDocument();
      expect(screen.getByTestId('scrub-label-BL')).toBeInTheDocument();
      expect(screen.getByTestId('scrub-label-BR')).toBeInTheDocument();
    });

    it('should update polygon corner radius', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestPolygon('poly1', 'Polygon 1'));
        useEditorStore.getState().setSelection(['poly1']);
      });

      const input = screen.getByTestId('corner-radius-input');
      act(() => {
        fireEvent.change(input, { target: { value: '10' } });
      });

      const updatedNode = sg.getNode('poly1') as PolygonNode;
      expect(updatedNode.cornerRadius).toBe(10);
    });
  });
});
