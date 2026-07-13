import { callLLM } from './llm';
import { extractJSON } from './json';
import type { DomainProfile, TrendSignal } from './types';

export const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You do NOT forward every topic — you classify, score, filter, prioritise, and route.

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

export function profileBlock(p: DomainProfile = {}): string {
  const rows: Array<[string, unknown]> = [
    ['Business', p.business_name], ['Industry', p.industry], ['Core topics', p.core_topics],
    ['Target keywords', p.target_keywords], ['Locations', p.target_locations],
    ['Audience', p.target_audience], ['Brand tone', p.brand_tone],
    ['Restricted topics', p.restricted_topics], ['Competitors', p.competitors],
    ['Allowed formats', p.allowed_formats], ['Risk tolerance', p.risk_tolerance],
  ];
  return rows.filter(([, v]) => v).map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (no domain profile — lean toward monitor/reject)';
}

export function signalsBlock(signals: TrendSignal[] = []): string {
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

export async function supervise(body: { domain_profile?: DomainProfile; signals?: TrendSignal[]; account_label?: string }) {
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
  const { content: raw } = await callLLM(SUPERVISOR_SYSTEM_PROMPT, prompt, { maxTokens: 8000, temperature: 0.3 });
  const parsed: any = extractJSON(raw);
  const topics = Array.isArray(parsed) ? parsed : (parsed.topics || []);
  return { topics, summary: parsed?.summary ?? null, analysis_date: parsed?.analysis_date };
}

export function topicToRecord(t: any): Record<string, unknown> {
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
