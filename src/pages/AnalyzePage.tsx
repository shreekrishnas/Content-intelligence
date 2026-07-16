import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import type { SourceType } from '@/types';
import { archetypeHint } from '@/lib/archetype-hint';
import { motion, AnimatePresence } from 'motion/react';

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

// ── Conversation steps ──────────────────────────────────────────────────────
type Step = 'source_type' | 'title' | 'owner' | 'input_mode' | 'content' | 'notes' | 'ready';

// ── Small components ─────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card-static" style={{ position: 'relative', overflow: 'hidden', padding: '0.9rem 1rem' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: color }} />
      <div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif' }}>{String(value)}</div>
    </div>
  );
}

function AgentAvatar() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--accent-primary), #a855f7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    </div>
  );
}

function AgentBubble({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay }}
      style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}
    >
      <AgentAvatar />
      <div style={{
        background: 'var(--surface-card)',
        border: '1px solid var(--border)',
        borderRadius: '0 14px 14px 14px',
        padding: '0.7rem 1rem',
        fontSize: '0.85rem',
        lineHeight: 1.6,
        color: 'var(--text-primary)',
        maxWidth: 540,
      }}>
        {children}
      </div>
    </motion.div>
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.18 }}
      style={{ display: 'flex', justifyContent: 'flex-end' }}
    >
      <div style={{
        background: 'linear-gradient(135deg, var(--accent-primary), #a855f7)',
        borderRadius: '14px 0 14px 14px',
        padding: '0.55rem 1rem',
        fontSize: '0.84rem',
        color: '#fff',
        fontWeight: 500,
        maxWidth: 480,
      }}>
        {children}
      </div>
    </motion.div>
  );
}

function AddSourceTypeModal({ onClose, onSave }: { onClose: () => void; onSave: (name: string, description: string, formats: string[], guidance: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formatsText, setFormatsText] = useState('');
  const [guidance, setGuidance] = useState('');

  const handleSave = () => {
    if (!name.trim() || !description.trim()) return;
    const formats = formatsText.split(',').map((f) => f.trim()).filter(Boolean);
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
          <textarea className="glass-textarea" rows={3} placeholder="Describe what this source type is..." value={description} onChange={(e) => setDescription(e.target.value)} />
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>The AI infers an archetype from the name — this description sharpens the interpretation.</div>
        </div>
        <div className="field" style={{ marginBottom: '0.8rem' }}>
          <label className="field-label">Output Formats (comma-separated)</label>
          <input className="glass-input" type="text" placeholder="Blog, Carousel, Single Image" value={formatsText} onChange={(e) => setFormatsText(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: '1rem' }}>
          <label className="field-label">Analysis Guidance (optional)</label>
          <textarea className="glass-textarea" rows={3} placeholder="Any specifics the AI should follow when repurposing this source type..." value={guidance} onChange={(e) => setGuidance(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" onClick={onClose} style={{ opacity: 0.7 }}>Cancel</button>
          <button className="btn btn-primary btn-sm" disabled={!name.trim() || !description.trim()} onClick={handleSave} style={{ opacity: !name.trim() || !description.trim() ? 0.5 : 1 }}>Add Source Type</button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AnalyzePage() {
  const { accountId } = useAccount();
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setActiveStudioOpp = useAppStore((s) => s.setActiveStudioOpp);

  // Source types
  const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteType, setConfirmDeleteType] = useState<SourceType | null>(null);

  // Conversation state
  const [step, setStep] = useState<Step>('source_type');
  const [sourceType, setSourceType] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceOwner, setSourceOwner] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [marketingNotes, setMarketingNotes] = useState('');

  // Ephemeral input fields (committed on Next/Enter)
  const [titleDraft, setTitleDraft] = useState('');
  const [ownerDraft, setOwnerDraft] = useState('');
  const [contentDraft, setContentDraft] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');

  // Analysis state
  const [isRunning, setIsRunning] = useState(false);
  const [activityStep, setActivityStep] = useState(-1);
  const [result, setResult] = useState<any | null>(null);
  const [sourcesUsed, setSourcesUsed] = useState<Array<{ file_name: string; category: string }>>([]);
  const [savedOppIds, setSavedOppIds] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // Load source types on mount / account change
  useEffect(() => {
    resetConversation();
    if (!accountId || !supabaseConfigured) { setSourceTypes([]); return; }
    let cancelled = false;
    setLoadingTypes(true);
    api.sourceTypes.list(accountId).then(({ data }) => {
      if (cancelled) return;
      setSourceTypes(data ?? []);
      setLoadingTypes(false);
    });
    return () => { cancelled = true; };
  }, [accountId]);

  // Scroll chat to bottom whenever step changes
  useEffect(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);
  }, [step]);

  function resetConversation() {
    setStep('source_type');
    setSourceType('');
    setSourceTitle('');
    setSourceOwner('');
    setSourceContent('');
    setSourceUrl('');
    setMarketingNotes('');
    setInputMode('text');
    setTitleDraft('');
    setOwnerDraft('');
    setContentDraft('');
    setUrlDraft('');
    setNotesDraft('');
    setResult(null);
    setError(null);
    setActivityStep(-1);
    setSavedOppIds({});
  }

  const handleAddSourceType = useCallback(async (name: string, description: string, formats: string[], guidance: string) => {
    if (!accountId) return;
    setShowAddModal(false);
    const { data, error: apiErr } = await api.sourceTypes.create(accountId, name, description, formats, guidance);
    if (apiErr || !data) return;
    setSourceTypes((prev) => [...prev, data]);
  }, [accountId]);

  const handleDeleteSourceType = useCallback(async (st: SourceType) => {
    if (!accountId) return;
    const { error: apiErr } = await api.sourceTypes.delete(accountId, st.id);
    if (apiErr) return;
    setConfirmDeleteType(null);
    setSourceTypes((prev) => {
      const next = prev.filter((t) => t.id !== st.id);
      if (sourceType === st.slug) setSourceType(next[0]?.slug ?? '');
      return next;
    });
  }, [accountId, sourceType]);

  // Conversation step handlers
  function pickSourceType(slug: string) {
    setSourceType(slug);
    setStep('title');
  }

  function commitTitle() {
    const t = titleDraft.trim();
    setSourceTitle(t);
    setStep('owner');
  }

  function commitOwner(skip = false) {
    setSourceOwner(skip ? '' : ownerDraft.trim());
    setStep('input_mode');
  }

  function pickInputMode(mode: 'text' | 'url') {
    setInputMode(mode);
    setStep('content');
  }

  function commitContent() {
    if (inputMode === 'text') {
      if (!contentDraft.trim()) return;
      setSourceContent(contentDraft.trim());
    } else {
      if (!urlDraft.trim()) return;
      setSourceUrl(urlDraft.trim());
      setSourceContent(contentDraft.trim());
    }
    setStep('notes');
  }

  function commitNotes(skip = false) {
    setMarketingNotes(skip ? '' : notesDraft.trim());
    setStep('ready');
  }

  const handleRunAnalysis = useCallback(async () => {
    if (!accountId) return;
    const content = inputMode === 'text' ? sourceContent : sourceContent;
    const url = inputMode === 'url' ? sourceUrl : undefined;
    const finalContent = url ? `[Source URL: ${url}]\n\n${content}` : content;

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

    const activeType = sourceTypes.find((t) => t.slug === sourceType);
    const sourceTypeLabel = activeType?.name ?? sourceType;

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
        sourceTypeContext: activeType ? {
          name: activeType.name, slug: activeType.slug,
          description: activeType.description, formats: activeType.formats,
          analysis_guidance: activeType.analysis_guidance,
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

  const activeType = sourceTypes.find((t) => t.slug === sourceType);
  const wordCount = (inputMode === 'text' ? contentDraft : contentDraft).split(/\s+/).filter(Boolean).length;

  return (
    <div>
      <div className="eyebrow">Analysis Engine</div>
      <h1 className="page-title">New Analysis</h1>

      {showAddModal && <AddSourceTypeModal onClose={() => setShowAddModal(false)} onSave={handleAddSourceType} />}

      {confirmDeleteType && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={() => setConfirmDeleteType(null)} />
          <div className="glass-card-static" style={{ position: 'relative', width: '100%', maxWidth: 420, padding: '1.5rem', zIndex: 1 }}>
            <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>Delete Source Type</div>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>Delete <strong>{confirmDeleteType.name}</strong>? This cannot be undone.</p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => setConfirmDeleteType(null)} style={{ opacity: 0.7 }}>Cancel</button>
              <button className="btn btn-sm" onClick={() => handleDeleteSourceType(confirmDeleteType)} style={{ background: '#DC2626', color: '#fff' }}>Yes, Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ── RUNNING STATE ── */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            key="running"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{ maxWidth: 520, margin: '2rem auto' }}
          >
            <div className="glass-card-static" style={{ padding: '2rem 2.5rem' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.8rem' }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--accent-primary)', marginBottom: 8 }}>Intelligence Engine</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{sourceTitle || 'Analyzing source…'}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                {ACTIVITY_LABELS.map((label, idx) => {
                  const isDone = idx < activityStep;
                  const isActive = idx === activityStep && activityStep < ACTIVITY_LABELS.length;
                  const isPending = idx > activityStep;
                  return (
                    <motion.div key={idx} animate={{ opacity: isPending ? 0.35 : 1 }} transition={{ duration: 0.3 }}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', ...(isDone ? { background: 'var(--status-success)' } : isActive ? { background: 'var(--accent-primary)' } : { border: '2px solid var(--border-default)' }) }}>
                        {isDone && <span style={{ fontSize: '0.65rem', color: '#fff' }}>✓</span>}
                        {isActive && <div className="spin-dot" style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />}
                      </div>
                      <span style={{ fontSize: '0.84rem', fontWeight: isActive ? 700 : 400, color: isPending ? 'var(--text-muted)' : 'var(--text-primary)' }}>{label}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CONVERSATIONAL INPUT ── */}
      {!result && !isRunning && (
        <div style={{ maxWidth: 660, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '1rem' }}>

          {/* Step 0 — Source type */}
          <AgentBubble>
            <span style={{ fontWeight: 600 }}>Hey! What would you like to analyze today?</span>
            <div style={{ marginTop: '0.65rem', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {loadingTypes ? (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Loading source types…</span>
              ) : sourceTypes.length === 0 ? (
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No source types yet.</span>
              ) : (
                sourceTypes.map((st) => {
                  const hint = archetypeHint(st.name, st.slug);
                  const isChosen = sourceType === st.slug && step !== 'source_type';
                  return (
                    <button
                      key={st.id}
                      onClick={() => { if (step === 'source_type') pickSourceType(st.slug); }}
                      disabled={step !== 'source_type'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '6px 14px', borderRadius: 20, border: '1px solid',
                        borderColor: isChosen ? 'var(--accent-primary)' : 'var(--border)',
                        background: isChosen ? 'var(--accent-primary)' : 'var(--surface-hover)',
                        color: isChosen ? '#fff' : 'var(--text-primary)',
                        fontSize: '0.82rem', fontWeight: 600,
                        cursor: step === 'source_type' ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                      }}
                    >
                      {st.name}
                      {hint && <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>· {hint}</span>}
                      {step === 'source_type' && (
                        <span
                          onClick={(e) => { e.stopPropagation(); setConfirmDeleteType(st); }}
                          title="Remove"
                          style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(220,38,38,0.18)', color: '#DC2626', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1 }}
                        >&times;</span>
                      )}
                    </button>
                  );
                })
              )}
              {step === 'source_type' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{ padding: '6px 14px', borderRadius: 20, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}
                >
                  + New type
                </button>
              )}
            </div>
          </AgentBubble>

          {/* Step 1 — Title */}
          <AnimatePresence>
            {step !== 'source_type' && sourceType && (
              <>
                <UserBubble>{activeType?.name ?? sourceType}</UserBubble>
                <AgentBubble delay={0.08}>
                  <span style={{ fontWeight: 600 }}>Great choice.</span> What's the title or name of this piece?
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 2 }}>e.g. "Market Outlook Q3" or "Brand Strategy Video"</div>
                  {step === 'title' && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        className="glass-input"
                        style={{ flex: 1, fontSize: '0.84rem' }}
                        placeholder="Source title…"
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && titleDraft.trim()) commitTitle(); }}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!titleDraft.trim()}
                        onClick={commitTitle}
                        style={{ opacity: titleDraft.trim() ? 1 : 0.4 }}
                      >Next</button>
                    </div>
                  )}
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Step 2 — Owner */}
          <AnimatePresence>
            {['owner', 'input_mode', 'content', 'notes', 'ready'].includes(step) && sourceTitle && (
              <>
                <UserBubble>{sourceTitle}</UserBubble>
                <AgentBubble delay={0.08}>
                  Who created or presented this? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(optional — helps with attribution)</span>
                  {step === 'owner' && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: 6 }}>
                      <input
                        autoFocus
                        className="glass-input"
                        style={{ flex: 1, fontSize: '0.84rem' }}
                        placeholder="e.g. Anil Kumar"
                        value={ownerDraft}
                        onChange={(e) => setOwnerDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitOwner(); }}
                      />
                      <button className="btn btn-primary btn-sm" onClick={() => commitOwner()}>Next</button>
                      <button className="btn btn-sm" onClick={() => commitOwner(true)} style={{ opacity: 0.6 }}>Skip</button>
                    </div>
                  )}
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Step 3 — Input mode */}
          <AnimatePresence>
            {['input_mode', 'content', 'notes', 'ready'].includes(step) && (
              <>
                {sourceOwner && <UserBubble>{sourceOwner}</UserBubble>}
                {!sourceOwner && step !== 'owner' && <UserBubble>Skipped</UserBubble>}
                <AgentBubble delay={0.08}>
                  How would you like to share the content?
                  {step === 'input_mode' && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => pickInputMode('text')}
                        style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-hover)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        <div>Paste text</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Transcript, article, script…</div>
                      </button>
                      <button
                        onClick={() => pickInputMode('url')}
                        style={{ flex: 1, padding: '0.6rem', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-hover)', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                      >
                        <div>Paste a link</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>URL + optional text</div>
                      </button>
                    </div>
                  )}
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Step 4 — Content */}
          <AnimatePresence>
            {['content', 'notes', 'ready'].includes(step) && (
              <>
                <UserBubble>{inputMode === 'text' ? 'Paste text' : 'Paste a link'}</UserBubble>
                <AgentBubble delay={0.08}>
                  {inputMode === 'url' ? (
                    <>
                      <span style={{ fontWeight: 600 }}>Drop the link below.</span> You can also paste the article text — it helps the engine go deeper.
                    </>
                  ) : (
                    <>
                      <span style={{ fontWeight: 600 }}>Paste your content below.</span> The more text, the richer the output.
                    </>
                  )}
                  {step === 'content' && (
                    <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {inputMode === 'url' && (
                        <input
                          autoFocus
                          className="glass-input"
                          type="url"
                          placeholder="https://…"
                          value={urlDraft}
                          onChange={(e) => setUrlDraft(e.target.value)}
                          style={{ fontSize: '0.84rem' }}
                        />
                      )}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            {inputMode === 'url' ? 'Article text (optional but recommended)' : 'Content / Transcript'}
                          </span>
                          {contentDraft.length > 0 && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                              {wordCount.toLocaleString()} words
                            </span>
                          )}
                        </div>
                        <textarea
                          className="glass-textarea"
                          rows={6}
                          placeholder={inputMode === 'text' ? 'Paste your transcript, article, or script here…' : 'Paste article text here…'}
                          value={contentDraft}
                          onChange={(e) => setContentDraft(e.target.value)}
                          style={{ fontSize: '0.84rem' }}
                          autoFocus={inputMode === 'text'}
                        />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={inputMode === 'text' ? !contentDraft.trim() : !urlDraft.trim()}
                          onClick={commitContent}
                          style={{ opacity: (inputMode === 'text' ? !contentDraft.trim() : !urlDraft.trim()) ? 0.4 : 1 }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Step 5 — Notes */}
          <AnimatePresence>
            {['notes', 'ready'].includes(step) && (
              <>
                <UserBubble>
                  {inputMode === 'url' && urlDraft ? urlDraft : `${wordCount} words pasted`}
                </UserBubble>
                <AgentBubble delay={0.08}>
                  Almost there. Any specific marketing goals, active campaigns, or context I should keep in mind? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(optional)</span>
                  {step === 'notes' && (
                    <div style={{ marginTop: '0.6rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        autoFocus
                        className="glass-textarea"
                        rows={3}
                        placeholder="e.g. We're pushing brand awareness this quarter, focus on LinkedIn…"
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value)}
                        style={{ fontSize: '0.84rem' }}
                      />
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm" onClick={() => commitNotes(true)} style={{ opacity: 0.6 }}>Skip</button>
                        <button className="btn btn-primary btn-sm" onClick={() => commitNotes()}>Next</button>
                      </div>
                    </div>
                  )}
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Step 6 — Ready to run */}
          <AnimatePresence>
            {step === 'ready' && (
              <>
                {marketingNotes ? <UserBubble>{marketingNotes}</UserBubble> : <UserBubble>No special notes</UserBubble>}
                <AgentBubble delay={0.1}>
                  <span style={{ fontWeight: 600 }}>All set.</span> Here's what I'll analyze:
                  <div style={{ marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                    {[
                      { label: 'Source type', value: activeType?.name ?? sourceType },
                      { label: 'Title', value: sourceTitle },
                      sourceOwner && { label: 'Owner', value: sourceOwner },
                      { label: 'Input', value: inputMode === 'url' ? sourceUrl || urlDraft : `${wordCount} words` },
                      marketingNotes && { label: 'Notes', value: marketingNotes.length > 60 ? marketingNotes.slice(0, 60) + '…' : marketingNotes },
                    ].filter(Boolean).map((row: any) => (
                      <div key={row.label} style={{ display: 'flex', gap: 8, fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: 80 }}>{row.label}</span>
                        <span style={{ fontWeight: 600 }}>{row.value}</span>
                      </div>
                    ))}
                    {activeType && (activeType.formats as unknown as string[]).length > 0 && (
                      <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem' }}>
                        <span style={{ color: 'var(--text-muted)', minWidth: 80 }}>Outputs</span>
                        <span style={{ fontWeight: 600 }}>{(activeType.formats as unknown as string[]).join(', ')}</span>
                      </div>
                    )}
                  </div>
                  <button
                    className="btn btn-brand"
                    onClick={handleRunAnalysis}
                    style={{ marginTop: '1rem', width: '100%', background: 'linear-gradient(135deg, var(--accent-primary), #a855f7)' }}
                  >
                    Run Analysis
                  </button>
                </AgentBubble>
              </>
            )}
          </AnimatePresence>

          {/* Error shown in chat (pre-run) */}
          {error && !result && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <AgentAvatar />
              <div style={{ background: '#DC262610', border: '1px solid #DC262630', borderRadius: '0 14px 14px 14px', padding: '0.7rem 1rem', fontSize: '0.84rem', color: '#DC2626', maxWidth: 540 }}>
                {error}
                <button className="btn btn-sm" onClick={() => { setError(null); setStep('source_type'); resetConversation(); }} style={{ marginTop: 8, display: 'block', fontSize: '0.72rem' }}>Start over</button>
              </div>
            </motion.div>
          )}

          <div ref={chatEndRef} />
        </div>
      )}

      {/* ── RESULTS ── */}
      {result && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent-primary)', marginBottom: 4 }}>Analysis Complete</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, fontFamily: 'Fraunces, Georgia, serif', lineHeight: 1.3 }}>{sourceTitle || 'Untitled Source'}</div>
            </div>
            <button className="btn btn-sm" onClick={resetConversation} style={{ flexShrink: 0 }}>New Analysis</button>
          </div>

          {error && (
            <div style={{ padding: '0.8rem 1rem', marginBottom: '1rem', borderRadius: 10, background: '#DC262608', border: '1px solid #DC262630', fontSize: '0.8rem', color: '#DC2626' }}>
              {error}
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
                    <span key={i} style={{ fontSize: '0.78rem', padding: '4px 12px', borderRadius: 20, background: 'var(--accent-primary)10', color: 'var(--accent-primary)', border: '1px solid var(--accent-primary)30' }}>{topic}</span>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.7rem 1rem', background: 'var(--accent-primary)06', borderBottom: '1px solid var(--border)' }}>
                          <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 800, flexShrink: 0 }}>{opp.sequence_rank ?? i + 1}</span>
                          <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{opp.recommended_format}</span>
                          <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 20, background: priorityColor + '12', color: priorityColor }}>{opp.priority}</span>
                          {effortLabel && <span style={{ fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: '#6366F110', color: '#6366F1' }}>{effortLabel}</span>}
                        </div>
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
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.8rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
                            {opp.persona_match && opp.persona_match !== 'general' && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}><span style={{ fontWeight: 600, marginRight: 4 }}>For:</span>{opp.persona_match}</div>
                            )}
                            {opp.kpi && (
                              <div style={{ fontSize: '0.7rem', color: '#10B981' }}><span style={{ fontWeight: 600, marginRight: 4 }}>KPI:</span>{opp.kpi}</div>
                            )}
                            {opp.suggested_cta && (
                              <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}><span style={{ fontWeight: 600, marginRight: 4 }}>CTA:</span>{opp.suggested_cta}</div>
                            )}
                          </div>
                          {opp.prerequisites?.length > 0 && (
                            <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 8, background: '#F59E0B08', border: '1px solid #F59E0B20' }}>
                              <span style={{ fontSize: '0.66rem', fontWeight: 700, color: '#F59E0B', marginRight: 6 }}>BEFORE SHIPPING:</span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{opp.prerequisites.join(' · ')}</span>
                            </div>
                          )}
                          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
                            {savedOppIds[opp.title] ? (
                              <button className="btn btn-primary btn-sm" onClick={() => { setActiveStudioOpp(savedOppIds[opp.title]); setActiveTab('studio'); }} style={{ fontSize: '0.72rem' }}>
                                Open in Studio →
                              </button>
                            ) : (
                              <button className="btn btn-sm" disabled style={{ fontSize: '0.72rem', opacity: 0.4, cursor: 'not-allowed' }} title="Saving…">
                                Open in Studio →
                              </button>
                            )}
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
                  <span key={i} style={{ fontSize: '0.72rem', padding: '2px 10px', borderRadius: 20, background: 'var(--accent-primary)08', color: 'var(--text-secondary)', border: '1px solid var(--accent-primary)20' }}>
                    {s.file_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card-static" style={{ padding: '1.2rem', textAlign: 'center', background: 'linear-gradient(135deg, var(--accent-primary)08, #a855f708)' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.6rem' }}>{result.opportunities?.length ?? 0} content pieces ready for your pipeline</div>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('opportunities')}>View in Opportunities</button>
          </div>
        </div>
      )}
    </div>
  );
}
