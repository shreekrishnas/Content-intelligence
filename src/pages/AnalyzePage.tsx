import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabaseConfigured } from '@/lib/supabase';

const SOURCE_TYPES = [
  { id: 'et_video', label: 'ET Video', formats: ['Blog', 'Voice Page', 'Single Image', 'Carousel'] },
  { id: 'author_blog', label: 'Author / Wealth Manager Blog', formats: ['LinkedIn Amplification', 'Carousel', 'Single Image'] },
  { id: 'weekly_anil_rachana', label: 'Weekly Anil / Rachana Content', formats: ['Voice Page', 'Single Image', 'Carousel'] },
  { id: 'webinar', label: 'Webinar', formats: ['Blog', 'Short / Reel', 'B-roll Video', 'Q&A', 'Single Image', 'Carousel'] },
  { id: 'event_workshop', label: 'Event / Workshop', formats: ['Blog', 'Conversational Blog', 'Guide / E-book', 'Lead Magnet', 'Carousel'] },
  { id: 'trending_topic', label: 'Trending Topic', formats: ['Single Image', 'Carousel', 'Educational Carousel', 'Blog Pipeline'] },
];

const ACTIVITY_LABELS = [
  'Reading Source',
  'Checking Knowledge Base',
  'Extracting Topics',
  'Matching Personas',
  'Assessing Depth',
  'Generating Opportunities',
  'Quality Check',
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

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: 'flex', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
      <span style={{ width: 130, flexShrink: 0, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

export default function AnalyzePage() {
  const { accountId } = useAccount();
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const [sourceType, setSourceType] = useState('et_video');
  const [inputMode, setInputMode] = useState<'text' | 'url'>('text');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceOwner, setSourceOwner] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [marketingNotes, setMarketingNotes] = useState('');

  const [isRunning, setIsRunning] = useState(false);
  const [activityStep, setActivityStep] = useState(-1);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    if (!accountId) return;
    if (!sourceContent.trim() && inputMode === 'text') return;
    if (!sourceUrl.trim() && inputMode === 'url') return;

    setIsRunning(true);
    setResult(null);
    setError(null);
    setActivityStep(0);

    let step = 0;
    const stepTimer = setInterval(() => {
      step++;
      if (step < ACTIVITY_LABELS.length) setActivityStep(step);
    }, 600);
    timerRef.current = stepTimer;

    const content = inputMode === 'url' ? `[Source URL: ${sourceUrl}]\n\n${sourceContent}` : sourceContent;

    try {
      const retrieval = await retrieve(accountId, content, sourceType);

      if (retrieval.refused) {
        clearInterval(stepTimer);
        timerRef.current = null;
        setError(retrieval.reason || 'Knowledge base not ready. Upload required files first.');
        setActivityStep(-1);
        setIsRunning(false);
        return;
      }

      const kbChunks = [
        ...retrieval.constraintChunks.map((c) => c.chunk_text),
        ...retrieval.chunks.map((c) => c.chunk_text),
      ];

      const { data, error: apiErr } = await api.analysis.run({
        accountId,
        sourceText: content,
        sourceType,
        knowledgeChunks: kbChunks,
      });

      clearInterval(stepTimer);
      timerRef.current = null;

      if (apiErr) throw new Error(apiErr);

      const analysisResult = (data as any)?.result ?? data;
      setResult(analysisResult);
      setActivityStep(ACTIVITY_LABELS.length);

      await auditLog({
        accountId,
        action: 'analyze',
        targetType: 'analysis',
        targetId: (data as any)?.id,
        detail: { source_type: sourceType, source_title: sourceTitle },
      });
    } catch (e: any) {
      clearInterval(stepTimer);
      timerRef.current = null;
      setError(e.message || 'Analysis failed. Check your configuration and try again.');
      setActivityStep(-1);
    } finally {
      setIsRunning(false);
    }
  }, [accountId, sourceType, sourceTitle, sourceContent, sourceUrl, inputMode, marketingNotes]);

  const typeConfig = SOURCE_TYPES.find((t) => t.id === sourceType) ?? SOURCE_TYPES[0];
  const canRun = (inputMode === 'text' ? sourceContent.trim().length > 0 : sourceUrl.trim().length > 0) && supabaseConfigured;

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
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {SOURCE_TYPES.map((st) => (
            <span key={st.id} className="badge" onClick={() => setSourceType(st.id)} style={{ cursor: 'pointer', background: sourceType === st.id ? 'var(--accent-primary)' : undefined, color: sourceType === st.id ? '#fff' : undefined }}>
              {st.label}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Available formats: {typeConfig.formats.join(', ')}</div>
      </div>

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

      {result && (
        <div style={{ marginTop: '2rem' }}>
          <div className="hairline" style={{ marginBottom: '1.5rem' }} />
          <div className="grid grid-4" style={{ gap: '0.8rem', marginBottom: '1.5rem' }}>
            <StatCard label="Topics" value={result.topics?.length ?? 0} color="var(--accent-primary)" />
            <StatCard label="Insights" value={result.insights?.length ?? 0} color="var(--status-info)" />
            <StatCard label="Opportunities" value={result.opportunities?.length ?? 0} color="var(--status-success)" />
            <StatCard label="Content Value" value={(result.opportunities?.length ?? 0) > 8 ? 'High' : (result.opportunities?.length ?? 0) > 4 ? 'Medium' : 'Low'} color="var(--status-warning)" />
          </div>

          {result.analysisWarnings?.length > 0 && (
            <div className="glass-card-static" style={{ padding: '0.8rem 1rem', marginBottom: '1rem', borderLeft: '3px solid var(--status-warning)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--status-warning)', marginBottom: '0.4rem' }}>Warnings</div>
              {result.analysisWarnings.map((w: string, i: number) => <div key={i} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>{w}</div>)}
            </div>
          )}

          {result.sourceSummary && (
            <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Source Summary</div>
              <KV k="Type" v={result.sourceSummary.type} />
              <KV k="Title" v={result.sourceSummary.title} />
              <KV k="Owner" v={result.sourceSummary.owner} />
              {result.sourceSummary.wordCount && <KV k="Word Count" v={String(result.sourceSummary.wordCount)} />}
            </div>
          )}

          {result.topics?.length > 0 && (
            <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Topics & Depth</div>
              <div className="grid grid-2" style={{ gap: '0.8rem' }}>
                {result.topics.map((topic: any, i: number) => {
                  const depth = result.depthAnalysis?.find((d: any) => d.topicId === topic.id);
                  const depthColor = depth?.depth === 'Deep' ? 'var(--status-success)' : depth?.depth === 'Moderate' ? 'var(--status-warning)' : 'var(--status-danger)';
                  return (
                    <div key={i} className="glass-card-static" style={{ padding: '0.8rem', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: depthColor }} />
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '0.3rem' }}>{topic.title}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>{topic.summary}</div>
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                        {topic.keywords?.map((kw: string, ki: number) => <span key={ki} className="badge" style={{ fontSize: '0.65rem' }}>{kw}</span>)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {result.insights?.length > 0 && (
            <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Key Insights</div>
              {result.insights.map((ins: any, i: number) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'flex-start' }}>
                  <span className="badge" style={{ fontSize: '0.6rem', flexShrink: 0, background: ins.type === 'data-point' ? 'var(--status-info)' : 'var(--accent-primary)', color: '#fff', borderColor: 'transparent' }}>
                    {ins.type === 'data-point' ? 'DATA' : 'INSIGHT'}
                  </span>
                  <span style={{ fontSize: '0.8rem' }}>{ins.text}</span>
                </div>
              ))}
            </div>
          )}

          {result.personaMatches?.length > 0 && (
            <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Persona Matches</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {result.personaMatches.map((pm: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>{pm.relevanceScore}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{pm.personaName}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pm.question}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="glass-card-static" style={{ padding: '1rem 1.2rem', textAlign: 'center' }}>
            <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}><strong>{result.opportunities?.length ?? 0}</strong> content opportunities identified</div>
            <button className="btn btn-primary btn-sm" onClick={() => setActiveTab('opportunities')}>View in Opportunities Tab</button>
          </div>
        </div>
      )}
    </div>
  );
}
