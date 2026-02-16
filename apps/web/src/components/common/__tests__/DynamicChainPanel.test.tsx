import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DynamicChainPanel } from '../DynamicChainPanel';

const mockState: Record<string, unknown> = {
  dynamicChains: [],
  createDynamicChain: vi.fn(),
  removeDynamicChain: vi.fn(),
  setDynamicChainEnabled: vi.fn(),
  updateDynamicChainSettings: vi.fn(),
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

describe('DynamicChainPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.dynamicChains = [];
  });

  it('shows empty state when no chain', () => {
    render(<DynamicChainPanel boneId="bone-1" />);
    expect(screen.getByTestId('no-dynamic-chain-message')).toBeTruthy();
    expect(screen.getByText('No dynamic chain on this bone')).toBeTruthy();
  });

  it('shows + Chain button', () => {
    render(<DynamicChainPanel boneId="bone-1" />);
    expect(screen.getByTestId('create-dynamic-chain')).toBeTruthy();
  });

  it('calls createDynamicChain on + Chain click', () => {
    render(<DynamicChainPanel boneId="bone-1" />);
    fireEvent.click(screen.getByTestId('create-dynamic-chain'));
    expect(mockState.createDynamicChain).toHaveBeenCalledWith(expect.anything(), 'bone-1');
  });

  it('renders chain settings when chain exists', () => {
    mockState.dynamicChains = [
      {
        id: 'dc-1',
        name: 'Chain 1',
        rootBoneId: 'bone-1',
        boneIds: ['bone-1', 'bone-2'],
        enabled: true,
        stiffness: 0.5,
        damping: 0.3,
        gravity: 100,
        gravityAngle: -90,
        windInfluence: 1,
        elasticity: 0.5,
        collisionRadius: 0,
      },
    ];
    render(<DynamicChainPanel boneId="bone-1" />);
    expect(screen.getByTestId('dynamic-chain-settings')).toBeTruthy();
    expect(screen.getByText('Chain 1')).toBeTruthy();
  });

  it('toggles chain enabled state', () => {
    mockState.dynamicChains = [
      {
        id: 'dc-1',
        name: 'Chain',
        rootBoneId: 'bone-1',
        boneIds: ['bone-1'],
        enabled: true,
        stiffness: 0.5,
        damping: 0.3,
        gravity: 100,
        gravityAngle: -90,
        windInfluence: 1,
        elasticity: 0.5,
        collisionRadius: 0,
      },
    ];
    render(<DynamicChainPanel boneId="bone-1" />);
    const checkbox = screen.getByLabelText('Enable dynamic chain');
    fireEvent.click(checkbox);
    expect(mockState.setDynamicChainEnabled).toHaveBeenCalledWith('dc-1', false);
  });

  it('updates stiffness via slider', () => {
    mockState.dynamicChains = [
      {
        id: 'dc-1',
        name: 'Chain',
        rootBoneId: 'bone-1',
        boneIds: ['bone-1'],
        enabled: true,
        stiffness: 0.5,
        damping: 0.3,
        gravity: 100,
        gravityAngle: -90,
        windInfluence: 1,
        elasticity: 0.5,
        collisionRadius: 0,
      },
    ];
    render(<DynamicChainPanel boneId="bone-1" />);
    const slider = screen.getByTestId('stiffness-slider');
    fireEvent.change(slider, { target: { value: '0.8' } });
    expect(mockState.updateDynamicChainSettings).toHaveBeenCalledWith('dc-1', {
      stiffness: 0.8,
    });
  });

  it('updates gravity via number input', () => {
    mockState.dynamicChains = [
      {
        id: 'dc-1',
        name: 'Chain',
        rootBoneId: 'bone-1',
        boneIds: ['bone-1'],
        enabled: true,
        stiffness: 0.5,
        damping: 0.3,
        gravity: 100,
        gravityAngle: -90,
        windInfluence: 1,
        elasticity: 0.5,
        collisionRadius: 0,
      },
    ];
    render(<DynamicChainPanel boneId="bone-1" />);
    const input = screen.getByTestId('gravity-input');
    fireEvent.change(input, { target: { value: '200' } });
    expect(mockState.updateDynamicChainSettings).toHaveBeenCalledWith('dc-1', {
      gravity: 200,
    });
  });

  it('removes chain on × click', () => {
    mockState.dynamicChains = [
      {
        id: 'dc-1',
        name: 'Chain',
        rootBoneId: 'bone-1',
        boneIds: ['bone-1'],
        enabled: true,
        stiffness: 0.5,
        damping: 0.3,
        gravity: 100,
        gravityAngle: -90,
        windInfluence: 1,
        elasticity: 0.5,
        collisionRadius: 0,
      },
    ];
    render(<DynamicChainPanel boneId="bone-1" />);
    fireEvent.click(screen.getByTestId('remove-dynamic-chain'));
    expect(mockState.removeDynamicChain).toHaveBeenCalledWith('dc-1');
  });
});
