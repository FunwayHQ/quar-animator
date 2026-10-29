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

  it('keeps a progress toast up, saying how far it has got, until it’s done', () => {
    render(<ToastContainer />);

    let progress: ReturnType<typeof toast.progress> | null = null;
    act(() => {
      progress = toast.progress('Importing “Beach”…');
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Importing “Beach”…')).toBeInTheDocument();

    act(() => progress?.update('Importing “Beach”: frames 40%'));
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByText('Importing “Beach”: frames 40%')).toBeInTheDocument();

    act(() => progress?.done());
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Said once it's gone, it stays gone
    act(() => progress?.update('Late'));
    expect(screen.queryByText('Late')).not.toBeInTheDocument();
  });

  it('leaves a progress toast closed when it’s closed', () => {
    render(<ToastContainer />);
    let progress: ReturnType<typeof toast.progress> | null = null;
    act(() => {
      progress = toast.progress('Importing…');
    });
    fireEvent.click(screen.getByLabelText('Close'));
    act(() => {
      vi.advanceTimersByTime(150);
    });
    act(() => progress?.update('Still importing'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
