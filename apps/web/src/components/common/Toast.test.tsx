import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '../../test/utils';
import { ToastContainer, toast } from './Toast';

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a success toast with message', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Project saved');
    });

    expect(screen.getByText('Project saved')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('renders an error toast with message', () => {
    render(<ToastContainer />);

    act(() => {
      toast.error('Failed to save');
    });

    expect(screen.getByText('Failed to save')).toBeInTheDocument();
  });

  it('auto-dismisses after timeout', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('Will disappear');
    });

    expect(screen.getByText('Will disappear')).toBeInTheDocument();

    // Advance past auto-dismiss duration (4000ms) + exit animation (150ms)
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByText('Will disappear')).not.toBeInTheDocument();
  });

  it('close button removes toast', () => {
    render(<ToastContainer />);

    act(() => {
      toast.info('Closable toast');
    });

    const closeButton = screen.getByLabelText('Close');
    fireEvent.click(closeButton);

    // Wait for exit animation
    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByText('Closable toast')).not.toBeInTheDocument();
  });

  it('multiple toasts stack', () => {
    render(<ToastContainer />);

    act(() => {
      toast.success('First');
      toast.error('Second');
      toast.info('Third');
    });

    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();

    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(3);
  });
});
