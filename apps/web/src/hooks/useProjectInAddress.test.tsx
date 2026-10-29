import { describe, it, expect, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useEditorStore } from '../stores/editorStore';
import { useProjectInAddress } from './useProjectInAddress';

/** The editor's address and what the hook says to open, on screen. */
function Probe() {
  const opening = useProjectInAddress();
  const location = useLocation();
  return (
    <>
      <span data-testid="opening">{opening ?? 'none'}</span>
      <span data-testid="search">{location.search}</span>
    </>
  );
}

function openEditorAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Probe />
    </MemoryRouter>
  );
}

const search = () => screen.getByTestId('search').textContent;

describe('the project in the editor’s address', () => {
  beforeEach(() => {
    useEditorStore.setState({ projectId: null, isDirty: false });
  });

  it('names a new project once it’s saved, so a reload opens it again', () => {
    openEditorAt('/editor');
    expect(search()).toBe('');
    act(() => useEditorStore.setState({ projectId: 'proj_1' }));
    expect(search()).toBe('?project=proj_1');
  });

  it('follows the editor to another project, and to a new one', () => {
    useEditorStore.setState({ projectId: 'proj_1' });
    openEditorAt('/editor?project=proj_1');
    act(() => useEditorStore.setState({ projectId: 'proj_2' }));
    expect(search()).toBe('?project=proj_2');
    act(() => useEditorStore.setState({ projectId: null }));
    expect(search()).toBe('');
  });

  it('opens the project the address names, and never again as the address changes', () => {
    openEditorAt('/editor?project=proj_1');
    expect(screen.getByTestId('opening').textContent).toBe('proj_1');
    act(() => useEditorStore.setState({ projectId: 'proj_1' }));
    act(() => useEditorStore.setState({ projectId: 'proj_2' }));
    expect(screen.getByTestId('opening').textContent).toBe('proj_1');
  });

  it('keeps the project asked for while the last one’s id is still in the store', () => {
    useEditorStore.setState({ projectId: 'proj_old' });
    openEditorAt('/editor?project=proj_1');
    expect(search()).toBe('?project=proj_1');
    act(() => useEditorStore.setState({ projectId: 'proj_1' }));
    expect(search()).toBe('?project=proj_1');
  });
});
