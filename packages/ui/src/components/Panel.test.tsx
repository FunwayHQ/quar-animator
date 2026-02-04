import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Panel } from './Panel';

describe('Panel', () => {
  it('renders with title', () => {
    render(<Panel title="Test Panel">Content</Panel>);
    expect(screen.getByText('Test Panel')).toBeInTheDocument();
  });

  it('renders children content', () => {
    render(<Panel title="Panel">Panel content here</Panel>);
    expect(screen.getByText('Panel content here')).toBeInTheDocument();
  });

  it('is expanded by default', () => {
    render(<Panel title="Panel">Content</Panel>);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('can be collapsed by default', () => {
    render(<Panel title="Panel" defaultExpanded={false}>Hidden content</Panel>);
    expect(screen.queryByText('Hidden content')).not.toBeInTheDocument();
  });

  it('toggles content on header click', async () => {
    const user = userEvent.setup();
    render(<Panel title="Clickable">Toggle content</Panel>);

    expect(screen.getByText('Toggle content')).toBeInTheDocument();

    await user.click(screen.getByText('Clickable'));
    expect(screen.queryByText('Toggle content')).not.toBeInTheDocument();

    await user.click(screen.getByText('Clickable'));
    expect(screen.getByText('Toggle content')).toBeInTheDocument();
  });

  it('calls onExpandedChange when toggled', async () => {
    const onExpandedChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Panel title="Panel" onExpandedChange={onExpandedChange}>
        Content
      </Panel>
    );

    await user.click(screen.getByText('Panel'));
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    await user.click(screen.getByText('Panel'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });

  it('can be controlled externally', () => {
    const { rerender } = render(
      <Panel title="Controlled" expanded={true}>
        Content
      </Panel>
    );

    expect(screen.getByText('Content')).toBeInTheDocument();

    rerender(
      <Panel title="Controlled" expanded={false}>
        Content
      </Panel>
    );

    expect(screen.queryByText('Content')).not.toBeInTheDocument();
  });

  it('can be non-collapsible', async () => {
    const user = userEvent.setup();
    render(
      <Panel title="Fixed" collapsible={false}>
        Always visible
      </Panel>
    );

    await user.click(screen.getByText('Fixed'));
    expect(screen.getByText('Always visible')).toBeInTheDocument();
  });

  it('renders header actions', () => {
    render(
      <Panel
        title="With Actions"
        headerActions={<button>Action</button>}
      >
        Content
      </Panel>
    );

    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });

  it('header actions click does not toggle panel', async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();

    render(
      <Panel
        title="Panel"
        headerActions={<button onClick={onAction}>Action</button>}
      >
        Content
      </Panel>
    );

    await user.click(screen.getByRole('button', { name: 'Action' }));
    expect(onAction).toHaveBeenCalled();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
