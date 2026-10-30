/**
 * Tests for the canvas without WebGL 2: a browser that can't give it, or
 * one whose graphics stop and don't come back, says so over the canvas
 * rather than leaving it blank.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent } from '../../test/utils';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { getHelpPanel, closeHelp } from '../help/helpPanel';
import { Canvas } from './Canvas';

function renderCanvas() {
  return render(
    <SceneGraphProvider>
      <Canvas />
    </SceneGraphProvider>
  );
}

const realGetContext = HTMLCanvasElement.prototype.getContext;

/** A browser with WebGL 2 off: getContext('webgl2') gives nothing. */
function withoutWebGL2() {
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    type: string,
    ...rest: unknown[]
  ) {
    if (type === 'webgl2') return null;
    return (realGetContext as (...args: unknown[]) => unknown).call(this, type, ...rest);
  } as typeof HTMLCanvasElement.prototype.getContext;
}

// The editor logs why it couldn't start WebGL: kept out of the test output
const quiet = () => vi.spyOn(console, 'error').mockImplementation(() => {});

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = realGetContext;
  vi.useRealTimers();
  closeHelp();
});

describe('Canvas without WebGL 2', () => {
  it('says the browser can’t draw the canvas, and what to do', () => {
    const logged = quiet();
    withoutWebGL2();
    renderCanvas();
    logged.mockRestore();

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('This browser can’t draw the canvas');
    expect(message).toHaveTextContent(/WebGL 2/);
    expect(message).toHaveTextContent(/hardware acceleration/i);
    expect(message).toHaveTextContent(/restart/i);
    expect(message).toHaveTextContent(/Update the browser/i);
    expect(message).toHaveTextContent(/another/i);
  });

  it('opens the guide’s page on it', () => {
    const logged = quiet();
    withoutWebGL2();
    renderCanvas();
    logged.mockRestore();

    fireEvent.click(screen.getByRole('button', { name: /user guide/i }));

    expect(getHelpPanel()).toMatchObject({
      open: true,
      page: 'troubleshooting',
      anchor: 'webgl',
    });
  });

  it('shows nothing when WebGL 2 works', () => {
    renderCanvas();
    expect(screen.queryByTestId('canvas-unavailable')).not.toBeInTheDocument();
  });
});

describe('Canvas whose WebGL context is lost', () => {
  const lose = (canvas: HTMLCanvasElement) =>
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });

  it('says so when the graphics don’t come back', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderCanvas();
    const canvas = document.querySelector('canvas')!;

    lose(canvas);
    // The browser usually gives the context back at once: no message meanwhile
    expect(screen.queryByTestId('canvas-unavailable')).not.toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    const message = screen.getByRole('alert');
    expect(message).toHaveTextContent('The canvas stopped drawing');
    expect(message).toHaveTextContent(/Reload the page/i);
    expect(message).toHaveTextContent(/Download as \.quar/);
  });

  it('says nothing when the browser gives the context back', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderCanvas();
    const canvas = document.querySelector('canvas')!;

    lose(canvas);
    act(() => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('canvas-unavailable')).not.toBeInTheDocument();
  });
});

describe('Canvas drawing', () => {
  it('keeps drawing after a frame that fails, and says so once', async () => {
    const { useEditorStore } = await import('../../stores/editorStore');
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const logged = quiet();
    renderCanvas();
    await vi.waitFor(() => expect(frames.length).toBeGreaterThan(0));
    const background = useEditorStore.getState().documentBackground;

    // Something in the scene the frame can't draw (here: no background at all)
    act(() => useEditorStore.setState({ documentBackground: null as never }));
    for (let i = 0; i < 3; i++) {
      const asked = frames.length;
      frames[frames.length - 1]!(0);
      // The next frame was asked for all the same
      expect(frames.length).toBe(asked + 1);
    }
    const failures = logged.mock.calls.filter(
      ([said]) => said === 'A canvas frame failed to draw:'
    );
    expect(failures).toHaveLength(1);

    act(() => useEditorStore.setState({ documentBackground: background }));
    logged.mockRestore();
    vi.mocked(window.requestAnimationFrame).mockRestore();
  });
});
