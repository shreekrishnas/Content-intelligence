import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabaseConfigured } from '@/lib/supabase';
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

function QualityPanel({ quality }: { quality: Record<string, string> }) {
  return (
    <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
      <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Quality Review</h4>
      <div className="grid grid-4">
        {Object.entries(quality).map(([k, v]) => {
          const color = v === 'ok' ? '#10B981' : v === 'fail' ? '#DC2626' : '#F59E0B';
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{k}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ContextRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{label}: </span>
      <span style={{ fontSize: 13 }}>{value}</span>
    </div>
  );
}

export default function StudioPage() {
  const { accountId } = useAccount();
  const activeStudioOpp = useAppStore((s) => s.activeStudioOpp);
  const studioAsset = useAppStore((s) => s.studioAsset);
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);
  const setStudioAsset = useAppStore((s) => s.setStudioAsset);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [working, setWorking] = useState(false);
  const [workingMsg, setWorkingMsg] = useState('');
  const contentRef = useRef<HTMLDivElement>(null);

  const loadOpps = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    const { data } = await api.opportunities.list(accountId);
    setOpportunities(data || []);
    setLoading(false);
  }, [accountId]);

  useEffect(() => { loadOpps(); }, [loadOpps]);

  const studioOpps = opportunities.filter((o) => o.status === 'in_studio');
  const activeOpp = activeStudioOpp ? opportunities.find((o) => o.id === activeStudioOpp) : null;

  async function getKbChunks(): Promise<string[]> {
    if (!accountId) return [];
    const result = await retrieve(accountId, activeOpp?.title || '', 'generation');
    if (result.refused) return [];
    return [
      ...result.constraintChunks.map((c) => c.chunk_text),
      ...result.chunks.map((c) => c.chunk_text),
    ];
  }

  if (loading) {
    return (
      <div>
        <p className="eyebrow">Content Studio</p>
        <h1 className="page-title">Studio</h1>
        <div className="empty-state"><p>Loading...</p></div>
      </div>
    );
  }

  if (!activeOpp) {
    return (
      <div>
        <p className="eyebrow">Content Studio</p>
        <h1 className="page-title">Studio</h1>
        <p className="page-desc">Select an opportunity to begin content creation.</p>

        {studioOpps.length === 0 ? (
          <div className="empty-state">
            <p>No opportunities in Studio yet.</p>
            <p style={{ marginTop: 8, opacity: 0.7 }}>Send opportunities from the Opportunities page.</p>
          </div>
        ) : (
          <div className="grid grid-3">
            {studioOpps.map((opp) => (
              <div
                key={opp.id}
                className="glass-card-static"
                style={{ padding: 20, cursor: 'pointer' }}
                onClick={() => setActiveStudioOpp(opp.id)}
              >
                <span className="badge" style={{ background: '#6366F118', color: '#6366F1', marginBottom: 8, display: 'inline-block' }}>
                  In Studio
                </span>
                <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{opp.title}</h3>
                <p style={{ fontSize: 13, opacity: 0.7 }}>{opp.content_angle}</p>
                <p style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>{opp.format}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!supabaseConfigured) {
    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setActiveStudioOpp(null)} style={{ marginBottom: 12 }}>&larr; All opportunities</button>
        <h2 className="page-title" style={{ marginBottom: 16 }}>{activeOpp.title}</h2>
        <div className="glass-card-static" style={{ padding: '1.5rem', borderLeft: '3px solid var(--status-warning)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--status-warning)' }}>
            Database connection required for content generation. Configure Supabase to enable Studio features.
          </p>
        </div>
      </div>
    );
  }

  if (!studioAsset) {
    async function handleGenerate() {
      setWorking(true);
      setWorkingMsg('Generating outline...');
      try {
        const kbChunks = await getKbChunks();
        const res = await api.studio.generateOutline(activeOpp!.id, kbChunks);
        if (res.error) throw new Error(res.error);

        setStudioAsset({
          stage: 'outline',
          outline: res.data!,
          draft: '',
          feedbackLog: [],
          sourceRefs: [],
          visualRec: { concept: '', format: '', data: '' },
          calendared: false,
        });

        await auditLog({
          accountId: accountId!,
          action: 'generate_outline',
          targetType: 'opportunity',
          targetId: activeOpp!.id,
        });

        showToast('Outline generated');
      } catch (e: any) {
        showToast(e.message || 'Outline generation failed', 'error');
      } finally {
        setWorking(false);
        setWorkingMsg('');
      }
    }

    return (
      <div>
        <button className="btn btn-ghost btn-sm" onClick={() => setActiveStudioOpp(null)} style={{ marginBottom: 12 }}>&larr; All opportunities</button>
        <h2 className="page-title" style={{ marginBottom: 16 }}>{activeOpp.title}</h2>

        <div className="glass-card-static" style={{ padding: 20, marginBottom: 20 }}>
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Content Context</h4>
          <div className="grid grid-2" style={{ gap: 12 }}>
            <ContextRow label="Content Angle" value={activeOpp.content_angle || 'N/A'} />
            <ContextRow label="Format" value={activeOpp.format || 'N/A'} />
            {(activeOpp as any).persona_name && <ContextRow label="Persona" value={(activeOpp as any).persona_name} />}
          </div>
        </div>

        <button className="btn btn-brand" onClick={handleGenerate} disabled={working}>
          {working ? workingMsg : 'Generate Outline'}
        </button>
      </div>
    );
  }

  const asset = studioAsset;
  const { stage } = asset;

  async function handleRegenerate() {
    if (!feedback.trim()) {
      showToast('Enter feedback before regenerating', 'warn');
      return;
    }
    setWorking(true);
    setWorkingMsg('Regenerating with feedback...');
    try {
      const currentContent = contentRef.current?.innerText || (stage === 'outline' ? asset.outline : asset.draft);
      const kbChunks = await getKbChunks();
      const res = await api.studio.regenerate(currentContent, feedback, kbChunks);
      if (res.error) throw new Error(res.error);

      const newLog = [...asset.feedbackLog, { stage, feedback, at: Date.now() }];
      if (stage === 'outline') {
        setStudioAsset({ ...asset, outline: res.data!, feedbackLog: newLog });
      } else {
        setStudioAsset({ ...asset, draft: res.data!, feedbackLog: newLog });
      }
      setFeedback('');
      showToast('Content regenerated');
    } catch (e: any) {
      showToast(e.message || 'Regeneration failed', 'error');
    } finally {
      setWorking(false);
      setWorkingMsg('');
    }
  }

  async function handleApproveOutline() {
    const outlineText = contentRef.current?.innerText || asset.outline;
    setWorking(true);
    setWorkingMsg('Generating draft from outline...');
    try {
      const kbChunks = await getKbChunks();
      const res = await api.studio.generateDraft(activeOpp!.id, outlineText, kbChunks);
      if (res.error) throw new Error(res.error);

      setStudioAsset({ ...asset, stage: 'draft', outline: outlineText, draft: res.data! });

      await auditLog({
        accountId: accountId!,
        action: 'approve_outline',
        targetType: 'opportunity',
        targetId: activeOpp!.id,
      });

      showToast('Outline approved. Draft generated.');
    } catch (e: any) {
      showToast(e.message || 'Draft generation failed', 'error');
    } finally {
      setWorking(false);
      setWorkingMsg('');
    }
  }

  async function handleApproveDraft() {
    const draftText = contentRef.current?.innerText || asset.draft;
    setWorking(true);
    setWorkingMsg('Running quality review...');
    try {
      const kbChunks = await getKbChunks();
      const res = await api.studio.qualityReview(draftText, kbChunks);
      if (res.error) throw new Error(res.error);

      setStudioAsset({ ...asset, stage: 'approved', draft: draftText, quality: res.data });

      await auditLog({
        accountId: accountId!,
        action: 'approve_draft',
        targetType: 'opportunity',
        targetId: activeOpp!.id,
      });

      showToast('Draft approved. Quality review complete.');
    } catch (e: any) {
      showToast(e.message || 'Quality review failed', 'error');
    } finally {
      setWorking(false);
      setWorkingMsg('');
    }
  }

  async function handleSendToCalendar() {
    if (!accountId) return;
    const { error } = await api.calendar.add({
      account_id: accountId,
      asset_id: null,
      title: activeOpp!.title,
      format: activeOpp!.format,
      scheduled_for: null,
      status: 'scheduled',
    });
    if (error) { showToast(error, 'error'); return; }

    await auditLog({
      accountId,
      action: 'send_to_calendar',
      targetType: 'opportunity',
      targetId: activeOpp!.id,
    });

    setStudioAsset({ ...asset, calendared: true });
    showToast('Content added to calendar');
  }

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => setActiveStudioOpp(null)} style={{ marginBottom: 12 }}>&larr; All opportunities</button>
      <h2 className="page-title" style={{ marginBottom: 4 }}>{activeOpp.title}</h2>
      <p className="page-desc" style={{ marginBottom: 16 }}>
        Stage: <span className="badge" style={{ marginLeft: 4 }}>{stage}</span>
      </p>

      {working && (
        <div className="glass-card-static" style={{ padding: 16, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="spin-dot" style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0 }} />
          <span style={{ fontSize: 13 }}>{workingMsg}</span>
        </div>
      )}

      {stage === 'approved' ? (
        <>
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 8 }}>Approved Draft</h4>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{asset.draft}</pre>
          </div>

          {asset.quality && <QualityPanel quality={asset.quality} />}

          {!asset.calendared ? (
            <button className="btn btn-brand" onClick={handleSendToCalendar}>Send to Calendar</button>
          ) : (
            <span className="badge" style={{ background: '#10B98118', color: '#10B981' }}>Added to Calendar</span>
          )}
        </>
      ) : (
        <>
          <div className="glass-card-static" style={{ padding: 20, marginBottom: 16 }}>
            <h4 style={{ fontWeight: 700, marginBottom: 8 }}>
              {stage === 'outline' ? 'Outline' : 'Draft'}
            </h4>
            <div
              ref={contentRef}
              className="glass-textarea"
              contentEditable
              suppressContentEditableWarning
              style={{ minHeight: 180, whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}
            >
              {stage === 'outline' ? asset.outline : asset.draft}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <textarea
              className="glass-textarea"
              placeholder="Enter feedback for regeneration..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              style={{ flex: 1, minWidth: 200, minHeight: 48 }}
            />
            <button className="btn btn-secondary btn-sm" onClick={handleRegenerate} disabled={working}>
              {working ? 'Working...' : 'Regenerate'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={stage === 'outline' ? handleApproveOutline : handleApproveDraft}
              disabled={working}
            >
              {working ? 'Working...' : stage === 'outline' ? 'Approve outline' : 'Approve draft'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
