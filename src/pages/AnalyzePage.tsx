import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { SourceType } from '@/types';
import { archetypeHint } from '@/lib/archetype-hint';
import { showToast } from '@/lib/toast';
import { motion } from 'motion/react';

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

type Step = 'source' | 'details' | 'content' | 'context' | 'review';

const STEPS: { id: Step; label: string; heading: string; hint: string }[] = [
  { id: 'source', label: 'Source', heading: 'What are you analyzing?', hint: 'Pick the type of source — the engine adapts how it reads it.' },
  { id: 'details', label: 'Details', heading: 'Tell us about this piece', hint: 'A clear title helps the engine anchor its topic extraction.' },
  { id: 'content', label: 'Content', heading: 'Add your content', hint: 'Paste a transcript, article, or script — length is not limited.' },
  { id: 'context', label: 'Context', heading: 'Any campaign context?', hint: 'Optional. Steers the opportunities toward your current goals.' },
  { id: 'review', label: 'Review', heading: 'Ready to analyze', hint: 'Confirm the setup below, then run the engine.' },
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

function Stepper({ current }: { current: Step }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.6rem' }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display: 'contents' }}>
          {i > 0 && <div className={`az-rung${i <= idx ? ' done' : ''}`} />}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, width: 74 }}>
            <div className={`az-node${i < idx ? ' done' : i === idx ? ' current' : ''}`}>
              {i < idx ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : i + 1}
            </div>
            <span style={{
              fontSize: '0.66rem', fontWeight: i === idx ? 700 : 500,
              color: i <= idx ? 'var(--text-primary)' : 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}>{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function RailRow({ label, value, pending, last }: { label: string; value?: string; pending?: boolean; last?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '0.55rem 0', borderBottom: last ? 'none' : '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', width: 62, flexShrink: 0 }}>
        {label}
      </span>
      <span style={{
        fontSize: '0.78rem', fontWeight: pending ? 400 : 600, minWidth: 0,
        color: pending ? 'var(--text-muted)' : 'var(--text-primary)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {pending ? '—' : value}
      </span>
    </div>
  );
}

function AddSourceTypeModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, description: string, formats: string[], guidance: string) => Promise<string | null> }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formatsText, setFormatsText] = useState('');
  const [guidance, setGuidance] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim() || !description.trim() || saving) return;
    const formats = formatsText.split(',').map((f) => f.trim()).filter(Boolean);
    setSaving(true);
    setSaveError(null);
    // The modal owns the save lifecycle: it stays open (with the user's
    // typed values intact) until the insert either succeeds or reports an
    // error. Closing optimistically before the insert is how failures used
    // to vanish without a trace.
    const err = await onSave(name.trim(), description.trim(), formats.length > 0 ? formats : ['Blog', 'Single Image', 'Carousel'], guidance.trim());
    setSaving(false);
    if (err) setSaveError(err);
    else onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '1.1rem', fontFamily: 'Fraunces, Georgia, serif' }}>Add Source Type</div>
        <div className="field">
          <label className="field-label">Name</label>
          <input className="glass-input" type="text" placeholder="e.g. Podcast Episode" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Description</label>
          <textarea className="glass-textarea" rows={3} style={{ minHeight: 72 }} placeholder="Describe what this source type is…" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>The engine infers an archetype from the name — this sharpens the interpretation.</div>
        </div>
        <div className="field">
          <label className="field-label">Output Formats</label>
          <input className="glass-input" type="text" placeholder="Blog, Carousel, Single Image" value={formatsText} onChange={(e) => setFormatsText(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: '1.25rem' }}>
          <label className="field-label">Analysis Guidance (optional)</label>
          <textarea className="glass-textarea" rows={3} style={{ minHeight: 72 }} placeholder="Specifics the engine should follow for this source type…" value={guidance} onChange={(e) => setGuidance(e.target.value)} />
        </div>
        {saveError && (
          <div style={{ marginBottom: '0.9rem', padding: '0.6rem 0.8rem', borderRadius: 8, background: '#DC262614', borderLeft: '3px solid #DC2626' }}>
            <p style={{ fontSize: '0.78rem', color: '#DC2626', margin: 0 }}>{saveError}</p>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!name.trim() || !description.trim() || saving} onClick={handleSave}>{saving ? 'Adding…' : 'Add Source Type'}</button>
        </div>
      </div>
    </div>
  );
}

export default function AnalyzePage() {
  const { accountId } = useAccount();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);

  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteType, setConfirmDeleteType] = useState<SourceType | null>(null);

  const [step, setStep] = useState<Step>('source');
  const [sourceType, setSourceType] = useState('');
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
  const [savedOppIds, setSavedOppIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  useEffect(() => {
    resetAll();
    if (!accountId || !supabaseConfigured) { setSourceTypes([]); return; }
    let cancelled = false;
    setLoadingTypes(true);
    api.sourceTypes.list(accountId).then(({ data, error: listErr }) => {
      if (cancelled) return;
      if (listErr) showToast(`Could not load source types: ${listErr}`, 'error');
      setSourceTypes(data ?? []);
      setLoadingTypes(false);
    });
    return () => { cancelled = true; };
  }, [accountId]);

  function resetAll() {
    setStep('source');
    setSourceType('');
    setSourceTitle('');
    setSourceOwner('');
    setSourceContent('');
    setSourceUrl('');
    setMarketingNotes('');
    setInputMode('text');
    setResult(null);
    setError(null);
    setActivityStep(-1);
    setSavedOppIds({});
  }

  // Returns null on success, or a user-facing error message. The modal
  // stays open on failure so the typed values aren't lost.
  const handleAddSourceType = useCallback(async (name: string, description: string, formats: string[], guidance: string): Promise<string | null> => {
    if (!accountId) return 'No account selected — pick an account first.';
    const { data, error: apiErr } = await api.sourceTypes.create(accountId, name, description, formats, guidance);
    if (apiErr || !data) {
      const msg = apiErr || 'Could not create the source type.';
      if (/duplicate|unique|uq_source_type/i.test(msg)) {
        return `A source type named like "${name}" already exists for this account — pick a different name.`;
      }
      if (/row-level security|permission|policy/i.test(msg)) {
        return 'You don\'t have permission to add source types on this account (editor or manager role required).';
      }
      return msg;
    }
    // Re-fetch instead of appending locally so the list reflects exactly
    // what the DB has (ordering, server defaults), then land the user on
    // their new type with the wizard advanced.
    const { data: fresh } = await api.sourceTypes.list(accountId);
    setSourceTypes(fresh ?? []);
    setSourceType(data.slug);
    setStep('details');
    showToast(`Source type "${data.name}" added`);
    return null;
  }, [accountId]);

  const handleDeleteSourceType = useCallback(async (st: SourceType) => {
    if (!accountId) return;
    const { error: apiErr } = await api.sourceTypes.delete(accountId, st.id);
    if (apiErr) { showToast(`Could not delete: ${apiErr}`, 'error'); return; }
    setConfirmDeleteType(null);
    setSourceTypes((prev) => prev.filter((t) => t.id !== st.id));
    if (sourceType === st.slug) { setSourceType(''); setStep('source'); }
    showToast(`Source type "${st.name}" deleted`);
  }, [accountId, sourceType]);

  const activeType = sourceTypes.find((t) => t.slug === sourceType);
  const activeFormats = (activeType?.formats as unknown as string[]) ?? [];
  const wordCount = sourceContent.split(/\s+/).filter(Boolean).length;
  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const meta = STEPS[stepIdx];

  const canAdvance =
    step === 'source' ? !!sourceType
    : step === 'details' ? sourceTitle.trim().length > 0
    : step === 'content' ? (inputMode === 'text' ? sourceContent.trim().length > 0 : sourceUrl.trim().length > 0)
    : true;

  function goNext() {
    if (!canAdvance) return;
    const next = STEPS[Math.min(STEPS.length - 1, stepIdx + 1)];
    setStep(next.id);
  }
  function goBack() {
    setStep(STEPS[Math.max(0, stepIdx - 1)].id);
  }

  const handleRunAnalysis = useCallback(async () => {
    if (!accountId) return;
    const url = inputMode === 'url' ? sourceUrl : undefined;
    const finalContent = url ? `[Source URL: ${url}]\n\n${sourceContent}` : sourceContent;

    setIsRunning(true);
    setResult(null);
    setSourcesUsed([]);
    setSavedOppIds({});
    setError(null);
    setActivityStep(0);

    let s = 0;
    const stepTimer = setInterval(() => {
      s++;
      if (s < ACTIVITY_LABELS.length - 1) setActivityStep(s);
    }, 800);
    timerRef.current = stepTimer;

    const at = sourceTypes.find((t) => t.slug === sourceType);
    const sourceTypeLabel = at?.name ?? sourceType;

    try {
      const [retrieval, personaFilesResult] = await Promise.all([
        retrieve(accountId, `${sourceTitle}\n\n${finalContent}`, sourceType),
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

      const kbChunks = [
        ...retrieval.constraintChunks.slice(0, 15).map((c) => c.chunk_text),
        ...retrieval.chunks.map((c) => c.chunk_text),
      ];

      const personas = (personaFilesResult.data || []).map((f: any) => {
        const str = (f.structured as any) || {};
        const cleanName = f.file_name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        return {
          name: cleanName || f.file_name,
          description: [str.summary, str.audience ? `Audience: ${str.audience}` : null].filter(Boolean).join(' — ') || cleanName,
          pain_points: (str.important_facts || str.key_messages || []).slice(0, 5),
          goals: (str.main_topics || []).slice(0, 5),
        };
      });

      const { data, error: apiErr } = await api.analysis.run({
        accountId,
        sourceText: finalContent,
        sourceType: sourceTypeLabel,
        sourceTypeContext: at ? {
          name: at.name, slug: at.slug,
          description: at.description, formats: at.formats,
          analysis_guidance: at.analysis_guidance,
        } : undefined,
        sourceTitle: sourceTitle || 'Untitled Source',
        sourceOwner,
        sourceUrl: url,
        marketingNotes: marketingNotes || undefined,
        knowledgeChunks: kbChunks,
        fileContext: retrieval.sourcesUsed,
        personas: personas.length > 0 ? personas : undefined,
      });

      clearInterval(stepTimer);
      timerRef.current = null;
      if (apiErr) throw new Error(apiErr);

      const analysis = (data as any)?.analysis ?? data;
      if (retrieval.reason && analysis) {
        analysis.warnings = [...(analysis.warnings || []), retrieval.reason];
      }
      if (analysis?.refused === true) {
        setError(analysis.reason || "I don't have that idea in the knowledge base. Add relevant knowledge files that cover this source's topic.");
        setActivityStep(-1);
        setIsRunning(false);
        return;
      }

      setResult(analysis);
      setSourcesUsed(retrieval.sourcesUsed);
      setActivityStep(ACTIVITY_LABELS.length);

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
        ).then((res: any) => {
          if (res.error) {
            setError(`Results saved but opportunities could not be stored: ${res.error}.`);
          } else if (Array.isArray(res.data)) {
            const idMap: Record<string, string> = {};
            res.data.forEach((row: any) => { if (row?.id && row?.title) idMap[row.title] = row.id; });
            setSavedOppIds(idMap);
          }
        }).catch(() => {});
      }

      auditLog({
        accountId, action: 'analyze', targetType: 'analysis',
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

  return (
    <div>
      {showAddModal && <AddSourceTypeModal onClose={() => setShowAddModal(false)} onSave={handleAddSourceType} />}

      {confirmDeleteType && (
        <div className="modal-overlay" onClick={() => setConfirmDeleteType(null)}>
          <div className="glass-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '0.6rem' }}>Delete source type</div>
            <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginBottom: '1.25rem', lineHeight: 1.5 }}>
              Delete <strong style={{ color: 'var(--text-primary)' }}>{confirmDeleteType.name}</strong>? Existing analyses are not affected.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setConfirmDeleteType(null)}>Cancel</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSourceType(confirmDeleteType)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ RUNNING ══ */}
      {isRunning && (
        <div style={{ maxWidth: 460, margin: '3rem auto' }}>
          <div className="glass-card-static" style={{ padding: '2rem' }}>
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              <div className="eyebrow">Analyzing</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.3 }}>
                {sourceTitle || 'Your source'}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {ACTIVITY_LABELS.map((label, i) => {
                const done = i < activityStep;
                const active = i === activityStep && activityStep < ACTIVITY_LABELS.length;
                return (
                  <motion.div key={i} animate={{ opacity: i > activityStep ? 0.3 : 1 }} transition={{ duration: 0.3 }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      ...(done ? { background: 'var(--status-success)' }
                        : active ? { background: 'var(--accent-primary)' }
                        : { border: '2px solid var(--border-default)' }),
                    }}>
                      {done && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      {active && <div className="spin-dot" style={{ width: 8, height: 8, background: '#fff' }} />}
                    </div>
                    <span style={{ fontSize: '0.82rem', fontWeight: active ? 700 : 400, color: i > activityStep ? 'var(--text-muted)' : 'var(--text-primary)' }}>{label}</span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ WIZARD ══ */}
      {!result && !isRunning && (
        <>
          <div className="eyebrow">Analysis Engine</div>
          <h1 className="page-title">New Analysis</h1>
          <p className="page-desc">Give the engine a source — it reads, extracts topics, matches personas, and returns a ranked repurposing plan.</p>

          <div className="az-layout">
            {/* ── Main column ── */}
            <div className="glass-card-static" style={{ padding: '1.5rem 1.75rem' }}>
              <Stepper current={step} />
              <div className="hairline" style={{ margin: '0.9rem 0 1.35rem' }} />

              {/* Previously wrapped in AnimatePresence + motion.div keyed on
                  step. That fade replayed whenever the div remounted — which
                  looks like the "New Analysis" section flashing/refreshing on
                  every tab return. Static render — the step change alone is a
                  clear-enough transition. */}
              <div>
                  <div style={{ marginBottom: '1.35rem' }}>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif', margin: '0 0 0.25rem', letterSpacing: '-0.01em' }}>
                      {meta.heading}
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>{meta.hint}</p>
                  </div>

                  {/* Step 1 — Source */}
                  {step === 'source' && (
                    loadingTypes ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                        <span className="spin-dot" /> Loading source types…
                      </div>
                    ) : sourceTypes.length === 0 ? (
                      <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                        <p style={{ fontSize: '0.84rem', margin: '0 0 0.9rem' }}>No source types configured for this account yet.</p>
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>Create your first source type</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.6rem' }}>
                          {sourceTypes.map((st) => {
                            const hint = archetypeHint(st.name, st.slug);
                            const fmts = (st.formats as unknown as string[]) ?? [];
                            return (
                              <button
                                key={st.id}
                                className={`az-tile${sourceType === st.slug ? ' sel' : ''}`}
                                onClick={() => { setSourceType(st.slug); setStep('details'); }}
                              >
                                <div style={{ fontSize: '0.84rem', fontWeight: 700, marginBottom: 2, paddingRight: 14 }}>{st.name}</div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                  {hint || `${fmts.length} format${fmts.length === 1 ? '' : 's'}`}
                                </div>
                                <span
                                  className="az-tile-x"
                                  title="Remove"
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteType(st); }}
                                >&times;</span>
                              </button>
                            );
                          })}
                        </div>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowAddModal(true)}
                          style={{ marginTop: '0.9rem', paddingLeft: 0 }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                          Add source type
                        </button>
                      </>
                    )
                  )}

                  {/* Step 2 — Details */}
                  {step === 'details' && (
                    <div className="grid grid-2" style={{ gap: '1rem' }}>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label">Source title</label>
                        <input
                          autoFocus
                          className="glass-input"
                          placeholder="e.g. Market Outlook Q3 2025"
                          value={sourceTitle}
                          onChange={(e) => setSourceTitle(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) goNext(); }}
                        />
                      </div>
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label className="field-label">Owner / speaker <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
                        <input
                          className="glass-input"
                          placeholder="e.g. Anil Kumar"
                          value={sourceOwner}
                          onChange={(e) => setSourceOwner(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter' && canAdvance) goNext(); }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 3 — Content */}
                  {step === 'content' && (
                    <div>
                      <div className="underline-tabs" style={{ marginBottom: '1rem' }}>
                        <button className={`u-tab${inputMode === 'text' ? ' active' : ''}`} onClick={() => setInputMode('text')}>Paste text</button>
                        <button className={`u-tab${inputMode === 'url' ? ' active' : ''}`} onClick={() => setInputMode('url')}>Paste a link</button>
                      </div>

                      {inputMode === 'url' && (
                        <div className="field">
                          <label className="field-label">Source URL</label>
                          <input
                            autoFocus
                            className="glass-input"
                            type="url"
                            placeholder="https://…"
                            value={sourceUrl}
                            onChange={(e) => setSourceUrl(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="field" style={{ marginBottom: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <label className="field-label" style={{ marginBottom: '0.4rem' }}>
                            {inputMode === 'text' ? 'Content / transcript' : 'Article text'}
                            {inputMode === 'url' && <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}> · optional, improves depth</span>}
                          </label>
                          {sourceContent.length > 0 && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>{wordCount.toLocaleString()} words</span>
                          )}
                        </div>
                        <textarea
                          className="glass-textarea"
                          style={{ minHeight: 260 }}
                          placeholder={inputMode === 'text' ? 'Paste the full transcript, article text, or script…' : 'Paste the article text here…'}
                          value={sourceContent}
                          onChange={(e) => setSourceContent(e.target.value)}
                          autoFocus={inputMode === 'text'}
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 4 — Context */}
                  {step === 'context' && (
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label className="field-label">Marketing notes <span style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· optional</span></label>
                      <textarea
                        autoFocus
                        className="glass-textarea"
                        style={{ minHeight: 150 }}
                        placeholder="e.g. Pushing brand awareness this quarter — prioritise LinkedIn and thought-leadership angles."
                        value={marketingNotes}
                        onChange={(e) => setMarketingNotes(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Step 5 — Review */}
                  {step === 'review' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
                      {[
                        { k: 'Source type', v: activeType?.name ?? sourceType },
                        { k: 'Title', v: sourceTitle },
                        { k: 'Owner', v: sourceOwner || 'Not specified' },
                        { k: inputMode === 'url' ? 'Link' : 'Content', v: inputMode === 'url' ? sourceUrl : `${wordCount.toLocaleString()} words` },
                        { k: 'Grounding', v: 'Account knowledge base' },
                        { k: 'Notes', v: marketingNotes || 'None' },
                      ].map(({ k, v }) => (
                        <div key={k} style={{ background: 'var(--surface-hover)', borderRadius: '0.75rem', padding: '0.7rem 0.85rem', minWidth: 0 }}>
                          <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 3 }}>{k}</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 600, lineHeight: 1.4, overflowWrap: 'anywhere' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}
              </div>

              {/* Nav */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.6rem', paddingTop: '1.1rem', borderTop: '1px solid var(--border-subtle)' }}>
                <button className="btn btn-ghost btn-sm" onClick={goBack} disabled={stepIdx === 0} style={{ opacity: stepIdx === 0 ? 0 : 1, pointerEvents: stepIdx === 0 ? 'none' : 'auto' }}>
                  ← Back
                </button>
                {step === 'review' ? (
                  <button className="btn btn-brand" onClick={handleRunAnalysis} disabled={!supabaseConfigured}>
                    Run Analysis
                  </button>
                ) : step !== 'source' && (
                  <button className="btn btn-primary btn-sm" onClick={goNext} disabled={!canAdvance}>
                    Continue →
                  </button>
                )}
              </div>
            </div>

            {/* ── Rail ── */}
            <aside className="az-rail" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="glass-card-static" style={{ padding: '1.1rem 1.25rem' }}>
                <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent-section)', marginBottom: '0.4rem' }}>
                  Your setup
                </div>
                <RailRow label="Source" value={activeType?.name} pending={!sourceType} />
                <RailRow label="Title" value={sourceTitle} pending={!sourceTitle} />
                <RailRow label="Owner" value={sourceOwner} pending={!sourceOwner} />
                <RailRow
                  label="Content"
                  value={inputMode === 'url' ? sourceUrl : `${wordCount.toLocaleString()} words`}
                  pending={inputMode === 'url' ? !sourceUrl : wordCount === 0}
                />
                <RailRow label="Notes" value={marketingNotes} pending={!marketingNotes} last />
              </div>

              {activeType && (
                <div className="glass-card-static" style={{ padding: '1.1rem 1.25rem' }}>
                  <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--accent-section)', marginBottom: '0.7rem' }}>
                    What you'll get
                  </div>
                  {activeFormats.length > 0 ? (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: activeType.analysis_guidance ? '0.8rem' : 0 }}>
                      {activeFormats.map((f) => (
                        <span key={f} style={{ fontSize: '0.7rem', fontWeight: 600, padding: '3px 9px', borderRadius: 9999, background: 'var(--accent-primary-soft)', color: 'var(--accent-section)' }}>{f}</span>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>Default formats</div>
                  )}
                  {activeType.analysis_guidance && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: '0.7rem', borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>Custom guidance: </span>
                      {activeType.analysis_guidance}
                    </div>
                  )}
                </div>
              )}

              {!supabaseConfigured && (
                <div className="glass-card-static" style={{ padding: '0.9rem 1.1rem', borderLeft: '3px solid var(--status-warning)' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--status-warning)', margin: 0, lineHeight: 1.5 }}>
                    Database connection required to run analysis.
                  </p>
                </div>
              )}

              {error && (
                <div className="glass-card-static" style={{ padding: '0.9rem 1.1rem', borderLeft: '3px solid var(--status-danger)' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--status-danger)', margin: '0 0 0.6rem', lineHeight: 1.5 }}>{error}</p>
                  <button className="btn btn-secondary btn-sm" onClick={() => { setError(null); resetAll(); }}>Start over</button>
                </div>
              )}
            </aside>
          </div>
        </>
      )}

      {/* ══ RESULTS ══ */}
      {result && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', gap: '1rem' }}>
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow">Analysis Complete</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.25 }}>{sourceTitle || 'Untitled Source'}</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={resetAll} style={{ flexShrink: 0 }}>New Analysis</button>
          </div>

          {error && (
            <div className="glass-card-static" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', borderLeft: '3px solid var(--status-danger)' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--status-danger)', margin: 0 }}>{error}</p>
            </div>
          )}

          <div className="grid grid-4" style={{ gap: '0.7rem', marginBottom: '1.5rem' }}>
            <StatCard label="Topics" value={result.topics?.length ?? 0} color="var(--accent-primary)" />
            <StatCard label="Insights" value={result.insights?.length ?? 0} color="#6366F1" />
            <StatCard label="Opportunities" value={result.opportunities?.length ?? 0} color="#10B981" />
            <StatCard label="Source Quality" value={result.quality_check?.source_richness ?? 'N/A'} color="#F59E0B" />
          </div>

          {result.warnings?.length > 0 && (
            <div style={{ padding: '0.7rem 1rem', marginBottom: '1.2rem', borderRadius: 10, background: '#F59E0B0A', border: '1px solid #F59E0B30' }}>
              {result.warnings.map((w: string, i: number) => <div key={i} style={{ fontSize: '0.78rem', color: '#F59E0B', lineHeight: 1.5 }}>{w}</div>)}
            </div>
          )}

          {result.summary && (
            <div className="glass-card-static" style={{ padding: '1.2rem 1.4rem', marginBottom: '1.2rem', borderLeft: '4px solid var(--accent-primary)' }}>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>{result.summary}</p>
            </div>
          )}

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
                    <span key={i} style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 20, background: 'var(--accent-primary-soft)', color: 'var(--accent-section)', border: '1px solid var(--border-default)' }}>{topic}</span>
                  ))}
                </div>
              )}
            </div>
          )}

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
                      <div style={{ fontSize: '0.84rem', lineHeight: 1.6, paddingRight: '4rem' }}>{ins.text}</div>
                      {ins.source_reference && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic', paddingLeft: 8, borderLeft: '2px solid var(--border-subtle)' }}>
                          {ins.source_reference}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

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
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: `conic-gradient(${ringColor} ${ringPct}%, var(--border-default) ${ringPct}%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, color: ringColor }}>{ringPct}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 2 }}>{pm.persona_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{pm.suggested_angle}</div>
                        {pm.matching_points?.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                            {pm.matching_points.slice(0, 3).map((mp: string, mi: number) => (
                              <span key={mi} style={{ fontSize: '0.64rem', padding: '1px 6px', borderRadius: 12, background: 'var(--accent-primary-soft)', color: 'var(--accent-section)' }}>{mp}</span>
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
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--border-default)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: color, transition: 'width 0.5s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {result.opportunities?.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.8rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>Repurposing Plan</div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{result.opportunities.length} pieces · sorted by ship order</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                {[...result.opportunities]
                  .sort((a: any, b: any) => (a.sequence_rank ?? 99) - (b.sequence_rank ?? 99))
                  .map((opp: any, i: number) => {
                    const priorityColor = opp.priority === 'high' ? '#EF4444' : opp.priority === 'medium' ? '#F59E0B' : '#6B7280';
                    const effortLabel = opp.effort === 'quick' ? 'Quick win' : opp.effort === 'half-day' ? 'Half day' : opp.effort === 'full-day' ? 'Full day' : opp.effort;
                    return (
                      <div key={i} className="glass-card-static" style={{ padding: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 1rem', background: 'var(--surface-card-header)', borderBottom: '1px solid var(--border-subtle)' }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{opp.sequence_rank ?? i + 1}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{opp.recommended_format}</span>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20, background: priorityColor + '12', color: priorityColor }}>{opp.priority}</span>
                          {effortLabel && <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#6366F110', color: '#6366F1' }}>{effortLabel}</span>}
                        </div>
                        <div style={{ padding: '1rem 1.2rem' }}>
                          <div style={{ fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.4, marginBottom: '0.5rem' }}>{opp.title}</div>
                          {opp.hook && (
                            <div style={{ fontSize: '0.8rem', fontStyle: 'italic', marginBottom: '0.6rem', paddingLeft: 10, borderLeft: '3px solid var(--accent-primary)' }}>
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
                                    <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: 20, background: 'var(--surface-hover)', color: 'var(--text-secondary)' }}>{s}</span>
                                    {idx < Math.min(opp.structure.length, 6) - 1 && <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>&rarr;</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)' }}>
                            {opp.persona_match && opp.persona_match !== 'general' && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}><span style={{ fontWeight: 600, marginRight: 4 }}>For:</span>{opp.persona_match}</div>
                            )}
                            {opp.kpi && (
                              <div style={{ fontSize: '0.7rem', color: '#10B981' }}><span style={{ fontWeight: 600, marginRight: 4 }}>KPI:</span>{opp.kpi}</div>
                            )}
                            {opp.suggested_cta && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-section)' }}><span style={{ fontWeight: 600, marginRight: 4 }}>CTA:</span>{opp.suggested_cta}</div>
                            )}
                          </div>
                          {opp.prerequisites?.length > 0 && (
                            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                              <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#F59E0B', marginRight: 6 }}>BEFORE SHIPPING:</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{opp.prerequisites.join(' · ')}</span>
                            </div>
                          )}
                          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                              className={savedOppIds[opp.title] ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                              disabled={!savedOppIds[opp.title]}
                              onClick={() => { setActiveStudioOpp(savedOppIds[opp.title]); setActiveTab('studio'); }}
                              title={savedOppIds[opp.title] ? undefined : 'Saving…'}
                            >
                              Open in Studio →
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {sourcesUsed.length > 0 && (
            <div className="glass-card-static" style={{ padding: '0.8rem 1.2rem', marginBottom: '1.2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Grounded in:</span>
                {sourcesUsed.map((s, i) => (
                  <span key={i} style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: 20, background: 'var(--accent-primary-soft)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
                    {s.file_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card-static" style={{ padding: '1.2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem' }}>{result.opportunities?.length ?? 0} content pieces ready for your pipeline</div>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('opportunities')}>View in Opportunities</button>
          </div>
        </div>
      )}
    </div>
  );
}
