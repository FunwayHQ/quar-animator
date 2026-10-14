/**
 * Tests for Projects Landing Page
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '../test/utils';
import { Projects } from './Projects';
import type { ProjectListItem } from '../services/projectStorage';
import { parseQuarFile, writeQuarFile } from '@quar/core';

// ============================================================================
// Mocks
// ============================================================================

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockProjects: ProjectListItem[] = [
  { id: 'proj_1', name: 'Walk Cycle', updatedAt: '2024-06-17T10:00:00.000Z' },
  { id: 'proj_2', name: 'Bouncing Ball', updatedAt: '2024-06-16T14:30:00.000Z' },
  { id: 'proj_3', name: 'Character Idle', updatedAt: '2024-06-15T09:15:00.000Z' },
];

const mockListProjects = vi.fn<[], Promise<ProjectListItem[]>>();
const mockDeleteProject = vi.fn<[string], Promise<void>>();
const mockLoadProject = vi.fn();
const mockSaveProject = vi.fn();

vi.mock('../services/projectStorage', () => ({
  listProjects: (...args: unknown[]) => mockListProjects(...(args as [])),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...(args as [string])),
  loadProject: (...args: unknown[]) => mockLoadProject(...args),
  saveProject: (...args: unknown[]) => mockSaveProject(...args),
}));

vi.mock('../services/projectSerializer', () => ({
  uploadProjectFile: vi.fn(),
}));

// ============================================================================
// Tests
// ============================================================================

describe('Projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListProjects.mockResolvedValue(mockProjects);
    mockDeleteProject.mockResolvedValue(undefined);
    mockSaveProject.mockResolvedValue(undefined);
  });

  it('should render the page logo and import button', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByAltText('Quar Animator')).toBeInTheDocument();
    });
    expect(screen.getByTestId('import-button')).toBeInTheDocument();
  });

  it('should render project cards from data', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByText('Walk Cycle')).toBeInTheDocument();
    });
    expect(screen.getByText('Bouncing Ball')).toBeInTheDocument();
    expect(screen.getByText('Character Idle')).toBeInTheDocument();
  });

  it('should render the New Project card when projects exist', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('new-project-card')).toBeInTheDocument();
    });
    expect(screen.getByText('New Project')).toBeInTheDocument();
  });

  it('should show empty state when no projects', async () => {
    mockListProjects.mockResolvedValue([]);
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });

  it('should navigate to /editor on New Project click', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('new-project-card')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('new-project-card'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor');
  });

  it('should navigate to /editor?project={id} on project card click', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('project-card-proj_1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('project-card-proj_1'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor?project=proj_1');
  });

  it('should require double-click to delete a project', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('delete-proj_1')).toBeInTheDocument();
    });

    // First click — no delete
    fireEvent.click(screen.getByTestId('delete-proj_1'));
    expect(mockDeleteProject).not.toHaveBeenCalled();

    // Second click — confirm delete
    fireEvent.click(screen.getByTestId('delete-proj_1'));
    await waitFor(() => {
      expect(mockDeleteProject).toHaveBeenCalledWith('proj_1');
    });
  });

  it('should remove deleted project from the grid', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByText('Walk Cycle')).toBeInTheDocument();
    });

    // Double-click delete
    fireEvent.click(screen.getByTestId('delete-proj_1'));
    fireEvent.click(screen.getByTestId('delete-proj_1'));

    await waitFor(() => {
      expect(screen.queryByText('Walk Cycle')).not.toBeInTheDocument();
    });
  });

  it('should show section title when projects exist', async () => {
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByText('Your Projects')).toBeInTheDocument();
    });
  });

  it('should navigate on empty-state new button', async () => {
    mockListProjects.mockResolvedValue([]);
    render(<Projects />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-new-button')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('empty-new-button'));
    expect(mockNavigate).toHaveBeenCalledWith('/editor');
  });

  it('renames a binary project without losing its data', async () => {
    const data = writeQuarFile({
      version: '3.0',
      name: 'Walk Cycle',
      pages: [{ id: 'page_1', name: 'Scene', sceneGraph: { nodes: [] } }],
      rigging: { dynamicChains: [{ id: 'chain_1' }] },
    });
    mockLoadProject.mockResolvedValue({ id: 'proj_1', name: 'Walk Cycle', data });

    render(<Projects />);
    fireEvent.doubleClick(await screen.findByText('Walk Cycle'));
    const input = screen.getByTestId('rename-input-proj_1');
    fireEvent.change(input, { target: { value: 'New Name' } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockSaveProject).toHaveBeenCalledOnce());
    const [id, name, saved] = mockSaveProject.mock.calls[0] as [string, string, ArrayBuffer];
    expect([id, name]).toEqual(['proj_1', 'New Name']);
    expect(parseQuarFile(saved)).toMatchObject({
      name: 'New Name',
      pages: [{ id: 'page_1' }],
      rigging: { dynamicChains: [{ id: 'chain_1' }] },
    });
  });
});
