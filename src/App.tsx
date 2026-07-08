import { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { AccountProvider, useAccount } from './contexts/AccountContext';
import AppShell from './components/layout/AppShell';
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

function SetupScreen() {
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
              background: 'linear-gradient(135deg, #F59E0B, #D97706)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '1rem',
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2l1.8 5.6L19 9.5l-5.2 1.9L12 17l-1.8-5.6L5 9.5l5.2-1.9L12 2z" />
            </svg>
          </div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>Setup Required</h1>
          <p className="page-desc" style={{ marginBottom: '1.5rem' }}>
            The database connection is not configured yet. Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> environment variables to connect.
          </p>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '0.5rem', padding: '1rem', textAlign: 'left' }}>
            <p style={{ margin: '0 0 0.5rem' }}>1. Create a Supabase project</p>
            <p style={{ margin: '0 0 0.5rem' }}>2. Run the migration scripts from <code>supabase/migrations/</code></p>
            <p style={{ margin: 0 }}>3. Add the project URL and anon key to your environment</p>
          </div>
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

  if (error === 'not_configured') return <SetupScreen />;

  if (error === 'no_account') {
    return (
      <ErrorScreen
        title="No Account Selected"
        message="This app must be opened from your dashboard with an account_id parameter. Navigate to your dashboard and select an account to continue."
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

  if (!account) return <LoadingScreen />;

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
    <BrowserRouter>
      <ToastProvider>
        <AccountProvider>
          <AccountGate />
        </AccountProvider>
        <div id="toastRoot" />
      </ToastProvider>
    </BrowserRouter>
  );
}
