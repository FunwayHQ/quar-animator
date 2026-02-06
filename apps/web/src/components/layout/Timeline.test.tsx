import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline';
import { SceneGraphProvider } from '../../contexts/SceneGraphContext';
import { useEditorStore } from '../../stores/editorStore';
import { DEFAULT_FILL, DEFAULT_STROKE } from '../../stores/editorStore';

function renderTimeline() {
  return render(
    <SceneGraphProvider>
      <Timeline />
    </SceneGraphProvider>
  );
}

describe('Timeline', () => {
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
      currentFrame: 0,
      isPlaying: false,
      isLooping: false,
      timelineDuration: 300,
      frameRate: 30,
      timelineExpanded: true,
    });
  });

  it('renders transport controls', () => {
    renderTimeline();

    expect(screen.getByTitle('Go to start (Home)')).toBeInTheDocument();
    expect(screen.getByTitle('Previous frame (,)')).toBeInTheDocument();
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
    expect(screen.getByTitle('Next frame (.)')).toBeInTheDocument();
    expect(screen.getByTitle('Go to end (End)')).toBeInTheDocument();
  });

  it('renders option buttons', () => {
    renderTimeline();

    expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle onion skinning (Shift+O)')).toBeInTheDocument();
  });

  it('displays time in correct format', () => {
    renderTimeline();

    // Initial time should be 00:00:00
    expect(screen.getByText('00:00:00')).toBeInTheDocument();

    // Duration should be 00:10:00 (10 seconds at 30fps = 300 frames)
    expect(screen.getByText('00:10:00')).toBeInTheDocument();
  });

  it('displays "No layers" when scene graph is empty', () => {
    renderTimeline();

    expect(screen.getByText('No layers')).toBeInTheDocument();
  });

  it('displays ruler marks', () => {
    renderTimeline();

    // Should display frame numbers
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('toggles play state when play button clicked', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const playButton = screen.getByTitle('Play/Pause (Space)');
    await user.click(playButton);

    expect(useEditorStore.getState().isPlaying).toBe(true);
  });

  it('navigates to start when go to start is clicked', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ currentFrame: 50 });
    renderTimeline();

    const goToStartButton = screen.getByTitle('Go to start (Home)');
    await user.click(goToStartButton);

    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  it('steps forward one frame', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const nextButton = screen.getByTitle('Next frame (.)');
    await user.click(nextButton);

    expect(useEditorStore.getState().currentFrame).toBe(1);
    // Time should now be 00:00:01 (1 frame at 30fps)
    expect(screen.getByText('00:00:01')).toBeInTheDocument();
  });

  it('steps backward one frame', async () => {
    const user = userEvent.setup();
    useEditorStore.setState({ currentFrame: 2 });
    renderTimeline();

    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    expect(useEditorStore.getState().currentFrame).toBe(1);
  });

  it('navigates to end when go to end is clicked', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const goToEndButton = screen.getByTitle('Go to end (End)');
    await user.click(goToEndButton);

    expect(useEditorStore.getState().currentFrame).toBe(299);
  });

  it('does not go below frame 0', async () => {
    const user = userEvent.setup();
    renderTimeline();

    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    expect(useEditorStore.getState().currentFrame).toBe(0);
  });

  // ============================================================================
  // Collapsed mode
  // ============================================================================

  describe('collapsed mode', () => {
    it('renders collapsed bar when timelineExpanded is false', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.getByTitle('Expand timeline')).toBeInTheDocument();
      expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
      expect(screen.getByText('00:00:00')).toBeInTheDocument();
    });

    it('does not render transport controls in collapsed mode', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.queryByTitle('Go to start (Home)')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Go to end (End)')).not.toBeInTheDocument();
    });

    it('toggles to expanded when expand button clicked', async () => {
      const user = userEvent.setup();
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      await user.click(screen.getByTitle('Expand timeline'));
      expect(useEditorStore.getState().timelineExpanded).toBe(true);
    });

    it('toggles to collapsed when collapse button clicked', async () => {
      const user = userEvent.setup();
      renderTimeline();

      await user.click(screen.getByTitle('Collapse timeline'));
      expect(useEditorStore.getState().timelineExpanded).toBe(false);
    });

    it('shows loop toggle in collapsed mode', () => {
      useEditorStore.setState({ timelineExpanded: false });
      renderTimeline();

      expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    });
  });
});
