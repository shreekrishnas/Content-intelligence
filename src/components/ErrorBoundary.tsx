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
    // Stale chunk after a new Vercel deploy: the old index.html in the
    // browser references JS bundles whose filename hashes were replaced.
    // Auto-reload once so the user picks up the new bundle instead of
    // seeing a scary "Something went wrong". A sessionStorage guard stops
    // it from becoming an infinite reload loop if the failure is real.
    const msg = error?.message || '';
    const isStaleChunk =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      /ChunkLoadError/i.test(msg) ||
      /Loading chunk .* failed/i.test(msg);
    if (isStaleChunk && typeof window !== 'undefined') {
      const KEY = '__stale_chunk_reload_at';
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 10_000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        window.location.reload();
      }
    }
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
              <h1 className="page-title" style={{ marginBottom: 8 }}>
                {/Failed to fetch dynamically imported module|Loading chunk .* failed|ChunkLoadError/i.test(this.state.error?.message || '')
                  ? 'Updating…'
                  : 'Something went wrong'}
              </h1>
              <p className="page-desc" style={{ marginBottom: 16 }}>
                {/Failed to fetch dynamically imported module|Loading chunk .* failed|ChunkLoadError/i.test(this.state.error?.message || '')
                  ? 'A new version was deployed. Reloading to pick it up.'
                  : (this.state.error?.message || 'An unexpected error occurred.')}
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
