import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store';
import { useAccount } from '@/contexts/AccountContext';
import { api } from '@/lib/api';
import { auditLog } from '@/lib/audit';
import { retrieve } from '@/lib/retrieval';
import { supabaseConfigured } from '@/lib/supabase';
import { showToast } from '@/lib/toast';


type SubTab = 'generate' | 'library' | 'seasonal' | 'webinar' | 'seo';
type ExpandType = 'brief' | 'carousel' | 'blog' | 'caption';

interface Idea {
  _id?: string;
  title?: string;
  format?: string;
  group?: string;
  audience?: string;
  hook?: string;
  angle?: string;
  score?: number;
  cta?: string;
  visual_direction?: string;
  why_it_works?: string;
  compliance_reminder?: string;
  slide_flow?: string[];
  scores?: Record<string, number>;
  platform_notes?: string;
  content_pillar?: string;
  // webinar / seo / seasonal extras
  description?: string;
  key_insight?: string;
  funnel_stage?: string;
  priority?: string;
  effort?: string;
  keyword?: string;
  search_intent?: string;
  difficulty_tier?: string;
  long_tail_keywords?: string[];
  meta_description?: string;
  estimated_word_count?: number;
  occasion?: string;
  timing?: string;
  urgency?: string;
  [k: string]: unknown;
}

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: 'generate', label: 'Generate' },
  { id: 'library', label: 'Saved Library' },
  { id: 'seasonal', label: 'Seasonal' },
  { id: 'webinar', label: 'Webinar' },
  { id: 'seo', label: 'SEO' },
];

const GROUP_COLORS: Record<string, string> = {
  Social: '#6366F1', Video: '#EC4899', Blog: '#0EA5E9', Email: '#F59E0B', Seasonal: '#10B981',
};

function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Client-side fallback so the grid is never empty if the AI call fails ──
function fallbackIdeas(topic: string, audience: string): Idea[] {
  const t = topic.trim() || 'your core offering';
  const a = audience.trim() || 'your target audience';
  const templates: Array<Partial<Idea>> = [
    { format: 'LinkedIn carousel', group: 'Social', angle: 'Myth-buster', title: `5 myths about ${t} that cost ${a} money`, hook: `Most people believe the opposite of what's actually true about ${t}.` },
    { format: 'Blog post', group: 'Blog', angle: 'Framework', title: `The ${t} decision framework for ${a}`, hook: `Stop guessing. Here's a step-by-step way to think about ${t}.` },
    { format: 'Short video', group: 'Video', angle: 'Contrarian', title: `Why the usual advice on ${t} is wrong for ${a}`, hook: `Everyone says do X. For ${a}, that's often a mistake.` },
    { format: 'Email', group: 'Email', angle: 'Case study', title: `How one ${a} got ${t} right`, hook: `A real before/after that shows what good looks like.` },
    { format: 'Quote card', group: 'Social', angle: 'Data-backed', title: `The one number about ${t} ${a} should know`, hook: `A single statistic that reframes the whole conversation.` },
    { format: 'Instagram Reel', group: 'Video', angle: 'FAQ', title: `${t}: the 3 questions ${a} always ask`, hook: `Answering the questions that actually keep people up at night.` },
  ];
  return templates.map((x) => ({
    ...x, _id: uid(), audience: a, score: 70, content_pillar: t,
    why_it_works: 'Template idea generated locally because the AI service was unavailable. Edit or regenerate for stronger output.',
    compliance_reminder: '', slide_flow: [],
    scores: { audience_fit: 70, clarity: 70, platform_fit: 70, conversion_potential: 65, compliance_safety: 80 },
  }));
}

function withIds(ideas: Idea[]): Idea[] {
  return (ideas || []).map((x) => ({ ...x, _id: x._id || uid() }));
}

function IdeaCard({ idea, onOpen, onSave, saved }: { idea: Idea; onOpen: () => void; onSave: () => void; saved: boolean }) {
  const groupColor = GROUP_COLORS[idea.group || ''] || '#6366F1';
  const score = typeof idea.score === 'number' ? idea.score : undefined;
  return (
    <div className="glass-card-static il-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }} onClick={onOpen}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {idea.format && <span className="badge" style={{ fontSize: '0.6rem', background: groupColor + '18', color: groupColor }}>{idea.format}</span>}
          {idea.angle && <span className="badge" style={{ fontSize: '0.6rem' }}>{idea.angle}</span>}
          {idea.funnel_stage && <span className="badge" style={{ fontSize: '0.6rem' }}>{idea.funnel_stage}</span>}
          {idea.urgency && <span className="badge" style={{ fontSize: '0.6rem', background: '#F59E0B18', color: '#F59E0B' }}>{idea.urgency}</span>}
        </div>
        {score !== undefined && (
          <div style={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.72rem', fontWeight: 800, color: '#fff', background: `conic-gradient(${groupColor} ${score * 3.6}deg, var(--border) 0deg)` }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-card)', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{score}</span>
          </div>
        )}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.9rem', lineHeight: 1.3 }}>{idea.title || 'Untitled idea'}</div>
      {(idea.hook || idea.description) && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{idea.hook || idea.description}</div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }} onClick={(e) => e.stopPropagation()}>
        <button className="btn btn-ghost btn-sm" onClick={onSave} style={{ fontSize: '0.7rem' }}>{saved ? 'Saved ✓' : 'Save'}</button>
        <button className="btn btn-secondary btn-sm" onClick={onOpen} style={{ fontSize: '0.7rem' }}>View</button>
      </div>
    </div>
  );
}

// ── Expand output: render each type as readable content, not raw JSON ──
function OutBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

function Para({ text }: { text?: string }) {
  if (!text) return null;
  return <div style={{ fontSize: '0.82rem', lineHeight: 1.55 }}>{text}</div>;
}

function Bullets({ items }: { items?: any[] }) {
  if (!items?.length) return null;
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.82rem', lineHeight: 1.6 }}>
      {items.map((it, i) => <li key={i}>{typeof it === 'string' ? it : JSON.stringify(it)}</li>)}
    </ul>
  );
}

function ExpandOutput({ type, data }: { type: ExpandType; data: any }) {
  if (!data || typeof data !== 'object') return <Para text={String(data ?? '')} />;

  if (type === 'brief') {
    return (
      <div>
        <OutBlock label="Overview"><Para text={data.overview} /></OutBlock>
        <OutBlock label="Target Audience"><Para text={data.target_audience} /></OutBlock>
        <OutBlock label="Key Messages"><Bullets items={data.key_messages} /></OutBlock>
        <OutBlock label="Content Structure"><Bullets items={data.content_structure} /></OutBlock>
        <OutBlock label="Visual Mood"><Para text={data.visual_mood} /></OutBlock>
        <OutBlock label="Distribution Plan"><Para text={data.distribution_plan} /></OutBlock>
        <OutBlock label="Success Metrics"><Bullets items={data.success_metrics} /></OutBlock>
        <OutBlock label="SEO Notes"><Para text={data.seo_notes} /></OutBlock>
      </div>
    );
  }

  if (type === 'carousel') {
    return (
      <div>
        {data.slides?.length > 0 && (
          <OutBlock label={`Slides (${data.slides.length})`}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.slides.map((s: any, i: number) => (
                <div key={i} className="glass-card-static" style={{ padding: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span className="badge" style={{ fontSize: '0.58rem' }}>Slide {i + 1}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.82rem' }}>{s.headline}</span>
                  </div>
                  {s.body && <div style={{ fontSize: '0.8rem', lineHeight: 1.5 }}>{s.body}</div>}
                  {s.visual_note && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 3 }}>🎨 {s.visual_note}</div>}
                  {s.speaker_note && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>🎙 {s.speaker_note}</div>}
                </div>
              ))}
            </div>
          </OutBlock>
        )}
        <OutBlock label="Caption"><Para text={data.caption} /></OutBlock>
        <OutBlock label="Design System"><Para text={data.design_system} /></OutBlock>
      </div>
    );
  }

  if (type === 'blog') {
    return (
      <div>
        <OutBlock label="Meta Title"><Para text={data.meta_title} /></OutBlock>
        <OutBlock label="Meta Description"><Para text={data.meta_description} /></OutBlock>
        {data.outline?.length > 0 && (
          <OutBlock label="Outline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {data.outline.map((sec: any, i: number) => (
                <div key={i}>
                  <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{sec.heading}</div>
                  <Bullets items={sec.subpoints} />
                </div>
              ))}
            </div>
          </OutBlock>
        )}
        {data.faq_schema?.length > 0 && (
          <OutBlock label="FAQ">
            {data.faq_schema.map((f: any, i: number) => (
              <div key={i} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>Q: {f.question}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>A: {f.answer}</div>
              </div>
            ))}
          </OutBlock>
        )}
        <OutBlock label="Internal Links"><Bullets items={data.internal_links} /></OutBlock>
        <OutBlock label="Featured Snippet Target"><Para text={data.featured_snippet_target} /></OutBlock>
      </div>
    );
  }

  // caption
  return (
    <div>
      <OutBlock label="LinkedIn"><Para text={data.linkedin} /></OutBlock>
      <OutBlock label="Instagram"><Para text={data.instagram} /></OutBlock>
      <OutBlock label="Twitter / X"><Para text={data.twitter} /></OutBlock>
      <OutBlock label="Email Subject Lines"><Bullets items={data.email_subject_lines} /></OutBlock>
    </div>
  );
}

// Flatten an expand output into readable plain text for copy/calendar.
function expandToText(type: ExpandType, d: any): string {
  if (!d || typeof d !== 'object') return String(d ?? '');
  const L: string[] = [];
  const push = (label: string, val?: any) => {
    if (val === undefined || val === null || val === '') return;
    if (Array.isArray(val)) { if (val.length) { L.push(label + ':'); val.forEach((v) => L.push(`- ${typeof v === 'string' ? v : JSON.stringify(v)}`)); L.push(''); } }
    else { L.push(`${label}: ${val}`); L.push(''); }
  };
  if (type === 'carousel') {
    (d.slides || []).forEach((s: any, i: number) => { L.push(`Slide ${i + 1}: ${s.headline || ''}`); if (s.body) L.push(s.body); if (s.visual_note) L.push(`Visual: ${s.visual_note}`); L.push(''); });
    push('Caption', d.caption); push('Design System', d.design_system);
  } else if (type === 'blog') {
    push('Meta Title', d.meta_title); push('Meta Description', d.meta_description);
    (d.outline || []).forEach((sec: any) => { L.push(`## ${sec.heading || ''}`); (sec.subpoints || []).forEach((p: string) => L.push(`- ${p}`)); L.push(''); });
    (d.faq_schema || []).forEach((f: any) => { L.push(`Q: ${f.question}`); L.push(`A: ${f.answer}`); L.push(''); });
    push('Internal Links', d.internal_links); push('Featured Snippet', d.featured_snippet_target);
  } else if (type === 'caption') {
    push('LinkedIn', d.linkedin); push('Instagram', d.instagram); push('Twitter/X', d.twitter); push('Email Subjects', d.email_subject_lines);
  } else {
    push('Overview', d.overview); push('Target Audience', d.target_audience); push('Key Messages', d.key_messages);
    push('Content Structure', d.content_structure); push('Visual Mood', d.visual_mood); push('Distribution Plan', d.distribution_plan);
    push('Success Metrics', d.success_metrics); push('SEO Notes', d.seo_notes);
  }
  return L.join('\n').trim();
}

function Row({ label, value }: { label: string; value?: string | number }) {
  if (value === undefined || value === '' || value === null) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>{String(value)}</div>
    </div>
  );
}

export default function IdeasLabPage() {
  const { accountId, account } = useAccount();
  const [subTab, setSubTab] = useState<SubTab>('generate');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [seasonal, setSeasonal] = useState<Idea[]>([]);
  const [webinarIdeas, setWebinarIdeas] = useState<Idea[]>([]);
  const [seoIdeas, setSeoIdeas] = useState<Idea[]>([]);
  const [saved, setSaved] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('All');
  const [selected, setSelected] = useState<Idea | null>(null);
  const [expandOut, setExpandOut] = useState<{ type: ExpandType; data: any } | null>(null);
  const [expanding, setExpanding] = useState(false);

  // Brief form
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('');
  const [contentType, setContentType] = useState('LinkedIn carousel');
  const [goal, setGoal] = useState('Awareness');
  const [source, setSource] = useState('Manual topic');
  const [context, setContext] = useState('');

  // Webinar / SEO inputs
  const [webinarText, setWebinarText] = useState('');
  const [seoText, setSeoText] = useState('');

  const ideasSeed = useAppStore((s) => s.ideasSeed);
  const setIdeasSeed = useAppStore((s) => s.setIdeasSeed);

  const lsKey = accountId ? `idea_lab_saved_${accountId}` : 'idea_lab_saved';

  // When a trend is routed here from the Trend Supervisor, prefill the brief.
  useEffect(() => {
    if (!ideasSeed) return;
    setSubTab('generate');
    if (ideasSeed.topic) setTopic(ideasSeed.topic);
    if (ideasSeed.audience) setAudience(ideasSeed.audience);
    if (ideasSeed.context) setContext(ideasSeed.context);
    setIdeasSeed(null);
    showToast('Brief prefilled from trend — review and generate');
  }, [ideasSeed, setIdeasSeed]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      setSaved(raw ? JSON.parse(raw) : []);
    } catch { setSaved([]); }
  }, [lsKey]);

  const persistSaved = useCallback((next: Idea[]) => {
    setSaved(next);
    try { localStorage.setItem(lsKey, JSON.stringify(next)); } catch { /* quota */ }
  }, [lsKey]);

  // Optional, non-blocking KB grounding — ignored if unavailable
  const getKbChunks = useCallback(async (query: string): Promise<string[]> => {
    if (!accountId || !supabaseConfigured) return [];
    try {
      const r = await retrieve(accountId, query, 'ideas');
      if (r.refused) return [];
      return [...r.constraintChunks.slice(0, 10), ...r.chunks].map((c) => c.chunk_text);
    } catch { return []; }
  }, [accountId]);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.title)), [saved]);

  function toggleSave(idea: Idea) {
    if (savedIds.has(idea.title)) {
      persistSaved(saved.filter((s) => s.title !== idea.title));
      showToast('Removed from library', 'warn');
    } else {
      persistSaved([{ ...idea, _id: idea._id || uid() }, ...saved]);
      showToast('Saved to library');
    }
  }

  async function handleGenerate() {
    setLoading(true); setError(null); setExpandOut(null);
    try {
      const kb = await getKbChunks(`${topic} ${audience} ${context}`);
      const res = await api.ideas.generate({
        accountLabel: account?.name,
        topic, audience, contentType, goal, source, context,
        avoidTitles: [...ideas, ...saved].map((i) => i.title || '').filter(Boolean),
        knowledgeChunks: kb,
      });
      if (res.error) {
        // graceful fallback so the user still gets something usable
        setIdeas(fallbackIdeas(topic, audience));
        setError(`${res.error} — showing template ideas as a fallback.`);
      } else {
        setIdeas(withIds(res.data || []));
        if (!res.data?.length) setError('No ideas returned. Try a more specific topic.');
      }
      if (accountId) auditLog({ accountId, action: 'ideas_generate', targetType: 'ideas', detail: { topic } }).catch(() => {});
    } finally {
      setLoading(false);
    }
  }

  async function handleSeasonal() {
    setLoading(true); setError(null);
    try {
      const kb = await getKbChunks(`${account?.name || ''} seasonal timely`);
      const res = await api.ideas.seasonal({ accountLabel: account?.name, month: new Date().toISOString().slice(0, 7), context, knowledgeChunks: kb });
      if (res.error) setError(res.error);
      else setSeasonal(withIds(res.data || []));
    } finally { setLoading(false); }
  }

  async function handleWebinar() {
    if (!webinarText.trim()) { showToast('Paste webinar content first', 'warn'); return; }
    setLoading(true); setError(null);
    try {
      const kb = await getKbChunks(webinarText.slice(0, 400));
      const res = await api.ideas.webinar(webinarText, kb);
      if (res.error) setError(res.error);
      else setWebinarIdeas(withIds(res.data || []));
    } finally { setLoading(false); }
  }

  async function handleSeo() {
    if (!seoText.trim()) { showToast('Enter at least one keyword', 'warn'); return; }
    setLoading(true); setError(null);
    try {
      const kb = await getKbChunks(seoText.slice(0, 400));
      const res = await api.ideas.seo(seoText, kb);
      if (res.error) setError(res.error);
      else setSeoIdeas(withIds(res.data || []));
    } finally { setLoading(false); }
  }

  async function handleExpand(type: ExpandType) {
    if (!selected) return;
    setExpanding(true); setExpandOut(null);
    try {
      const kb = await getKbChunks(`${selected.title} ${selected.hook || ''}`);
      const res = await api.ideas.expand(selected, type, kb);
      if (res.error) { showToast(res.error, 'error'); return; }
      setExpandOut({ type, data: res.data });
    } finally { setExpanding(false); }
  }

  async function sendToCalendar(idea: Idea) {
    if (!accountId) { showToast('No account selected', 'error'); return; }
    const bodyParts = [
      idea.hook ? `Hook: ${idea.hook}` : '',
      idea.description ? `\n${idea.description}` : '',
      idea.slide_flow?.length ? `\n\nFlow:\n${idea.slide_flow.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : '',
      idea.cta ? `\n\nCTA: ${idea.cta}` : '',
    ].filter(Boolean).join('');
    const { error: e } = await api.calendar.add({
      account_id: accountId,
      asset_id: null,
      title: idea.title || 'Untitled idea',
      format: idea.format || 'content',
      scheduled_for: null,
      status: 'scheduled',
      body: bodyParts || (idea.title ?? ''),
    });
    if (e) { showToast(e, 'error'); return; }
    auditLog({ accountId, action: 'ideas_to_calendar', targetType: 'calendar_item', detail: { title: idea.title } }).catch(() => {});
    showToast('Added to Calendar');
  }

  async function sendExpandedToCalendar() {
    if (!accountId || !selected || !expandOut) return;
    const { error: e } = await api.calendar.add({
      account_id: accountId,
      asset_id: null,
      title: selected.title || 'Untitled idea',
      format: expandOut.type === 'carousel' ? 'Carousel' : expandOut.type === 'blog' ? 'Blog post' : selected.format || 'content',
      scheduled_for: null,
      status: 'scheduled',
      body: expandToText(expandOut.type, expandOut.data) || (selected.title ?? ''),
    });
    if (e) { showToast(e, 'error'); return; }
    auditLog({ accountId, action: 'ideas_expand_to_calendar', targetType: 'calendar_item', detail: { title: selected.title, type: expandOut.type } }).catch(() => {});
    showToast('Expanded asset added to Calendar');
  }

  function copyIdea(idea: Idea) {
    const text = [
      idea.title, idea.format ? `Format: ${idea.format}` : '', idea.hook ? `Hook: ${idea.hook}` : '',
      idea.description || '', idea.cta ? `CTA: ${idea.cta}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard')).catch(() => showToast('Could not copy', 'warn'));
  }

  const activeIdeas: Idea[] =
    subTab === 'generate' ? ideas :
    subTab === 'seasonal' ? seasonal :
    subTab === 'webinar' ? webinarIdeas :
    subTab === 'seo' ? seoIdeas :
    saved;

  const groups = useMemo(() => ['All', ...Array.from(new Set(activeIdeas.map((i) => i.group).filter(Boolean)))] as string[], [activeIdeas]);
  const filtered = filter === 'All' ? activeIdeas : activeIdeas.filter((i) => i.group === filter);

  const metrics = useMemo(() => {
    const scores = activeIdeas.map((i) => i.score).filter((s): s is number => typeof s === 'number');
    return {
      count: activeIdeas.length,
      top: scores.length ? Math.max(...scores) : 0,
      saved: saved.length,
    };
  }, [activeIdeas, saved.length]);

  return (
    <div>
      <p className="eyebrow">Ideation Engine</p>
      <h1 className="page-title">Ideas Lab</h1>
      <p className="page-desc">Generate specific, production-ready content ideas — grounded in your Knowledge Base when available.</p>

      {/* sub-tabs */}
      <div className="underline-tabs" style={{ marginBottom: '1.2rem', flexWrap: 'wrap' }}>
        {SUB_TABS.map((t) => (
          <button key={t.id} className={`u-tab${subTab === t.id ? ' active' : ''}`} onClick={() => { setSubTab(t.id); setFilter('All'); setError(null); }}>
            {t.label}{t.id === 'library' && saved.length ? ` (${saved.length})` : ''}
          </button>
        ))}
      </div>

      {/* ── GENERATE brief form ── */}
      {subTab === 'generate' && (
        <div className="glass-card-static" style={{ padding: '1.2rem', marginBottom: '1.2rem' }}>
          <div className="grid grid-2" style={{ gap: '0.8rem' }}>
            <div className="field"><label className="field-label">Core Topic</label><input className="glass-input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. NRI retirement planning" /></div>
            <div className="field"><label className="field-label">Target Audience</label><input className="glass-input" value={audience} onChange={(e) => setAudience(e.target.value)} placeholder="e.g. Middle-East NRIs earning ₹30L+" /></div>
            <div className="field"><label className="field-label">Preferred Format</label>
              <select className="glass-select" value={contentType} onChange={(e) => setContentType(e.target.value)}>
                {['LinkedIn carousel', 'Instagram Reel', 'Blog post', 'Email', 'Short video', 'Quote card', 'Mixed'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label className="field-label">Goal</label>
              <select className="glass-select" value={goal} onChange={(e) => setGoal(e.target.value)}>
                {['Awareness', 'Lead generation', 'Engagement', 'Education', 'Conversion', 'Retention'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="field"><label className="field-label">Idea Source</label>
              <select className="glass-select" value={source} onChange={(e) => setSource(e.target.value)}>
                {['Manual topic', 'SEO keyword', 'Webinar', 'Trend', 'Customer question', 'Competitor gap'].map((o) => <option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginTop: '0.6rem' }}><label className="field-label">Extra Direction (optional)</label><textarea className="glass-textarea" rows={2} value={context} onChange={(e) => setContext(e.target.value)} placeholder="Any campaign notes, angle, or must-include points..." /></div>
          <button className="btn btn-brand" onClick={handleGenerate} disabled={loading} style={{ marginTop: '0.8rem' }}>{loading ? 'Generating ideas...' : '✦ Generate Ideas'}</button>
        </div>
      )}

      {/* ── SEASONAL controls ── */}
      {subTab === 'seasonal' && (
        <div className="glass-card-static" style={{ padding: '1.2rem', marginBottom: '1.2rem' }}>
          <div className="field"><label className="field-label">Context (optional)</label><input className="glass-input" value={context} onChange={(e) => setContext(e.target.value)} placeholder="Any focus for the next 3 months..." /></div>
          <button className="btn btn-brand" onClick={handleSeasonal} disabled={loading} style={{ marginTop: '0.8rem' }}>{loading ? 'Finding seasonal moments...' : '✦ Generate Seasonal Ideas'}</button>
        </div>
      )}

      {/* ── WEBINAR input ── */}
      {subTab === 'webinar' && (
        <div className="glass-card-static" style={{ padding: '1.2rem', marginBottom: '1.2rem' }}>
          <div className="field"><label className="field-label">Webinar Transcript / Notes</label><textarea className="glass-textarea" rows={6} value={webinarText} onChange={(e) => setWebinarText(e.target.value)} placeholder="Paste the webinar transcript or detailed notes here..." /></div>
          <button className="btn btn-brand" onClick={handleWebinar} disabled={loading} style={{ marginTop: '0.8rem' }}>{loading ? 'Repurposing...' : '✦ Repurpose into 15-18 pieces'}</button>
        </div>
      )}

      {/* ── SEO input ── */}
      {subTab === 'seo' && (
        <div className="glass-card-static" style={{ padding: '1.2rem', marginBottom: '1.2rem' }}>
          <div className="field"><label className="field-label">Target Keywords (one per line)</label><textarea className="glass-textarea" rows={5} value={seoText} onChange={(e) => setSeoText(e.target.value)} placeholder={'NRI tax planning\nretirement corpus calculator\nbest AIF for HNI'} /></div>
          <button className="btn btn-brand" onClick={handleSeo} disabled={loading} style={{ marginTop: '0.8rem' }}>{loading ? 'Building SEO plan...' : '✦ Generate SEO Ideas'}</button>
        </div>
      )}

      {/* ── metrics + filters ── */}
      {activeIdeas.length > 0 && (
        <>
          <div className="grid grid-3" style={{ gap: '0.8rem', marginBottom: '1rem' }}>
            <div className="glass-card-static" style={{ padding: '0.7rem 1rem' }}><div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Ideas</div><div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{metrics.count}</div></div>
            <div className="glass-card-static" style={{ padding: '0.7rem 1rem' }}><div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Top Score</div><div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{metrics.top || '—'}</div></div>
            <div className="glass-card-static" style={{ padding: '0.7rem 1rem' }}><div style={{ fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Saved</div><div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{metrics.saved}</div></div>
          </div>
          {groups.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: '1rem' }}>
              {groups.map((g) => (
                <button key={g} className="badge" style={{ cursor: 'pointer', background: filter === g ? 'var(--accent-primary)' : undefined, color: filter === g ? '#fff' : undefined }} onClick={() => setFilter(g)}>{g}</button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <div className="glass-card-static" style={{ padding: '0.9rem 1.1rem', marginBottom: '1rem', borderLeft: '3px solid #DC2626' }}>
          <p style={{ fontSize: '0.82rem', color: '#DC2626' }}>{error}</p>
          {(error.includes('API key') || error.includes('credits') || error.includes('Model not found')) && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Check <strong>OPENROUTER_API_KEY</strong> (and optionally <strong>LLM_MODEL</strong>) in Vercel Environment Variables.</p>
          )}
        </div>
      )}

      {loading && activeIdeas.length === 0 && (
        <div className="grid grid-3" style={{ gap: '0.8rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="glass-card-static il-skeleton" style={{ height: 150 }} />)}
        </div>
      )}

      {!loading && activeIdeas.length === 0 && (
        <div className="empty-state">
          <p>{subTab === 'library' ? 'No saved ideas yet. Save ideas from any tab to build your library.' : 'No ideas yet. Fill the brief above and generate.'}</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-3" style={{ gap: '0.8rem', alignItems: 'stretch' }}>
          {filtered.map((idea) => (
            <IdeaCard key={idea._id} idea={idea} saved={savedIds.has(idea.title)} onOpen={() => { setSelected(idea); setExpandOut(null); }} onSave={() => toggleSave(idea)} />
          ))}
        </div>
      )}

      {/* ── Detail drawer ── */}
      {selected && (
        <div className="il-drawer-overlay" onClick={() => setSelected(null)}>
          <aside className="glass-card-static il-drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected.format && <span className="badge" style={{ background: (GROUP_COLORS[selected.group || ''] || '#6366F1') + '18', color: GROUP_COLORS[selected.group || ''] || '#6366F1' }}>{selected.format}</span>}
                {selected.content_pillar && <span className="badge">{selected.content_pillar}</span>}
              </div>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--text-muted)' }}>&times;</button>
            </div>

            <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 12, lineHeight: 1.3 }}>{selected.title}</h3>

            <Row label="Hook" value={selected.hook} />
            <Row label="Audience" value={selected.audience} />
            <Row label="Angle" value={selected.angle} />
            <Row label="Description" value={selected.description} />
            <Row label="Key Insight" value={selected.key_insight} />
            <Row label="Why It Works" value={selected.why_it_works} />
            <Row label="Occasion" value={selected.occasion} />
            <Row label="Timing" value={selected.timing} />
            <Row label="Keyword" value={selected.keyword} />
            <Row label="Search Intent" value={selected.search_intent} />
            <Row label="Meta Description" value={selected.meta_description} />
            <Row label="Visual Direction" value={selected.visual_direction} />
            <Row label="Platform Notes" value={selected.platform_notes} />
            <Row label="CTA" value={selected.cta} />
            <Row label="Compliance" value={selected.compliance_reminder} />

            {selected.slide_flow && selected.slide_flow.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Content Flow</div>
                <ol style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.8rem', lineHeight: 1.6 }}>
                  {selected.slide_flow.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
            )}

            {selected.long_tail_keywords && selected.long_tail_keywords.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 4 }}>Long-tail Keywords</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{selected.long_tail_keywords.map((k, i) => <span key={i} className="badge" style={{ fontSize: '0.62rem' }}>{k}</span>)}</div>
              </div>
            )}

            {selected.scores && Object.keys(selected.scores).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Score Breakdown</div>
                {Object.entries(selected.scores).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.72rem', width: 120, flexShrink: 0 }}>{k.replace(/_/g, ' ')}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}><div style={{ width: `${Number(v)}%`, height: '100%', background: 'var(--accent-primary)' }} /></div>
                    <span style={{ fontSize: '0.7rem', width: 28, textAlign: 'right' }}>{Number(v)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="hairline" style={{ margin: '12px 0' }} />

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => toggleSave(selected)}>{savedIds.has(selected.title) ? 'Saved ✓' : 'Save'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => copyIdea(selected)}>Copy</button>
              <button className="btn btn-secondary btn-sm" onClick={() => sendToCalendar(selected)}>Send to Calendar</button>
            </div>

            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: 6 }}>Expand with AI</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {(['brief', 'carousel', 'blog', 'caption'] as ExpandType[]).map((t) => (
                <button key={t} className="btn btn-primary btn-sm" disabled={expanding} onClick={() => handleExpand(t)} style={{ textTransform: 'capitalize' }}>{expanding ? '...' : t}</button>
              ))}
            </div>

            {expandOut && (
              <div className="glass-card-static" style={{ padding: 14, marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', textTransform: 'capitalize' }}>{expandOut.type} output</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard.writeText(expandToText(expandOut.type, expandOut.data)).then(() => showToast('Copied')).catch(() => showToast('Could not copy', 'warn')); }}>Copy</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => sendExpandedToCalendar()}>Send to Calendar</button>
                  </div>
                </div>
                <div style={{ maxHeight: 420, overflow: 'auto' }}>
                  <ExpandOutput type={expandOut.type} data={expandOut.data} />
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
