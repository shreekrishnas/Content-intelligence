import { BrowserRouter } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import AppShell from "./components/layout/AppShell";
import { ToastProvider } from "./components/ui/Toast";

function LoginPage() {
  const login = useAuthStore((s) => s.loginDemo);

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
          style={{ maxWidth: 420, width: "100%", padding: "2.5rem" }}
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
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2l1.8 5.6L19 9.5l-5.2 1.9L12 17l-1.8-5.6L5 9.5l5.2-1.9L12 2z" />
              </svg>
            </div>
          </div>
          <h1 className="page-title" style={{ marginBottom: 8, textAlign: "center" }}>
            Content Intelligence
          </h1>
          <p
            className="page-desc"
            style={{ marginBottom: "1.5rem", textAlign: "center" }}
          >
            Multi-tenant, knowledge-grounded content creation platform
          </p>
          <button
            className="btn btn-brand"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={login}
          >
            Enter Demo Mode
          </button>
          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--text-muted)",
              textAlign: "center",
              marginTop: "1rem",
            }}
          >
            Supabase auth will replace this in production
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const user = useAuthStore((s) => s.user);

  return (
    <BrowserRouter>
      <ToastProvider>
        {user ? <AppShell /> : <LoginPage />}
        <div id="toastRoot" />
      </ToastProvider>
    </BrowserRouter>
  );
}
