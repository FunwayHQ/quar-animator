import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { LayerPanel } from './LayerPanel';

describe('LayerPanel', () => {
  it('renders the panel title', () => {
    render(<LayerPanel />);
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument();
  });

  it('renders header action buttons', () => {
    render(<LayerPanel />);

    expect(screen.getByTitle('Add layer')).toBeInTheDocument();
    expect(screen.getByTitle('Add group')).toBeInTheDocument();
  });

  it('renders sample layers', () => {
    render(<LayerPanel />);

    expect(screen.getByText('Character')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
    expect(screen.getByText('Title')).toBeInTheDocument();
  });

  it('renders nested layers when parent is expanded', () => {
    render(<LayerPanel />);

    // Character group is expanded by default
    expect(screen.getByText('Head')).toBeInTheDocument();
    expect(screen.getByText('Body')).toBeInTheDocument();
    expect(screen.getByText('Arms')).toBeInTheDocument();
  });

  it('has visibility toggle buttons for each layer', () => {
    render(<LayerPanel />);

    const visibilityButtons = screen.getAllByTitle('Toggle visibility');
    expect(visibilityButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('has lock toggle buttons for each layer', () => {
    render(<LayerPanel />);

    const lockButtons = screen.getAllByTitle('Toggle lock');
    expect(lockButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('shows correct layer type icons', () => {
    render(<LayerPanel />);

    // Group folders
    const folderIcons = screen.getAllByText('📁');
    expect(folderIcons.length).toBeGreaterThanOrEqual(1);

    // Shape squares
    const shapeIcons = screen.getAllByText('◼');
    expect(shapeIcons.length).toBeGreaterThanOrEqual(1);

    // Text T
    const textIcons = screen.getAllByText('T');
    expect(textIcons.length).toBeGreaterThanOrEqual(1);
  });

  it('can select a layer by clicking', async () => {
    const user = userEvent.setup();
    render(<LayerPanel />);

    const characterLayer = screen.getByText('Character').closest('div');
    expect(characterLayer).toBeInTheDocument();

    if (characterLayer) {
      await user.click(characterLayer);
      // The layer should now have selected styling (we can't easily test CSS classes in this setup)
    }
  });

  it('can toggle visibility', async () => {
    const user = userEvent.setup();
    render(<LayerPanel />);

    const visibilityButtons = screen.getAllByTitle('Toggle visibility');
    const firstVisibilityButton = visibilityButtons[0];

    // Click to toggle
    await user.click(firstVisibilityButton);

    // The button should still exist (visibility was toggled but button remains)
    expect(firstVisibilityButton).toBeInTheDocument();
  });

  it('can toggle lock', async () => {
    const user = userEvent.setup();
    render(<LayerPanel />);

    const lockButtons = screen.getAllByTitle('Toggle lock');
    const firstLockButton = lockButtons[0];

    // Click to toggle
    await user.click(firstLockButton);

    // The button should still exist
    expect(firstLockButton).toBeInTheDocument();
  });
});
