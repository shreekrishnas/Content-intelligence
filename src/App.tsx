import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/ui/Toast';

function ErrorScreen({ title, message }: { title: string; message: string }) {
  return (
    <div className="app-outer">
      <div className="atmosphere" />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          position: 'relative',
          zIndex: 1,
        }}
      >
        <div
          className="glass-card-static"
          style={{ maxWidth: 520, width: '100%', padding: '2.5rem', textAlign: 'center' }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '1rem',
              background: 'linear-gradient(135deg, #EF4444, #DC2626)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{title}</h1>
          <p className="page-desc" style={{ marginBottom: 0 }}>{message}</p>
        </div>
      </div>
    </div>
  );
}


function LoadingScreen() {
  return (
    <div className="app-outer">
      <div className="atmosphere" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <div className="spin-dot" style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-primary)' }} />
      </div>
    </div>
  );
}

function AccountGate() {
  const { accountId, account, loading, error } = useAccount();

  if (loading) return <LoadingScreen />;

  // When DB is not configured or no account_id, let the user through
  // so they can explore the UI. Pages show empty states gracefully.
  if (error === 'not_configured' || error === 'no_account') {
    return <AppShell />;
  }

  if (error === 'access_denied' || error === 'not_found') {
    return (
      <ErrorScreen
        title="Access Denied"
        message={`Account ${accountId ?? ''} was not found or you do not have access. Contact your administrator if you believe this is an error.`}
      />
    );
  }

  if (!account && accountId) return <LoadingScreen />;

  return <AppShell />;
}

export default function App() {
  const initialized = useAuthStore((s) => s.initialized);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) return <LoadingScreen />;

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <AccountProvider>
            <AccountGate />
          </AccountProvider>
          <div id="toastRoot" />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
