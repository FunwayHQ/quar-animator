/**
 * Tests for SmartBonePanel component
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../../test/utils';
import { SmartBonePanel } from './SmartBonePanel';
import { useEditorStore, DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { createTimeline } from '@quar/animation';
import type { SmartBoneAction } from '@quar/types';

/** Helper: render SmartBonePanel wrapped in SceneGraphProvider */
function renderPanel(boneId: string) {
  return render(
    <SceneGraphProvider>
      <SmartBonePanel boneId={boneId} />
    </SceneGraphProvider>
  );
}

function createTestAction(boneId: string, overrides?: Partial<SmartBoneAction>): SmartBoneAction {
  return {
    id: 'action-1',
    name: 'Smart Bone 1',
    driver: { boneId, property: 'transform.rotation', rangeMin: 0, rangeMax: 90 },
    targets: [],
    enabled: true,
    ...overrides,
  };
}

describe('SmartBonePanel', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'selection',
      selectedNodeIds: new Set<string>(),
      defaultFill: DEFAULT_FILL,
      defaultStroke: DEFAULT_STROKE,
      isDrawing: false,
      brushSize: 5,
      brushSmoothing: 50,
      eraserSize: 10,
      eraserMode: 'stroke',
      aspectRatioLocked: false,
      clipboard: null,
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
      timeline: createTimeline({ duration: 300, frameRate: 30 }),
      autoKeyframe: false,
      selectedKeyframeIds: new Set<string>(),
      keyframeClipboard: null,
      smartBoneActions: [],
      smartBoneRecordingActionId: null,
      smartBoneRecordingTargetId: null,
      smartBoneRecordingPrevTool: null,
      smartBoneRecordingPrevRotation: null,
    });
  });

  it('renders empty state when no actions exist', () => {
    renderPanel('bone-1');
    expect(screen.getByTestId('no-actions-message')).toBeInTheDocument();
    expect(screen.getByText('No actions defined')).toBeInTheDocument();
  });

  it('renders action list when actions exist', () => {
    const action = createTestAction('bone-1');
    useEditorStore.setState({ smartBoneActions: [action] });

    renderPanel('bone-1');
    expect(screen.queryByTestId('no-actions-message')).not.toBeInTheDocument();
    expect(screen.getByTestId('smart-bone-action')).toBeInTheDocument();
    expect(screen.getByText('Smart Bone 1')).toBeInTheDocument();
  });

  it('creates a new action via + Action button', () => {
    renderPanel('bone-1');
    const createBtn = screen.getByTestId('create-smart-bone-action');

    fireEvent.click(createBtn);

    const state = useEditorStore.getState();
    expect(state.smartBoneActions.length).toBe(1);
    expect(state.smartBoneActions[0].driver.boneId).toBe('bone-1');
  });

  it('removes an action via × button', () => {
    const action = createTestAction('bone-1');
    useEditorStore.setState({ smartBoneActions: [action] });

    renderPanel('bone-1');
    fireEvent.click(screen.getByTestId('remove-action'));

    expect(useEditorStore.getState().smartBoneActions.length).toBe(0);
  });

  it('toggles action enabled via checkbox', () => {
    const action = createTestAction('bone-1');
    useEditorStore.setState({ smartBoneActions: [action] });

    renderPanel('bone-1');
    // The toggle is a <label> wrapping a hidden <input type="checkbox">
    const label = screen.getByTitle('Enable/disable');
    const checkbox = label.querySelector('input[type="checkbox"]') as HTMLInputElement;

    expect(useEditorStore.getState().smartBoneActions[0].enabled).toBe(true);

    fireEvent.click(checkbox);
    expect(useEditorStore.getState().smartBoneActions[0].enabled).toBe(false);
  });

  it('adds a morph target via + Target button', () => {
    const action = createTestAction('bone-1');
    useEditorStore.setState({ smartBoneActions: [action] });

    renderPanel('bone-1');
    fireEvent.click(screen.getByTestId('add-target'));

    const updatedAction = useEditorStore.getState().smartBoneActions[0];
    expect(updatedAction.targets.length).toBe(1);
    // Default value = midpoint of range (0 + 90) / 2 = 45
    expect(updatedAction.targets[0].driverValue).toBe(45);
  });

  it('only shows actions for the given boneId', () => {
    const action1 = createTestAction('bone-1', { id: 'a1', name: 'Action A' });
    const action2 = createTestAction('bone-2', { id: 'a2', name: 'Action B' });
    useEditorStore.setState({ smartBoneActions: [action1, action2] });

    renderPanel('bone-1');
    expect(screen.getByText('Action A')).toBeInTheDocument();
    expect(screen.queryByText('Action B')).not.toBeInTheDocument();
  });

  it('starts and stops recording on a morph target', () => {
    const action = createTestAction('bone-1', {
      targets: [{ id: 'target-1', name: 'Target 1', driverValue: 45, offsets: {} }],
    });
    useEditorStore.setState({ smartBoneActions: [action] });

    renderPanel('bone-1');

    // Start recording
    fireEvent.click(screen.getByTestId('start-recording'));
    let state = useEditorStore.getState();
    expect(state.smartBoneRecordingActionId).toBe('action-1');
    expect(state.smartBoneRecordingTargetId).toBe('target-1');

    // Stop recording
    fireEvent.click(screen.getByTestId('stop-recording'));
    state = useEditorStore.getState();
    expect(state.smartBoneRecordingActionId).toBeNull();
    expect(state.smartBoneRecordingTargetId).toBeNull();
  });
});
