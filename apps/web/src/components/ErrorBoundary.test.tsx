import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '../test/utils';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws on demand
function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test canvas error');
  }
  return <div data-testid="child">Canvas content</div>;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Suppress console.error from React and componentDidCatch
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/canvas encountered an error/)).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows the error message in the fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Test canvas error')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div data-testid="custom-fallback">Custom error</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByTestId('custom-fallback')).toBeInTheDocument();
  });

  it('resets state and re-renders children on retry', () => {
    // We need a stateful wrapper to control ThrowingChild
    let shouldThrow = true;

    function Wrapper() {
      // On first render, throws. After retry, we set shouldThrow = false
      return <ThrowingChild shouldThrow={shouldThrow} />;
    }

    render(
      <ErrorBoundary>
        <Wrapper />
      </ErrorBoundary>
    );

    // Should show error
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Fix the error condition before clicking retry
    shouldThrow = false;

    fireEvent.click(screen.getByText('Retry'));

    // Should now render children
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('calls componentDidCatch when error occurs', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Canvas error caught by ErrorBoundary:',
      expect.any(Error),
      expect.any(Object)
    );
  });
});
