import { useState } from 'react';
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

const PRIORITY_COLORS: Record<string, string> = {
  High: '#DC2626',
  Medium: '#F59E0B',
  Low: '#9CA3AF',
};

const TIMELINESS_COLORS: Record<string, string> = {
  Trending: '#F472B6',
  'Time Sensitive': '#F59E0B',
  Evergreen: '#0EA5E9',
};

export default function OpportunitiesPage() {
  const opportunities = useAppStore((s) => s.opportunities);
  const updateOpportunityStatus = useAppStore((s) => s.updateOpportunityStatus);
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);
  const setStudioAsset = useAppStore((s) => s.setStudioAsset);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');

  const filtered = opportunities.filter((o) => {
    if (statusFilter === 'new' && o.status !== 'new') return false;
    if (statusFilter === 'sent' && o.status !== 'sent') return false;
    if (priorityFilter !== 'All' && o.priority !== priorityFilter) return false;
    return true;
  });

  function handleSendToStudio(id: string) {
    updateOpportunityStatus(id, 'sent');
    setActiveStudioOpp(id);
    setStudioAsset(null);
    setActiveTab('studio');
    showToast('Opportunity sent to Studio');
  }

  return (
    <div>
      <p className="eyebrow">Content Pipeline</p>
      <h1 className="page-title">Opportunities</h1>
      <p className="page-desc">Content opportunities surfaced from analyses. Filter, review, and send to Studio.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { key: 'all', label: 'All statuses' },
          { key: 'new', label: 'New' },
          { key: 'sent', label: 'Sent to Studio' },
        ].map((f) => (
          <button
            key={f.key}
            className={`badge${statusFilter === f.key ? '' : ''}`}
            style={{
              cursor: 'pointer',
              background: statusFilter === f.key ? 'var(--brand)' : undefined,
              color: statusFilter === f.key ? '#fff' : undefined,
            }}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />
        {['All', 'High', 'Medium', 'Low'].map((p) => (
          <button
            key={p}
            className="badge"
            style={{
              cursor: 'pointer',
              background: priorityFilter === p ? 'var(--brand)' : undefined,
              color: priorityFilter === p ? '#fff' : undefined,
            }}
            onClick={() => setPriorityFilter(p)}
          >
            {p === 'All' ? 'All priorities' : p}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>No opportunities match the current filters.</p>
          {opportunities.length === 0 && <p style={{ marginTop: 8, opacity: 0.7 }}>Run an analysis from the Dashboard to generate opportunities.</p>}
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((opp) => {
            const pc = PRIORITY_COLORS[opp.priority] || '#9CA3AF';
            const tc = TIMELINESS_COLORS[opp.timeliness] || '#9CA3AF';
            return (
              <div className="glass-card-static" key={opp.id} style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span className="badge" style={{ background: pc + '18', color: pc, fontWeight: 600 }}>
                    {opp.priority}
                  </span>
                  <span className="badge" style={{ background: tc + '18', color: tc }}>
                    {opp.timeliness}
                  </span>
                  {opp.status === 'sent' && (
                    <span className="badge" style={{ background: '#10B98118', color: '#10B981' }}>
                      In Studio
                    </span>
                  )}
                </div>

                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{opp.title}</h3>

                <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>
                  {opp.personaName
                    ? `${opp.personaName} — relevance ${opp.personaRelevanceScore}/10`
                    : 'No specific persona match'}
                </p>

                <p style={{ fontSize: 13, marginBottom: 10 }}>{opp.contentAngle}</p>

                <div className="hairline" />

                <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                  <strong>Format:</strong> {opp.recommendedFormat}
                </p>
                <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{opp.recommendationReason}</p>

                {opp.unsuitableFormatNotes && (
                  <p style={{ fontSize: 12, color: '#F59E0B', marginBottom: 8 }}>
                    Unsuitable: {opp.unsuitableFormatNotes}
                  </p>
                )}

                {opp.status !== 'sent' && (
                  <button className="btn btn-primary btn-sm" onClick={() => handleSendToStudio(opp.id)}>
                    Send to Studio &rarr;
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
