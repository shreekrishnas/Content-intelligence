import { useState, useEffect, useMemo, useRef } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { supabaseConfigured } from '@/lib/supabase';
import type { TrendProfile, TrendRecord } from '@/types';
import { showToast } from '@/lib/toast';


const CLASS_META: Record<string, { label: string; color: string }> = {
  domain_trend: { label: 'Domain Trend', color: '#10B981' },
  supertrend_exception: { label: 'Supertrend', color: '#8B5CF6' },
  monitor: { label: 'Monitor', color: '#F59E0B' },
  reject: { label: 'Rejected', color: '#9CA3AF' },
};

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#F59E0B', medium: '#0EA5E9', low: '#9CA3AF', experimental: '#8B5CF6',
};

function ScorePill({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const good = invert ? value <= 40 : value >= 60;
  const mid = value >= 40 && value < 60;
  const color = good ? '#10B981' : mid ? '#F59E0B' : (invert ? '#10B981' : '#DC2626');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', width: 30 }}>{label}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', minWidth: 30 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color }} />
      </div>
      <span style={{ fontSize: '0.62rem', width: 22, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

const EMPTY_PROFILE: TrendProfile = { enabled: false, max_recommendations: 8 };

export default function TrendsPage() {
  const { accountId, account } = useAccount();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setIdeasSeed = useAppStore((s) => s.setIdeasSeed);

  const [profile, setProfile] = useState<TrendProfile>(EMPTY_PROFILE);
  const [showProfile, setShowProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [records, setRecords] = useState<TrendRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('actionable');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const autoDetectRanRef = useRef<Set<string>>(new Set());
  const accountRef = useRef(account);
  accountRef.current = account;

  const accountMeta = useMemo(() => {
    return { url: (account?.profile as any)?.website_url || '', name: account?.name || '' };
  }, [account]);

  async function loadRecords() {
    if (!accountId || !supabaseConfigured) return;
    const recs = await api.trends.list(accountId);
    setRecords(recs.data || []);
  }

  // Single effect: load data on account change, auto-detect if needed (once per account)
  useEffect(() => {
    if (!accountId || !supabaseConfigured) { setLoading(false); return; }

    let stale = false;
    const acctId = accountId;
    const acctUrl = accountMeta.url;
    const acctName = accountMeta.name;

    (async () => {
      setLoading(true); setError(null); setNote(null);

      // Step 1: Load saved profile + existing records
      const [prof, recs] = await Promise.all([
        api.trends.getProfile(acctId),
        api.trends.list(acctId),
      ]);
      if (stale) return;

      const savedProfile = prof.data;
      const currentProfile = savedProfile
        ? { ...EMPTY_PROFILE, ...savedProfile, business_name: savedProfile.business_name || acctName }
        : { ...EMPTY_PROFILE, business_name: acctName };
      setProfile(currentProfile);
      setRecords(recs.data || []);
      setLoading(false);

      // Step 2: If no profile saved yet, auto-detect once
      const hasProfile = !!(savedProfile?.core_topics || savedProfile?.industry);
      if (hasProfile || !acctUrl || autoDetectRanRef.current.has(acctId)) return;

      autoDetectRanRef.current.add(acctId);
      setDetecting(true);

      try {
        // 2a: Auto-detect profile from URL
        const detectRes = await api.trends.autoDetectProfile(acctUrl, acctName);
        if (stale) return;
        if (detectRes.error) { setError(detectRes.error); return; }

        const detected = detectRes.data || {};
        const updated: TrendProfile = {
          ...EMPTY_PROFILE,
          business_name: acctName,
          ...Object.fromEntries(Object.entries(detected).filter(([, v]) => v && String(v).trim())),
          website_url: acctUrl,
        };
        setProfile(updated);
        await api.trends.saveProfile(acctId, updated);
        if (stale) return;
        showToast('Domain profile auto-detected');

        // 2b: Run initial scan with detected profile
        setScanning(true);
        const scanRes = await api.trends.runScan({ accountId: acctId, accountLabel: acctName, profile: updated, mode: 'suggest' });
        if (stale) return;

        if (scanRes.error) { setError(scanRes.error); return; }
        if (scanRes.data?.note) setNote(scanRes.data.note);

        const topics = scanRes.data?.topics || [];
        if (!topics.length) { setNote(scanRes.data?.note || 'No trends qualified.'); return; }

        // 2c: Save scan results and load fresh records
        if (!scanRes.data?.saved) {
          const { error: saveErr } = await api.trends.saveScan(acctId, 'auto-detect', topics);
          if (saveErr) { setError(`Scanned but could not save: ${saveErr}`); return; }
        }
        auditLog({ accountId: acctId, action: 'trend_scan', targetType: 'trend', detail: { source: 'auto-detect', count: topics.length } }).catch(() => {});

        if (stale) return;
        const freshRecs = await api.trends.list(acctId);
        if (stale) return;
        setRecords(freshRecs.data || []);
        showToast(`Auto-scan complete — ${topics.length} topics reviewed`);
      } finally {
        if (!stale) { setDetecting(false); setScanning(false); }
      }
    })();

    return () => { stale = true; };
  }, [accountId, accountMeta.url, accountMeta.name]);

  async function saveProfile() {
    if (!accountId) return;
    setSavingProfile(true);
    const { error: e } = await api.trends.saveProfile(accountId, profile);
    setSavingProfile(false);
    if (e) { showToast(e, 'error'); return; }
    showToast('Domain profile saved');
    setShowProfile(false);
  }

  async function runScan(mode: 'live' | 'suggest') {
    if (!accountId) return;
    setScanning(true); setError(null); setNote(null);
    try {
      const res = await api.trends.runScan({ accountId, accountLabel: accountMeta.name, profile, mode });
      if (res.error) { setError(res.error); return; }
      if (res.data?.note) setNote(res.data.note);
      const topics = res.data?.topics || [];
      if (!topics.length) { setNote(res.data?.note || 'No trends qualified from this scan.'); return; }
      if (!res.data?.saved) {
        const { error: saveErr } = await api.trends.saveScan(accountId, res.data?.source || mode, topics);
        if (saveErr) { setError(`Scanned but could not save: ${saveErr}`); return; }
      }
      auditLog({ accountId, action: 'trend_scan', targetType: 'trend', detail: { source: res.data?.source || mode, count: topics.length } }).catch(() => {});
      await loadRecords();
      showToast(`Scan complete — ${topics.length} topics reviewed`);
    } finally { setScanning(false); }
  }

  async function supervisePasted() {
    if (!accountId) return;
    const signals = pasteText.split('\n').map((l) => l.trim()).filter(Boolean).map((topic) => ({ topic }));
    if (!signals.length) { showToast('Enter at least one topic', 'warn'); return; }
    setScanning(true); setError(null); setNote(null);
    try {
      const res = await api.trends.superviseManual({ accountLabel: accountMeta.name, profile, signals });
      if (res.error) { setError(res.error); return; }
      const topics = res.data?.topics || [];
      if (!topics.length) { setNote('No trends qualified.'); return; }
      const { error: saveErr } = await api.trends.saveScan(accountId, 'manual', topics);
      if (saveErr) { setError(`Could not save: ${saveErr}`); return; }
      auditLog({ accountId, action: 'trend_scan', targetType: 'trend', detail: { source: 'manual', count: topics.length } }).catch(() => {});
      await loadRecords();
      setPasteText(''); setPasteOpen(false);
      showToast(`Reviewed ${signals.length} pasted topics`);
    } finally { setScanning(false); }
  }

  function routeToIdeas(t: TrendRecord) {
    setIdeasSeed({
      topic: t.topic,
      audience: profile.target_audience,
      context: [t.summary, t.suggested_connection && `Connection: ${t.suggested_connection}`, t.reason && `Why: ${t.reason}`].filter(Boolean).join('\n'),
    });
    setActiveTab('ideas');
  }

  async function createOpportunity(t: TrendRecord) {
    if (!accountId) return;
    const { error: e } = await api.opportunities.createFromAnalysis(accountId, null as any, [{
      title: t.topic,
      content_angle: t.suggested_connection || t.summary,
      format: (t.recommended_formats?.[0] as string) || 'blog_post',
      priority: t.priority,
      source_context: t.reason,
    }]);
    if (e) { showToast(e, 'error'); return; }
    await api.trends.updateStatus(accountId, t.id, 'actioned');
    showToast('Opportunity created');
    loadRecords();
  }

  async function addToCalendar(t: TrendRecord) {
    if (!accountId) return;
    const body = [t.summary, t.suggested_connection && `Connection: ${t.suggested_connection}`, t.reason && `Rationale: ${t.reason}`, t.related_keywords?.length ? `Keywords: ${t.related_keywords.join(', ')}` : ''].filter(Boolean).join('\n\n');
    const { error: e } = await api.calendar.add({
      account_id: accountId, asset_id: null, title: t.topic,
      format: (t.recommended_formats?.[0] as string) || 'content', scheduled_for: null, status: 'scheduled', body,
    });
    if (e) { showToast(e, 'error'); return; }
    await api.trends.updateStatus(accountId, t.id, 'actioned');
    showToast('Added to Calendar');
    loadRecords();
  }

  async function setStatus(t: TrendRecord, status: TrendRecord['status']) {
    if (!accountId) return;
    const { error: e } = await api.trends.updateStatus(accountId, t.id, status);
    if (e) { showToast(e, 'error'); return; }
    loadRecords();
  }

  async function del(t: TrendRecord) {
    if (!accountId) return;
    await api.trends.remove(accountId, t.id);
    loadRecords();
  }

  const counts = useMemo(() => ({
    actionable: records.filter((r) => r.classification === 'domain_trend' || r.classification === 'supertrend_exception').length,
    domain_trend: records.filter((r) => r.classification === 'domain_trend').length,
    supertrend_exception: records.filter((r) => r.classification === 'supertrend_exception').length,
    monitor: records.filter((r) => r.classification === 'monitor').length,
    actioned: records.filter((r) => r.status === 'actioned').length,
  }), [records]);

  const sortByScore = (a: any, b: any) =>
    (b.domain_relevance_score + b.trend_impact_score) - (a.domain_relevance_score + a.trend_impact_score);

  const filtered = useMemo(() => {
    let base: typeof records;
    if (filter === 'actionable') base = records.filter((r) => r.classification === 'domain_trend' || r.classification === 'supertrend_exception');
    else if (filter === 'actioned') base = records.filter((r) => r.status === 'actioned');
    else base = records.filter((r) => r.classification === filter);
    return [...base].sort(sortByScore);
  }, [records, filter]);

  function setField<K extends keyof TrendProfile>(k: K, v: TrendProfile[K]) { setProfile((p) => ({ ...p, [k]: v })); }

  if (!supabaseConfigured) {
    return (
      <div>
        <p className="eyebrow">Monitoring</p>
        <h1 className="page-title">Trends &amp; Alerts</h1>
        <div className="glass-card-static" style={{ padding: '1.5rem', borderLeft: '3px solid var(--status-warning)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--status-warning)' }}>Database connection required. Configure Supabase to use the Trend Supervisor.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="eyebrow">Monitoring</p>
      <h1 className="page-title">Trends &amp; Alerts</h1>
      <p className="page-desc">An AI supervisor scores, classifies, and routes trends — only qualified topics reach your content pipeline.</p>

      {/* action bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        <button className="btn btn-brand" onClick={() => runScan('live')} disabled={scanning || detecting}>{scanning ? 'Scanning…' : '⚡ Run Live Scan'}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => runScan('suggest')} disabled={scanning || detecting}>AI-suggest candidates</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setPasteOpen((v) => !v)} disabled={scanning || detecting}>Paste topics</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowProfile((v) => !v)}>{showProfile ? 'Hide' : 'Domain Profile'}</button>
        {profile.enabled && <span className="badge" style={{ background: '#10B98118', color: '#10B981' }}>Daily scan on</span>}
      </div>

      {pasteOpen && (
        <div className="glass-card-static" style={{ padding: '1rem', marginBottom: 16 }}>
          <div className="field"><label className="field-label">Candidate topics (one per line)</label>
            <textarea className="glass-textarea" rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'small-cap correction\nRBI repo rate decision\nDiwali muhurat trading'} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={supervisePasted} disabled={scanning} style={{ marginTop: 8 }}>Supervise these</button>
        </div>
      )}

      {/* domain profile config */}
      {showProfile && (
        <div className="glass-card-static" style={{ padding: '1.2rem', marginBottom: 16 }}>
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>Domain Profile</h4>
          <div className="grid grid-2" style={{ gap: '0.7rem' }}>
            <Field label="Business Name" v={profile.business_name} on={(v) => setField('business_name', v)} />
            <Field label="Industry" v={profile.industry} on={(v) => setField('industry', v)} />
            <Field label="Core Topics (comma/newline)" v={profile.core_topics} on={(v) => setField('core_topics', v)} />
            <Field label="Target Keywords" v={profile.target_keywords} on={(v) => setField('target_keywords', v)} />
            <Field label="Target Locations" v={profile.target_locations} on={(v) => setField('target_locations', v)} />
            <Field label="Target Audience" v={profile.target_audience} on={(v) => setField('target_audience', v)} />
            <Field label="Competitors" v={profile.competitors} on={(v) => setField('competitors', v)} />
            <Field label="Restricted Topics" v={profile.restricted_topics} on={(v) => setField('restricted_topics', v)} />
            <Field label="Brand Tone" v={profile.brand_tone} on={(v) => setField('brand_tone', v)} />
            <div className="field"><label className="field-label">Max Recommendations</label>
              <input className="glass-input" type="number" min={1} max={20} value={profile.max_recommendations ?? 8} onChange={(e) => setField('max_recommendations', Number(e.target.value))} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '0.82rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={!!profile.enabled} onChange={(e) => setField('enabled', e.target.checked)} />
            Enable automated daily scan (needs Tavily + service-role keys on the server)
          </label>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Profile'}</button>
          </div>
        </div>
      )}

      {note && (
        <div className="glass-card-static" style={{ padding: '0.8rem 1rem', marginBottom: 16, borderLeft: '3px solid var(--status-info)' }}>
          <p style={{ fontSize: '0.8rem' }}>{note}</p>
        </div>
      )}
      {error && (
        <div className="glass-card-static" style={{ padding: '0.8rem 1rem', marginBottom: 16, borderLeft: '3px solid #DC2626' }}>
          <p style={{ fontSize: '0.82rem', color: '#DC2626' }}>{error}</p>
          {(error.includes('API key') || error.includes('credits') || error.includes('Model not found')) && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Check <strong>OPENROUTER_API_KEY</strong> in Vercel Environment Variables. For live signals, add <strong>TAVILY_API_KEY</strong>.</p>
          )}
        </div>
      )}

      {/* filters */}
      {records.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {[
            { k: 'actionable', label: `Strong (${counts.actionable})` },
            { k: 'domain_trend', label: `Domain (${counts.domain_trend})` },
            { k: 'supertrend_exception', label: `Supertrend (${counts.supertrend_exception})` },
            { k: 'monitor', label: `Watch (${counts.monitor})` },
            { k: 'actioned', label: `Actioned (${counts.actioned})` },
          ].map((f) => (
            <button key={f.k} className="badge" style={{ cursor: 'pointer', background: filter === f.k ? 'var(--accent-primary)' : undefined, color: filter === f.k ? '#fff' : undefined }} onClick={() => setFilter(f.k)}>{f.label}</button>
          ))}
        </div>
      )}

      {loading || detecting ? (
        <div className="empty-state">
          <p>{detecting ? 'Analyzing your domain and generating trend ideas…' : 'Loading…'}</p>
          {detecting && <p style={{ marginTop: 8, fontSize: '0.78rem', opacity: 0.6 }}>Auto-detecting profile for {accountMeta.name} from {accountMeta.url}</p>}
        </div>
      ) : records.length === 0 ? (
        <EmptyState
          icon="trends"
          title="No trends yet"
          description='Click "Run Live Scan" or "AI-suggest candidates" to find strong, actionable trends for your domain.'
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="No results in this filter"
          description="The supervisor didn't find strong trends in this category. Try 'Watch' or run a fresh scan."
        />
      ) : (
        <div className="grid grid-2" style={{ gap: '0.8rem' }}>
          {filtered.map((t) => {
            const cm = CLASS_META[t.classification] || CLASS_META.monitor;
            const pc = PRIORITY_COLOR[t.priority] || '#9CA3AF';
            const actionable = t.classification === 'domain_trend' || t.classification === 'supertrend_exception';
            return (
              <div key={t.id} className="glass-card-static" style={{ padding: 16, borderLeft: `3px solid ${cm.color}`, opacity: t.status === 'actioned' ? 0.7 : 1 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
                  <span className="badge" style={{ fontSize: '0.6rem', background: cm.color + '18', color: cm.color }}>{cm.label}</span>
                  <span className="badge" style={{ fontSize: '0.6rem', background: pc + '18', color: pc }}>{t.priority}</span>
                  <span className="badge" style={{ fontSize: '0.6rem' }}>{t.trend_stage}</span>
                  {t.status === 'actioned' && <span className="badge" style={{ fontSize: '0.6rem', background: '#10B98118', color: '#10B981' }}>Actioned</span>}
                  {t.needs_human_review && <span className="badge" style={{ fontSize: '0.6rem', background: '#F59E0B18', color: '#F59E0B' }}>Review</span>}
                  <span style={{ marginLeft: 'auto', fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    score {Math.round((t.domain_relevance_score + t.trend_impact_score) / 2)}
                  </span>
                </div>

                <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: 4, lineHeight: 1.3 }}>{t.topic}</div>
                {t.summary && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8 }}>{t.summary}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  <ScorePill label="Rel" value={t.domain_relevance_score} />
                  <ScorePill label="Imp" value={t.trend_impact_score} />
                  {t.classification === 'supertrend_exception' && <ScorePill label="Adp" value={t.adaptability_score} />}
                  <ScorePill label="Risk" value={t.risk_score} invert />
                </div>

                {t.suggested_connection && (
                  <div style={{ fontSize: '0.74rem', marginBottom: 6 }}><strong>Connection:</strong> {t.suggested_connection}</div>
                )}
                {t.reason && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: 8 }}>{t.reason}</div>}
                {t.estimated_lifespan && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 8 }}>Lifespan: {t.estimated_lifespan}</div>}

                <div className="hairline" style={{ margin: '8px 0' }} />

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {actionable && (
                    <>
                      <button className="btn btn-primary btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => routeToIdeas(t)}>Ideas Lab →</button>
                      <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => createOpportunity(t)}>+ Opportunity</button>
                      <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => addToCalendar(t)}>+ Calendar</button>
                    </>
                  )}
                  {t.classification === 'monitor' && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem' }} onClick={() => setStatus(t, 'accepted')}>Promote</button>
                  )}
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.68rem', marginLeft: 'auto', color: 'var(--text-muted)' }} onClick={() => del(t)}>Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, v, on }: { label: string; v?: string; on: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <input className="glass-input" value={v ?? ''} onChange={(e) => on(e.target.value)} />
    </div>
  );
}
