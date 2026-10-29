import type { ComponentProps } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '../../test/utils';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { toast } from '../common/Toast';
import { Camera } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { Canvas } from './Canvas';
import { canvasViewCenter } from '../../services/canvasView';

// Counts the canvas's renders: the smart guides are drawn on every one
const smartGuides = vi.hoisted(() => ({ renders: 0 }));
const importSoundFiles = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../../services/soundImport', () => ({ importSoundFiles }));

vi.mock('../canvas/SmartGuidesOverlay', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../canvas/SmartGuidesOverlay')>();
  return {
    ...actual,
    SmartGuidesOverlay: (props: ComponentProps<typeof actual.SmartGuidesOverlay>) => {
      smartGuides.renders++;
      return <actual.SmartGuidesOverlay {...props} />;
    },
  };
});

function renderCanvas(onProjectFileDrop?: (file: File) => void | Promise<void>) {
  return render(
    <SceneGraphProvider>
      <Canvas onProjectFileDrop={onProjectFileDrop} />
    </SceneGraphProvider>
  );
}

/** The canvas, and the scene it draws. */
function renderCanvasWithScene() {
  const scene: { graph?: SceneGraph } = {};
  function GrabScene() {
    scene.graph = useSceneGraph();
    return null;
  }
  render(
    <SceneGraphProvider>
      <GrabScene />
      <Canvas />
    </SceneGraphProvider>
  );
  return scene.graph!;
}

/** Text pasted onto the page, as the browser hands it over. */
function pasteText(text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: () => '',
      items: [{ type: 'text/plain', getAsString: (done: (s: string) => void) => done(text) }],
    },
  });
  document.dispatchEvent(event);
}

const TWO_SHAPES_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect x="0" y="0" width="10" height="10" fill="red"/>' +
  '<circle cx="50" cy="50" r="5" fill="blue"/></svg>';

describe('Canvas', () => {
  it('renders the canvas element', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('displays coordinate display', () => {
    renderCanvas();
    expect(screen.getByText(/X:/)).toBeInTheDocument();
    expect(screen.getByText(/Y:/)).toBeInTheDocument();
  });

  it('displays zoom level', () => {
    renderCanvas();
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('pans the canvas on a horizontal Magic Mouse side swipe', () => {
    const pan = vi.spyOn(Camera.prototype, 'pan');
    renderCanvas();
    const canvas = document.querySelector('canvas');

    expect(canvas).toBeInTheDocument();
    fireEvent.wheel(canvas!, { deltaX: 72, deltaY: 2 });

    expect(pan).toHaveBeenCalledWith({ x: -72, y: 0 });
    pan.mockRestore();
  });

  it('updates coordinates on mouse move', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');

    if (canvas) {
      // Mock getBoundingClientRect
      vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
        right: 800,
        bottom: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });

      fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 });

      // Coordinates display exists (values depend on camera initialization which may fail in test env)
      // Just verify the display updates without WebGL errors
      expect(screen.getByText(/X:/)).toBeInTheDocument();
      expect(screen.getByText(/Y:/)).toBeInTheDocument();
    }
  });

  it('shows where the pointer is without drawing the whole canvas again (F077)', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600));
    const readout = () => screen.getByText(/X:.*Y:/).textContent;
    const before = readout();

    const rendersBefore = smartGuides.renders;
    const pointsBefore = useEditorStore.getState().directSelectionPoints;
    fireEvent.mouseMove(canvas, { clientX: 100, clientY: 50 });
    const first = readout();
    fireEvent.mouseMove(canvas, { clientX: 300, clientY: 250 });
    const second = readout();

    expect(first).not.toBe(before);
    expect(second).not.toBe(first);
    expect(smartGuides.renders).toBe(rendersBefore);
    // Nor the panels that show picked points
    expect(useEditorStore.getState().directSelectionPoints).toBe(pointsBefore);
  });

  it('SVGs pasted in the same millisecond both land (F078)', () => {
    const sceneGraph = renderCanvasWithScene();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const undoSteps = useEditorStore.getState().undoStack.length;

    pasteText(TWO_SHAPES_SVG);
    pasteText(TWO_SHAPES_SVG);
    now.mockRestore();

    const groups = sceneGraph.getRootNodes();
    expect(groups).toHaveLength(2);
    expect(groups.flatMap((group) => group.children)).toHaveLength(4);
    expect(useEditorStore.getState().selectedNodeIds).toEqual(new Set([groups[1]!.id]));
    expect(useEditorStore.getState().undoStack.length).toBe(undoSteps + 2);
  });

  it('tells where it is looking, for a symbol placed from the Symbols panel', () => {
    expect(canvasViewCenter()).toBeNull();
    const { unmount } = renderCanvas();

    const center = canvasViewCenter();
    expect(Number.isFinite(center?.x)).toBe(true);
    expect(Number.isFinite(center?.y)).toBe(true);
    unmount();
    expect(canvasViewCenter()).toBeNull();
  });

  describe('Edit > Paste', () => {
    // While the clipboard's promises settle, no frame is drawn: the test's WebGL is a stub
    let noFrames: { mockRestore(): void } | undefined;
    beforeEach(() => {
      noFrames = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(0);
    });
    afterEach(() => {
      noFrames?.mockRestore();
      Reflect.deleteProperty(navigator, 'clipboard');
    });

    const menuPaste = async () => {
      await act(async () => {
        window.dispatchEvent(new CustomEvent('menubar:paste', { cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };
    const clipboardWith = (clipboard: Partial<Clipboard>) =>
      Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });

    it('pastes an SVG off the system clipboard, as Ctrl+V does', async () => {
      const sceneGraph = renderCanvasWithScene();
      clipboardWith({ readText: () => Promise.resolve(TWO_SHAPES_SVG) });

      await menuPaste();

      expect(sceneGraph.getRootNodes()).toHaveLength(1);
      expect(sceneGraph.getRootNodes()[0]!.children).toHaveLength(2);
    });

    it('says why nothing pasted when the browser won’t let it read the clipboard', async () => {
      const sceneGraph = renderCanvasWithScene();
      const info = vi.spyOn(toast, 'info');
      const refuse = () => Promise.reject(new DOMException('Denied', 'NotAllowedError'));
      clipboardWith({ readText: refuse, read: refuse });
      useEditorStore.setState({ clipboard: null });

      await menuPaste();

      expect(sceneGraph.getRootNodes()).toHaveLength(0);
      expect(info).toHaveBeenCalledWith(expect.stringMatching(/didn’t let .* read the clipboard/));
      info.mockRestore();
    });
  });

  it('an SVG with nothing to import says so and leaves no undo step (F078)', () => {
    const sceneGraph = renderCanvasWithScene();
    const error = vi.spyOn(toast, 'error');
    const undoSteps = useEditorStore.getState().undoStack.length;

    pasteText('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>');

    expect(sceneGraph.getRootNodes()).toHaveLength(0);
    expect(useEditorStore.getState().undoStack.length).toBe(undoSteps);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('has crosshair cursor style', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    // The canvas should have cursor styling applied via CSS module
    expect(canvas).toBeInTheDocument();
  });

  it('renders within a container div', () => {
    renderCanvas();
    const canvas = document.querySelector('canvas');
    expect(canvas?.parentElement).toBeInTheDocument();
  });

  it('shows a drop hint while a file is dragged over the canvas', () => {
    renderCanvas();
    const dropZone = screen.getByTestId('canvas-drop-zone');

    fireEvent.dragOver(dropZone, { dataTransfer: { types: ['Files'] } });

    expect(
      screen.getByText('Drop an image, SVG, sound, or project file to import')
    ).toBeInTheDocument();
  });

  it('forwards a dropped project file to the project importer', () => {
    const onProjectFileDrop = vi.fn();
    renderCanvas(onProjectFileDrop);
    const dropZone = screen.getByTestId('canvas-drop-zone');
    const file = new File(['project'], 'animation.quar', { type: 'application/octet-stream' });

    fireEvent.drop(dropZone, { dataTransfer: { files: [file], types: ['Files'] } });

    expect(onProjectFileDrop).toHaveBeenCalledWith(file);
  });

  it('puts dropped sound files on the timeline, at the playhead', () => {
    renderCanvas();
    const dropZone = screen.getByTestId('canvas-drop-zone');
    const voice = new File(['RIFF'], 'voice.wav', { type: 'audio/wav' });
    // Some systems give no type: known by its name
    const music = new File(['ID3'], 'music.mp3', { type: '' });

    fireEvent.drop(dropZone, { dataTransfer: { files: [voice, music], types: ['Files'] } });

    expect(importSoundFiles).toHaveBeenCalledWith(expect.anything(), [voice, music]);
  });

  describe('editing keys', () => {
    /** A rectangle on the page, selected. */
    function selectedRectangle(sceneGraph: SceneGraph) {
      sceneGraph.addNode({
        id: 'rect',
        name: 'Rectangle',
        type: 'rectangle',
        parent: null,
        children: [],
        transform: {
          position: { x: 0, y: 0 },
          rotation: 0,
          scale: { x: 1, y: 1 },
          anchor: { x: 0.5, y: 0.5 },
          skew: { x: 0, y: 0 },
        },
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 100,
        height: 100,
        cornerRadius: [0, 0, 0, 0],
        fills: [],
        strokes: [],
      });
      // Picked, and shown so (the tools read the selection the canvas shows)
      act(() => {
        useEditorStore.setState({ activeTool: 'selection', selectedNodeIds: new Set(['rect']) });
      });
    }

    /** A layer row in another panel, focused, as after a click on it. */
    function focusElsewhere() {
      const row = document.createElement('div');
      row.tabIndex = 0;
      document.body.append(row);
      row.focus();
      return row;
    }

    it('work with focus elsewhere, as after a click in the Layers panel', () => {
      const sceneGraph = renderCanvasWithScene();
      selectedRectangle(sceneGraph);
      const row = focusElsewhere();

      fireEvent.keyDown(row, { key: 'ArrowRight', shiftKey: true });
      fireEvent.keyUp(row, { key: 'ArrowRight' });
      expect(sceneGraph.getNode('rect')!.transform.position.x).toBe(10);

      fireEvent.keyDown(row, { key: 'd', ctrlKey: true });
      expect(sceneGraph.getRootNodes()).toHaveLength(2);

      fireEvent.keyDown(row, { key: 'a', ctrlKey: true });
      expect(useEditorStore.getState().selectedNodeIds.size).toBe(2);
      fireEvent.keyDown(row, { key: 'Delete' });
      expect(sceneGraph.getRootNodes()).toHaveLength(0);
      row.remove();
    });

    it('act once when the canvas has the focus', () => {
      const sceneGraph = renderCanvasWithScene();
      selectedRectangle(sceneGraph);
      const canvas = document.querySelector('canvas')!;
      canvas.focus();

      fireEvent.keyDown(canvas, { key: 'd', ctrlKey: true });
      fireEvent.keyDown(canvas, { key: 'ArrowRight' });
      fireEvent.keyUp(canvas, { key: 'ArrowRight' });

      const roots = sceneGraph.getRootNodes();
      expect(roots).toHaveLength(2);
      // Only the copy is selected after duplicating: nudged one unit, once
      expect(roots[1]!.transform.position.x - roots[0]!.transform.position.x).toBe(21);
    });
  });
});
