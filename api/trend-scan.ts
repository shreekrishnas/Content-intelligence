import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError, cors } from './_lib/http.js';
import { getServiceClient } from './_lib/supabase.js';
import { supervise, topicToRecord } from './_lib/trends.js';
import { buildViralQueries, classifySensitivity, bridgeSignals } from './_lib/bridge.js';
import type { DomainProfile, TrendSignal } from './_lib/types.js';

const TAVILY_API_URL = 'https://api.tavily.com/search';

// Curated default news sources for India-focused accounts. Reactive niche
// queries are scoped to these outlets so scans return real journalism —
// not SEO blogspam or a random Medium post. Accounts can override via
// domain_profile.preferred_news_domains.
const DEFAULT_NEWS_DOMAINS = [
  // General national
  'ndtv.com', 'indianexpress.com', 'thehindu.com', 'hindustantimes.com',
  'timesofindia.indiatimes.com', 'news18.com', 'thewire.in', 'theprint.in',
  // Business / markets
  'moneycontrol.com', 'livemint.com', 'business-standard.com',
  'economictimes.indiatimes.com', 'financialexpress.com', 'bloombergquint.com',
  'businesstoday.in', 'cnbctv18.com', 'thehindubusinessline.com',
  // Tech / startups
  'yourstory.com', 'inc42.com', 'entrackr.com',
];

function parseDomainList(raw?: string): string[] {
  return (raw || '')
    .split(/[,\n\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, ''))
    .filter(Boolean);
}

function newsDomainsFor(p: DomainProfile): string[] {
  const custom = parseDomainList(p.preferred_news_domains);
  return custom.length ? custom : DEFAULT_NEWS_DOMAINS;
}

// Reactive queries: this week's news, for time-boxed newsjacking content.
// Prefers niche_pillars (explicit content pillars) over core_topics if both present.
function buildReactiveQueries(p: DomainProfile): string[] {
  const q: string[] = [];
  const loc = p.target_locations ? ` ${p.target_locations}` : '';
  const splitList = (s?: string) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
  // niche_pillars take priority — they're more specific than core_topics
  const pillars = splitList(p.niche_pillars || p.core_topics);
  pillars.slice(0, 4).forEach((t) => q.push(`${t}${loc} latest news this week`));
  if (p.industry) q.push(`${p.industry}${loc} news announcement this week`);
  if (p.competitors) splitList(p.competitors).slice(0, 2).forEach((c) => q.push(`${c} news announcement`));
  // Add compliance-domain signals if set (regulatory body news is authority-tier signal)
  if (p.compliance_domain) q.push(`${p.compliance_domain} announcement regulation this week`);
  if (!q.length && p.business_name) q.push(`${p.business_name}${loc} news`);
  return [...new Set(q)].slice(0, 6);
}

async function runTavilySearch(
  query: string,
  opts: { topic: 'news' | 'general'; days: number; depth: 'basic' | 'advanced'; include_domains?: string[] },
): Promise<any[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  try {
    const body: Record<string, unknown> = {
      api_key: key, query, topic: opts.topic,
      search_depth: opts.depth, max_results: 5, days: opts.days,
    };
    if (opts.include_domains?.length) body.include_domains = opts.include_domains;
    const resp = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    return data.results || [];
  } catch {
    return [];
  }
}

interface CollectStats {
  queries_built: number;
  strict_hits: number;
  wide_hits: number;
  broad_hits: number;
  viral_hits: number;
  bridged_hits: number;
  profile_empty: boolean;
}

async function collectTavilySignals(profile: DomainProfile, accountLabel?: string, stats?: CollectStats): Promise<TrendSignal[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];

  const reactiveQueries = buildReactiveQueries(profile);
  const viralQueries = buildViralQueries(profile);
  if (stats) {
    stats.queries_built = reactiveQueries.length;
    stats.profile_empty = !profile.industry && !profile.core_topics && !profile.target_keywords && !profile.business_name;
  }

  const seen = new Set<string>();
  const nicheSignals: TrendSignal[] = [];
  const viralRaw: TrendSignal[] = [];

  // scoreFloor: 0.35 for the strict first pass, 0 (accept all) for
  // rescue fallbacks — a low-score real article is still better than an
  // AI hallucination. The supervisor re-scores everything anyway.
  function ingest(bucket: TrendSignal[], results: any[], horizon: 'reactive' | 'strategic', signalType: 'niche' | 'viral_bridged', scoreFloor = 0.35) {
    for (const r of results) {
      const url: string = r.url || '';
      const dedupeKey = url || r.title;
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      if (typeof r.score === 'number' && r.score < scoreFloor) continue;
      seen.add(dedupeKey);
      bucket.push({
        title: r.title, content: r.content, url,
        source: (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'web'; } })(),
        published_at: r.published_date, score: r.score, horizon,
        signal_type: signalType,
      });
    }
  }

  const newsDomains = newsDomainsFor(profile);

  // Reactive niche runs first-pass locked to trusted news outlets. If a
  // query returns nothing under that lock — because Moneycontrol / NDTV /
  // etc. simply didn't cover that specific niche in the last 14 days —
  // we retry the same query WITHOUT include_domains and widen the window
  // to 30 days rather than fall back to AI-hypothesised topics.
  async function reactiveWithFallback(q: string): Promise<{ results: any[]; strict: boolean }> {
    const scoped = await runTavilySearch(q, { topic: 'news', days: 14, depth: 'basic', include_domains: newsDomains });
    if (scoped.length) return { results: scoped, strict: true };
    const wide = await runTavilySearch(q, { topic: 'news', days: 30, depth: 'basic' });
    return { results: wide, strict: false };
  }

  const [reactivePairs, viralResults] = await Promise.all([
    Promise.all(reactiveQueries.map(reactiveWithFallback)),
    // Viral queries stay unrestricted — pop-culture buzz doesn't originate
    // on business-news sites, so scoping would kill the trend-jack signal.
    Promise.all(viralQueries.map((q) => runTavilySearch(q, { topic: 'news', days: 7, depth: 'basic' }))),
  ]);
  const beforeNiche = nicheSignals.length;
  reactivePairs.forEach(({ results, strict }) => {
    ingest(nicheSignals, results, 'reactive', 'niche', strict ? 0.35 : 0);
    if (stats) {
      if (strict) stats.strict_hits += results.length;
      else stats.wide_hits += results.length;
    }
  });
  viralResults.forEach((results) => {
    ingest(viralRaw, results, 'reactive', 'viral_bridged');
    if (stats) stats.viral_hits += results.length;
  });
  void beforeNiche;

  // Last-resort broad safety net: if nothing survived the reactive pass,
  // fan out on the plainest possible queries so Tavily returns SOMETHING
  // real for the supervisor to score. Better a supervisor-rejected pile
  // of real news than an AI-hallucinated pile of fake trends.
  if (!nicheSignals.length) {
    const splitList = (s?: string) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
    const loc = profile.target_locations ? ` ${profile.target_locations}` : '';
    const broadQueries = [
      ...(profile.industry ? [`${profile.industry}${loc} news`, profile.industry] : []),
      ...splitList(profile.core_topics).slice(0, 2).map((t) => `${t}${loc} news`),
      ...(profile.business_name ? [`${profile.business_name}${loc}`] : []),
      ...(profile.target_keywords ? splitList(profile.target_keywords).slice(0, 2).map((k) => `${k}${loc}`) : []),
    ].filter(Boolean).slice(0, 4);
    if (broadQueries.length) {
      const broadResults = await Promise.all(
        broadQueries.map((q) => runTavilySearch(q, { topic: 'news', days: 30, depth: 'basic' })),
      );
      // Score floor 0 — accept anything real that came back.
      broadResults.forEach((results) => {
        ingest(nicheSignals, results, 'reactive', 'niche', 0);
        if (stats) stats.broad_hits += results.length;
      });
    }
  }

  // Bridge layer: filter viral signals through safety, then attempt to
  // creatively connect them to the brand. Anything the LLM can't bridge
  // naturally is dropped — no forced trend-jacks.
  let bridged: TrendSignal[] = [];
  if (viralRaw.length) {
    const verdicts = await classifySensitivity(viralRaw);
    const survivors = viralRaw.filter((_, i) => verdicts[i] !== 'block').slice(0, 12);
    if (survivors.length) bridged = await bridgeSignals(survivors, profile, accountLabel);
  }
  if (stats) stats.bridged_hits = bridged.length;

  return [...nicheSignals, ...bridged];
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

async function collect(profile: DomainProfile, accountLabel: string | undefined, mode: 'live' | 'suggest'): Promise<{ signals: TrendSignal[]; source: string; note?: string; stats?: CollectStats }> {
  if (mode === 'suggest') {
    const signals = await suggestCandidateSignals(profile, accountLabel);
    return { signals, source: 'suggest' };
  }
  const stats: CollectStats = {
    queries_built: 0, strict_hits: 0, wide_hits: 0, broad_hits: 0,
    viral_hits: 0, bridged_hits: 0, profile_empty: false,
  };
  const live = await collectTavilySignals(profile, accountLabel, stats);
  if (live.length) return { signals: live, source: 'tavily', stats };
  const signals = await suggestCandidateSignals(profile, accountLabel);

  let note: string;
  if (!process.env.TAVILY_API_KEY) {
    note = 'TAVILY_API_KEY is not set on the server — add it to Vercel → Environment Variables to enable live news scans. Falling back to AI-suggested candidate topics for now.';
  } else if (stats.profile_empty) {
    note = 'Domain profile is empty — no industry, core_topics, target_keywords, or business_name to build queries from. Open Domain Profile and fill at least one of these fields, then re-scan.';
  } else if (stats.queries_built === 0) {
    note = 'No usable queries could be built from the Domain Profile. Ensure core_topics or industry has real values (not just punctuation). Using AI-suggested candidates for now.';
  } else {
    note = `Live scan tried ${stats.queries_built} reactive queries in 3 tiers — strict (preferred outlets, 14d) hit ${stats.strict_hits}, wide (open web, 30d) hit ${stats.wide_hits}, broad safety-net hit ${stats.broad_hits}, viral hit ${stats.viral_hits} (bridged ${stats.bridged_hits}). Tavily returned zero real signals. Try: (a) clear Preferred News Domains, (b) broaden core_topics/target_keywords, or (c) verify TAVILY_API_KEY is a valid non-expired key. Using AI-suggested candidates for now.`;
  }
  return { signals, source: 'suggest', note, stats };
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
  const accountId = body.account_id || (req.headers['x-account-id'] as string) || '';
  const { signals, source, note, stats } = await collect(profile, body.account_label, mode);
  if (!signals.length) {
    return res.status(200).json({ success: true, topics: [], summary: null, source, note: note || 'No candidate signals were found for this profile. Add more core topics or keywords.', saved: false, stats });
  }
  // Dedup: fetch recent topic headlines (last 30 days) so the supervisor
  // avoids reusing phrasing the account has already seen this month.
  let recentTopics: string[] = [];
  if (accountId) {
    try {
      const admin = getServiceClient();
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin
        .from('trend_records')
        .select('topic')
        .eq('account_id', accountId)
        .gte('created_at', cutoff)
        .limit(50);
      recentTopics = (recent || []).map((r: any) => String(r.topic || '')).filter(Boolean);
    } catch {
      // Non-fatal — supervisor proceeds without dedup context
    }
  }

  const { topics, summary, analysis_date } = await supervise({ domain_profile: profile, signals, account_label: body.account_label, recent_topics: recentTopics });

  let saved = false;
  let saveError: string | undefined;
  let savedRecords: unknown[] = [];
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
      const { data: scan, error: scanErr } = await admin.from('trend_scans').insert({
        account_id: accountId, source,
        total_reviewed: topics.length,
        domain_sent: counts.domain, supertrends_sent: counts.superts,
        monitored: counts.mon, rejected: counts.rej,
      }).select('id').single();
      if (scanErr) throw new Error(`trend_scans insert: ${scanErr.message}`);
      const rows = topics.map((t: any) => ({ ...topicToRecord(t), account_id: accountId, scan_id: (scan as any)?.id ?? null }));
      // Prune every previous trend_record for this account before inserting
      // the new batch. The user wants a clean feed on every refresh — no
      // history at all. trend_scans rows are kept for audit/counting.
      const { error: delErr } = await admin.from('trend_records').delete().eq('account_id', accountId);
      if (delErr) throw new Error(`trend_records delete: ${delErr.message}`);
      if (rows.length) {
        // supabase-js does NOT throw on failure — it returns { error }.
        // Ignoring it is exactly how a schema drift (missing column) once
        // made every scan report "saved" while persisting zero records.
        const { data: inserted, error: insErr } = await admin.from('trend_records').insert(rows).select();
        if (insErr) throw new Error(`trend_records insert: ${insErr.message}`);
        savedRecords = inserted || [];
      }
      saved = true;
    } catch (e) {
      saveError = e instanceof Error ? e.message : 'save failed';
      console.error('[trend-scan] persist failed:', saveError);
    }
  }

  return res.status(200).json({ success: true, topics, summary, analysis_date, source, signals_reviewed: signals.length, note, saved, save_error: saveError, saved_records: savedRecords, stats });
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
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentRecs } = await admin.from('trend_records').select('topic').eq('account_id', acc.id).gte('created_at', cutoff).limit(50);
      const recentTopics = (recentRecs || []).map((r: any) => String(r.topic || '')).filter(Boolean);
      const { topics, summary } = await supervise({ domain_profile: profile, signals, account_label: acc.name, recent_topics: recentTopics });
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t: any) => {
        const c = t.classification;
        if (c === 'domain_trend') counts.domain++;
        else if (c === 'supertrend_exception') counts.superts++;
        else if (c === 'reject') counts.rej++;
        else counts.mon++;
      });
      const { data: scan, error: scanErr } = await admin.from('trend_scans').insert({
        account_id: acc.id, source: `cron:${source}`,
        total_reviewed: summary?.total_topics_reviewed ?? topics.length,
        domain_sent: counts.domain, supertrends_sent: counts.superts,
        monitored: counts.mon, rejected: counts.rej,
      }).select('id').single();
      if (scanErr) throw new Error(`trend_scans insert: ${scanErr.message}`);
      const rows = topics.map((t: any) => ({ ...topicToRecord(t), account_id: acc.id, scan_id: (scan as any)?.id ?? null }));
      // Same prune as the manual path — every daily cron scan replaces
      // this account's previous trend_records wholesale.
      const { error: delErr } = await admin.from('trend_records').delete().eq('account_id', acc.id);
      if (delErr) throw new Error(`trend_records delete: ${delErr.message}`);
      if (rows.length) {
        const { error: insErr } = await admin.from('trend_records').insert(rows);
        if (insErr) throw new Error(`trend_records insert: ${insErr.message}`);
      }
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
