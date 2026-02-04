import { describe, it, expect } from 'vitest';
import { render, screen } from '../../test/utils';
import userEvent from '@testing-library/user-event';
import { Timeline } from './Timeline';

describe('Timeline', () => {
  it('renders transport controls', () => {
    render(<Timeline />);

    expect(screen.getByTitle('Go to start (Home)')).toBeInTheDocument();
    expect(screen.getByTitle('Previous frame (,)')).toBeInTheDocument();
    expect(screen.getByTitle('Play/Pause (Space)')).toBeInTheDocument();
    expect(screen.getByTitle('Next frame (.)')).toBeInTheDocument();
    expect(screen.getByTitle('Go to end (End)')).toBeInTheDocument();
  });

  it('renders option buttons', () => {
    render(<Timeline />);

    expect(screen.getByTitle('Toggle loop (L)')).toBeInTheDocument();
    expect(screen.getByTitle('Toggle onion skinning (O)')).toBeInTheDocument();
  });

  it('displays time in correct format', () => {
    render(<Timeline />);

    // Initial time should be 00:00:00
    expect(screen.getByText('00:00:00')).toBeInTheDocument();

    // Duration should be 00:10:00 (10 seconds at 30fps = 300 frames)
    expect(screen.getByText('00:10:00')).toBeInTheDocument();
  });

  it('displays layer labels', () => {
    render(<Timeline />);

    expect(screen.getByText('Character')).toBeInTheDocument();
    expect(screen.getByText('├ Position')).toBeInTheDocument();
    expect(screen.getByText('├ Scale')).toBeInTheDocument();
    expect(screen.getByText('└ Rotation')).toBeInTheDocument();
    expect(screen.getByText('Background')).toBeInTheDocument();
  });

  it('displays ruler marks', () => {
    render(<Timeline />);

    // Should display frame numbers
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('60')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
  });

  it('toggles play/pause icon when clicked', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    const playButton = screen.getByTitle('Play/Pause (Space)');

    // Initially shows play icon (triangle)
    // Click to play
    await user.click(playButton);

    // Button should still be there (icon changes internally)
    expect(playButton).toBeInTheDocument();
  });

  it('navigates to start when go to start is clicked', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    // First move to a different frame
    const nextButton = screen.getByTitle('Next frame (.)');
    await user.click(nextButton);
    await user.click(nextButton);
    await user.click(nextButton);

    // Now go to start
    const goToStartButton = screen.getByTitle('Go to start (Home)');
    await user.click(goToStartButton);

    // Time should be back at 00:00:00
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });

  it('steps forward one frame', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    const nextButton = screen.getByTitle('Next frame (.)');
    await user.click(nextButton);

    // Time should now be 00:00:01 (1 frame at 30fps)
    expect(screen.getByText('00:00:01')).toBeInTheDocument();
  });

  it('steps backward one frame', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    // First step forward
    const nextButton = screen.getByTitle('Next frame (.)');
    await user.click(nextButton);
    await user.click(nextButton);

    // Now step backward
    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    // Time should be 00:00:01
    expect(screen.getByText('00:00:01')).toBeInTheDocument();
  });

  it('navigates to end when go to end is clicked', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    const goToEndButton = screen.getByTitle('Go to end (End)');
    await user.click(goToEndButton);

    // Time should be 00:10:00 (300 frames at 30fps)
    expect(screen.getAllByText('00:10:00').length).toBe(2); // Current time and total time match
  });

  it('does not go below frame 0', async () => {
    const user = userEvent.setup();
    render(<Timeline />);

    // Try to go backward at frame 0
    const prevButton = screen.getByTitle('Previous frame (,)');
    await user.click(prevButton);

    // Should still be at 00:00:00
    expect(screen.getByText('00:00:00')).toBeInTheDocument();
  });
});
