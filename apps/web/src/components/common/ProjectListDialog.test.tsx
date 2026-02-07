/**
 * Tests for ProjectListDialog Component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { ProjectListDialog } from './ProjectListDialog';
import type { ProjectListItem } from '../../services/projectStorage';

const mockProjects: ProjectListItem[] = [
  { id: 'proj1', name: 'First Project', updatedAt: '2024-06-15T10:00:00.000Z' },
  { id: 'proj2', name: 'Second Project', updatedAt: '2024-06-16T14:30:00.000Z' },
  { id: 'proj3', name: 'Third Project', updatedAt: '2024-06-17T09:15:00.000Z' },
];

describe('ProjectListDialog', () => {
  it('should render dialog with title', () => {
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Open Project')).toBeInTheDocument();
  });

  it('should render all projects', () => {
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('First Project')).toBeInTheDocument();
    expect(screen.getByText('Second Project')).toBeInTheDocument();
    expect(screen.getByText('Third Project')).toBeInTheDocument();
  });

  it('should show empty state when no projects', () => {
    render(
      <ProjectListDialog projects={[]} onOpen={vi.fn()} onDelete={vi.fn()} onClose={vi.fn()} />
    );
    expect(screen.getByTestId('project-list-empty')).toBeInTheDocument();
    expect(screen.getByText('No saved projects yet')).toBeInTheDocument();
  });

  it('should call onOpen when a project is clicked', () => {
    const onOpen = vi.fn();
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={onOpen}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('project-item-proj2'));
    expect(onOpen).toHaveBeenCalledWith('proj2');
  });

  it('should require double-click to delete (confirmation)', () => {
    const onDelete = vi.fn();
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={onDelete}
        onClose={vi.fn()}
      />
    );
    // First click — shows confirmation state
    fireEvent.click(screen.getByTestId('project-delete-proj1'));
    expect(onDelete).not.toHaveBeenCalled();

    // Second click — confirms deletion
    fireEvent.click(screen.getByTestId('project-delete-proj1'));
    expect(onDelete).toHaveBeenCalledWith('proj1');
  });

  it('should call onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('project-dialog-overlay'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should call onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('should render as a dialog with accessible role', () => {
    render(
      <ProjectListDialog
        projects={mockProjects}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
