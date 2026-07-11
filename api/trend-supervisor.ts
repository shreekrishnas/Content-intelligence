import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---- Inlined trend-core (was ../lib/trend-core, inlined defensively) ----

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You do NOT forward every topic — you classify, score, filter, prioritise, and route.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Deduplicate and cluster signals that describe the same underlying topic into ONE record.
- Score each topic on four independent 0-100 scales: domain_relevance, trend_impact, adaptability, and risk (higher = more dangerous).
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
}
interface TrendSignal {
  topic?: string; title?: string; summary?: string; source?: string;
  url?: string; published_at?: string; content?: string;
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
        try {
          const b = await response.json();
          msg = b?.error?.message || `LLM service error (${response.status})`;
        } catch { msg = `LLM service error (${response.status})`; }
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

// ---- Handler ----

interface SupervisorRequest {
  domain_profile?: DomainProfile;
  signals?: TrendSignal[];
  account_label?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: SupervisorRequest = req.body || {};
    if (!body.signals?.length) {
      return res.status(400).json({ error: 'No trend signals provided. Add candidate topics or run a live scan first.' });
    }
    const { topics, summary, analysis_date } = await supervise(body);
    return res.status(200).json({ success: true, topics, summary, analysis_date });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return res.status(502).json({ error: message });
    return res.status(500).json({ error: message });
  }
}
