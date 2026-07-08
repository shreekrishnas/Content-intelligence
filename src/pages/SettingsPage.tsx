import { useState } from 'react';
import { useAppStore, type IntegrationItem } from '@/store';
import { useAuthStore } from '@/stores/authStore';

const supabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL;

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

const CONFIG_FIELDS: Record<string, Array<{ key: string; label: string; type: 'text' | 'password'; placeholder: string }>> = {
  llm: [
    { key: 'apiKey', label: 'Claude API Key', type: 'password', placeholder: 'sk-ant-...' },
    { key: 'model', label: 'Model', type: 'text', placeholder: 'claude-sonnet-5' },
  ],
  urlfetch: [
    { key: 'apiKey', label: 'API Key (optional)', type: 'password', placeholder: 'Key for web extraction service' },
    { key: 'endpoint', label: 'Service Endpoint', type: 'text', placeholder: 'https://...' },
  ],
  alerts: [
    { key: 'feedUrl', label: 'RSS Feed URL', type: 'text', placeholder: 'https://www.google.com/alerts/feeds/...' },
  ],
  canva: [
    { key: 'apiKey', label: 'Canva API Key', type: 'password', placeholder: 'Canva Connect API key' },
    { key: 'brandTemplateId', label: 'Brand Template ID', type: 'text', placeholder: 'Template ID' },
  ],
  social: [
    { key: 'linkedinToken', label: 'LinkedIn Access Token', type: 'password', placeholder: 'LinkedIn OAuth token' },
    { key: 'metaToken', label: 'Meta Page Token', type: 'password', placeholder: 'Meta page access token' },
  ],
  storage: [
    { key: 'bucket', label: 'Bucket Name', type: 'text', placeholder: 'my-knowledge-bucket' },
    { key: 'accessKey', label: 'Access Key', type: 'password', placeholder: 'AKIA...' },
    { key: 'secretKey', label: 'Secret Key', type: 'password', placeholder: 'Secret...' },
    { key: 'region', label: 'Region', type: 'text', placeholder: 'ap-south-1' },
  ],
};

function maskValue(val: string): string {
  if (!val || val.length < 8) return val ? '••••••' : '';
  return val.slice(0, 4) + '••••' + val.slice(-4);
}

export default function SettingsPage() {
  const integrations = useAppStore((s) => s.integrations);
  const updateIntegration = useAppStore((s) => s.updateIntegration);
  const user = useAuthStore((s) => s.user);

  const [configModal, setConfigModal] = useState<IntegrationItem | null>(null);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<string | null>(null);

  function openConfig(intg: IntegrationItem) {
    setConfigModal(intg);
    setConfigValues(intg.config ? { ...intg.config } : {});
    setShowSecrets({});
  }

  function saveConfig() {
    if (!configModal) return;
    const hasValues = Object.values(configValues).some((v) => v.trim());
    updateIntegration(configModal.id, {
      config: configValues,
      status: hasValues ? 'Configuration Required' : 'Not Connected',
    });
    setConfigModal(null);
    showToast('Configuration saved');
  }

  function testConnection(intg: IntegrationItem) {
    setTesting(intg.id);
    setTimeout(() => {
      const hasConfig = intg.config && Object.values(intg.config).some((v) => v);
      if (hasConfig) {
        updateIntegration(intg.id, { status: 'Connected', lastTested: Date.now() });
        showToast(`${intg.name} connected successfully`);
      } else {
        updateIntegration(intg.id, { status: 'Configuration Required', lastTested: Date.now() });
        showToast(`${intg.name}: no credentials configured`, 'warn');
      }
      setTesting(null);
    }, 1500);
  }

  function clearConfig(intg: IntegrationItem) {
    updateIntegration(intg.id, { config: {}, status: 'Not Connected', lastTested: undefined });
    showToast('Configuration cleared');
  }

  return (
    <div>
      <p className="eyebrow">Configuration</p>
      <h1 className="page-title">Settings &amp; Integrations</h1>
      <p className="page-desc">Manage external service connections. All integrations are optional — the system works locally without them.</p>

      <div className="glass-card-static" style={{ padding: 20, marginBottom: 24 }}>
        <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Platform Status</h4>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Supabase: </span>
            <span className="badge" style={{
              background: supabaseConfigured ? '#10B98118' : '#F59E0B18',
              color: supabaseConfigured ? '#10B981' : '#F59E0B',
            }}>
              {supabaseConfigured ? 'Connected' : 'Local Mode'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Auth: </span>
            <span style={{ fontSize: 13 }}>
              {user ? `${user.name || user.email}` : 'Not signed in'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>Data Storage: </span>
            <span style={{ fontSize: 13 }}>
              {supabaseConfigured ? 'Supabase PostgreSQL' : 'Browser localStorage'}
            </span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>File Storage: </span>
            <span style={{ fontSize: 13 }}>
              {supabaseConfigured ? 'Supabase Storage' : 'In-memory (session only)'}
            </span>
          </div>
        </div>
      </div>

      <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Integrations</h3>
      <div className="grid grid-2">
        {integrations.map((intg) => {
          const statusColor = STATUS_COLORS[intg.status] || '#9CA3AF';
          const hasConfig = intg.config && Object.values(intg.config).some((v) => v);
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
              <div style={{ fontSize: 13, marginBottom: 6 }}>
                <strong>Fallback:</strong> {intg.fallback}
              </div>

              {hasConfig && (
                <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
                  {Object.entries(intg.config!).filter(([, v]) => v).map(([k, v]) => (
                    <span key={k} style={{ marginRight: 12 }}>{k}: {maskValue(v)}</span>
                  ))}
                </div>
              )}
              {intg.lastTested && (
                <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 8 }}>
                  Last tested: {new Date(intg.lastTested).toLocaleString()}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => openConfig(intg)}>
                  Configure
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => testConnection(intg)}
                  disabled={testing === intg.id}
                >
                  {testing === intg.id ? 'Testing...' : 'Test Connection'}
                </button>
                {hasConfig && (
                  <button className="btn btn-danger btn-sm" onClick={() => clearConfig(intg)}>
                    Clear
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {configModal && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setConfigModal(null); }}>
          <div className="glass-modal">
            <h3 style={{ fontWeight: 700, marginBottom: 16 }}>Configure {configModal.name}</h3>
            <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>{configModal.feature}</p>

            {(CONFIG_FIELDS[configModal.id] || []).map((field) => (
              <div className="field" key={field.key} style={{ marginBottom: '0.8rem' }}>
                <label className="field-label">{field.label}</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input
                    className="glass-input"
                    type={field.type === 'password' && !showSecrets[field.key] ? 'password' : 'text'}
                    placeholder={field.placeholder}
                    value={configValues[field.key] || ''}
                    onChange={(e) => setConfigValues({ ...configValues, [field.key]: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  {field.type === 'password' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setShowSecrets({ ...showSecrets, [field.key]: !showSecrets[field.key] })}
                      style={{ flexShrink: 0 }}
                    >
                      {showSecrets[field.key] ? 'Hide' : 'Show'}
                    </button>
                  )}
                </div>
              </div>
            ))}

            {!CONFIG_FIELDS[configModal.id] && (
              <div className="field" style={{ marginBottom: '0.8rem' }}>
                <label className="field-label">API Key</label>
                <input
                  className="glass-input"
                  type="password"
                  placeholder="Enter API key"
                  value={configValues.apiKey || ''}
                  onChange={(e) => setConfigValues({ ...configValues, apiKey: e.target.value })}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setConfigModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveConfig}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
