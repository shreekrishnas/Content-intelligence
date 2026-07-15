import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 40%, #16213e 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background orbs */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: 500, height: 500, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-10%', left: '-5%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{
        width: '100%', maxWidth: 420, position: 'relative', zIndex: 1,
      }}>
        {/* Card */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '1.5rem',
          padding: '2.75rem 2.5rem',
          backdropFilter: 'blur(24px)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}>

          {/* Logo + Brand */}
          <div style={{ textAlign: 'center', marginBottom: '2.25rem' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '1.25rem',
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '1.25rem',
              boxShadow: '0 8px 32px rgba(99,102,241,0.4)',
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>

            <h1 style={{
              fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.375rem',
              color: '#ffffff', letterSpacing: '-0.02em',
            }}>
              Content Intelligence
            </h1>
            <p style={{
              fontSize: '0.875rem', margin: 0,
              color: 'rgba(255,255,255,0.45)',
              lineHeight: 1.5,
            }}>
              Your AI-powered content strategy platform
            </p>
          </div>

          {/* Divider */}
          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
            marginBottom: '2rem',
          }} />

          {/* Error */}
          {error && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
              padding: '0.75rem 1rem', marginBottom: '1.25rem',
              background: 'rgba(239,68,68,0.1)', borderRadius: '0.75rem',
              border: '1px solid rgba(239,68,68,0.2)',
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p style={{ margin: 0, color: '#f87171', fontSize: '0.8125rem', lineHeight: 1.5 }}>{error}</p>
            </div>
          )}

          {/* Google Button */}
          <button
            onClick={() => signInWithGoogle()}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '0.75rem', width: '100%', padding: '0.875rem 1.25rem',
              borderRadius: '0.875rem',
              border: '1px solid rgba(255,255,255,0.12)',
              background: loading ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)',
              color: '#ffffff', fontSize: '0.9375rem', fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer',
              transition: 'all 0.15s ease',
              outline: 'none', opacity: loading ? 0.65 : 1,
              letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.11)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)';
              }
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.12)';
            }}
          >
            {loading ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05"/>
                <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
              </svg>
            )}
            <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
          </button>

          {/* Footer */}
          <p style={{
            textAlign: 'center', marginTop: '1.5rem', marginBottom: 0,
            fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)',
            lineHeight: 1.6,
          }}>
            Access restricted to{' '}
            <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
              @trilliantdigital.com
            </span>{' '}
            accounts only
          </p>
        </div>

        {/* Below card */}
        <p style={{
          textAlign: 'center', marginTop: '1.5rem',
          fontSize: '0.75rem', color: 'rgba(255,255,255,0.18)',
        }}>
          Trilliant Digital · Internal Platform
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
