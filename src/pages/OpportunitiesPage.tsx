import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import type { Opportunity } from '@/types';

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
  high: '#DC2626',
  medium: '#F59E0B',
  standard: '#0EA5E9',
  low: '#9CA3AF',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  open: { bg: '#10B98118', color: '#10B981' },
  in_studio: { bg: '#6366F118', color: '#6366F1' },
  dropped: { bg: '#9CA3AF18', color: '#9CA3AF' },
};

export default function OpportunitiesPage() {
  const { accountId } = useAccount();
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);
  const setStudioAsset = useAppStore((s) => s.setStudioAsset);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const loadOpps = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.opportunities.list(accountId);
    setOpportunities(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadOpps(); }, [loadOpps]);

  const filtered = opportunities.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    return true;
  });

  async function handleSendToStudio(opp: Opportunity) {
    const { error } = await api.opportunities.updateStatus(opp.id, 'in_studio');
    if (error) { showToast(error, 'error'); return; }

    await auditLog({
      accountId: accountId!,
      action: 'send_to_studio',
      targetType: 'opportunity',
      targetId: opp.id,
    });

    setActiveStudioOpp(opp.id);
    setStudioAsset(null);
    setActiveTab('studio');
    showToast('Opportunity sent to Studio');
  }

  async function handleDrop(opp: Opportunity) {
    const { error } = await api.opportunities.updateStatus(opp.id, 'dropped');
    if (error) { showToast(error, 'error'); return; }
    showToast('Opportunity dropped');
    loadOpps();
  }

  if (loading) {
    return (
      <div>
        <p className="eyebrow">Content Pipeline</p>
        <h1 className="page-title">Opportunities</h1>
        <div className="empty-state"><p>Loading...</p></div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Content Pipeline</p>
      <h1 className="page-title">Opportunities</h1>
      <p className="page-desc">Content opportunities surfaced from analyses. Filter, review, and send to Studio.</p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { key: 'all', label: `All (${opportunities.length})` },
          { key: 'open', label: `Open (${opportunities.filter((o) => o.status === 'open').length})` },
          { key: 'in_studio', label: `In Studio (${opportunities.filter((o) => o.status === 'in_studio').length})` },
          { key: 'dropped', label: `Dropped (${opportunities.filter((o) => o.status === 'dropped').length})` },
        ].map((f) => (
          <button
            key={f.key}
            className="badge"
            style={{ cursor: 'pointer', background: statusFilter === f.key ? 'var(--brand)' : undefined, color: statusFilter === f.key ? '#fff' : undefined }}
            onClick={() => setStatusFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>{opportunities.length === 0 ? 'No opportunities yet. Run an analysis to generate opportunities.' : 'No opportunities match the current filter.'}</p>
        </div>
      ) : (
        <div className="grid grid-3">
          {filtered.map((opp) => {
            const pc = PRIORITY_COLORS[opp.priority || 'standard'] || '#9CA3AF';
            const sc = STATUS_COLORS[opp.status] || STATUS_COLORS.open;
            return (
              <div className="glass-card-static" key={opp.id} style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {opp.priority && (
                    <span className="badge" style={{ background: pc + '18', color: pc, fontWeight: 600 }}>
                      {opp.priority}
                    </span>
                  )}
                  <span className="badge" style={{ background: sc.bg, color: sc.color }}>
                    {opp.status.replace('_', ' ')}
                  </span>
                </div>

                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{opp.title}</h3>

                {opp.persona_name && (
                  <p style={{ fontSize: 13, opacity: 0.75, marginBottom: 4 }}>
                    {opp.persona_name}
                    {opp.persona_relevance_score != null && ` — relevance ${opp.persona_relevance_score}`}
                  </p>
                )}

                {opp.content_angle && <p style={{ fontSize: 13, marginBottom: 10 }}>{opp.content_angle}</p>}

                <div className="hairline" />

                {opp.format && (
                  <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}><strong>Format:</strong> {opp.format}</p>
                )}
                {opp.recommendation_reason && (
                  <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>{opp.recommendation_reason}</p>
                )}

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {opp.status === 'open' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => handleSendToStudio(opp)}>
                        Send to Studio &rarr;
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDrop(opp)}>
                        Drop
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
