import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from './Toolbar';

describe('Toolbar', () => {
  it('renders children', () => {
    render(
      <Toolbar>
        <button>Tool 1</button>
        <button>Tool 2</button>
      </Toolbar>
    );

    expect(screen.getByRole('button', { name: 'Tool 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tool 2' })).toBeInTheDocument();
  });

  it('has toolbar role', () => {
    render(
      <Toolbar>
        <button>Tool</button>
      </Toolbar>
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
  });

  it('renders horizontal by default', () => {
    const { container } = render(
      <Toolbar>
        <button>Tool</button>
      </Toolbar>
    );

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toHaveStyle({ flexDirection: undefined });
  });

  it('renders vertical orientation', () => {
    const { container } = render(
      <Toolbar orientation="vertical">
        <button>Tool</button>
      </Toolbar>
    );

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar).toHaveStyle({ flexDirection: 'column' });
  });

  it('supports custom className', () => {
    render(
      <Toolbar className="custom-toolbar">
        <button>Tool</button>
      </Toolbar>
    );

    expect(screen.getByRole('toolbar')).toHaveClass('custom-toolbar');
  });

  it('accepts custom style prop', () => {
    const { container } = render(
      <Toolbar style={{ padding: '20px' }}>
        <button>Tool</button>
      </Toolbar>
    );

    const toolbar = container.querySelector('[role="toolbar"]');
    expect(toolbar?.getAttribute('style')).toContain('padding: 20px');
  });
});

describe('ToolbarGroup', () => {
  it('renders children', () => {
    render(
      <ToolbarGroup>
        <button>Group Item 1</button>
        <button>Group Item 2</button>
      </ToolbarGroup>
    );

    expect(screen.getByRole('button', { name: 'Group Item 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Group Item 2' })).toBeInTheDocument();
  });

  it('has group role', () => {
    render(
      <ToolbarGroup>
        <button>Item</button>
      </ToolbarGroup>
    );

    expect(screen.getByRole('group')).toBeInTheDocument();
  });

  it('supports custom className', () => {
    render(
      <ToolbarGroup className="custom-group">
        <button>Item</button>
      </ToolbarGroup>
    );

    expect(screen.getByRole('group')).toHaveClass('custom-group');
  });
});

describe('ToolbarSeparator', () => {
  it('renders separator', () => {
    render(<ToolbarSeparator />);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('renders horizontal separator by default', () => {
    render(<ToolbarSeparator />);
    const separator = screen.getByRole('separator');
    expect(separator).toHaveStyle({ width: '1px' });
  });

  it('renders vertical separator', () => {
    render(<ToolbarSeparator orientation="vertical" />);
    const separator = screen.getByRole('separator');
    expect(separator).toHaveStyle({ height: '1px' });
  });
});

describe('Toolbar composition', () => {
  it('renders complete toolbar with groups and separators', () => {
    render(
      <Toolbar>
        <ToolbarGroup>
          <button>Tool 1</button>
          <button>Tool 2</button>
        </ToolbarGroup>
        <ToolbarSeparator />
        <ToolbarGroup>
          <button>Tool 3</button>
        </ToolbarGroup>
      </Toolbar>
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.getByRole('separator')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('works with Toolbar.Group and Toolbar.Separator', () => {
    render(
      <Toolbar>
        <Toolbar.Group>
          <button>A</button>
        </Toolbar.Group>
        <Toolbar.Separator />
        <Toolbar.Group>
          <button>B</button>
        </Toolbar.Group>
      </Toolbar>
    );

    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(2);
    expect(screen.getByRole('separator')).toBeInTheDocument();
  });
});
