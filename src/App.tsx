import { useEffect, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import AppShell from './components/layout/AppShell';
import LoginPage from './pages/LoginPage';
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 1, gap: '0.5rem' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--accent-primary)',
              animation: `pulseDot 1.2s ease-in-out ${i * 0.18}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <LoginPage />;
  return <>{children}</>;
}

function AccountGate() {
  const { accountId, account, loading, error } = useAccount();

  // Only unmount AppShell for the FIRST-time load (no account object yet).
  // Once an account has landed, transient loading flips -e.g. switching
  // accounts, background refetches -must NOT swap AppShell for a
  // LoadingScreen, because that unmount destroys AppShell's visitedTabs
  // keep-alive state and remounts every visited page from scratch. That
  // remount is what the user perceives as the whole app "refreshing" when
  // they come back to a tab.
  if (loading && !account && !error) return <LoadingScreen />;

  if (error === 'not_configured') {
    return <AppShell />;
  }

  if (error === 'no_account') {
    return (
      <ErrorScreen
        title="No Accounts Assigned"
        message="Your profile has no client accounts linked yet. This usually resolves after your first sign-in -try refreshing. If the issue persists, contact your administrator."
      />
    );
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
          <AuthGate>
            <AccountProvider>
              <AccountGate />
            </AccountProvider>
          </AuthGate>
          <div id="toastRoot" />
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
