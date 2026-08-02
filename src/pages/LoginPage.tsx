import { useAuthStore } from '@/stores/authStore';
import Logo from '@/components/Logo';

export default function LoginPage() {
  const { signInWithGoogle, loading, error } = useAuthStore();

  return (
    <div className="login-root">
      {/* ─────────────────────────  LEFT · BRAND SHOWCASE  ───────────────────────── */}
      <aside className="login-brand">
        <div className="login-brand__mesh" />
        <div className="login-brand__grain" />
        <div className="login-brand__glow" />

        <div className="login-brand__inner">
          <div className="login-brand__top">
            <Logo size={38} radius={11} />
            <span className="login-logo__word">Content Intelligence</span>
          </div>

          <div className="login-brand__hero">
            <div className="login-eyebrow">AI CONTENT STRATEGY PLATFORM</div>
            <h1 className="login-brand__headline">
              Turn every source into<br />a content strategy.
            </h1>
            <p className="login-brand__sub">
              Analyze transcripts, surface opportunities, generate on-brand drafts,
              and track live trends - every step grounded in your knowledge base.
            </p>

            <ul className="login-brand__features">
              <li><Check /> AI analysis that reads, understands &amp; routes</li>
              <li><Check /> Grounded generation from your brand knowledge</li>
              <li><Check /> Live trend supervision across every account</li>
            </ul>
          </div>

          <div className="login-brand__stats">
            <Stat value="9" label="AI agents" />
            <span className="login-stat__div" />
            <Stat value="5" label="Accounts" />
            <span className="login-stat__div" />
            <Stat value="100%" label="KB-grounded" />
          </div>
        </div>
      </aside>

      {/* ─────────────────────────  RIGHT · SIGN IN  ───────────────────────── */}
      <main className="login-panel">
        <div className="login-card">
          <div className="login-card__brandline">
            <Logo size={46} radius={13} />
          </div>

          <h2 className="login-card__title">Welcome back</h2>
          <p className="login-card__desc">Sign in to continue to your workspace</p>

          {error && (
            <div className="login-error" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <button
            className="login-google"
            onClick={() => signInWithGoogle()}
            disabled={loading}
          >
            {loading ? (
              <svg className="login-spin" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="19" height="19" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 0 0 0 12c0 1.94.46 3.77 1.28 5.4l3.56-2.77.01-.54z" fill="#FBBC05"/>
                <path d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.09 14.97 0 12 0 7.7 0 3.99 2.47 2.18 6.07l3.66 2.84c.87-2.6 3.3-4.16 6.16-4.16z" fill="#EA4335"/>
              </svg>
            )}
            <span>{loading ? 'Signing in…' : 'Continue with Google'}</span>
          </button>

          <div className="login-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Restricted to <strong>@trilliantdigital.com</strong> accounts</span>
          </div>

          <div className="login-card__foot">
            © {new Date().getFullYear()} Trilliant Digital · Internal Platform
          </div>
        </div>
      </main>

      <style>{CSS}</style>
    </div>
  );
}

function Check() {
  return (
    <span className="login-feat-check">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    </span>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="login-stat">
      <div className="login-stat__value">{value}</div>
      <div className="login-stat__label">{label}</div>
    </div>
  );
}

const CSS = `
.login-root {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.05fr 1fr;
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: #ffffff;
}

/* ── LEFT / BRAND ─────────────────────────────────────────── */
.login-brand {
  position: relative;
  overflow: hidden;
  background: #0b0a1f;
  display: flex;
}
.login-brand__mesh {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(120% 90% at 15% 5%, rgba(124,58,237,0.55) 0%, transparent 45%),
    radial-gradient(90% 80% at 95% 25%, rgba(139,92,246,0.40) 0%, transparent 50%),
    radial-gradient(100% 90% at 80% 100%, rgba(67,56,202,0.45) 0%, transparent 55%),
    radial-gradient(70% 60% at 0% 100%, rgba(217,70,239,0.28) 0%, transparent 50%);
}
.login-brand__grain {
  position: absolute; inset: 0; opacity: 0.5; pointer-events: none;
  background-image: radial-gradient(rgba(255,255,255,0.35) 0.5px, transparent 0.5px);
  background-size: 3px 3px;
  mask-image: radial-gradient(80% 80% at 50% 40%, #000 0%, transparent 100%);
}
.login-brand__glow {
  position: absolute; width: 420px; height: 420px; border-radius: 50%;
  top: 30%; left: 45%; pointer-events: none;
  background: radial-gradient(circle, rgba(167,139,250,0.28) 0%, transparent 65%);
  filter: blur(30px);
  animation: login-float 9s ease-in-out infinite;
}
@keyframes login-float {
  0%,100% { transform: translate(0,0); }
  50% { transform: translate(-24px,-30px); }
}
.login-brand__inner {
  position: relative; z-index: 1;
  display: flex; flex-direction: column;
  padding: 3.25rem 3.5rem;
  width: 100%;
  animation: login-rise 0.6s cubic-bezier(0.16,1,0.3,1) both;
}
.login-brand__top { display: flex; align-items: center; gap: 0.75rem; }
.login-logo__word {
  color: #fff; font-weight: 650; font-size: 1.02rem; letter-spacing: -0.02em;
}
.login-brand__hero { margin-top: auto; margin-bottom: auto; padding: 2.25rem 0; }
.login-eyebrow {
  display: inline-block; color: #c4b5fd; font-size: 0.7rem; font-weight: 700;
  letter-spacing: 0.16em; margin-bottom: 1.1rem;
}
.login-brand__headline {
  color: #fff; font-size: 2.6rem; line-height: 1.12; font-weight: 700;
  letter-spacing: -0.035em; margin: 0 0 1.25rem;
}
.login-brand__sub {
  color: rgba(255,255,255,0.58); font-size: 1rem; line-height: 1.65;
  margin: 0 0 2.25rem; max-width: 30rem;
}
.login-brand__features {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 0.9rem;
}
.login-brand__features li {
  display: flex; align-items: center; gap: 0.75rem;
  color: rgba(255,255,255,0.8); font-size: 0.9rem; font-weight: 450;
}
.login-feat-check {
  width: 20px; height: 20px; border-radius: 999px; flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  background: rgba(139,92,246,0.22); color: #c4b5fd;
  border: 1px solid rgba(139,92,246,0.35);
}
.login-brand__stats {
  display: flex; align-items: center; gap: 1.5rem;
  padding-top: 1.75rem; border-top: 1px solid rgba(255,255,255,0.09);
}
.login-stat__value {
  color: #fff; font-size: 1.5rem; font-weight: 700; letter-spacing: -0.02em; line-height: 1;
}
.login-stat__label {
  color: rgba(255,255,255,0.42); font-size: 0.74rem; margin-top: 0.3rem; font-weight: 500;
}
.login-stat__div { width: 1px; height: 34px; background: rgba(255,255,255,0.1); }

/* ── RIGHT / SIGN IN ──────────────────────────────────────── */
.login-panel {
  display: flex; align-items: center; justify-content: center;
  padding: 2rem;
  background:
    radial-gradient(90% 60% at 100% 0%, rgba(124,58,237,0.05) 0%, transparent 60%),
    radial-gradient(80% 50% at 0% 100%, rgba(124,58,237,0.04) 0%, transparent 55%),
    #ffffff;
}
.login-card {
  width: 100%; max-width: 380px;
  animation: login-rise 0.6s cubic-bezier(0.16,1,0.3,1) 0.08s both;
}
.login-card__brandline { margin-bottom: 1.75rem; }
.login-card__title {
  font-size: 1.72rem; font-weight: 700; letter-spacing: -0.03em;
  color: #1e1b4b; margin: 0 0 0.4rem;
}
.login-card__desc {
  font-size: 0.925rem; color: #6b7280; margin: 0 0 2rem; line-height: 1.5;
}
.login-error {
  display: flex; align-items: flex-start; gap: 0.55rem;
  padding: 0.75rem 0.9rem; margin-bottom: 1.25rem;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 0.7rem;
  color: #dc2626; font-size: 0.82rem; line-height: 1.45;
}
.login-error svg { flex-shrink: 0; margin-top: 1px; }

.login-google {
  display: flex; align-items: center; justify-content: center; gap: 0.7rem;
  width: 100%; padding: 0.9rem 1.25rem;
  border-radius: 0.85rem; border: 1.5px solid #e5e7eb; background: #fff;
  color: #1f2937; font-size: 0.95rem; font-weight: 600; letter-spacing: -0.01em;
  cursor: pointer; outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.06s ease;
  box-shadow: 0 1px 2px rgba(16,24,40,0.04);
}
.login-google:hover:not(:disabled) {
  border-color: #7c3aed;
  box-shadow: 0 6px 20px rgba(124,58,237,0.16);
}
.login-google:active:not(:disabled) { transform: translateY(1px); }
.login-google:disabled { opacity: 0.65; cursor: wait; }
.login-spin { animation: login-spin 0.75s linear infinite; color: #7c3aed; }
@keyframes login-spin { to { transform: rotate(360deg); } }

.login-note {
  display: flex; align-items: center; justify-content: center; gap: 0.5rem;
  margin-top: 1.75rem; padding-top: 1.5rem;
  border-top: 1px solid #f1f1f4;
  color: #9ca3af; font-size: 0.78rem;
}
.login-note strong { color: #6b7280; font-weight: 600; }
.login-card__foot {
  text-align: center; margin-top: 1.25rem;
  color: #c4c4cf; font-size: 0.72rem;
}

@keyframes login-rise {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── RESPONSIVE ───────────────────────────────────────────── */
@media (max-width: 900px) {
  .login-root { grid-template-columns: 1fr; }
  .login-brand { display: none; }
  .login-panel { padding: 1.5rem; }
}
@media (min-width: 901px) {
  .login-card__brandline { display: none; }
}
`;
