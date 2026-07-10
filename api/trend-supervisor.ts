import type { VercelRequest, VercelResponse } from '@vercel/node';

// ---- Inline shared utilities (Vercel strips _shared/ from bundles) ----------

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You do NOT forward every topic — you classify, score, filter, prioritise, and route.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Deduplicate and cluster signals that describe the same underlying topic into ONE record.
- Score each topic on four independent 0-100 scales: domain_relevance, trend_impact, adaptability (for non-domain topics), and risk (higher = more dangerous).
- Classify each into exactly one of: domain_trend, supertrend_exception, monitor, reject.
- Assign priority (critical/high/medium/low/experimental), trend_stage (emerging/growing/peak/declining/seasonal/evergreen), estimated_lifespan, and a confidence_score (0-100).
- Write a clear, specific reason for every decision.

ROUTING RULES (defaults — respect any overrides in the profile thresholds):
- domain_trend: domain_relevance >= 60 AND trend_impact >= 40 AND risk <= 60.
- supertrend_exception: domain_relevance < 60 AND trend_impact >= 90 AND adaptability >= 65 AND risk <= 40. Only when the brand connection is natural — never just because it is popular. Include a suggested_connection.
- monitor: relevant-but-weak, emerging, or incomplete evidence.
- reject: low impact AND low relevance, or too risky/outdated/forced/duplicate.

GUARDRAILS: never invent trend data, never treat popularity as relevance, never force a brand connection, never exceed the max_recommendations, prefer a few high-quality trends over many weak ones. If a topic touches politics, health, finance, law, tragedy, or controversy, raise its risk and set needs_human_review = true.`;

interface DomainProfile {
  business_name?: string;
  industry?: string;
  max_recommendations?: number;
  core_topics?: string;
  target_keywords?: string;
  target_locations?: string;
  target_audience?: string;
  content_categories?: string;
  brand_tone?: string;
  restricted_topics?: string;
  competitors?: string;
  allowed_formats?: string;
  risk_tolerance?: string;
}

interface TrendSignal {
  topic?: string;
  title?: string;
  summary?: string;
  source?: string;
  url?: string;
  published_at?: string;
  content?: string;
}

function extractJSON(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json|javascript|js)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* try bounds */ }
  const candidates: Array<[number, number]> = [];
  const ob = stripped.indexOf('{'); const cb = stripped.lastIndexOf('}');
  if (ob !== -1 && cb > ob) candidates.push([ob, cb]);
  const oa = stripped.indexOf('['); const ca = stripped.lastIndexOf(']');
  if (oa !== -1 && ca > oa) candidates.push([oa, ca]);
  for (const [s, e] of candidates) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* next */ }
  }
  throw new Error('The model returned a response that could not be parsed as JSON. Please try again.');
}

async function callLLM(systemPrompt: string, userPrompt: string, options: { maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');

  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  const maxTokens = options.maxTokens ?? 8000;
  const temperature = options.temperature ?? 0.3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.SITE_URL ?? 'https://content-intelligence-ebon.vercel.app',
          'X-Title': 'Content Intelligence Platform',
        },
        body: JSON.stringify({
          model, max_tokens: maxTokens, temperature,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        }),
      });

      if (response.status === 429) { lastError = new Error('Rate limit reached. Please wait a moment and try again.'); continue; }
      if (!response.ok) {
        let msg: string;
        try {
          const b = await response.json();
          const detail = b?.error?.message || 'Unknown error';
          if (response.status === 401) msg = 'Invalid API key. Check your OPENROUTER_API_KEY in Vercel Environment Variables.';
          else if (response.status === 402) msg = 'OpenRouter account has insufficient credits. Add credits at openrouter.ai.';
          else if (response.status === 404) msg = `Model not found on OpenRouter. Set a valid LLM_MODEL. Detail: ${detail}`;
          else msg = `LLM service error (${response.status}): ${detail}`;
        } catch { msg = `LLM service error (${response.status}). Please try again.`; }
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
    ['Business', p.business_name], ['Core topics', p.core_topics], ['Target keywords', p.target_keywords],
    ['Locations', p.target_locations], ['Audience', p.target_audience], ['Content categories', p.content_categories],
    ['Brand tone', p.brand_tone], ['Restricted topics', p.restricted_topics], ['Competitors', p.competitors],
    ['Allowed formats', p.allowed_formats], ['Risk tolerance', p.risk_tolerance],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (no domain profile provided — infer conservatively and lean toward monitor/reject)';
}

function signalsBlock(signals: TrendSignal[] = []): string {
  if (!signals.length) return '(no signals provided)';
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

function buildSupervisorPrompt(body: { domain_profile?: DomainProfile; signals?: TrendSignal[]; account_label?: string }): string {
  const max = body.domain_profile?.max_recommendations ?? 8;
  return `TODAY: ${new Date().toISOString().slice(0, 10)}
ACCOUNT: ${body.account_label || body.domain_profile?.business_name || 'General'}

DOMAIN PROFILE:
${profileBlock(body.domain_profile)}

RAW TREND SIGNALS (cluster duplicates before scoring):
${signalsBlock(body.signals)}

Supervise these signals. Deduplicate into distinct topics, score and classify each, and route. Send at most ${max} topics to action (domain_trend + supertrend_exception combined) — prefer quality over quantity.

Return ONLY this JSON:
{
  "analysis_date": "YYYY-MM-DD",
  "summary": { "total_topics_reviewed": 0, "domain_trends_sent": 0, "supertrends_sent": 0, "topics_monitored": 0, "topics_rejected": 0 },
  "topics": [
    {
      "topic": "The clustered topic name",
      "summary": "1-2 sentence description of the trend",
      "classification": "domain_trend | supertrend_exception | monitor | reject",
      "domain_relevance_score": 0,
      "trend_impact_score": 0,
      "adaptability_score": 0,
      "risk_score": 0,
      "confidence_score": 0,
      "priority": "critical | high | medium | low | experimental",
      "trend_stage": "emerging | growing | peak | declining | seasonal | evergreen",
      "estimated_lifespan": "e.g. '2-3 weeks'",
      "recommended_route": "domain_action_layer | supertrend_action_layer | monitor | reject",
      "recommended_formats": ["format1", "format2"],
      "suggested_connection": "For supertrends only: the natural, non-forced brand connection (empty otherwise)",
      "related_keywords": ["kw1", "kw2"],
      "needs_human_review": false,
      "reason": "Specific explanation for this decision"
    }
  ]
}`;
}

async function supervise(body: { domain_profile?: DomainProfile; signals?: TrendSignal[]; account_label?: string }): Promise<{ topics: any[]; summary: any; analysis_date?: string }> {
  const raw = await callLLM(SUPERVISOR_SYSTEM_PROMPT, buildSupervisorPrompt(body), { maxTokens: 8000, temperature: 0.3 });
  const parsed: any = extractJSON(raw);
  const topics = Array.isArray(parsed) ? parsed : (parsed.topics || []);
  return { topics, summary: parsed?.summary ?? null, analysis_date: parsed?.analysis_date };
}

// ---- Handler ----------------------------------------------------------------

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
