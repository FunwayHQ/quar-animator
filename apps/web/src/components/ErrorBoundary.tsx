import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Canvas error caught by ErrorBoundary:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            padding: '2rem',
            color: 'var(--color-text-secondary, #999)',
            backgroundColor: 'var(--color-bg-canvas, #1a1a1a)',
            textAlign: 'center',
            gap: '1rem',
          }}
        >
          <h2 style={{ color: 'var(--color-text-primary, #fff)', margin: 0 }}>
            Something went wrong
          </h2>
          <p style={{ margin: 0, maxWidth: '400px' }}>
            The canvas encountered an error. This may be caused by a WebGL context loss or a
            rendering issue.
          </p>
          {this.state.error && (
            <code
              style={{
                fontSize: '0.75rem',
                padding: '0.5rem 1rem',
                borderRadius: '4px',
                backgroundColor: 'var(--color-bg-tertiary, #2a2a2a)',
                maxWidth: '500px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {this.state.error.message}
            </code>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              marginTop: '0.5rem',
              padding: '0.5rem 1.5rem',
              border: '1px solid var(--color-border-subtle, #333)',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary, #A855F7)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.875rem',
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
