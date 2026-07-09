import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-outer">
          <div className="atmosphere" />
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', position: 'relative', zIndex: 1,
          }}>
            <div className="glass-card-static" style={{ maxWidth: 520, width: '100%', padding: '2.5rem', textAlign: 'center' }}>
              <div style={{
                width: 56, height: 56, borderRadius: '1rem',
                background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <h1 className="page-title" style={{ marginBottom: 8 }}>Something went wrong</h1>
              <p className="page-desc" style={{ marginBottom: 16 }}>
                {this.state.error?.message || 'An unexpected error occurred.'}
              </p>
              <button
                className="btn btn-primary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
