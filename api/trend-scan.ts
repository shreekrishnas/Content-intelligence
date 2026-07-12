import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---- Inlined trend-core (was ../lib/trend-core, inlined defensively) ----

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const TAVILY_API_URL = 'https://api.tavily.com/search';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You do NOT forward every topic — you classify, score, filter, prioritise, and route.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Deduplicate and cluster signals that describe the same underlying topic into ONE record.
- Score each topic on four independent 0-100 scales: domain_relevance, trend_impact, adaptability, and risk.
- Classify each into exactly one of: domain_trend, supertrend_exception, monitor, reject.
- Assign priority, trend_stage, estimated_lifespan, and a confidence_score (0-100).
- Write a clear, specific reason for every decision.

ROUTING RULES:
- domain_trend: domain_relevance >= 60 AND trend_impact >= 40 AND risk <= 60.
- supertrend_exception: domain_relevance < 60 AND trend_impact >= 90 AND adaptability >= 65 AND risk <= 40. Only with a natural brand connection.
- monitor: relevant-but-weak, emerging, or incomplete evidence.
- reject: low impact AND low relevance, or too risky/outdated/forced/duplicate.

GUARDRAILS: never invent trend data, never treat popularity as relevance, never force a brand connection, never exceed max_recommendations. If a topic touches politics, health, finance, law, tragedy, or controversy, raise its risk and set needs_human_review = true.`;

interface DomainProfile {
  business_name?: string; industry?: string; products?: string; services?: string;
  core_topics?: string; target_keywords?: string; target_locations?: string;
  target_audience?: string; business_goals?: string; content_categories?: string;
  brand_tone?: string; restricted_topics?: string; competitors?: string;
  allowed_formats?: string; max_recommendations?: number; risk_tolerance?: string;
  enabled?: boolean;
}
interface TrendSignal {
  topic?: string; title?: string; summary?: string; source?: string;
  url?: string; published_at?: string; content?: string; score?: number;
}

function extractJSON(text: string): unknown {
  const stripped = text.replace(/^```(?:json|javascript|js)?\s*\n?/gim, '').replace(/\n?```\s*$/gim, '').trim();
  try { return JSON.parse(stripped); } catch { /* try bounds */ }
  const candidates: Array<[number, number]> = [];
  const ob = stripped.indexOf('{'); const cb = stripped.lastIndexOf('}');
  if (ob !== -1 && cb > ob) candidates.push([ob, cb]);
  const oa = stripped.indexOf('['); const ca = stripped.lastIndexOf(']');
  if (oa !== -1 && ca > oa) candidates.push([oa, ca]);
  for (const [s, e] of candidates) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* next */ }
  }
  throw new Error('The model returned a response that could not be parsed as JSON.');
}

async function callLLM(sys: string, user: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured.');
  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
          'X-Title': 'Content Intelligence Platform',
        },
        body: JSON.stringify({
          model, max_tokens: opts.maxTokens ?? 8000, temperature: opts.temperature ?? 0.3,
          messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        }),
      });
      if (response.status === 429) { lastError = new Error('Rate limit reached.'); continue; }
      if (!response.ok) {
        let msg: string;
        try { const b = await response.json(); msg = b?.error?.message || `LLM service error (${response.status})`; }
        catch { msg = `LLM service error (${response.status})`; }
        throw new Error(msg);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in LLM response');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limit')) { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError ?? new Error('Failed to call LLM after retries');
}

function profileBlock(p: DomainProfile = {}): string {
  const rows: Array<[string, unknown]> = [
    ['Business', p.business_name], ['Industry', p.industry], ['Core topics', p.core_topics],
    ['Target keywords', p.target_keywords], ['Locations', p.target_locations],
    ['Audience', p.target_audience], ['Brand tone', p.brand_tone],
    ['Restricted topics', p.restricted_topics], ['Competitors', p.competitors],
    ['Allowed formats', p.allowed_formats], ['Risk tolerance', p.risk_tolerance],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (no domain profile — lean toward monitor/reject)';
}
function signalsBlock(signals: TrendSignal[] = []): string {
  if (!signals.length) return '(no signals)';
  return signals.slice(0, 60).map((s, i) => {
    const parts = [
      `[${i + 1}] ${s.topic || s.title || 'Untitled'}`,
      s.source ? `source: ${s.source}` : '',
      s.published_at ? `date: ${s.published_at}` : '',
      s.summary || s.content ? `note: ${String(s.summary || s.content).slice(0, 300)}` : '',
      s.url ? `url: ${s.url}` : '',
    ].filter(Boolean);
    return parts.join('\n   ');
  }).join('\n');
}

async function supervise(body: { domain_profile?: DomainProfile; signals?: TrendSignal[]; account_label?: string }) {
  const max = body.domain_profile?.max_recommendations ?? 8;
  const prompt = `TODAY: ${new Date().toISOString().slice(0, 10)}
ACCOUNT: ${body.account_label || body.domain_profile?.business_name || 'General'}

DOMAIN PROFILE:
${profileBlock(body.domain_profile)}

RAW TREND SIGNALS (cluster duplicates before scoring):
${signalsBlock(body.signals)}

Supervise. Deduplicate, score, classify, route. Send at most ${max} topics to action.

Return ONLY this JSON:
{"analysis_date":"YYYY-MM-DD","summary":{"total_topics_reviewed":0,"domain_trends_sent":0,"supertrends_sent":0,"topics_monitored":0,"topics_rejected":0},"topics":[{"topic":"","summary":"","classification":"domain_trend|supertrend_exception|monitor|reject","domain_relevance_score":0,"trend_impact_score":0,"adaptability_score":0,"risk_score":0,"confidence_score":0,"priority":"","trend_stage":"","estimated_lifespan":"","recommended_route":"","recommended_formats":[],"suggested_connection":"","related_keywords":[],"needs_human_review":false,"reason":""}]}`;
  const raw = await callLLM(SUPERVISOR_SYSTEM_PROMPT, prompt, { maxTokens: 8000, temperature: 0.3 });
  const parsed: any = extractJSON(raw);
  const topics = Array.isArray(parsed) ? parsed : (parsed.topics || []);
  return { topics, summary: parsed?.summary ?? null, analysis_date: parsed?.analysis_date };
}

function buildQueries(p: DomainProfile): string[] {
  const q: string[] = [];
  const loc = p.target_locations ? ` ${p.target_locations}` : '';
  const splitList = (s?: string) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  splitList(p.core_topics).slice(0, 4).forEach((t) => q.push(`${t}${loc} latest news trends`));
  splitList(p.target_keywords).slice(0, 3).forEach((k) => q.push(`${k}${loc} 2026 trend`));
  if (p.industry) q.push(`${p.industry}${loc} industry trends this week`);
  if (p.competitors) splitList(p.competitors).slice(0, 2).forEach((c) => q.push(`${c} news announcement`));
  if (!q.length && p.business_name) q.push(`${p.business_name}${loc} news`);
  return [...new Set(q)].slice(0, 6);
}

async function collectTavilySignals(profile: DomainProfile): Promise<TrendSignal[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const queries = buildQueries(profile);
  const seen = new Set<string>();
  const signals: TrendSignal[] = [];
  await Promise.all(queries.map(async (query) => {
    try {
      const resp = await fetch(TAVILY_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: key, query, topic: 'news', search_depth: 'basic', max_results: 5, days: 14 }),
      });
      if (!resp.ok) return;
      const data = await resp.json();
      for (const r of (data.results || [])) {
        const url: string = r.url || '';
        const dedupeKey = url || r.title;
        if (!dedupeKey || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        signals.push({
          title: r.title, content: r.content, url,
          source: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; } })(),
          published_at: r.published_date, score: r.score,
        });
      }
    } catch { /* skip failed query */ }
  }));
  return signals;
}

async function suggestCandidateSignals(profile: DomainProfile, accountLabel?: string): Promise<TrendSignal[]> {
  const sys = `You propose candidate topics for a trend supervisor to investigate. These are HYPOTHESES, not confirmed trends. Output ONLY raw JSON.`;
  const user = `Business: ${accountLabel || profile.business_name || 'General'}
Industry: ${profile.industry || 'unknown'}
Core topics: ${profile.core_topics || ''}
Target keywords: ${profile.target_keywords || ''}
Audience: ${profile.target_audience || ''}
Locations: ${profile.target_locations || ''}

Propose 12 candidate topics that MIGHT be trending or timely for this business right now (${new Date().toISOString().slice(0, 10)}). Mix on-domain topics with 2-3 broader cultural/seasonal "supertrend" candidates.
Return ONLY: {"candidates":[{"topic":"","summary":"why it might matter now"}]}`;
  const raw = await callLLM(sys, user, { maxTokens: 2000, temperature: 0.8 });
  const parsed: any = extractJSON(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed.candidates || parsed.topics || []);
  return list.map((c: any) => ({ topic: c.topic, summary: c.summary, source: 'ai-suggested' }));
}

function topicToRecord(t: any): Record<string, unknown> {
  const classification = String(t.classification || 'monitor');
  const status = classification === 'domain_trend' || classification === 'supertrend_exception'
    ? 'accepted' : classification === 'reject' ? 'rejected' : 'monitoring';
  const num = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  return {
    topic: String(t.topic || 'Untitled'),
    summary: String(t.summary || ''),
    classification,
    domain_relevance_score: num(t.domain_relevance_score),
    trend_impact_score: num(t.trend_impact_score),
    adaptability_score: num(t.adaptability_score),
    risk_score: num(t.risk_score),
    confidence_score: num(t.confidence_score),
    priority: String(t.priority || 'low'),
    trend_stage: String(t.trend_stage || 'emerging'),
    estimated_lifespan: String(t.estimated_lifespan || ''),
    recommended_route: String(t.recommended_route || 'monitor'),
    reason: String(t.reason || ''),
    suggested_connection: String(t.suggested_connection || ''),
    recommended_formats: Array.isArray(t.recommended_formats) ? t.recommended_formats : [],
    related_keywords: Array.isArray(t.related_keywords) ? t.related_keywords : [],
    status,
  };
}

// ---- Handler ----

interface ScanBody {
  account_label?: string;
  account_id?: string;
  profile?: DomainProfile;
  mode?: 'live' | 'suggest';
}

async function collect(profile: DomainProfile, accountLabel: string | undefined, mode: 'live' | 'suggest'): Promise<{ signals: TrendSignal[]; source: string; note?: string }> {
  if (mode === 'suggest') {
    const signals = await suggestCandidateSignals(profile, accountLabel);
    return { signals, source: 'suggest' };
  }
  const live = await collectTavilySignals(profile);
  if (live.length) return { signals: live, source: 'tavily' };
  const signals = await suggestCandidateSignals(profile, accountLabel);
  return { signals, source: 'suggest', note: 'No live results (TAVILY_API_KEY not set or no matches) — used AI-suggested candidate topics instead.' };
}

async function handleManual(req: VercelRequest, res: VercelResponse) {
  const body: ScanBody = req.body || {};
  const profile = body.profile || {};
  const mode = body.mode === 'suggest' ? 'suggest' : 'live';
  const { signals, source, note } = await collect(profile, body.account_label, mode);
  if (!signals.length) {
    return res.status(200).json({ success: true, topics: [], summary: null, source, note: note || 'No candidate signals were found for this profile. Add more core topics or keywords.', saved: false });
  }
  const { topics, summary, analysis_date } = await supervise({ domain_profile: profile, signals, account_label: body.account_label });

  // Save server-side via service role (bypasses RLS) when account_id provided.
  let saved = false;
  let savedRecords: unknown[] = [];
  const accountId = body.account_id;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (accountId && url && serviceKey) {
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const admin = createClient(url, serviceKey);
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t: any) => {
        const c = t.classification;
        if (c === 'domain_trend') counts.domain++;
        else if (c === 'supertrend_exception') counts.superts++;
        else if (c === 'reject') counts.rej++;
        else counts.mon++;
      });
      const { data: scan } = await admin.from('trend_scans').insert({
        account_id: accountId,
        source,
        total_reviewed: topics.length,
        domain_sent: counts.domain,
        supertrends_sent: counts.superts,
        monitored: counts.mon,
        rejected: counts.rej,
      }).select('id').single();
      const rows = topics.map((t: any) => ({ ...topicToRecord(t), account_id: accountId, scan_id: (scan as any)?.id ?? null }));
      if (rows.length) {
        const { data: inserted } = await admin.from('trend_records').insert(rows).select();
        savedRecords = inserted || [];
      }
      saved = true;
    } catch { /* best-effort — client can retry save */ }
  }

  return res.status(200).json({ success: true, topics, summary, analysis_date, source, signals_reviewed: signals.length, note, saved, saved_records: savedRecords });
}

async function handleCron(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(200).json({
      skipped: true,
      reason: 'Scheduled scan needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables. Manual scans still work without them.',
    });
  }
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(url, serviceKey);
  const { data: accounts, error } = await admin.from('accounts').select('id, name, profile');
  if (error) return res.status(500).json({ error: error.message });

  const enabled = (accounts || []).filter((a: any) => a?.profile?.trend_profile?.enabled === true).slice(0, 10);
  const results: Array<{ account: string; inserted: number; source: string }> = [];

  for (const acc of enabled) {
    try {
      const tp = (acc.profile?.trend_profile || {}) as DomainProfile;
      const profile: DomainProfile = { ...tp, business_name: tp.business_name || acc.name };
      const { signals, source } = await collect(profile, acc.name, 'live');
      if (!signals.length) { results.push({ account: acc.name, inserted: 0, source }); continue; }
      const { topics, summary } = await supervise({ domain_profile: profile, signals, account_label: acc.name });
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t: any) => {
        const c = t.classification;
        if (c === 'domain_trend') counts.domain++;
        else if (c === 'supertrend_exception') counts.superts++;
        else if (c === 'reject') counts.rej++;
        else counts.mon++;
      });
      const { data: scan } = await admin.from('trend_scans').insert({
        account_id: acc.id,
        source: `cron:${source}`,
        total_reviewed: summary?.total_topics_reviewed ?? topics.length,
        domain_sent: counts.domain,
        supertrends_sent: counts.superts,
        monitored: counts.mon,
        rejected: counts.rej,
      }).select('id').single();
      const rows = topics.map((t: any) => ({ ...topicToRecord(t), account_id: acc.id, scan_id: (scan as any)?.id ?? null }));
      if (rows.length) await admin.from('trend_records').insert(rows);
      results.push({ account: acc.name, inserted: rows.length, source });
    } catch (e) {
      results.push({ account: acc.name, inserted: 0, source: `error: ${e instanceof Error ? e.message : 'failed'}` });
    }
  }
  return res.status(200).json({ success: true, scanned_accounts: enabled.length, results });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') return await handleCron(req, res);
    if (req.method === 'POST') return await handleManual(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return res.status(502).json({ error: message });
    return res.status(500).json({ error: message });
  }
}
