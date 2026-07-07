import { useAppStore } from '@/store';

function showToast(msg: string, kind: 'success' | 'error' | 'warn' = 'success') {
  const el = document.createElement('div');
  el.className = 'toast';
  const color = kind === 'error' ? '#DC2626' : kind === 'warn' ? '#F59E0B' : '#10B981';
  el.innerHTML = `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></span>${msg}`;
  const root = document.getElementById('toastRoot');
  if (root) root.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s ease'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3200);
}

const STATUS_COLORS: Record<string, string> = {
  'Connected': '#10B981',
  'Configuration Required': '#F59E0B',
  'Connection Error': '#DC2626',
  'Not Connected': '#9CA3AF',
};

export default function SettingsPage() {
  const integrations = useAppStore((s) => s.integrations);

  return (
    <div>
      <p className="eyebrow">Configuration</p>
      <h1 className="page-title">Settings &amp; Integrations</h1>
      <p className="page-desc">Manage external service connections. All integrations are optional — the system works in demo mode without them.</p>

      <div className="grid grid-2">
        {integrations.map((intg) => {
          const statusColor = STATUS_COLORS[intg.status] || '#9CA3AF';
          return (
            <div className="glass-card-static" key={intg.id} style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <h3 style={{ fontWeight: 700, fontSize: 15 }}>{intg.name}</h3>
                <span className="badge" style={{ background: statusColor + '18', color: statusColor, fontWeight: 600 }}>
                  {intg.status}
                </span>
              </div>

              <span className="badge" style={{ marginBottom: 12, display: 'inline-block' }}>{intg.category}</span>

              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Required for:</strong> {intg.feature}
              </div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Provider:</strong> {intg.provider}
              </div>
              <div style={{ fontSize: 13, marginBottom: 12 }}>
                <strong>Fallback:</strong> {intg.fallback}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => showToast('Configuration panel not available in demo mode', 'warn')}
                >
                  Configure
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => showToast('Connection test not available in demo mode', 'warn')}
                >
                  Test Connection
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
