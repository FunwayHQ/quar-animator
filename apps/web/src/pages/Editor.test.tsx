import { describe, it, expect } from 'vitest';
import { render, screen } from '../test/utils';
import { Editor } from './Editor';

describe('Editor Page', () => {
  it('renders the complete editor layout', () => {
    render(<Editor />);

    // MenuBar should be present
    expect(screen.getByAltText('Quar Animator')).toBeInTheDocument();

    // Toolbar should be present
    expect(screen.getByTitle('Selection (V)')).toBeInTheDocument();

    // Canvas should be present
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();

    // Properties panel should be present
    expect(screen.getByRole('heading', { name: 'Properties' })).toBeInTheDocument();

    // Layers panel should be present
    expect(screen.getByRole('heading', { name: 'Layers' })).toBeInTheDocument();

    // Timeline should be present
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
  });

  it('renders menu bar with all menus', () => {
    render(<Editor />);

    const menus = ['File', 'Edit', 'View', 'Animation', 'Rigging', 'Export', 'Help'];
    menus.forEach((menu) => {
      expect(screen.getByRole('button', { name: menu })).toBeInTheDocument();
    });
  });

  it('renders toolbar with all tools', () => {
    render(<Editor />);

    const tools = [
      'Selection (V)',
      'Direct Selection (A)',
      'Rectangle (R)',
      'Ellipse (O)',
      'Pen (P)',
      'Brush (B)',
      'Eraser (E)',
      'Text (T)',
      'Bone (J)',
    ];

    tools.forEach((tool) => {
      expect(screen.getByTitle(tool)).toBeInTheDocument();
    });
  });

  it('renders properties panel with empty state when nothing selected', () => {
    render(<Editor />);

    expect(screen.getByText('Select an object to view properties')).toBeInTheDocument();
  });

  it('renders layers panel with empty state', () => {
    render(<Editor />);

    // LayerPanel shows empty state when no shapes have been drawn
    expect(screen.getByText('No layers yet')).toBeInTheDocument();
  });

  it('renders timeline with playback controls', () => {
    render(<Editor />);

    expect(screen.getByTitle('Go to start (Home)')).toBeInTheDocument();
    expect(screen.getByTitle('Previous frame (,)')).toBeInTheDocument();
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
    expect(screen.getByTitle('Next frame (.)')).toBeInTheDocument();
    expect(screen.getByTitle('Go to end (End)')).toBeInTheDocument();
  });

  it('renders timeline with time display', () => {
    render(<Editor />);

    expect(screen.getByText('00:00:00')).toBeInTheDocument();
    expect(screen.getByText('00:10:00')).toBeInTheDocument();
  });

  it('renders timeline options', () => {
    render(<Editor />);

    expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle onion skinning (Shift+O)')).toBeInTheDocument();
  });

  it('shows project name in menu bar', () => {
    render(<Editor />);
    expect(screen.getByText('Untitled Project')).toBeInTheDocument();
  });

  it('renders canvas with coordinate display', () => {
    render(<Editor />);
    expect(screen.getByText(/X:/)).toBeInTheDocument();
    expect(screen.getByText(/Y:/)).toBeInTheDocument();
  });

  it('renders canvas with zoom display', () => {
    render(<Editor />);
    expect(screen.getByText('100%')).toBeInTheDocument();
  });
});
