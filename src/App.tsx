import { useState, useEffect } from "react";
import { BrowserRouter } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import AppShell from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/Toast";

import { supabaseConfigured } from "./lib/supabase";

function AuthPage() {
  const { signIn, signUp, loginDemo, loading, error } = useAuthStore();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [localError, setLocalError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    if (mode === "signup") {
      if (password !== confirm) {
        setLocalError("Passwords do not match");
        return;
      }
      if (password.length < 6) {
        setLocalError("Password must be at least 6 characters");
        return;
      }
      signUp(email, password, name);
    } else {
      signIn(email, password);
    }
  }

  const displayError = localError || error;

  return (
    <div className="app-outer">
      <div className="atmosphere" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          className="glass-card-static"
          style={{ maxWidth: 440, width: "100%", padding: "2.5rem" }}
        >
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "1rem",
                background: "linear-gradient(135deg, #6366F1, #7C3AED)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "1rem",
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l1.8 5.6L19 9.5l-5.2 1.9L12 17l-1.8-5.6L5 9.5l5.2-1.9L12 2z" />
              </svg>
            </div>
          </div>
          <h1 className="page-title" style={{ marginBottom: 8, textAlign: "center" }}>
            Content Intelligence
          </h1>
          <p className="page-desc" style={{ marginBottom: "1.5rem", textAlign: "center" }}>
            Knowledge-grounded content creation platform
          </p>

          {supabaseConfigured ? (
            <>
              <div className="underline-tabs" style={{ marginBottom: "1.2rem" }}>
                <button className={`u-tab${mode === "signin" ? " active" : ""}`} onClick={() => setMode("signin")}>
                  Sign In
                </button>
                <button className={`u-tab${mode === "signup" ? " active" : ""}`} onClick={() => setMode("signup")}>
                  Sign Up
                </button>
              </div>

              <form onSubmit={handleSubmit}>
                {mode === "signup" && (
                  <div className="field" style={{ marginBottom: "0.8rem" }}>
                    <label className="field-label">Name</label>
                    <input className="glass-input" type="text" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                )}
                <div className="field" style={{ marginBottom: "0.8rem" }}>
                  <label className="field-label">Email</label>
                  <input className="glass-input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="field" style={{ marginBottom: "0.8rem" }}>
                  <label className="field-label">Password</label>
                  <input className="glass-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
                {mode === "signup" && (
                  <div className="field" style={{ marginBottom: "0.8rem" }}>
                    <label className="field-label">Confirm Password</label>
                    <input className="glass-input" type="password" placeholder="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                  </div>
                )}

                {displayError && (
                  <div style={{ fontSize: "0.8rem", color: "#DC2626", marginBottom: "0.8rem", padding: "0.5rem", background: "#DC262610", borderRadius: "0.5rem" }}>
                    {displayError}
                  </div>
                )}

                <button className="btn btn-brand" type="submit" disabled={loading} style={{ width: "100%", justifyContent: "center", opacity: loading ? 0.6 : 1 }}>
                  {loading ? "Please wait..." : mode === "signin" ? "Sign In" : "Create Account"}
                </button>
              </form>
            </>
          ) : (
            <>
              <button className="btn btn-brand" style={{ width: "100%", justifyContent: "center" }} onClick={loginDemo}>
                Enter Application
              </button>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", marginTop: "1rem" }}>
                Running in local mode — configure Supabase for multi-tenant features
              </p>
            </>
          )}

          {supabaseConfigured && (
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "center", marginTop: "1rem", cursor: "pointer" }} onClick={loginDemo}>
              Or continue without an account (local mode)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const user = useAuthStore((s) => s.user);
  const initialized = useAuthStore((s) => s.initialized);
  const initialize = useAuthStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (!initialized) {
    return (
      <div className="app-outer">
        <div className="atmosphere" />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", position: "relative", zIndex: 1 }}>
          <div className="spin-dot" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--accent-primary)" }} />
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        {user ? <AppShell /> : <AuthPage />}
        <div id="toastRoot" />
      </ToastProvider>
    </BrowserRouter>
  );
}
