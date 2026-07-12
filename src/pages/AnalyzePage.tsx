import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { SourceType } from '@/types';
import { archetypeHint } from '@/lib/archetype-hint';

const ACTIVITY_LABELS = [
  'Reading Source',
  'Checking Knowledge Base',
  'Extracting Topics',
  'Matching Personas',
  'Assessing Depth',
  'Generating Opportunities',
  'Quality Check',
  'Saving Results',
  'Complete',
];

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card-static" style={{ position: 'relative', overflow: 'hidden', padding: '0.9rem 1rem' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif' }}>{String(value)}</div>
    </div>
  );
}

function AddSourceTypeModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, description: string, formats: string[], guidance: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formatsText, setFormatsText] = useState('');
  const [guidance, setGuidance] = useState('');

  const handleSave = () => {
    if (!name.trim() || !description.trim()) return;
    const formats = formatsText
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    onSave(name.trim(), description.trim(), formats.length > 0 ? formats : ['Blog', 'Single Image', 'Carousel'], guidance.trim());
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="glass-card-static" style={{ position: 'relative', width: '100%', maxWidth: 480, padding: '1.5rem', zIndex: 1 }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Add Source Type</div>
        <div className="field" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">Name</label>
          <input className="glass-input" type="text" placeholder="e.g. Podcast Episode" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">Description</label>
          <textarea className="glass-textarea" rows={3} placeholder="Describe what this source type is so the AI can understand it. e.g. 'Audio podcast episodes discussing industry trends and expert interviews.'" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>The AI infers an archetype (video / blog / webinar / etc.) from the name — this description sharpens the interpretation.</div>
        </div>
        <div className="field" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">Output Formats (comma-separated)</label>
          <input className="glass-input" type="text" placeholder="Blog, Carousel, Single Image" value={formatsText} onChange={(e) => setFormatsText(e.target.value)} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>The AI will only propose repurposed pieces from this list. Leave empty for defaults.</div>
        </div>
        <div className="field" style={{ marginBottom: '1rem' }}>
          <label className="field-label">Analysis Guidance (optional)</label>
          <textarea className="glass-textarea" rows={3} placeholder="Override the archetype defaults. e.g. 'Ignore the intro/outro. Focus on the guest's answers, not the host's questions. Always suggest 2 short-form clips per major point.'" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Any specifics you want the AI to follow when repurposing this type of source. Takes priority over the built-in defaults.</div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" onClick={onClose} style={{ opacity: 0.7 }}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!name.trim() || !description.trim()} onClick={handleSave} style={{ opacity: !name.trim() || !description.trim() ? 0.5 : 1 }}>Add Source Type</button>
        </div>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const { accountId } = useAccount();
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [sourceType, setSourceType] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  const [confirmDeleteType, setConfirmDeleteType] = useState<SourceType | null>(null);

  const [inputMode, setInputMode] = useState<'text' | 'url'>('text');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceOwner, setSourceOwner] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [marketingNotes, setMarketingNotes] = useState('');

  const [isRunning, setIsRunning] = useState(false);
  const [activityStep, setActivityStep] = useState(-1);
  const [result, setResult] = useState<any | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<Array<{ file_name: string; category: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    setResult(null);
    setError(null);
    setActivityStep(-1);
    setSourceType('');
    if (!accountId || !supabaseConfigured) { setSourceTypes([]); return; }
    let cancelled = false;
    setLoadingTypes(true);
    api.sourceTypes.list(accountId).then(({ data }) => {
      if (cancelled) return;
      const types = data ?? [];
      setSourceTypes(types);
      if (types.length > 0) setSourceType(types[0].slug);
      setLoadingTypes(false);
    });
    return () => { cancelled = true; };
  }, [accountId]);

  const handleAddSourceType = useCallback(async (name: string, description: string, formats: string[], guidance: string) => {
    if (!accountId) return;
    setShowAddModal(false);
    const { data, error: apiErr } = await api.sourceTypes.create(accountId, name, description, formats, guidance);
    if (apiErr || !data) return;
    setSourceTypes((prev) => [...prev, data]);
    setSourceType(data.slug);
  }, [accountId]);

  const handleDeleteSourceType = useCallback(async (st: SourceType) => {
    if (!accountId) return;
    const { error: apiErr } = await api.sourceTypes.delete(accountId, st.id);
    if (apiErr) return;
    setConfirmDeleteType(null);
    setSourceTypes((prev) => {
      const next = prev.filter((t) => t.id !== st.id);
      if (next.length > 0 && !next.find((t) => t.slug === sourceType)) {
        setSourceType(next[0].slug);
      } else if (next.length === 0) {
        setSourceType('');
      }
      return next;
    });
  }, [accountId, sourceType]);

  const handleRunAnalysis = useCallback(async () => {
    if (!accountId) return;
    if (!sourceContent.trim() && inputMode === 'text') return;
    if (!sourceUrl.trim() && inputMode === 'url') return;

    setIsRunning(true);
    setResult(null);
    setSourcesUsed([]);
    setError(null);
    setActivityStep(0);

    let step = 0;
    const stepTimer = setInterval(() => {
      step++;
      if (step < ACTIVITY_LABELS.length - 1) setActivityStep(step);
    }, 800);
    timerRef.current = stepTimer;

    const content = inputMode === 'url' ? `[Source URL: ${sourceUrl}]\n\n${sourceContent}` : sourceContent;
    const activeType = sourceTypes.find((t) => t.slug === sourceType);
    const sourceTypeLabel = activeType?.name ?? sourceType;

    try {
      // Load personas from KB (category = 'persona') in parallel with retrieval
      const [retrieval, personaFilesResult] = await Promise.all([
        retrieve(accountId, `${sourceTitle}\n\n${content}`, sourceType),
        supabase
          .from('knowledge_files')
          .select('file_name, structured')
          .eq('account_id', accountId)
          .eq('category', 'persona')
          .eq('active', true)
          .eq('ingest_status', 'ready'),
      ]);

      if (retrieval.refused) {
        clearInterval(stepTimer);
        timerRef.current = null;
        setError(retrieval.reason || 'Knowledge base not ready. Upload required files first.');
        setActivityStep(-1);
        setIsRunning(false);
        return;
      }

      let kbWarning: string | undefined;
      if (retrieval.reason) {
        kbWarning = retrieval.reason;
      }

      const kbChunks = [
        ...retrieval.constraintChunks.slice(0, 15).map((c) => c.chunk_text),
        ...retrieval.chunks.map((c) => c.chunk_text),
      ];

      const personas = (personaFilesResult.data || []).map((f: any) => {
        const s = (f.structured as any) || {};
        const cleanName = f.file_name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        const descParts = [s.summary, s.audience ? `Audience: ${s.audience}` : null].filter(Boolean);
        return {
          name: cleanName || f.file_name,
          description: descParts.join(' — ') || cleanName,
          pain_points: (s.important_facts || s.key_messages || []).slice(0, 5),
          goals: (s.main_topics || []).slice(0, 5),
        };
      });

      const { data, error: apiErr } = await api.analysis.run({
        accountId,
        sourceText: content,
        sourceType: sourceTypeLabel,
        sourceTypeContext: activeType ? {
          name: activeType.name,
          slug: activeType.slug,
          description: activeType.description,
          formats: activeType.formats,
          analysis_guidance: activeType.analysis_guidance,
        } : undefined,
        sourceTitle: sourceTitle || 'Untitled Source',
        sourceOwner,
        sourceUrl: inputMode === 'url' ? sourceUrl : undefined,
        marketingNotes: marketingNotes || undefined,
        knowledgeChunks: kbChunks,
        fileContext: retrieval.sourcesUsed,
        personas: personas.length > 0 ? personas : undefined,
      });

      clearInterval(stepTimer);
      timerRef.current = null;

      if (apiErr) throw new Error(apiErr);

      const analysis = (data as any)?.analysis ?? data;
      if (kbWarning && analysis) {
        analysis.warnings = [...(analysis.warnings || []), kbWarning];
      }

      // Strict-grounding refusal path — surface as an error so the user
      // can act (upload relevant KB files) instead of seeing empty cards.
      if (analysis?.refused === true) {
        setError(analysis.reason || "I don't have that idea in the knowledge base. Add relevant knowledge files that cover this source's topic.");
        setActivityStep(-1);
        setIsRunning(false);
        return;
      }

      // Show results immediately — don't block on DB saves
      setResult(analysis);
      setSourcesUsed(retrieval.sourcesUsed);
      setActivityStep(ACTIVITY_LABELS.length);

      // Scroll results into view
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

      // Save opportunities — non-blocking but surface errors to user
      if (analysis?.opportunities?.length > 0 && accountId) {
        api.opportunities.createFromAnalysis(
          accountId,
          null as any,
          analysis.opportunities.map((o: any) => ({
            title: o.title,
            content_angle: o.content_angle,
            format: o.recommended_format,
            priority: o.priority,
            persona_name: o.persona_match,
            suggested_cta: o.suggested_cta,
            source_context: o.source_context,
          })),
        ).then((res) => {
          if (res.error) {
            setError(`Results saved but opportunities could not be stored: ${res.error}. Check Supabase RLS policies.`);
          }
        }).catch(() => {});
      }

      auditLog({
        accountId,
        action: 'analyze',
        targetType: 'analysis',
        targetId: (data as any)?.id,
        detail: { source_type: sourceType, source_title: sourceTitle },
      }).catch(() => {});
    } catch (e: any) {
      clearInterval(stepTimer);
      timerRef.current = null;
      setError(e.message || 'Analysis failed. Check your configuration and try again.');
      setActivityStep(-1);
    } finally {
      setIsRunning(false);
    }
  }, [accountId, sourceType, sourceTypes, sourceTitle, sourceOwner, sourceContent, sourceUrl, inputMode, marketingNotes]);

  const activeType = sourceTypes.find((t) => t.slug === sourceType);
  const activeFormats: string[] = activeType ? (activeType.formats as unknown as string[]) : [];
  const canRun = (inputMode === 'text' ? sourceContent.trim().length > 0 : sourceUrl.trim().length > 0) && supabaseConfigured && sourceType !== '';

  return (
    <div>
      <div className="eyebrow">Analysis Engine</div>
      <h1 className="page-title">Analyze Source Content</h1>
      <p className="page-desc">Paste your source content and let the intelligence engine extract topics, match personas, and identify content opportunities.</p>

      {!supabaseConfigured && (
        <div className="glass-card-static" style={{ padding: '1rem', marginBottom: '1rem', borderLeft: '3px solid var(--status-warning)' }}>
          <p style={{ fontSize: '0.85rem', color: 'var(--status-warning)' }}>
            Database connection required to run analysis. Configure Supabase to enable this feature.
          </p>
        </div>
      )}

      <div style={{ marginBottom: '1.2rem' }}>
        <div className="field-label" style={{ marginBottom: '0.5rem' }}>Source Type</div>
        {loadingTypes ? (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>Loading source types...</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            {sourceTypes.map((st) => (
              <span key={st.id} className="badge" onClick={() => setSourceType(st.slug)} style={{ cursor: 'pointer', background: sourceType === st.slug ? 'var(--accent-primary)' : undefined, color: sourceType === st.slug ? '#fff' : undefined, position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px' }}>
                {st.name}
                <span
                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteType(st); }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: '50%', background: 'rgba(220,38,38,0.15)', color: '#DC2626', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                  title="Remove source type"
                >&times;</span>
              </span>
            ))}
            <span
              className="badge"
              onClick={() => setShowAddModal(true)}
              style={{ cursor: 'pointer', border: '1px dashed var(--border-default)', background: 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}
              title="Add a new source type"
            >
              + Add
            </span>
          </div>
        )}
        {activeType && (
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {(() => {
              const hint = archetypeHint(activeType.name, activeType.slug);
              return hint ? <span>Archetype: <strong>{hint}</strong></span> : null;
            })()}
            {activeFormats.length > 0 && <span>Repurposed as: {activeFormats.join(', ')}</span>}
            {activeType.analysis_guidance && <span title={activeType.analysis_guidance}>Custom guidance ✓</span>}
          </div>
        )}
        {sourceTypes.length === 0 && !loadingTypes && supabaseConfigured && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
            No source types configured for this account. Click "+ Add" to create one.
          </div>
        )}
      </div>

      {showAddModal && <AddSourceTypeModal onClose={() => setShowAddModal(false)} onSave={handleAddSourceType} />}

      {confirmDeleteType && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmDeleteType(null)} />
          <div className="glass-card-static" style={{ position: 'relative', width: '100%', maxWidth: 420, padding: '1.5rem', zIndex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Delete Source Type</div>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Are you sure you want to delete <strong>{confirmDeleteType.name}</strong>?
            </p>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '1.2rem' }}>
              This action cannot be undone. Existing analyses using this source type will not be affected.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setConfirmDeleteType(null)} style={{ opacity: 0.7 }}>Cancel</button>
              <button className="btn btn-sm" onClick={() => handleDeleteSourceType(confirmDeleteType)} style={{ background: '#DC2626', color: '#fff' }}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── INPUT FORM — hidden once results arrive ── */}
      {!result && (
        <div className="grid grid-2" style={{ gap: '1.5rem', alignItems: 'start' }}>
          <div>
            <div className="underline-tabs" style={{ marginBottom: '1rem' }}>
              <button className={`u-tab${inputMode === 'text' ? ' active' : ''}`} onClick={() => setInputMode('text')}>Paste Text / Transcript</button>
              <button className={`u-tab${inputMode === 'url' ? ' active' : ''}`} onClick={() => setInputMode('url')}>Paste Source Link</button>
            </div>

            <div className="glass-card-static" style={{ padding: '1.2rem' }}>
              <div className="field" style={{ marginBottom: '0.8rem' }}>
                <label className="field-label">Source Title</label>
                <input className="glass-input" type="text" placeholder="e.g. Market Outlook Q3 2025" value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: '0.8rem' }}>
                <label className="field-label">Source Owner / Speaker</label>
                <input className="glass-input" type="text" placeholder="e.g. Anil Kumar" value={sourceOwner} onChange={(e) => setSourceOwner(e.target.value)} />
              </div>
              {inputMode === 'url' && (
                <div className="field" style={{ marginBottom: '0.8rem' }}>
                  <label className="field-label">Source URL</label>
                  <input className="glass-input" type="url" placeholder="https://..." value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} />
                  <div style={{ fontSize: '0.7rem', color: 'var(--status-warning)', marginTop: '0.3rem' }}>
                    Paste the article text below as well for best results.
                  </div>
                </div>
              )}
              <div className="field" style={{ marginBottom: '0.8rem' }}>
                <label className="field-label">{inputMode === 'text' ? 'Source Content / Transcript' : 'Paste Article Text'}</label>
                <textarea className="glass-textarea" rows={8} placeholder={inputMode === 'text' ? 'Paste the full transcript, article text, or raw content here...' : 'Paste the article text here...'} value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: '1rem' }}>
                <label className="field-label">Marketing Notes (optional)</label>
                <textarea className="glass-textarea" rows={3} placeholder="Any specific goals, campaigns, or context..." value={marketingNotes} onChange={(e) => setMarketingNotes(e.target.value)} />
              </div>
              <button className="btn btn-brand" disabled={!canRun || isRunning} onClick={handleRunAnalysis} style={{ width: '100%', background: canRun && !isRunning ? 'linear-gradient(135deg, var(--accent-primary), #a855f7)' : undefined, opacity: !canRun || isRunning ? 0.5 : 1, cursor: !canRun || isRunning ? 'not-allowed' : 'pointer' }}>
                {isRunning ? 'Analyzing...' : 'Run Analysis'}
              </button>
            </div>
          </div>

          <div>
            <div className="glass-card-static" style={{ padding: '1.2rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>
                Agent Activity
              </div>

              {error && (
                <div style={{ padding: '0.8rem', background: '#DC262610', borderRadius: '0.5rem', marginBottom: '0.8rem' }}>
                  <p style={{ fontSize: '0.8rem', color: '#DC2626' }}>{error}</p>
                </div>
              )}

              {activityStep < 0 && !error ? (
                <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click "Run Analysis" to start the intelligence engine.</p>
                </div>
              ) : activityStep >= 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {ACTIVITY_LABELS.map((label, idx) => {
                    const isDone = idx < activityStep || activityStep >= ACTIVITY_LABELS.length;
                    const isActive = idx === activityStep && activityStep < ACTIVITY_LABELS.length;
                    const isPending = idx > activityStep;
                    return (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        {isDone && <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--status-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: '#fff', flexShrink: 0 }}>&#10003;</div>}
                        {isActive && <div className="spin-dot" style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-primary)', flexShrink: 0 }} />}
                        {isPending && <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--border-default)', flexShrink: 0 }} />}
                        <span style={{ fontSize: '0.8rem', fontWeight: isActive ? 600 : 400, color: isPending ? 'var(--text-muted)' : 'var(--text-primary)' }}>{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RESULTS — shown full-width immediately after run ── */}
      {result && (
        <div>
          {/* header row with New Analysis button */}
          {/* ── Header ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)', marginBottom: 4 }}>Analysis Complete</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.3 }}>{sourceTitle || 'Untitled Source'}</div>
            </div>
            <button className="btn btn-sm" onClick={() => { setResult(null); setSourcesUsed([]); setActivityStep(-1); setError(null); }} style={{ flexShrink: 0 }}>
              New Analysis
            </button>
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-4" style={{ gap: '0.7rem', marginBottom: '1.5rem' }}>
            <StatCard label="Topics" value={result.topics?.length ?? 0} color="var(--accent-primary)" />
            <StatCard label="Insights" value={result.insights?.length ?? 0} color="#6366F1" />
            <StatCard label="Opportunities" value={result.opportunities?.length ?? 0} color="#10B981" />
            <StatCard label="Source Quality" value={result.quality_check?.source_richness ?? 'N/A'} color="#F59E0B" />
          </div>

          {/* ── Warnings ── */}
          {result.warnings?.length > 0 && (
            <div style={{ padding: '0.7rem 1rem', marginBottom: '1.2rem', borderRadius: 10, background: '#F59E0B0A', border: '1px solid #F59E0B30' }}>
              {result.warnings.map((w: string, i: number) => <div key={i} style={{ fontSize: '0.78rem', color: '#F59E0B', lineHeight: 1.5 }}>{w}</div>)}
            </div>
          )}

          {/* ── Summary ── */}
          {result.summary && (
            <div className="glass-card-static" style={{ padding: '1.2rem 1.4rem', marginBottom: '1.2rem', borderLeft: '4px solid var(--accent-primary)' }}>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.7, margin: 0, color: 'var(--text-primary)' }}>{result.summary}</p>
            </div>
          )}

          {/* ── Topics & Depth ── */}
          {result.topics?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Topics & Depth Analysis</div>
              {result.depth_analysis?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {result.depth_analysis.map((da: any, i: number) => {
                    const depthColor = da.depth === 'deep' ? '#10B981' : da.depth === 'moderate' ? '#F59E0B' : '#EF4444';
                    const depthBg = da.depth === 'deep' ? '#10B98112' : da.depth === 'moderate' ? '#F59E0B12' : '#EF444412';
                    return (
                      <div key={i} className="glass-card-static" style={{ padding: '1rem 1.2rem', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: depthColor }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '0.5rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', flex: 1 }}>{da.topic}</div>
                          <span style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20, background: depthBg, color: depthColor }}>{da.depth}</span>
                        </div>
                        {da.key_points?.length > 0 && (
                          <ul style={{ margin: '0 0 0.4rem', paddingLeft: '1.1rem', fontSize: '0.78rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                            {da.key_points.map((kp: string, ki: number) => <li key={ki}>{kp}</li>)}
                          </ul>
                        )}
                        {da.gaps?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                            {da.gaps.map((g: string, gi: number) => (
                              <span key={gi} style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: 20, background: '#F59E0B10', color: '#F59E0B', border: '1px solid #F59E0B30' }}>Gap: {g}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {result.topics.map((topic: string, i: number) => (
                    <span key={i} style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 20, background: 'var(--accent-primary)10', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)30' }}>{topic}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Key Insights ── */}
          {result.insights?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Key Insights</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {result.insights.map((ins: any, i: number) => {
                  const confColor = ins.confidence === 'high' ? '#10B981' : ins.confidence === 'medium' ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={i} className="glass-card-static" style={{ padding: '0.9rem 1.1rem', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', right: 12, top: 10 }}>
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 20, background: confColor + '15', color: confColor }}>{ins.confidence || 'insight'}</span>
                      </div>
                      <div style={{ fontSize: '0.84rem', lineHeight: 1.6, paddingRight: '4rem', color: 'var(--text-primary)' }}>{ins.text}</div>
                      {ins.source_reference && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic', paddingLeft: 8, borderLeft: '2px solid var(--border)' }}>
                          {ins.source_reference}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Persona Matches ── */}
          {result.persona_matches?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Audience Fit</div>
              <div className="grid grid-2" style={{ gap: '0.6rem' }}>
                {result.persona_matches.map((pm: any, i: number) => {
                  const score = typeof pm.relevance_score === 'number' ? pm.relevance_score : parseFloat(pm.relevance_score) || 0;
                  const ringPct = Math.round(score * 100);
                  const ringColor = score >= 0.7 ? '#10B981' : score >= 0.4 ? '#F59E0B' : '#EF4444';
                  return (
                    <div key={i} className="glass-card-static" style={{ padding: '1rem 1.1rem', display: 'flex', gap: '0.8rem', alignItems: 'flex-start' }}>
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: `conic-gradient(${ringColor} ${ringPct}%, var(--border) ${ringPct}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg-card, var(--bg-primary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, color: ringColor }}>{ringPct}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>{pm.persona_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pm.suggested_angle}</div>
                        {pm.matching_points?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {pm.matching_points.slice(0, 3).map((mp: string, mi: number) => (
                              <span key={mi} style={{ fontSize: '0.64rem', padding: '1px 6px', borderRadius: 12, background: 'var(--accent-primary)10', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)20' }}>{mp}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Quality Assessment ── */}
          {result.quality_check && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '0.8rem' }}>Quality Assessment</div>
              <div className="glass-card-static" style={{ padding: '0.8rem 1.2rem' }}>
                <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                  {Object.entries(result.quality_check).map(([key, value]) => {
                    const color = value === 'high' ? '#10B981' : value === 'medium' ? '#F59E0B' : '#EF4444';
                    const pct = value === 'high' ? 100 : value === 'medium' ? 60 : 30;
                    return (
                      <div key={key} style={{ flex: '1 1 120px', minWidth: 100 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 700, color }}>{String(value)}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── Repurposing Plan (Opportunities) ── */}
          {result.opportunities?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Repurposing Plan</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{result.opportunities.length} pieces &middot; sorted by ship order</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {[...result.opportunities]
                  .sort((a: any, b: any) => (a.sequence_rank ?? 99) - (b.sequence_rank ?? 99))
                  .map((opp: any, i: number) => {
                    const priorityColor = opp.priority === 'high' ? '#EF4444' : opp.priority === 'medium' ? '#F59E0B' : '#6B7280';
                    const effortLabel = opp.effort === 'quick' ? 'Quick win' : opp.effort === 'half-day' ? 'Half day' : opp.effort === 'full-day' ? 'Full day' : opp.effort;
                    return (
                      <div key={i} className="glass-card-static" style={{ padding: 0, overflow: 'hidden' }}>
                        {/* Card header bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 1rem', background: 'var(--accent-primary)06', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{opp.sequence_rank ?? i + 1}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{opp.recommended_format}</span>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20, background: priorityColor + '12', color: priorityColor }}>{opp.priority}</span>
                          {effortLabel && <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#6366F110', color: '#6366F1' }}>{effortLabel}</span>}
                        </div>

                        {/* Card body */}
                        <div style={{ padding: '1rem 1.2rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.4, marginBottom: '0.5rem' }}>{opp.title}</div>

                          {opp.hook && (
                            <div style={{ fontSize: '0.8rem', fontStyle: 'italic', color: 'var(--text-primary)', marginBottom: '0.6rem', paddingLeft: 10, borderLeft: '3px solid var(--accent-primary)' }}>
                              &ldquo;{opp.hook}&rdquo;
                            </div>
                          )}

                          <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '0.7rem' }}>{opp.content_angle}</div>

                          {opp.structure?.length > 0 && (
                            <div style={{ marginBottom: '0.7rem' }}>
                              <div style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 6 }}>Content Flow</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                {opp.structure.slice(0, 6).map((s: string, idx: number) => (
                                  <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, background: 'var(--bg-tertiary, var(--border))', color: 'var(--text-secondary)' }}>{s}</span>
                                    {idx < Math.min(opp.structure.length, 6) - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>&rarr;</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Footer meta row */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
                            {opp.persona_match && opp.persona_match !== 'general' && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                <span style={{ fontWeight: 600, marginRight: 4 }}>For:</span>{opp.persona_match}
                              </div>
                            )}
                            {opp.kpi && (
                              <div style={{ fontSize: '0.7rem', color: '#10B981' }}>
                                <span style={{ fontWeight: 600, marginRight: 4 }}>KPI:</span>{opp.kpi}
                              </div>
                            )}
                            {opp.suggested_cta && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>
                                <span style={{ fontWeight: 600, marginRight: 4 }}>CTA:</span>{opp.suggested_cta}
                              </div>
                            )}
                          </div>

                          {opp.prerequisites?.length > 0 && (
                            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                              <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#F59E0B', marginRight: 6 }}>BEFORE SHIPPING:</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{opp.prerequisites.join(' · ')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── Sources Used ── */}
          {sourcesUsed.length > 0 && (
            <div className="glass-card-static" style={{ padding: '0.8rem 1.2rem', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Grounded in:</span>
                {sourcesUsed.map((s, i) => (
                  <span key={i} style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: 20, background: 'var(--accent-primary)08', color: 'var(--text-secondary)', border: '1px solid var(--accent-primary)20' }}>
                    {s.file_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── CTA ── */}
          <div className="glass-card-static" style={{ padding: '1.2rem', textAlign: 'center', background: 'linear-gradient(135deg, var(--accent-primary)08, #a855f708)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem' }}>{result.opportunities?.length ?? 0} content pieces ready for your pipeline</div>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('opportunities')}>View in Opportunities</button>
          </div>
        </div>
      )}
    </div>
  );
}
