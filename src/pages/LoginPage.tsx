import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const { signIn, signUp, loading, error } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signin') {
      await signIn(email, password);
    } else {
      await signUp(email, password, name);
    }
  };

  return (
    <div className="app-outer">
      <div className="atmosphere" />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
        <div className="glass-card-static" style={{ maxWidth: 420, width: '100%', padding: '2.5rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '1rem',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary, #6366f1))',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>Content Intelligence</h1>
            <p className="page-desc">{mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}</p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {mode === 'signup' && (
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: 'var(--text-secondary)' }}>Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  style={inputStyle}
                />
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: 'var(--text-secondary)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4, color: 'var(--text-secondary)' }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                style={inputStyle}
              />
            </div>

            {error && (
              <p style={{ color: '#EF4444', fontSize: '0.85rem', margin: 0 }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '0.75rem',
                borderRadius: '0.5rem',
                border: 'none',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 600,
                fontSize: '0.95rem',
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              style={{
                background: 'none', border: 'none', color: 'var(--accent-primary)',
                cursor: 'pointer', textDecoration: 'underline', fontSize: '0.85rem',
              }}
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid var(--border-primary, rgba(255,255,255,0.12))',
  background: 'var(--bg-secondary, rgba(255,255,255,0.06))',
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
  boxSizing: 'border-box',
};
