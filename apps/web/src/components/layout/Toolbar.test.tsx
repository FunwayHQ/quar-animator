import { describe, it, expect } from 'vitest';
import { act, render as renderWith, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { createDefaultTransform } from '@quar/core';
import type { SceneGraph } from '@quar/core';
import { SceneGraphProvider, useSceneGraph } from '../../contexts/SceneGraphContext';
import { usePresentation } from '../presentation/presentation';
import { Toolbar } from './Toolbar';

/** The toolbar in the editor's scene (`scene` gets it). */
function render(ui: React.ReactElement, scene?: (sg: SceneGraph) => void) {
  function Capture() {
    scene?.(useSceneGraph());
    return null;
  }
  return renderWith(
    <SceneGraphProvider>
      <Capture />
      {ui}
    </SceneGraphProvider>
  );
}

describe('Toolbar', () => {
  it('renders all tool buttons', () => {
    render(<Toolbar />);

    const toolLabels = [
      'Selection (V)',
      'Direct Selection (A)',
      'Rectangle (R)',
      'Ellipse (O)',
      'Pen (P)',
      'Brush (B)',
      'Eraser (E)',
      'Text (T)',
      'Bone (J)',
      'Artboard (F)',
    ];

    toolLabels.forEach((label) => {
      expect(screen.getByTitle(label)).toBeInTheDocument();
    });
  });

  it('has selection tool active by default', () => {
    render(<Toolbar />);

    const selectionButton = screen.getByTitle('Selection (V)');
    expect(selectionButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('changes active tool when clicked', async () => {
    const user = userEvent.setup();
    render(<Toolbar />);

    const selectionButton = screen.getByTitle('Selection (V)');
    const rectangleButton = screen.getByTitle('Rectangle (R)');

    // Initially selection is active
    expect(selectionButton).toHaveAttribute('aria-pressed', 'true');
    expect(rectangleButton).toHaveAttribute('aria-pressed', 'false');

    // Click rectangle tool
    await user.click(rectangleButton);

    // Now rectangle should be active
    expect(selectionButton).toHaveAttribute('aria-pressed', 'false');
    expect(rectangleButton).toHaveAttribute('aria-pressed', 'true');
  });

  it('has correct data-tool attributes', () => {
    render(<Toolbar />);

    const tools = [
      'selection',
      'direct-selection',
      'rectangle',
      'ellipse',
      'pen',
      'brush',
      'eraser',
      'text',
      'bone',
      'artboard',
    ];

    tools.forEach((tool) => {
      const button = document.querySelector(`[data-tool="${tool}"]`);
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('data-tool', tool);
    });
  });

  it('renders in a complementary aside element', () => {
    render(<Toolbar />);
    const aside = screen.getByRole('complementary');
    expect(aside).toBeInTheDocument();
  });

  it('offers to present the page’s artboards, once it has one', async () => {
    let sg: SceneGraph | null = null;
    render(<Toolbar />, (graph) => (sg = graph));
    expect(screen.queryByTestId('present-button')).toBeNull();
    act(() =>
      sg?.addNode({
        id: 'slide',
        name: 'Slide',
        type: 'artboard',
        parent: null,
        children: [],
        transform: createDefaultTransform(),
        visible: true,
        locked: false,
        opacity: 1,
        blendMode: 'normal',
        width: 100,
        height: 100,
        fills: [],
        clipContent: true,
      } as never)
    );
    await userEvent.click(screen.getByTestId('present-button'));
    expect(usePresentation.getState().open).toBe(true);
    usePresentation.setState({ open: false });
    // A hidden artboard isn't a slide
    act(() => sg?.updateNode('slide', { visible: false }));
    expect(screen.queryByTestId('present-button')).toBeNull();
  });
});
