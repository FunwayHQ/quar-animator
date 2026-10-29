import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, within, waitFor } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import {
  findGoogleFont,
  getFontManager,
  createDefaultTransform,
  createPolygonPath,
  createStarPath,
  getTextLocalBounds,
  getTextNodeBounds,
} from '@quar/core';
import { applyAnimatedValues, createTimeline, evaluateNodeAtFrame } from '@quar/animation';
import type { SceneGraph } from '@quar/core';
import type {
  RectangleNode,
  EllipseNode,
  PolygonNode,
  PathNode,
  TextNode,
  ArtboardNode,
  Node,
} from '@quar/types';
import { PropertiesPanel, textSizeUpdate } from './PropertiesPanel';
import { useEditorStore } from '../../stores/editorStore';
import { Profiler, type ReactNode } from 'react';
import { poseScene } from '../../stores/scenePosing';
import { PromptDialogHost } from '../common/PromptDialog';

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

function createTestText(id: string, name: string): TextNode {
  return {
    ...createTestRect(id, name),
    type: 'text',
    content: 'Hello',
    fontFamily: 'Arial',
    fontSize: 24,
    fontWeight: 400,
    fontStyle: 'normal',
    textAlign: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
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

  it('holds still while the animation plays, then shows where it stopped', () => {
    let sg: SceneGraph | null = null;
    let renders = 0;
    render(
      <SceneGraphProvider>
        <SceneGraphCapture onCapture={(s) => (sg = s)} />
        <Profiler id="properties" onRender={() => renders++}>
          <PropertiesPanel />
        </Profiler>
      </SceneGraphProvider>
    );
    act(() => {
      sg!.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
      useEditorStore.setState({ currentFrame: 0, timeline: createTimeline() });
    });
    act(() => useEditorStore.setState({ isPlaying: true }));
    const playing = renders;
    // Ten frames shown, the layer posed on each
    act(() => {
      for (let frame = 1; frame <= 10; frame++) {
        useEditorStore.setState({ currentFrame: frame });
        poseScene(() => sg!.updateNode('rect1', { opacity: frame / 20 } as Partial<Node>));
      }
    });
    expect(renders).toBe(playing);

    // An edit made meanwhile keys the frame being shown, not the one held
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add opacity keyframe' }));
    });
    const track = useEditorStore
      .getState()
      .timeline.tracks.find((t) => t.nodeId === 'rect1' && t.property === 'opacity');
    expect(track?.keyframes.map((kf) => kf.time)).toEqual([10]);

    act(() => useEditorStore.setState({ isPlaying: false }));
    expect(renders).toBeGreaterThan(playing);
    expect(screen.getByDisplayValue('50%')).toBeInTheDocument();
    act(() => useEditorStore.setState({ currentFrame: 0, timeline: createTimeline() }));
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

  it('names a star Star in its header, a polygon Polygon', () => {
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(createTestPolygon('hex', 'Hexagon'));
      sg.addNode({ ...createTestPolygon('star', 'Star'), innerRadius: 20 });
      useEditorStore.getState().setSelection(['star']);
    });
    const header = () => screen.getByRole('heading', { name: 'Properties' }).parentElement!;
    expect(header()).toHaveTextContent(/^PropertiesStar$/);

    act(() => useEditorStore.getState().setSelection(['hex']));
    expect(header()).toHaveTextContent(/^PropertiesPolygon$/);
  });

  it('adds presets as Animation Sequence steps while the sequence window is open', () => {
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
      useEditorStore.setState({ sequenceWindowOpen: true });
    });
    expect(screen.getByText('Adds to sequence')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Fade entrance animation' }));

    const { animationSequence, timeline } = useEditorStore.getState();
    expect(animationSequence.steps.map(({ nodeId, presetId }) => [nodeId, presetId])).toEqual([
      ['rect1', 'fade-in'],
    ]);
    const opacityTrack = timeline.tracks.find((track) => track.property === 'opacity');
    expect(opacityTrack?.keyframes.every((keyframe) => keyframe.sequenceStepId)).toBe(true);
    act(() =>
      useEditorStore.setState({
        sequenceWindowOpen: false,
        animationSequence: { steps: [], restPoses: {} },
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        undoStack: [],
      })
    );
  });

  it('applies an editable animation preset and undoes it as one action', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Fade entrance animation' }));

    const opacityTrack = useEditorStore
      .getState()
      .timeline.tracks.find((track) => track.nodeId === 'rect1' && track.property === 'opacity');
    expect(opacityTrack?.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 0],
      [24, 0.8],
    ]);
    expect(sg.getNode('rect1')?.opacity).toBe(0);
    expect(useEditorStore.getState().canUndo).toBe(true);

    act(() => useEditorStore.getState().undo(sg));
    expect(useEditorStore.getState().timeline.tracks).toHaveLength(0);
    expect(sg.getNode('rect1')?.opacity).toBe(0.8);
  });

  it('applies selected direction and intensity to motion presets', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    fireEvent.change(screen.getByLabelText('Animation direction'), {
      target: { value: 'bottom' },
    });
    fireEvent.change(screen.getByLabelText('Animation intensity'), {
      target: { value: '1.5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Drop entrance animation' }));

    const yTrack = useEditorStore
      .getState()
      .timeline.tracks.find(
        (track) => track.nodeId === 'rect1' && track.property === 'transform.position.y'
      );
    expect(yTrack?.keyframes.map((keyframe) => [keyframe.time, keyframe.value])).toEqual([
      [0, 104],
      [18, 212],
      [24, 200],
    ]);
  });

  it('shows typewriter and draw-on presets only for matching node types', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestText('text1', 'Text 1'));
      sg.addNode({
        ...createTestRect('path1', 'Path 1'),
        type: 'path',
        points: [
          { position: { x: 0, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
          { position: { x: 50, y: 0 }, handleIn: null, handleOut: null, type: 'corner' },
        ],
        closed: false,
      });
      useEditorStore.getState().setSelection(['text1']);
    });

    expect(
      screen.getByRole('button', { name: 'Apply Typewriter entrance animation' })
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply By Word entrance animation' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Apply By Line entrance animation' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Apply Draw On entrance animation' })).toBeNull();

    act(() => useEditorStore.getState().setSelection(['path1']));

    expect(screen.getByRole('button', { name: 'Apply Draw On entrance animation' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Apply Typewriter entrance animation' })
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply By Word entrance animation' })).toBeNull();
  });

  it('stagger-applies a preset to selected objects in selection order', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      sg.addNode(createTestRect('rect2', 'Rectangle 2'));
      useEditorStore.getState().setSelection(['rect1', 'rect2']);
    });

    fireEvent.change(screen.getByLabelText('Animation stagger delay per object'), {
      target: { value: '0.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply Fade entrance animation' }));

    const secondOpacityTrack = useEditorStore
      .getState()
      .timeline.tracks.find((track) => track.nodeId === 'rect2' && track.property === 'opacity');
    // The staggered object stays hidden until its fade starts
    expect(
      secondOpacityTrack?.keyframes.map((keyframe) => [keyframe.time, keyframe.value])
    ).toEqual([
      [0, 0],
      [3, 0],
      [27, 0.8],
    ]);
  });

  it('collapses and expands the animation preset controls', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    const toggle = screen.getByTestId('animation-presets-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'Apply Fade entrance animation' })
    ).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Apply Fade entrance animation' })
    ).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('button', { name: 'Apply Fade entrance animation' })
    ).toBeInTheDocument();
  });

  it('displays actual node position values', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Position displayed as visual top-left on screen:
    // X: center.x - width * anchor.x = 150 - 100*0.5 = 100
    // Y: center.y + height * (1 - anchor.y) = 200 + 50*0.5 = 225 (world max Y = visual top in Y-up)
    const posXInput = document.getElementById('prop-pos-x') as HTMLInputElement;
    expect(posXInput.value).toBe('100.0');
    expect(screen.getByDisplayValue('225.0')).toBeInTheDocument();
  });

  it('types into the integer part of a numeric field, keeping the decimals', async () => {
    const user = userEvent.setup();
    const sg = renderWithSceneGraph();
    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
      useEditorStore.setState({ snapToGrid: false });
    });

    const posXInput = document.getElementById('prop-pos-x') as HTMLInputElement;
    await user.click(posXInput);
    expect([posXInput.selectionStart, posXInput.selectionEnd]).toEqual([0, 3]);

    // Each digit is committed and redisplayed as "N.0"; the caret must stay
    // before the decimal point so "250" doesn't become "2.5"
    await user.keyboard('250');
    expect(posXInput.value).toBe('250.0');
    expect(sg.getNode('rect1')!.transform.position.x).toBe(300); // 250 + width/2

    // → moves on to the decimals
    await user.keyboard('{ArrowRight}5');
    expect(posXInput.value).toBe('250.5');
  });

  it('displays actual node size', () => {
    const sg = renderWithSceneGraph();

    act(() => {
      sg.addNode(createTestRect('rect1', 'Rectangle 1'));
      useEditorStore.getState().setSelection(['rect1']);
    });

    // Width 100 (note: position X is also 100.0, so there are 2 matches)
    expect(screen.getAllByDisplayValue('100.0').length).toBeGreaterThanOrEqual(2);
    // Height 50
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
    const slider = screen.getByLabelText('Opacity');
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

      // Use id to target width input (position X also shows '100.0')
      const widthInput = document.getElementById('prop-size-w')!;
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

    it("shows a scaled group's size once scaled, and resizes it to exactly what's typed", () => {
      const sg = renderWithSceneGraph();
      const shape = (id: string, x: number, width: number, height: number): RectangleNode => ({
        ...createTestRect(id, id),
        transform: { ...createDefaultTransform(), position: { x, y: 0 } },
        width,
        height,
        strokes: [],
      });
      act(() => {
        sg.addNode({
          id: 'g',
          name: 'Group',
          type: 'group',
          parent: null,
          children: [],
          transform: { ...createDefaultTransform(), scale: { x: 2, y: 2 } },
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
        });
        // x −50–50 and 130–170 in the group: 220 × 80 before its scale
        sg.addNode(shape('a', 0, 100, 60), 'g');
        sg.addNode(shape('b', 150, 40, 80), 'g');
        useEditorStore.setState({ aspectRatioLocked: false, snapToGrid: false });
        useEditorStore.getState().setSelection(['g']);
      });

      const widthInput = document.getElementById('prop-size-w') as HTMLInputElement;
      const heightInput = document.getElementById('prop-size-h') as HTMLInputElement;
      expect(widthInput.value).toBe('440.0');
      expect(heightInput.value).toBe('160.0');

      act(() => {
        fireEvent.change(widthInput, { target: { value: '330' } });
      });
      act(() => {
        fireEvent.change(heightInput, { target: { value: '40' } });
      });
      expect(sg.getNode('g')!.transform.scale).toEqual({ x: 1.5, y: 0.5 });
      expect(widthInput.value).toBe('330.0');
      expect(heightInput.value).toBe('40.0');
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

      const widthInput = document.getElementById('prop-size-w')!;
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

      const widthInput = document.getElementById('prop-size-w')!;
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
    it('shows valid hex for colors animation carried out of range (F070)', () => {
      const sg = renderWithSceneGraph();
      act(() => {
        const rect = createTestRect('rect1', 'Rectangle 1');
        sg.addNode({
          ...rect,
          fills: [{ ...rect.fills[0]!, color: { r: 300, g: -5, b: 127.5, a: 1 } }],
          strokes: [{ ...rect.strokes[0]!, color: { r: 12.4, g: 255.6, b: -0.2, a: 1 } }],
        });
        useEditorStore.getState().setSelection(['rect1']);
      });

      expect(screen.getByDisplayValue('#FF0080')).toBeInTheDocument();
      expect(screen.getByDisplayValue('#0CFF00')).toBeInTheDocument();
    });

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

      const widthInput = document.getElementById('prop-size-w')!;
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
      const widthInput = document.getElementById('prop-size-w')!;
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

    it('adds an opacity keyframe from the opacity control', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      fireEvent.click(screen.getByRole('button', { name: 'Add opacity keyframe' }));

      const opacityTrack = useEditorStore
        .getState()
        .timeline.tracks.find((track) => track.nodeId === 'rect1' && track.property === 'opacity');
      expect(opacityTrack?.keyframes[0]?.value).toBe(0.8);
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
      expect(indicators[0]!.style.background).toBe('var(--color-keyframe-active)');
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
      expect(indicators[0]!.style.background).toBe('transparent');
      expect(indicators[0]!.style.border).toContain('var(--color-accent-primary)');
    });

    it('should show none when no keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      const indicators = screen.getAllByTestId('keyframe-indicator');
      // Should be outline-only (none)
      expect(indicators[0]!.style.background).toBe('transparent');
      expect(indicators[0]!.style.border).toContain('var(--color-text-disabled)');
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
        fireEvent.click(indicators[0]!);
      });

      // Position keys X and Y together
      expect(useEditorStore.getState().timeline.tracks.map((t) => t.property)).toEqual([
        'transform.position.x',
        'transform.position.y',
      ]);

      // Click again to remove keyframe
      act(() => {
        fireEvent.click(indicators[0]!);
      });

      // Track should be cleaned up (auto-cleanup of empty tracks)
      expect(useEditorStore.getState().timeline.tracks.length).toBe(0);
    });

    it('keys width and height together from the Size indicator', () => {
      const sg = renderWithSceneGraph();
      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });
      act(() => {
        fireEvent.click(screen.getAllByTestId('keyframe-indicator')[1]!);
      });
      expect(useEditorStore.getState().timeline.tracks.map((t) => t.property)).toEqual([
        'width',
        'height',
      ]);
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

    it('keys a regular polygon’s Inner Radius as the same polygon, as the field shows it (F083)', () => {
      useEditorStore.setState({
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        currentFrame: 0,
      });
      const sg = renderWithSceneGraph();
      act(() => {
        sg.addNode(createTestPolygon('poly1', 'Polygon 1')); // 5 sides, radius 50
        useEditorStore.getState().setSelection(['poly1']);
      });
      // The distance to the middle of its edges
      const apothem = 50 * Math.cos(Math.PI / 5);
      expect(screen.getByTestId('polygon-inner-radius-input')).toHaveValue(apothem.toFixed(1));

      const row = screen.getByText('Inner Radius').parentElement!;
      act(() => {
        fireEvent.click(within(row).getByTestId('keyframe-indicator'));
      });

      const track = useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.nodeId === 'poly1' && t.property === 'innerRadius');
      expect(track?.keyframes.map((kf) => kf.value)).toEqual([apothem]);
      // As a star, every other point sits on an edge of the polygon: the same shape
      const polygon = createPolygonPath(0, 0, 50, 5).map((p) => p.position);
      const star = createStarPath(0, 0, 50, apothem, 5).map((p) => p.position);
      polygon.forEach((corner, i) => {
        const next = polygon[(i + 1) % polygon.length]!;
        expect(star[2 * i]!.x).toBeCloseTo(corner.x);
        expect(star[2 * i]!.y).toBeCloseTo(corner.y);
        expect(star[2 * i + 1]!.x).toBeCloseTo((corner.x + next.x) / 2);
        expect(star[2 * i + 1]!.y).toBeCloseTo((corner.y + next.y) / 2);
      });
    });

    describe('keyframing one radius for all corners (F082)', () => {
      const keyedFrames = (property: string) =>
        useEditorStore
          .getState()
          .timeline.tracks.find((track) => track.nodeId === 'rect1' && track.property === property)
          ?.keyframes.map((kf) => [kf.time, kf.value]);

      beforeEach(() => {
        useEditorStore.setState({
          timeline: createTimeline({ duration: 300, frameRate: 30 }),
          currentFrame: 0,
          autoKeyframe: false,
        });
      });

      it('keys every corner when the corners are animated, auto-key off', () => {
        const sg = renderWithSceneGraph();
        act(() => {
          sg.addNode(createTestRect('rect1', 'Rectangle 1'));
          useEditorStore.getState().setSelection(['rect1']);
          for (const corner of [0, 1, 2, 3]) {
            useEditorStore.getState().addKeyframeAtFrame('rect1', `cornerRadius.${corner}`, 0, 0);
          }
          useEditorStore.setState({ currentFrame: 10 });
        });

        act(() => {
          fireEvent.change(screen.getByTestId('corner-radius-input'), {
            target: { value: '20' },
          });
        });

        for (const corner of [0, 1, 2, 3]) {
          expect(keyedFrames(`cornerRadius.${corner}`)).toEqual([
            [0, 0],
            [10, 20],
          ]);
        }
      });

      it('keys only the animated corners, auto-key off', () => {
        const sg = renderWithSceneGraph();
        act(() => {
          sg.addNode(createTestRect('rect1', 'Rectangle 1'));
          useEditorStore.getState().setSelection(['rect1']);
          useEditorStore.getState().addKeyframeAtFrame('rect1', 'cornerRadius.0', 0, 0);
          useEditorStore.setState({ currentFrame: 10 });
        });

        act(() => {
          fireEvent.change(screen.getByTestId('corner-radius-input'), {
            target: { value: '20' },
          });
        });

        expect(keyedFrames('cornerRadius.0')).toEqual([
          [0, 0],
          [10, 20],
        ]);
        expect(keyedFrames('cornerRadius.1')).toBeUndefined();
        expect((sg.getNode('rect1') as RectangleNode).cornerRadius).toEqual([20, 20, 20, 20]);
      });

      it('keys every corner with auto-key on', () => {
        const sg = renderWithSceneGraph();
        act(() => {
          sg.addNode(createTestRect('rect1', 'Rectangle 1'));
          useEditorStore.getState().setSelection(['rect1']);
          useEditorStore.setState({ autoKeyframe: true, currentFrame: 5 });
        });

        act(() => {
          fireEvent.change(screen.getByTestId('corner-radius-input'), {
            target: { value: '8' },
          });
        });

        for (const corner of [0, 1, 2, 3]) {
          expect(keyedFrames(`cornerRadius.${corner}`)).toEqual([[5, 8]]);
        }
      });
    });
  });

  // ==========================================================================
  // IK Target Properties
  // ==========================================================================

  describe('IK Target', () => {
    it('shows IK Chain section for ik-target node', () => {
      const sg = renderWithSceneGraph();

      const chainId = 'ik_test_chain';
      // Set up IK chain in store
      useEditorStore.setState({
        ikChains: [
          {
            id: chainId,
            name: 'IK Chain (Bone1 → Bone2)',
            rootBoneId: 'bone1',
            endEffectorBoneId: 'bone2',
            targetNodeId: 'ikt1',
            maxIterations: 10,
            tolerance: 0.5,
            enabled: true,
          },
        ],
      });

      act(() => {
        sg.addNode({
          id: 'ikt1',
          name: 'IK Target',
          type: 'ik-target',
          parent: null,
          children: [],
          transform: {
            position: { x: 100, y: 200 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            anchor: { x: 0, y: 0 },
            skew: { x: 0, y: 0 },
          },
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          ikChainId: chainId,
          targetType: 'effector',
        } as any);
        useEditorStore.getState().setSelection(['ikt1']);
      });

      // Should show IK Chain section
      expect(screen.getByText('IK Chain')).toBeInTheDocument();
      // Should show chain name
      expect(screen.getByText('IK Chain (Bone1 → Bone2)')).toBeInTheDocument();
      // Should show target type
      expect(screen.getByText('End Effector')).toBeInTheDocument();
    });

    it('shows Pole Target type for pole target nodes', () => {
      const sg = renderWithSceneGraph();

      const chainId = 'ik_test_chain';
      useEditorStore.setState({
        ikChains: [
          {
            id: chainId,
            name: 'IK Chain (A → B)',
            rootBoneId: 'bone1',
            endEffectorBoneId: 'bone2',
            targetNodeId: 'ikt1',
            poleTargetNodeId: 'ikp1',
            maxIterations: 10,
            tolerance: 0.5,
            enabled: true,
          },
        ],
      });

      act(() => {
        sg.addNode({
          id: 'ikp1',
          name: 'Pole Target',
          type: 'ik-target',
          parent: null,
          children: [],
          transform: {
            position: { x: 50, y: 100 },
            rotation: 0,
            scale: { x: 1, y: 1 },
            anchor: { x: 0, y: 0 },
            skew: { x: 0, y: 0 },
          },
          visible: true,
          locked: false,
          opacity: 1,
          blendMode: 'normal',
          ikChainId: chainId,
          targetType: 'pole',
        } as any);
        useEditorStore.getState().setSelection(['ikp1']);
      });

      expect(screen.getByText('IK Chain')).toBeInTheDocument();
      expect(screen.getByText('Pole Target')).toBeInTheDocument();
    });
  });

  // ============================================================================
  // shouldKeyframe: auto-create keyframes for already-animated properties
  // ============================================================================

  describe('shouldKeyframe — auto-create keyframes for animated properties', () => {
    beforeEach(() => {
      useEditorStore.setState({
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        currentFrame: 0,
        autoKeyframe: false,
      });
    });

    it('should NOT create keyframe when autoKeyframe OFF and property has no keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });

      // Change position X — autoKeyframe is OFF, no existing keyframes
      const posXInput = document.getElementById('prop-pos-x') as HTMLInputElement;
      act(() => {
        fireEvent.change(posXInput, { target: { value: '300' } });
      });

      // No keyframe should be created
      const { timeline } = useEditorStore.getState();
      expect(timeline.tracks.length).toBe(0);
    });

    it('should create keyframe when autoKeyframe OFF but property already has keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        // Add an existing keyframe for position X at frame 0
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'transform.position.x', 0, 150);
      });

      // Scrub to frame 10
      act(() => {
        useEditorStore.setState({ currentFrame: 10 });
      });

      // Change position X — property already has keyframes, should auto-create
      const posXInput = document.getElementById('prop-pos-x') as HTMLInputElement;
      act(() => {
        fireEvent.change(posXInput, { target: { value: '300' } });
      });

      const { timeline } = useEditorStore.getState();
      const track = timeline.tracks.find(
        (t) => t.nodeId === 'rect1' && t.property === 'transform.position.x'
      );
      expect(track).toBeDefined();
      // Should have 2 keyframes: original at frame 0 + new one at frame 10
      expect(track!.keyframes.length).toBe(2);
      expect(track!.keyframes[1].time).toBe(10);
    });

    it('should create keyframe when autoKeyframe ON regardless of existing keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        useEditorStore.setState({ autoKeyframe: true });
      });

      // Change position X — autoKeyframe is ON, no pre-existing keyframes needed
      const posXInput = document.getElementById('prop-pos-x') as HTMLInputElement;
      act(() => {
        fireEvent.change(posXInput, { target: { value: '300' } });
      });

      const { timeline } = useEditorStore.getState();
      const track = timeline.tracks.find(
        (t) => t.nodeId === 'rect1' && t.property === 'transform.position.x'
      );
      expect(track).toBeDefined();
      expect(track!.keyframes.length).toBe(1);
    });

    it('should NOT create keyframe for unrelated property when another property is animated', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        // Add keyframe for position X only
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'transform.position.x', 0, 150);
      });

      act(() => {
        useEditorStore.setState({ currentFrame: 10 });
      });

      // Change rotation — rotation has no keyframes, position X does
      const rotInput = screen.getByDisplayValue('45.0\u00B0');
      act(() => {
        fireEvent.change(rotInput, { target: { value: '90' } });
      });

      const { timeline } = useEditorStore.getState();
      // Position X track should still have just 1 keyframe
      const posTrack = timeline.tracks.find(
        (t) => t.nodeId === 'rect1' && t.property === 'transform.position.x'
      );
      expect(posTrack!.keyframes.length).toBe(1);
      // Rotation should NOT have a keyframe
      const rotTrack = timeline.tracks.find(
        (t) => t.nodeId === 'rect1' && t.property === 'transform.rotation'
      );
      expect(rotTrack).toBeUndefined();
    });

    it('should auto-create keyframe for opacity when opacity already has keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        // Add existing opacity keyframe
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'opacity', 0, 0.8);
      });

      act(() => {
        useEditorStore.setState({ currentFrame: 15 });
      });

      // Change opacity via text input
      const opacityInput = screen.getByDisplayValue('80%');
      act(() => {
        fireEvent.change(opacityInput, { target: { value: '50' } });
      });

      const { timeline } = useEditorStore.getState();
      const track = timeline.tracks.find((t) => t.nodeId === 'rect1' && t.property === 'opacity');
      expect(track).toBeDefined();
      expect(track!.keyframes.length).toBe(2);
      expect(track!.keyframes[1].time).toBe(15);
    });

    it('should auto-create keyframe for size when width already has keyframes', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
        // Add existing width keyframe
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'width', 0, 100);
      });

      act(() => {
        useEditorStore.setState({ currentFrame: 20 });
      });

      // Change width
      const widthInput = document.getElementById('prop-size-w')!;
      act(() => {
        fireEvent.change(widthInput, { target: { value: '200' } });
      });

      const { timeline } = useEditorStore.getState();
      const track = timeline.tracks.find((t) => t.nodeId === 'rect1' && t.property === 'width');
      expect(track).toBeDefined();
      expect(track!.keyframes.length).toBe(2);
      expect(track!.keyframes[1].time).toBe(20);
    });

    it('should auto-create keyframe for vertex position when point already has keyframes', () => {
      const sg = renderWithSceneGraph();

      const pathNode: PathNode = {
        id: 'path1',
        name: 'Test Path',
        type: 'path',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        closed: true,
        points: [
          { position: { x: 0, y: 0 }, type: 'corner' },
          { position: { x: 100, y: 0 }, type: 'corner' },
          { position: { x: 100, y: 100 }, type: 'corner' },
        ],
        fills: [
          { type: 'solid', color: { r: 100, g: 100, b: 100, a: 1 }, opacity: 1, visible: true },
        ],
        strokes: [],
      };

      act(() => {
        sg.addNode(pathNode);
        useEditorStore.getState().setSelection(['path1']);
        // Simulate direct selection tool with point 0 selected
        useEditorStore.setState({
          activeTool: 'direct-selection',
          directSelectionPoints: [{ nodeId: 'path1', pointIndex: 0 }],
        });
        // Add existing keyframe for point 0 position.x at frame 0
        useEditorStore.getState().addKeyframeAtFrame('path1', 'points.0.position.x', 0, 0);
      });

      act(() => {
        useEditorStore.setState({ currentFrame: 12 });
      });

      // Change vertex X position — property already has keyframes, should auto-create
      const vertexXInput = screen.getByTestId('vertex-pos-x');
      act(() => {
        fireEvent.change(vertexXInput, { target: { value: '50' } });
      });

      const { timeline } = useEditorStore.getState();
      const track = timeline.tracks.find(
        (t) => t.nodeId === 'path1' && t.property === 'points.0.position.x'
      );
      expect(track).toBeDefined();
      expect(track!.keyframes.length).toBe(2);
      expect(track!.keyframes[1].time).toBe(12);
    });

    it('should NOT create vertex keyframe when no existing vertex keyframes and autoKeyframe OFF', () => {
      const sg = renderWithSceneGraph();

      const pathNode: PathNode = {
        id: 'path1',
        name: 'Test Path',
        type: 'path',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        closed: true,
        points: [
          { position: { x: 0, y: 0 }, type: 'corner' },
          { position: { x: 100, y: 0 }, type: 'corner' },
          { position: { x: 100, y: 100 }, type: 'corner' },
        ],
        fills: [
          { type: 'solid', color: { r: 100, g: 100, b: 100, a: 1 }, opacity: 1, visible: true },
        ],
        strokes: [],
      };

      act(() => {
        sg.addNode(pathNode);
        useEditorStore.getState().setSelection(['path1']);
        useEditorStore.setState({
          activeTool: 'direct-selection',
          directSelectionPoints: [{ nodeId: 'path1', pointIndex: 0 }],
        });
      });

      // Change vertex X — no existing keyframes, autoKeyframe OFF
      const vertexXInput = screen.getByTestId('vertex-pos-x');
      act(() => {
        fireEvent.change(vertexXInput, { target: { value: '50' } });
      });

      const { timeline } = useEditorStore.getState();
      expect(timeline.tracks.length).toBe(0);
    });
  });

  // ==========================================================================
  // Removing a fill, stroke or effect keeps the keyframes on the right one (F081)
  // ==========================================================================

  describe('removing a fill, stroke or effect', () => {
    const solid = (r: number) => ({
      type: 'solid' as const,
      color: { r, g: 0, b: 0, a: 1 },
      opacity: 1,
      visible: true,
    });
    const fillsOf = (node: Node | undefined) => (node && 'fills' in node ? node.fills : []);
    const tracksOf = (nodeId: string) =>
      useEditorStore
        .getState()
        .timeline.tracks.filter((track) => track.nodeId === nodeId)
        .map((track) => track.property)
        .sort();

    beforeEach(() => {
      useEditorStore.setState({
        timeline: createTimeline({ duration: 300, frameRate: 30 }),
        currentFrame: 0,
        autoKeyframe: false,
        selectedKeyframeIds: new Set<string>(),
      });
      useEditorStore.getState().clearHistory();
    });

    it('drops the removed fill’s keyframes and moves the later fills’ down with them', () => {
      const sg = renderWithSceneGraph();
      act(() => {
        sg.addNode({
          ...createTestRect('rect1', 'Rect'),
          fills: [solid(10), solid(20), solid(30)],
        });
        useEditorStore.getState().setSelection(['rect1']);
        const { addKeyframeAtFrame } = useEditorStore.getState();
        addKeyframeAtFrame('rect1', 'fills.1.opacity', 0, 0.5);
        addKeyframeAtFrame('rect1', 'fills.2.color', 0, { r: 30, g: 0, b: 0, a: 1 });
        addKeyframeAtFrame('rect1', 'fills.2.color', 10, { r: 30, g: 200, b: 0, a: 1 });
      });

      act(() => {
        fireEvent.click(screen.getByTestId('fill-remove-1'));
      });

      expect(tracksOf('rect1')).toEqual(['fills.1.color']);
      // Showing a frame animates the fill that was third, now second — and
      // makes no new one
      const node = sg.getNode('rect1')!;
      const shown = applyAnimatedValues(
        node,
        evaluateNodeAtFrame(useEditorStore.getState().timeline, 'rect1', 5)
      );
      expect(fillsOf(shown)).toEqual([
        solid(10),
        { ...solid(30), color: { r: 30, g: 100, b: 0, a: 1 } },
      ]);

      // One undo brings back the fill and its keyframes
      act(() => {
        useEditorStore.getState().undo(sg);
      });
      expect(fillsOf(sg.getNode('rect1'))).toHaveLength(3);
      expect(tracksOf('rect1')).toEqual(['fills.1.opacity', 'fills.2.color']);
    });

    it('moves the later strokes’ keyframes down when a stroke is removed', () => {
      const sg = renderWithSceneGraph();
      const stroke = createTestRect('x', 'x').strokes[0]!;
      act(() => {
        sg.addNode({
          ...createTestRect('rect1', 'Rect'),
          strokes: [stroke, { ...stroke, width: 6 }],
        });
        useEditorStore.getState().setSelection(['rect1']);
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'strokes.0.width', 0, 2);
        useEditorStore.getState().addKeyframeAtFrame('rect1', 'strokes.1.width', 0, 6);
      });

      act(() => {
        fireEvent.click(screen.getByTestId('stroke-remove-0'));
      });

      expect(tracksOf('rect1')).toEqual(['strokes.0.width']);
      const track = useEditorStore.getState().timeline.tracks[0]!;
      expect(track.keyframes[0]?.value).toBe(6);
    });

    it('moves the later effects’ keyframes down when an effect is removed', () => {
      const sg = renderWithSceneGraph();
      const shadow = {
        id: 'fx1',
        type: 'drop-shadow' as const,
        visible: true,
        color: { r: 0, g: 0, b: 0, a: 1 },
        offsetX: 4,
        offsetY: 4,
        blur: 8,
        spread: 0,
        opacity: 0.5,
      };
      act(() => {
        sg.addNode({
          ...createTestRect('rect1', 'Rect'),
          effects: [shadow, { ...shadow, id: 'fx2', blur: 20 }],
        });
        const { addKeyframeAtFrame } = useEditorStore.getState();
        addKeyframeAtFrame('rect1', 'effects.0.opacity', 0, 0.5);
        addKeyframeAtFrame('rect1', 'effects.1.blur', 0, 20);
      });

      act(() => {
        useEditorStore.getState().removeEffect(sg, 'rect1', 0);
      });

      expect(tracksOf('rect1')).toEqual(['effects.0.blur']);
    });
  });

  // ==========================================================================
  // Artboard Properties
  // ==========================================================================

  describe('artboard properties', () => {
    function createTestArtboard(id: string, name: string): ArtboardNode {
      return {
        id,
        name,
        type: 'artboard',
        parent: null,
        children: [],
        transform: { ...createDefaultTransform(), position: { x: 500, y: 500 } },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 1920,
        height: 1080,
        fills: [
          {
            type: 'solid' as const,
            color: { r: 255, g: 255, b: 255, a: 1 },
            opacity: 1,
            visible: true,
          },
        ],
        clipContent: true,
      };
    }

    it('shows artboard section with clip content', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestArtboard('art1', 'Main Artboard'));
        useEditorStore.getState().setSelection(['art1']);
      });

      // "Artboard" appears as both node type label and section title
      const artboardTexts = screen.getAllByText('Artboard');
      expect(artboardTexts.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Clip Content')).toBeInTheDocument();
    });

    it('shows artboard dimensions in size section', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestArtboard('art1', 'HD Artboard'));
        useEditorStore.getState().setSelection(['art1']);
      });

      expect(screen.getByDisplayValue('1920.0')).toBeInTheDocument();
      expect(screen.getByDisplayValue('1080.0')).toBeInTheDocument();
    });

    it('updates artboard width via size input', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestArtboard('art1', 'Artboard'));
        useEditorStore.getState().setSelection(['art1']);
      });

      const widthInput = screen.getByDisplayValue('1920.0');
      act(() => {
        fireEvent.change(widthInput, { target: { value: '1440' } });
      });

      const node = sg.getNode('art1') as ArtboardNode;
      expect(node.width).toBe(1440);
    });

    it('updates artboard fill color via fill section hex input', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestArtboard('art1', 'Artboard'));
        useEditorStore.getState().setSelection(['art1']);
      });

      // The fill color input should show #FFFFFF (white) — colorToHex returns uppercase
      const fillInput = screen.getByDisplayValue('#FFFFFF');
      expect(fillInput).toBeInTheDocument();

      act(() => {
        fireEvent.change(fillInput, { target: { value: '#FF0000' } });
      });

      const node = sg.getNode('art1') as ArtboardNode;
      expect(node.fills[0].color!.r).toBe(255);
      expect(node.fills[0].color!.g).toBe(0);
      expect(node.fills[0].color!.b).toBe(0);
    });

    it('toggles clipContent checkbox', () => {
      const sg = renderWithSceneGraph();

      act(() => {
        sg.addNode(createTestArtboard('art1', 'Artboard'));
        useEditorStore.getState().setSelection(['art1']);
      });

      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeChecked();

      act(() => {
        fireEvent.click(checkbox);
      });

      const node = sg.getNode('art1') as ArtboardNode;
      expect(node.clipContent).toBe(false);
    });
  });

  // ============================================================================
  // Live text boxes (Figma-style resizing)
  // ============================================================================

  describe('text box', () => {
    function addText(sg: SceneGraph, overrides: Partial<TextNode> = {}): TextNode {
      const node: TextNode = {
        ...createTestText('text1', 'Text 1'),
        transform: { ...createDefaultTransform(), position: { x: 150, y: 200 } },
        content: 'Hello there world',
        ...overrides,
      };
      act(() => {
        sg.addNode(node);
        useEditorStore.getState().setSelection(['text1']);
      });
      return structuredClone(node);
    }

    /** World top-left of a text box (rotation 0). */
    function topLeft(node: TextNode) {
      const box = getTextLocalBounds(node);
      return {
        x: node.transform.position.x + box.x * node.transform.scale.x,
        y: node.transform.position.y + (box.y + box.height) * node.transform.scale.y,
      };
    }

    it('switches between auto width, auto height and fixed size, staying in place', () => {
      const sg = renderWithSceneGraph();
      const initial = addText(sg);
      const size = getTextNodeBounds(initial);
      expect(screen.getByTestId('text-resize-auto-width')).toHaveAttribute('aria-pressed', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Fixed size' }));
      let node = sg.getNode('text1') as TextNode;
      expect(node.textResize).toBe('fixed');
      expect(node.boxWidth).toBeCloseTo(size.width);
      expect(node.boxHeight).toBeCloseTo(size.height);
      expect(topLeft(node).x).toBeCloseTo(topLeft(initial).x);
      expect(topLeft(node).y).toBeCloseTo(topLeft(initial).y);

      fireEvent.click(screen.getByRole('button', { name: 'Auto height' }));
      node = sg.getNode('text1') as TextNode;
      expect(node.textResize).toBe('auto-height');
      expect(node.boxHeight).toBeUndefined();

      fireEvent.click(screen.getByRole('button', { name: 'Auto width' }));
      node = sg.getNode('text1') as TextNode;
      expect(node.textResize).toBe('auto-width');
      expect(node.boxWidth).toBeUndefined();
      expect(topLeft(node).x).toBeCloseTo(topLeft(initial).x);
    });

    it('makes W the width text wraps at, and H a fixed height, without scaling it', () => {
      const sg = renderWithSceneGraph();
      const initial = addText(sg);

      act(() => {
        fireEvent.change(document.getElementById('prop-size-w')!, { target: { value: '90' } });
      });
      let node = sg.getNode('text1') as TextNode;
      expect(node.textResize).toBe('auto-height');
      expect(node.boxWidth).toBe(90);
      expect(node.transform.scale).toEqual({ x: 1, y: 1 });
      // Staying where it was (wrapping itself is measured in @quar/core's tests)
      expect(topLeft(node).x).toBeCloseTo(topLeft(initial).x);
      expect(topLeft(node).y).toBeCloseTo(topLeft(initial).y);

      act(() => {
        fireEvent.change(document.getElementById('prop-size-h')!, { target: { value: '120' } });
      });
      node = sg.getNode('text1') as TextNode;
      expect(node.textResize).toBe('fixed');
      expect(node.boxWidth).toBe(90);
      expect(node.boxHeight).toBe(120);
      expect(node.transform.scale).toEqual({ x: 1, y: 1 });
    });

    it('keeps the top-left of the text when its font size changes', () => {
      const sg = renderWithSceneGraph();
      const initial = addText(sg);

      act(() => {
        fireEvent.change(screen.getByDisplayValue('24'), { target: { value: '48' } });
      });

      const node = sg.getNode('text1') as TextNode;
      expect(node.fontSize).toBe(48);
      expect(topLeft(node).x).toBeCloseTo(topLeft(initial).x);
      expect(topLeft(node).y).toBeCloseTo(topLeft(initial).y);
    });
  });

  describe('font family', () => {
    const fetchMock = vi.fn();

    function addTextIn(sg: SceneGraph, fontFamily: string) {
      act(() => {
        sg.addNode({ ...createTestText('text1', 'Text 1'), fontFamily });
        useEditorStore.getState().setSelection(['text1']);
      });
    }

    const fontFamilyKeys = () =>
      useEditorStore
        .getState()
        .timeline.tracks.find((t) => t.nodeId === 'text1' && t.property === 'fontFamily')
        ?.keyframes.map((kf) => [kf.time, kf.value]);

    /** Pick a family in the Font picker by typing its name. */
    async function pick(family: string) {
      const user = userEvent.setup();
      await user.click(screen.getByRole('combobox', { name: 'Font' }));
      await user.keyboard(`${family}{Enter}`);
    }

    beforeEach(async () => {
      localStorage.clear();
      fetchMock
        .mockReset()
        .mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
      vi.stubGlobal('fetch', fetchMock);
      useEditorStore.setState({ autoKeyframe: false, currentFrame: 0, timeline: createTimeline() });
      // Loaded already (as the document's fonts are once it opens)
      await getFontManager().loadFontFromBuffer(new ArrayBuffer(8), 'Lato', 'local', 400);
    });

    afterEach(() => {
      getFontManager().removeFont('Lato');
      getFontManager().removeFont('Lobster');
      useEditorStore.setState({ autoKeyframe: false });
      vi.unstubAllGlobals();
    });

    it('sets the family picked', async () => {
      const sg = renderWithSceneGraph();
      addTextIn(sg, 'Inter');

      await pick('Lato');

      expect((sg.getNode('text1') as TextNode).fontFamily).toBe('Lato');
      expect(fontFamilyKeys()).toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keys the family picked when auto-key is on', async () => {
      const sg = renderWithSceneGraph();
      addTextIn(sg, 'Inter');
      act(() => useEditorStore.setState({ autoKeyframe: true, currentFrame: 12 }));

      await pick('Lato');

      expect((sg.getNode('text1') as TextNode).fontFamily).toBe('Lato');
      expect(fontFamilyKeys()).toEqual([[12, 'Lato']]);
    });

    it('asks to allow Google Fonts before downloading one, and asks Google nothing before', async () => {
      const sg = renderWithSceneGraph();
      render(<PromptDialogHost />);
      addTextIn(sg, 'Inter');

      await pick('Lobster');

      expect(await screen.findByRole('dialog', { name: 'Use Google Fonts?' })).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
      expect((sg.getNode('text1') as TextNode).fontFamily).toBe('Inter');

      await userEvent.setup().click(screen.getByRole('button', { name: 'Allow Google Fonts' }));

      await waitFor(() => expect((sg.getNode('text1') as TextNode).fontFamily).toBe('Lobster'));
      expect(fetchMock).toHaveBeenCalledWith(findGoogleFont('Lobster')?.url(400));
    });

    it('leaves the family as it was when Google Fonts are declined', async () => {
      const sg = renderWithSceneGraph();
      render(<PromptDialogHost />);
      addTextIn(sg, 'Inter');

      await pick('Lobster');
      await userEvent.setup().click(await screen.findByTestId('prompt-dialog-cancel'));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

      expect((sg.getNode('text1') as TextNode).fontFamily).toBe('Inter');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('textSizeUpdate', () => {
    it('takes the text scale out of the size typed in', () => {
      const node: TextNode = {
        ...createTestText('t', 'T'),
        transform: { ...createDefaultTransform(), scale: { x: 2, y: 2 } },
      };
      expect(textSizeUpdate(node, 200, 100, true)).toMatchObject({
        textResize: 'fixed',
        boxWidth: 100,
        boxHeight: 50,
      });
      expect(textSizeUpdate(node, 200, 100, false)).toMatchObject({
        textResize: 'auto-height',
        boxWidth: 100,
        boxHeight: undefined,
      });
    });
  });

  describe('document background', () => {
    it('is set from the panel when nothing is selected', () => {
      const sg = renderWithSceneGraph();
      act(() => useEditorStore.getState().resetProject());

      const input = screen.getByTestId('document-background-input');
      expect(input).toHaveValue('#1A1A1A');

      act(() => {
        fireEvent.change(input, { target: { value: '#F0ECE4' } });
      });
      const state = useEditorStore.getState();
      expect(state.documentBackground).toEqual({ r: 240, g: 236, b: 228, a: 1 });
      expect(state.isDirty).toBe(true);
      expect(screen.getByTestId('document-background-swatch')).toHaveAttribute(
        'aria-label',
        'Background color: #F0ECE4'
      );

      // A selection shows its own properties instead
      act(() => {
        sg.addNode(createTestRect('rect1', 'Rectangle 1'));
        useEditorStore.getState().setSelection(['rect1']);
      });
      expect(screen.queryByTestId('document-section')).toBeNull();
    });

    it('ignores a half-typed color', () => {
      renderWithSceneGraph();
      act(() => useEditorStore.getState().resetProject());

      act(() => {
        fireEvent.change(screen.getByTestId('document-background-input'), {
          target: { value: '#F0E' },
        });
      });
      expect(useEditorStore.getState().documentBackground).toEqual({ r: 26, g: 26, b: 26, a: 1 });
    });

    it('starts each new project on the default color', () => {
      act(() => useEditorStore.getState().setDocumentBackground({ r: 1, g: 2, b: 3, a: 1 }));
      act(() => useEditorStore.getState().resetProject());
      expect(useEditorStore.getState().documentBackground).toEqual({ r: 26, g: 26, b: 26, a: 1 });
    });
  });

  describe('Vertex section: point type and handles', () => {
    function setup(points: PathNode['points'], picked: number[]) {
      const sg = renderWithSceneGraph();
      const pathNode: PathNode = {
        id: 'p1',
        name: 'Path',
        type: 'path',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        closed: false,
        points,
        fills: [],
        strokes: [],
      };
      act(() => {
        sg.addNode(pathNode);
        useEditorStore.getState().setSelection(['p1']);
        useEditorStore.setState({
          activeTool: 'direct-selection',
          directSelectionPoints: picked.map((pointIndex) => ({ nodeId: 'p1', pointIndex })),
        });
      });
      return sg;
    }
    const corner = (x: number, y: number) => ({
      position: { x, y },
      handleIn: null,
      handleOut: null,
      type: 'corner' as const,
    });

    it("shows the picked points' type, and turns a corner smooth", () => {
      const sg = setup([corner(0, 0), corner(100, 0), corner(200, 0)], [1]);

      expect(screen.getByTestId('vertex-type-corner')).toHaveAttribute('aria-pressed', 'true');
      act(() => {
        fireEvent.click(screen.getByTestId('vertex-type-smooth'));
      });

      const point = (sg.getNode('p1') as PathNode).points[1]!;
      expect(point.type).toBe('smooth');
      expect(point.handleOut!.x).toBeGreaterThan(0);
      expect(point.handleIn!.x).toBeLessThan(0);
    });

    it('edits a handle in numbers, the other turning with it on a smooth point', () => {
      const sg = setup(
        [
          corner(0, 0),
          {
            ...corner(100, 0),
            handleIn: { x: -30, y: 0 },
            handleOut: { x: 30, y: 0 },
            type: 'smooth',
          },
        ],
        [1]
      );

      expect(screen.getByTestId('vertex-handle-out-x')).toHaveValue('30.0');
      act(() => {
        fireEvent.change(screen.getByTestId('vertex-handle-out-y'), { target: { value: '30' } });
      });

      const point = (sg.getNode('p1') as PathNode).points[1]!;
      expect(point.handleOut).toEqual({ x: 30, y: 30 });
      // Still in line, still 30 long
      expect(point.handleIn!.x).toBeCloseTo(-30 / Math.SQRT2);
      expect(point.handleIn!.y).toBeCloseTo(-30 / Math.SQRT2);
    });

    it("switches a path's fill rule", () => {
      const sg = setup([corner(0, 0), corner(100, 0), corner(50, 80)], []);
      act(() => {
        useEditorStore.setState({ activeTool: 'selection' });
      });
      act(() => {
        fireEvent.change(screen.getByTestId('path-fill-rule'), { target: { value: 'evenodd' } });
      });
      expect((sg.getNode('p1') as PathNode).fillRule).toBe('evenodd');
    });

    it('shows no handle fields with several points picked', () => {
      setup([corner(0, 0), { ...corner(100, 0), handleOut: { x: 30, y: 0 } }], [0, 1]);
      expect(screen.queryByTestId('vertex-handle-out-x')).toBeNull();
    });
  });

  describe('symbol instance', () => {
    it('styles Edit Symbol and Detach as the panel’s other buttons', () => {
      const sg = renderWithSceneGraph();
      act(() => {
        useEditorStore.setState({
          symbols: [
            {
              id: 'badge',
              name: 'Badge',
              sceneGraphJSON: { nodes: [createTestRect('r', 'Rect')], rootNodeIds: ['r'] },
            },
          ],
        });
        sg.addNode({
          ...createTestRect('inst', 'Badge'),
          type: 'symbol-instance',
          symbolId: 'badge',
          overrides: [],
        } as unknown as Node);
        useEditorStore.getState().setSelection(['inst']);
      });

      for (const id of ['edit-symbol-button', 'detach-instance-button']) {
        expect(screen.getByTestId(id).className).toContain('booleanOpButton');
      }
      act(() => useEditorStore.setState({ symbols: [] }));
    });
  });
});
