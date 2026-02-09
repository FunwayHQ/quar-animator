import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import type { ImageNode, RectangleNode, EllipseNode } from '@quar/types';
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

function createTestImage(id: string, name: string): ImageNode {
  return {
    id,
    name,
    type: 'image',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 100, y: 100 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    src: 'data:image/png;base64,test',
    width: 200,
    height: 150,
    naturalWidth: 200,
    naturalHeight: 150,
    cornerRadius: [0, 0, 0, 0] as [number, number, number, number],
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      hue: 0,
      exposure: 0,
      temperature: 0,
      tint: 0,
      blur: 0,
    },
  };
}

function createTestImageWithAdjustments(id: string, name: string): ImageNode {
  return {
    ...createTestImage(id, name),
    adjustments: {
      brightness: 25,
      contrast: -10,
      saturation: 50,
      hue: 30,
      exposure: 0,
      temperature: 0,
      tint: 0,
      blur: 0,
    },
  };
}

function createTestRect(id: string, name: string): RectangleNode {
  return {
    id,
    name,
    type: 'rectangle',
    parent: null,
    children: [],
    transform: { ...createDefaultTransform(), position: { x: 100, y: 100 } },
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'normal',
    width: 100,
    height: 50,
    cornerRadius: [0, 0, 0, 0],
    fills: [{ type: 'solid', color: { r: 100, g: 149, b: 237, a: 1 }, opacity: 1, visible: true }],
    strokes: [],
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

describe('PropertiesPanel - Image Node', () => {
  beforeEach(() => {
    useEditorStore.getState().clearSelection();
    if (useEditorStore.getState().aspectRatioLocked) {
      useEditorStore.getState().toggleAspectRatioLock();
    }
  });

  // ============================================================================
  // Image Adjustments section visibility
  // ============================================================================

  describe('image adjustments section', () => {
    it('shows image adjustments section when image node is selected', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByTestId('image-adjustments-section')).toBeInTheDocument();
      expect(screen.getByTestId('image-adjustments')).toBeInTheDocument();
    });

    it('does NOT show image adjustments section for rectangle nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.queryByTestId('image-adjustments-section')).not.toBeInTheDocument();
    });

    it('does NOT show image adjustments section for ellipse nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestEllipse('ellipse1', 'Ellipse 1'));
        useEditorStore.getState().setSelection(['ellipse1']);
      });

      expect(screen.queryByTestId('image-adjustments-section')).not.toBeInTheDocument();
    });

    it('renders "Adjustments" title in image adjustments section', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByText('Adjustments')).toBeInTheDocument();
    });

    it('displays the node type label as "Image"', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByText('Image')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Size (W/H) editing for image nodes
  // ============================================================================

  describe('image size editing', () => {
    it('displays image width and height', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByDisplayValue('200.0')).toBeInTheDocument();
      expect(screen.getByDisplayValue('150.0')).toBeInTheDocument();
    });

    it('should update image width when W input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const widthInput = document.getElementById('prop-size-w')!;
      act(() => {
        fireEvent.change(widthInput, { target: { value: '300' } });
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.width).toBe(300);
    });

    it('should update image height when H input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const heightInput = screen.getByDisplayValue('150.0');
      act(() => {
        fireEvent.change(heightInput, { target: { value: '200' } });
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.height).toBe(200);
    });

    it('should respect aspect ratio lock for image nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      // Lock aspect ratio (200 x 150, ratio = 4:3)
      act(() => {
        useEditorStore.getState().toggleAspectRatioLock();
      });

      const widthInput = document.getElementById('prop-size-w')!;
      act(() => {
        fireEvent.change(widthInput, { target: { value: '400' } });
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.width).toBe(400);
      expect(updatedNode.height).toBe(300); // 400 * (150/200) = 300
    });
  });

  // ============================================================================
  // No fill/stroke section for image nodes
  // ============================================================================

  describe('fill/stroke visibility', () => {
    it('does NOT show fill section for image nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      // Image nodes should not have Fill/Stroke labels in the Appearance section
      // hasFillsStrokes returns false for image type
      expect(screen.queryByText('Fill')).not.toBeInTheDocument();
      expect(screen.queryByText('Stroke')).not.toBeInTheDocument();
    });

    it('shows Appearance section header for image nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByText('Appearance')).toBeInTheDocument();
    });

    it('shows Opacity slider for image nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByText('Opacity')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Image adjustment values interaction
  // ============================================================================

  describe('image adjustment interaction via PropertiesPanel', () => {
    it('displays adjustment values from the image node', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImageWithAdjustments('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const brightnessValue = screen.getByTestId('adjustment-value-brightness') as HTMLInputElement;
      expect(brightnessValue.value).toBe('25');

      const contrastValue = screen.getByTestId('adjustment-value-contrast') as HTMLInputElement;
      expect(contrastValue.value).toBe('-10');
    });

    it('updates image adjustments when slider is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const brightnessSlider = screen.getByTestId('adjustment-slider-brightness');
      act(() => {
        fireEvent.change(brightnessSlider, { target: { value: '42' } });
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.adjustments?.brightness).toBe(42);
    });

    it('resets individual adjustment when reset button is clicked', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImageWithAdjustments('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const resetButton = screen.getByTestId('adjustment-reset-brightness');
      act(() => {
        fireEvent.click(resetButton);
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.adjustments?.brightness).toBe(0);
      // Other adjustments remain unchanged
      expect(updatedNode.adjustments?.saturation).toBe(50);
    });

    it('resets all adjustments when Reset All button is clicked', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImageWithAdjustments('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const resetAllButton = screen.getByTestId('image-adjustments-reset-all');
      act(() => {
        fireEvent.click(resetAllButton);
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.adjustments?.brightness).toBe(0);
      expect(updatedNode.adjustments?.contrast).toBe(0);
      expect(updatedNode.adjustments?.saturation).toBe(0);
      expect(updatedNode.adjustments?.hue).toBe(0);
    });
  });

  // ============================================================================
  // Transform section still works for image nodes
  // ============================================================================

  describe('transform section for image nodes', () => {
    it('shows transform section', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByText('Transform')).toBeInTheDocument();
      expect(screen.getByText('Position')).toBeInTheDocument();
      expect(screen.getByText('Size')).toBeInTheDocument();
      expect(screen.getByText('Rotation')).toBeInTheDocument();
    });

    it('shows corner radius section for image nodes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByTestId('corner-radius-section')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // Image Corner Radius
  // ============================================================================

  describe('image corner radius', () => {
    it('shows corner radius section with default zero value', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByTestId('corner-radius-section')).toBeInTheDocument();
      expect(screen.getByTestId('corner-radius-input')).toBeInTheDocument();
      expect((screen.getByTestId('corner-radius-input') as HTMLInputElement).value).toBe('0.0');
    });

    it('updates image corner radius when input is changed', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      const input = screen.getByTestId('corner-radius-input');
      act(() => {
        fireEvent.change(input, { target: { value: '30' } });
      });

      const updatedNode = sg.getNode('img1') as ImageNode;
      expect(updatedNode.cornerRadius).toEqual([30, 30, 30, 30]);
    });

    it('supports per-corner editing when unlocked', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      // Unlock per-corner editing
      const lockButton = screen.getByTestId('corner-radius-lock');
      act(() => {
        fireEvent.click(lockButton);
      });

      // Should show individual corner inputs (TL, TR, BL, BR)
      expect(screen.getByText('TL')).toBeInTheDocument();
      expect(screen.getByText('TR')).toBeInTheDocument();
      expect(screen.getByText('BL')).toBeInTheDocument();
      expect(screen.getByText('BR')).toBeInTheDocument();
    });

    it('shows lock/unlock button for corner radius', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestImage('img1', 'Test Image'));
        useEditorStore.getState().setSelection(['img1']);
      });

      expect(screen.getByTestId('corner-radius-lock')).toBeInTheDocument();
    });
  });
});
