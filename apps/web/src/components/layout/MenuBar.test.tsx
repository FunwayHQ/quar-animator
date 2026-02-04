import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import { MenuBar } from './MenuBar';

describe('MenuBar', () => {
  it('renders the logo', () => {
    render(<MenuBar />);
    const logo = screen.getByAltText('Quar Animator');
    expect(logo).toBeInTheDocument();
  });

  it('renders all menu items', () => {
    render(<MenuBar />);

    const menuItems = ['File', 'Edit', 'View', 'Animation', 'Rigging', 'Export', 'Help'];
    menuItems.forEach((item) => {
      expect(screen.getByRole('button', { name: item })).toBeInTheDocument();
    });
  });

  it('renders project name', () => {
    render(<MenuBar />);
    expect(screen.getByText('Untitled Project')).toBeInTheDocument();
  });

  it('has correct structure with header, nav, and actions', () => {
    render(<MenuBar />);

    // Check for header element
    const header = screen.getByRole('banner');
    expect(header).toBeInTheDocument();

    // Check for navigation
    const nav = screen.getByRole('navigation');
    expect(nav).toBeInTheDocument();

    // All menu buttons should be within navigation
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBe(7);
  });
});
