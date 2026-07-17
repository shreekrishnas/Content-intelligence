import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError, cors } from './_lib/http.js';
import { getServiceClient } from './_lib/supabase.js';
import { supervise, topicToRecord } from './_lib/trends.js';
import type { DomainProfile, TrendSignal } from './_lib/types.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';

// Reactive queries: this week's news, for time-boxed newsjacking content.
function buildReactiveQueries(p: DomainProfile): string[] {
  const q: string[] = [];
  const loc = p.target_locations ? ` ${p.target_locations}` : '';
  const splitList = (s?: string) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  splitList(p.core_topics).slice(0, 3).forEach((t) => q.push(`${t}${loc} latest news this week`));
  if (p.industry) q.push(`${p.industry}${loc} news announcement this week`);
  if (p.competitors) splitList(p.competitors).slice(0, 2).forEach((c) => q.push(`${c} news announcement`));
  if (!q.length && p.business_name) q.push(`${p.business_name}${loc} news`);
  return [...new Set(q)].slice(0, 5);
}

// Strategic queries: durable, structural shifts — regulatory phase-ins,
// market/industry outlook reports, multi-phase initiatives — the kind of
// thing worth building a content pillar around for the quarter, not just
// this week's news cycle.
function buildStrategicQueries(p: DomainProfile): string[] {
  const q: string[] = [];
  const loc = p.target_locations ? ` ${p.target_locations}` : '';
  const splitList = (s?: string) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  if (p.industry) {
    q.push(`${p.industry}${loc} industry outlook 2026`);
    q.push(`${p.industry}${loc} market trends report 2026`);
  }
  splitList(p.core_topics).slice(0, 2).forEach((t) => q.push(`${t}${loc} regulatory changes 2026`));
  splitList(p.target_keywords).slice(0, 2).forEach((k) => q.push(`${k}${loc} annual forecast`));
  return [...new Set(q)].slice(0, 5);
}

async function runTavilySearch(query: string, opts: { topic: 'news' | 'general'; days: number; depth: 'basic' | 'advanced' }): Promise<any[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const resp = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, topic: opts.topic, search_depth: opts.depth, max_results: 5, days: opts.days }),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch {
    return [];
  }
}

async function collectTavilySignals(profile: DomainProfile): Promise<TrendSignal[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const reactiveQueries = buildReactiveQueries(profile);
  const strategicQueries = buildStrategicQueries(profile);

  const seen = new Set<string>();
  const signals: TrendSignal[] = [];

  function ingest(results: any[], horizon: 'reactive' | 'strategic') {
    for (const r of results) {
      const url: string = r.url || '';
      const dedupeKey = url || r.title;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      if (typeof r.score === 'number' && r.score < 0.35) continue;
      seen.add(dedupeKey);
      signals.push({
        title: r.title, content: r.content, url,
        source: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; } })(),
        published_at: r.published_date, score: r.score, horizon,
      });
    }
  }

  const [reactiveResults, strategicResults] = await Promise.all([
    Promise.all(reactiveQueries.map((q) => runTavilySearch(q, { topic: 'news', days: 14, depth: 'basic' }))),
    Promise.all(strategicQueries.map((q) => runTavilySearch(q, { topic: 'general', days: 180, depth: 'advanced' }))),
  ]);
  reactiveResults.forEach((results) => ingest(results, 'reactive'));
  strategicResults.forEach((results) => ingest(results, 'strategic'));

  return signals;
}

async function suggestCandidateSignals(profile: DomainProfile, accountLabel?: string): Promise<TrendSignal[]> {
  const today = new Date().toISOString().slice(0, 10);
  const month = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });

  const sys = `You are a trend scout. You ONLY propose topics where something concrete and verifiable is happening RIGHT NOW — not evergreen topics, not hypotheticals. Output ONLY raw JSON. Be selective: 6 sharp candidates beat 12 vague ones.`;

  const user = `Business: ${accountLabel || profile.business_name || 'General'}
Industry: ${profile.industry || 'unknown'}
Core topics: ${profile.core_topics || '(not specified)'}
Target keywords: ${profile.target_keywords || '(not specified)'}
Audience: ${profile.target_audience || '(not specified)'}
Locations: ${profile.target_locations || 'India'}
Today's date: ${today} (${month})

Propose exactly 6 candidate topics. Each MUST meet ALL of these criteria:
1. Something that is happening or being discussed THIS MONTH specifically — not an evergreen topic
2. Has a clear, specific event, announcement, regulatory change, market movement, or seasonal moment driving it
3. Has a credible connection to the brand's industry AND audience — not just the broad industry
4. Is narrow enough to write ONE concrete content piece about — not "digital payments growth"

For each, state: the specific trigger event (what happened), why it matters to this audience NOW, and one content angle.

Return ONLY: {"candidates":[{"topic":"Specific narrow topic","trigger":"The specific event or data point driving this right now","relevance":"Why this audience cares this month","content_angle":"One concrete content piece this brand could make"}]}`;

  const { content: raw } = await callLLM(sys, user, { maxTokens: 1500, temperature: 0.4 });
  const parsed: any = extractJSON(raw);
  const list = Array.isArray(parsed) ? parsed : (parsed.candidates || parsed.topics || []);
  return list.slice(0, 6).map((c: any) => ({
    topic: c.topic,
    summary: `Trigger: ${c.trigger || 'unknown'}. Relevance: ${c.relevance || ''}. Angle: ${c.content_angle || ''}`,
    source: 'ai-suggested',
    score: 0.5, // mark as medium-confidence for supervisor pre-filter
  }));
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

interface ScanBody {
  account_label?: string;
  account_id?: string;
  profile?: DomainProfile;
  mode?: 'live' | 'suggest';
}

async function handleManual(req: VercelRequest, res: VercelResponse) {
  cors(res);

  const body: ScanBody = req.body || {};
  const profile = body.profile || {};
  const mode = body.mode === 'suggest' ? 'suggest' : 'live';
  const { signals, source, note } = await collect(profile, body.account_label, mode);
  if (!signals.length) {
    return res.status(200).json({ success: true, topics: [], summary: null, source, note: note || 'No candidate signals were found for this profile. Add more core topics or keywords.', saved: false });
  }
  const { topics, summary, analysis_date } = await supervise({ domain_profile: profile, signals, account_label: body.account_label });

  let saved = false;
  let savedRecords: unknown[] = [];
  const accountId = body.account_id || (req.headers['x-account-id'] as string) || '';
  if (accountId) {
    try {
      const admin = getServiceClient();
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t: any) => {
        const c = t.classification;
        if (c === 'domain_trend') counts.domain++;
        else if (c === 'supertrend_exception') counts.superts++;
        else if (c === 'reject') counts.rej++;
        else counts.mon++;
      });
      const { data: scan } = await admin.from('trend_scans').insert({
        account_id: accountId, source,
        total_reviewed: topics.length,
        domain_sent: counts.domain, supertrends_sent: counts.superts,
        monitored: counts.mon, rejected: counts.rej,
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
  let admin;
  try { admin = getServiceClient(); } catch {
    return res.status(200).json({
      skipped: true,
      reason: 'Scheduled scan needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables. Manual scans still work without them.',
    });
  }
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
        account_id: acc.id, source: `cron:${source}`,
        total_reviewed: summary?.total_topics_reviewed ?? topics.length,
        domain_sent: counts.domain, supertrends_sent: counts.superts,
        monitored: counts.mon, rejected: counts.rej,
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
  if (handleOptions(req, res)) return;
  try {
    if (req.method === 'GET') return await handleCron(req, res);
    if (req.method === 'POST') return await handleManual(req, res);
    return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return sendError(res, 502, 'parse_error', message);
    return sendError(res, 500, 'internal_error', message);
  }
}
