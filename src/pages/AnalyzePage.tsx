import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppStore } from '@/store';
import type { KnowledgeFile, OpportunityItem, AnalysisItem } from '@/store';
import { api } from '@/lib/api';

const supabaseConfigured = !!import.meta.env.VITE_SUPABASE_URL;

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
  'Understanding Context',
  'Extracting Topics',
  'Checking Source References',
  'Matching Personas',
  'Identifying Pain Points',
  'Assessing Content Depth',
  'Recommending Formats',
  'Ready for Generation',
];

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i',
  'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she',
  'her', 'they', 'them', 'their', 'what', 'which', 'who', 'whom', 'how',
  'when', 'where', 'why', 'not', 'no', 'nor', 'as', 'if', 'then',
  'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again',
  'all', 'also', 'am', 'any', 'because', 'before', 'between', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'into',
  'over', 'own', 'same', 'so', 'up', 'out', 'only', 'now', 'here',
  'there', 'once', 'during', 'while', 'through', 'under', 'until',
]);

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

/* ---- Local analysis engine (used when Supabase/AI not connected) ---- */

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 10);
}

function significantWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function scoreOverlap(a: string, b: string): number {
  const wordsA = new Set(significantWords(a));
  const wordsB = significantWords(b);
  let count = 0;
  for (const w of wordsB) { if (wordsA.has(w)) count++; }
  return count;
}

interface AnalysisInput {
  sourceType: string;
  sourceTitle: string;
  sourceOwner: string;
  sourceContent: string;
  sourceUrl: string;
  marketingNotes: string;
  kb: KnowledgeFile[];
}

function runLocalAnalysis(input: AnalysisInput) {
  const { sourceType, sourceTitle, sourceOwner, sourceContent, sourceUrl, marketingNotes, kb } = input;
  const sentences = splitSentences(sourceContent);
  const allWords = significantWords(sourceContent);
  const typeConfig = SOURCE_TYPES.find((t) => t.id === sourceType) ?? SOURCE_TYPES[0];

  const topicCount = sourceContent.length < 500 ? 2 : sourceContent.length < 1500 ? 3 : 4;
  const chunkSize = Math.ceil(sentences.length / topicCount);
  const topics: any[] = [];

  for (let i = 0; i < topicCount; i++) {
    const chunk = sentences.slice(i * chunkSize, (i + 1) * chunkSize);
    const chunkText = chunk.join(' ');
    const words = significantWords(chunkText);
    const freq: Record<string, number> = {};
    for (const w of words) freq[w] = (freq[w] || 0) + 1;
    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
    const topWords = sorted.slice(0, 3).map(([w]) => w);
    const topicTitle = topWords.length > 0 ? topWords.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' & ') : `Topic ${i + 1}`;
    topics.push({ id: `topic_${i + 1}`, title: topicTitle, summary: chunk.slice(0, 2).join(' ').substring(0, 200) + '...', keywords: topWords, sentenceCount: chunk.length });
  }

  const insights = sentences.filter((s) => /\d/.test(s) || /important|critical|key|significant|growth|increase|strategy/i.test(s)).slice(0, 6).map((s, idx) => ({ id: `ins_${idx + 1}`, text: s.substring(0, 180), type: /\d/.test(s) ? 'data-point' : 'action-insight' }));
  if (insights.length === 0 && sentences.length > 0) insights.push({ id: 'ins_1', text: sentences[0].substring(0, 180), type: 'key-point' });

  const activePersonas = kb.filter((f) => f.active && f.category === 'persona' && f.personaMeta);
  const personaMatches = activePersonas.map((p) => {
    const meta = p.personaMeta!;
    const painOverlap = scoreOverlap(sourceContent, meta.painPoint);
    const goalOverlap = scoreOverlap(sourceContent, meta.goal);
    const relevance = Math.min(100, Math.round(((painOverlap + goalOverlap) / Math.max(allWords.length, 1)) * 800 + 30 + Math.random() * 20));
    return { personaId: p.id, personaName: meta.name, relevanceScore: relevance, painPoint: meta.painPoint, question: `How does this relate to ${meta.goal.substring(0, 60)}?`, tone: meta.tone };
  }).sort((a, b) => b.relevanceScore - a.relevanceScore);

  const depthAnalysis = topics.map((t) => ({
    topicId: t.id, topicTitle: t.title,
    depth: t.sentenceCount > 4 ? 'Deep' : t.sentenceCount > 2 ? 'Moderate' : 'Surface',
    coverage: Math.min(100, t.sentenceCount * 15 + Math.round(Math.random() * 20)),
    recommendation: t.sentenceCount <= 2 ? 'Needs additional research and expert input' : 'Sufficient depth for content generation',
  }));

  const opportunities: any[] = [];
  let oppIdx = 0;
  for (const topic of topics) {
    const matchedPersonas = personaMatches.length > 0 ? personaMatches.slice(0, 2) : [{ personaId: null, personaName: 'General Audience', relevanceScore: 50, painPoint: '', question: '', tone: '' }];
    for (const persona of matchedPersonas) {
      for (const format of typeConfig.formats.slice(0, 2)) {
        oppIdx++;
        opportunities.push({
          id: `opp_${oppIdx}`, title: `${topic.title} - ${format}`, topicId: topic.id,
          sourceInsight: insights.length > 0 ? insights[0].text : topic.summary.substring(0, 100),
          personaId: persona.personaId, personaName: persona.personaName, personaRelevanceScore: persona.relevanceScore,
          personaPainPoint: persona.painPoint || null, personaQuestion: persona.question || null,
          contentAngle: `Address ${topic.title.toLowerCase()} from ${persona.personaName} perspective`,
          recommendedFormat: format, recommendationReason: `${format} format is ideal for ${typeConfig.label} content targeting ${persona.personaName}`,
          unsuitableFormatNotes: '', priority: persona.relevanceScore > 70 ? 'high' : 'standard',
          timeliness: sourceType === 'trending_topic' ? 'urgent' : 'standard',
          suggestedCTA: `Learn more about ${topic.keywords[0] || 'this topic'}`,
          expertAttribution: sourceOwner || 'Content Team', sourceContext: topic.summary.substring(0, 120),
          status: 'open', createdAt: Date.now(), analysisId: null,
        });
      }
    }
  }

  const usedFiles = kb.filter((f) => f.active).map((f) => ({ fileId: f.id, fileName: f.fileName, category: f.category, relevance: f.category === 'persona' ? 'primary' : 'supporting' }));
  const sourceReferences = sourceUrl ? [{ url: sourceUrl, title: sourceTitle || 'Source Link', verified: false, note: 'URL provided - verification pending' }] : [];
  const qualityCheck = { groundingScore: insights.length > 2 ? 85 : 60, complianceFlag: kb.some((f) => f.active && f.category === 'compliance') ? 'checked' : 'skipped', brandAligned: kb.some((f) => f.active && f.category === 'brand'), warnings: [] as string[] };
  const analysisWarnings: string[] = [];
  if (sourceContent.length < 200) analysisWarnings.push('Source content is very short. Analysis may be shallow.');
  if (!sourceUrl) analysisWarnings.push('No source URL provided. References cannot be verified.');
  if (activePersonas.length === 0) analysisWarnings.push('No active persona files in knowledge base.');
  const sourceSummary = { type: typeConfig.label, title: sourceTitle || 'Untitled', owner: sourceOwner || 'Unknown', wordCount: sourceContent.split(/\s+/).length, sentenceCount: sentences.length, marketingNotes: marketingNotes || 'None provided' };

  return { sourceSummary, topics, insights, personaMatches, depthAnalysis, opportunities, knowledgeContext: { filesUsed: usedFiles, totalFiles: kb.length, activeFiles: kb.filter((f) => f.active).length }, sourceReferences, qualityCheck, analysisWarnings };
}

export default function AnalyzePage() {
  const kb = useAppStore((s) => s.kb);
  const addAnalysis = useAppStore((s) => s.addAnalysis);
  const addOpportunities = useAppStore((s) => s.addOpportunities);
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
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'local' | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    if (!sourceContent.trim() && inputMode === 'text') return;
    if (!sourceUrl.trim() && inputMode === 'url') return;

    setIsRunning(true);
    setResult(null);
    setActivityStep(0);

    let step = 0;
    const stepTimer = setInterval(() => {
      step++;
      if (step < ACTIVITY_LABELS.length) setActivityStep(step);
    }, 380);
    timerRef.current = stepTimer;

    const content = inputMode === 'url' ? `[Content from URL: ${sourceUrl}] ${sourceContent}` : sourceContent;
    let analysisResult: any = null;
    let usedAI = false;

    if (supabaseConfigured) {
      try {
        const kbChunks = kb.filter((f) => f.active && f.content).map((f) => f.content!);
        const { data, error } = await api.analysis.run({
          accountId: '', sourceText: content, sourceType,
          knowledgeChunks: kbChunks,
        });
        if (!error && data) {
          analysisResult = (data as any).result ?? data;
          usedAI = true;
        }
      } catch { /* fall through to local */ }
    }

    if (!analysisResult) {
      analysisResult = runLocalAnalysis({ sourceType, sourceTitle, sourceOwner, sourceContent: content, sourceUrl, marketingNotes, kb });
    }

    clearInterval(stepTimer);
    timerRef.current = null;

    const typeLabel = SOURCE_TYPES.find((t) => t.id === sourceType)?.label ?? sourceType;
    const analysisId = `analysis_${Date.now()}`;

    const analysisItem: AnalysisItem = {
      id: analysisId, createdAt: Date.now(), sourceType, sourceTypeLabel: typeLabel,
      sourceTitle: sourceTitle || 'Untitled', sourceOwner: sourceOwner || 'Unknown', sourceUrl,
      ...analysisResult,
    };

    const taggedOpps: OpportunityItem[] = (analysisResult.opportunities || []).map((o: any) => ({ ...o, analysisId }));

    addAnalysis(analysisItem);
    addOpportunities(taggedOpps);
    setResult(analysisResult);
    setAnalysisMode(usedAI ? 'ai' : 'local');
    setActivityStep(ACTIVITY_LABELS.length);
    setIsRunning(false);
  }, [sourceType, sourceTitle, sourceOwner, sourceContent, sourceUrl, marketingNotes, inputMode, kb, addAnalysis, addOpportunities]);

  const typeConfig = SOURCE_TYPES.find((t) => t.id === sourceType) ?? SOURCE_TYPES[0];
  const canRun = inputMode === 'text' ? sourceContent.trim().length > 0 : sourceUrl.trim().length > 0;

  return (
    <div>
      <div className="eyebrow">Analysis Engine</div>
      <h1 className="page-title">Analyze Source Content</h1>
      <p className="page-desc">Paste your source content and let the intelligence engine extract topics, match personas, and identify content opportunities.</p>

      <div style={{ marginBottom: '1.2rem' }}>
        <div className="field-label" style={{ marginBottom: '0.5rem' }}>Source Type</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {SOURCE_TYPES.map((st) => (
            <span key={st.id} className="badge" onClick={() => setSourceType(st.id)} style={{ cursor: 'pointer', background: sourceType === st.id ? 'var(--accent-primary)' : undefined, color: sourceType === st.id ? '#fff' : undefined, borderColor: sourceType === st.id ? 'var(--accent-primary)' : undefined }}>
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
                <div style={{ fontSize: '0.7rem', color: 'var(--status-warning)', marginTop: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>&#9888;</span>
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
              <textarea className="glass-textarea" rows={3} placeholder="Any specific goals, campaigns, or context for this content..." value={marketingNotes} onChange={(e) => setMarketingNotes(e.target.value)} />
            </div>
            <button className="btn btn-brand" disabled={!canRun || isRunning} onClick={handleRunAnalysis} style={{ width: '100%', background: canRun && !isRunning ? 'linear-gradient(135deg, var(--accent-primary), #a855f7)' : undefined, opacity: !canRun || isRunning ? 0.5 : 1, cursor: !canRun || isRunning ? 'not-allowed' : 'pointer' }}>
              {isRunning ? 'Analyzing...' : 'Run Analysis'}
            </button>
          </div>
        </div>

        <div>
          <div className="glass-card-static" style={{ padding: '1.2rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Agent Activity</span>
              {analysisMode && (
                <span className="badge" style={{ fontSize: '0.6rem', background: analysisMode === 'ai' ? '#10B98118' : '#F59E0B18', color: analysisMode === 'ai' ? '#10B981' : '#F59E0B' }}>
                  {analysisMode === 'ai' ? 'AI Analysis' : 'Local Analysis'}
                </span>
              )}
            </div>
            {activityStep < 0 ? (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Click "Run Analysis" to start the intelligence engine.</p>
              </div>
            ) : (
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
              <KV k="Word Count" v={String(result.sourceSummary.wordCount)} />
              <KV k="Sentences" v={String(result.sourceSummary.sentenceCount)} />
              <KV k="Marketing Notes" v={result.sourceSummary.marketingNotes} />
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
                      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
                        {topic.keywords?.map((kw: string, ki: number) => <span key={ki} className="badge" style={{ fontSize: '0.65rem' }}>{kw}</span>)}
                      </div>
                      {depth && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Depth: <span style={{ color: depthColor, fontWeight: 600 }}>{depth.depth}</span> &middot; Coverage: {depth.coverage}%</div>}
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

          <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Persona Matches</div>
            {!result.personaMatches?.length ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No active persona files found in knowledge base.</div>
            ) : (
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
            )}
          </div>

          {result.knowledgeContext && (
            <div className="glass-card-static" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.6rem' }}>Knowledge Used ({result.knowledgeContext.activeFiles} / {result.knowledgeContext.totalFiles} files active)</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {result.knowledgeContext.filesUsed?.map((f: any, i: number) => (
                  <span key={i} className="badge" style={{ fontSize: '0.68rem', background: f.relevance === 'primary' ? 'var(--accent-primary-soft)' : undefined }}>{f.fileName}</span>
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
