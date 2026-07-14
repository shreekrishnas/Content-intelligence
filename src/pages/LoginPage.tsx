import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div className="app-outer">
      <div className="atmosphere" />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', position: 'relative', zIndex: 1, padding: '1rem',
      }}>
        <div style={{
          maxWidth: 400, width: '100%', padding: '2.5rem',
          background: 'rgba(30, 30, 46, 0.92)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '1rem',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 12px 48px rgba(0, 0, 0, 0.4)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '1rem',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '1rem',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 style={{
              fontSize: '1.4rem', fontWeight: 700, margin: '0 0 0.25rem',
              color: '#ffffff',
            }}>
              Content Intelligence
            </h1>
            <p style={{
              fontSize: '0.85rem', margin: 0,
              color: 'rgba(255, 255, 255, 0.55)',
            }}>
              Sign in with your Trilliant Digital account
            </p>
          </div>

          {error && (
            <p style={{
              color: '#f87171', fontSize: '0.85rem', margin: '0 0 1rem',
              textAlign: 'center', padding: '0.6rem 0.75rem',
              background: 'rgba(239, 68, 68, 0.12)', borderRadius: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.25)',
            }}>
              {error}
            </p>
          )}

          <button
            onClick={() => signInWithGoogle()}
            disabled={loading}
            className="google-login-btn"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05"/>
              <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
            </svg>
            <span>{loading ? 'Signing in...' : 'Sign in with Google'}</span>
          </button>

          <style>{`
            .google-login-btn {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 0.75rem;
              width: 100%;
              padding: 0.8rem 1rem;
              border-radius: 0.5rem;
              border: 1px solid rgba(255, 255, 255, 0.18);
              background: rgba(255, 255, 255, 0.08);
              color: #ffffff;
              font-size: 0.95rem;
              font-weight: 600;
              cursor: pointer;
              transition: background 0.15s, border-color 0.15s;
            }
            .google-login-btn:hover:not(:disabled) {
              background: rgba(255, 255, 255, 0.15);
              border-color: rgba(255, 255, 255, 0.3);
            }
            .google-login-btn:disabled {
              opacity: 0.6;
              cursor: wait;
            }
          `}</style>

          <p style={{
            textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.35)',
          }}>
            Only @trilliantdigital.com accounts are allowed
          </p>
        </div>
      </div>
    </div>
  );
}
