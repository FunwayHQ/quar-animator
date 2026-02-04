import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { Toolbar } from './Toolbar';

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
      'Bone (Shift+B)',
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
});
