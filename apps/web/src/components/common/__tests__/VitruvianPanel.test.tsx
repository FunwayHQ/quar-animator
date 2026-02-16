import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VitruvianPanel } from '../VitruvianPanel';

// Mock stores
const mockState: Record<string, unknown> = {
  vitruvianControllers: [],
  createVitruvianController: vi.fn(),
  removeVitruvianController: vi.fn(),
  setVitruvianControllerEnabled: vi.fn(),
  setVitruvianActiveGroup: vi.fn(),
  addVitruvianGroup: vi.fn(),
  removeVitruvianGroup: vi.fn(),
  captureVitruvianSkinSnapshots: vi.fn(),
};

vi.mock('../../../stores/editorStore', () => ({
  useEditorStore: (selector: (s: Record<string, unknown>) => unknown) => selector(mockState),
}));

vi.mock('../../../contexts/SceneGraphContext', () => ({
  useSceneGraph: () => ({
    getNode: vi.fn(),
    getChildren: vi.fn(() => []),
  }),
}));

describe('VitruvianPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.vitruvianControllers = [];
  });

  it('shows empty state when no controllers', () => {
    render(<VitruvianPanel boneId="bone-1" />);
    expect(screen.getByTestId('no-vitruvian-message')).toBeTruthy();
    expect(screen.getByText('No controllers defined')).toBeTruthy();
  });

  it('shows + Controller button', () => {
    render(<VitruvianPanel boneId="bone-1" />);
    expect(screen.getByTestId('create-vitruvian-controller')).toBeTruthy();
  });

  it('calls createVitruvianController on + Controller click', () => {
    render(<VitruvianPanel boneId="bone-1" />);
    fireEvent.click(screen.getByTestId('create-vitruvian-controller'));
    expect(mockState.createVitruvianController).toHaveBeenCalled();
  });

  it('renders controller card when controller exists', () => {
    mockState.vitruvianControllers = [
      {
        id: 'vc-1',
        name: 'Controller 1',
        enabled: true,
        activeGroupId: 'g-1',
        groups: [
          { id: 'g-1', name: 'Group A', boneIds: ['bone-1'], skinSnapshots: [] },
          { id: 'g-2', name: 'Group B', boneIds: ['bone-2'], skinSnapshots: [] },
        ],
      },
    ];
    render(<VitruvianPanel boneId="bone-1" />);
    expect(screen.getByTestId('vitruvian-controller')).toBeTruthy();
    expect(screen.getByText('Controller 1')).toBeTruthy();
  });

  it('shows group list with bone counts', () => {
    mockState.vitruvianControllers = [
      {
        id: 'vc-1',
        name: 'Ctrl',
        enabled: true,
        activeGroupId: 'g-1',
        groups: [{ id: 'g-1', name: 'Group A', boneIds: ['bone-1'], skinSnapshots: [] }],
      },
    ];
    render(<VitruvianPanel boneId="bone-1" />);
    // "Group A" appears in both the active group selector and the group list
    expect(screen.getAllByText('Group A').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('1 bone')).toBeTruthy();
  });

  it('toggles controller enabled state', () => {
    mockState.vitruvianControllers = [
      {
        id: 'vc-1',
        name: 'Ctrl',
        enabled: true,
        activeGroupId: 'g-1',
        groups: [{ id: 'g-1', name: 'G1', boneIds: ['bone-1'], skinSnapshots: [] }],
      },
    ];
    render(<VitruvianPanel boneId="bone-1" />);
    const checkbox = screen.getByLabelText('Enable controller');
    fireEvent.click(checkbox);
    expect(mockState.setVitruvianControllerEnabled).toHaveBeenCalledWith('vc-1', false);
  });

  it('calls addVitruvianGroup on + click', () => {
    mockState.vitruvianControllers = [
      {
        id: 'vc-1',
        name: 'Ctrl',
        enabled: true,
        activeGroupId: '',
        groups: [],
      },
    ];
    render(<VitruvianPanel boneId="bone-1" />);
    fireEvent.click(screen.getByTestId('add-vitruvian-group'));
    expect(mockState.addVitruvianGroup).toHaveBeenCalledWith('vc-1', expect.any(String), [
      'bone-1',
    ]);
  });

  it('calls captureVitruvianSkinSnapshots on Snap click', () => {
    mockState.vitruvianControllers = [
      {
        id: 'vc-1',
        name: 'Ctrl',
        enabled: true,
        activeGroupId: 'g-1',
        groups: [{ id: 'g-1', name: 'G1', boneIds: ['bone-1'], skinSnapshots: [] }],
      },
    ];
    render(<VitruvianPanel boneId="bone-1" />);
    fireEvent.click(screen.getByTestId('capture-skin'));
    expect(mockState.captureVitruvianSkinSnapshots).toHaveBeenCalledWith(
      'vc-1',
      'g-1',
      expect.anything()
    );
  });
});
