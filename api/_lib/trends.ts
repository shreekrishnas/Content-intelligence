import { callLLM } from './llm.js';
import { extractJSON } from './json.js';
import { isGenericText, hasConcreteAnchor } from './generic-filter.js';
import type { DomainProfile, TrendSignal } from './types.js';

export const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You are a strict gatekeeper — most signals should be rejected. Only forward the few that are genuinely strong.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Deduplicate and cluster signals that describe the same underlying topic into ONE record.
- Score each clustered topic on four independent 0-100 scales: domain_relevance, trend_impact, adaptability, and risk (higher = more dangerous).
- Classify each into exactly one of: domain_trend, supertrend_exception, monitor, reject.
- Assign priority, trend_stage, estimated_lifespan, and a confidence_score (0-100).
- Write a specific, concrete reason for every classification.
- Be ruthless: if in doubt, reject. A lean, high-quality output beats a bloated one.

ROUTING RULES (all conditions must be met — not suggestions, requirements):
- domain_trend: domain_relevance >= 70 AND trend_impact >= 55 AND risk <= 55. Must have a clear, direct content angle for this brand.
- supertrend_exception: domain_relevance < 70 AND trend_impact >= 85 AND adaptability >= 70 AND risk <= 35. Only when there is an obvious, natural brand connection — do not force it.
- monitor: genuinely emerging signal with real potential but insufficient evidence yet. Maximum 3 monitor items — pick only the most promising.
- reject: everything else. When topics overlap, keep the strongest and reject duplicates. Reject anything generic, speculative, off-brand, risky, or outdated.

SPECIFICITY IS MANDATORY — NOT OPTIONAL. Every topic that survives (domain_trend, supertrend_exception, monitor) must be anchored to a concrete, named, dated, or numbered fact. If you cannot name the specific event, announcement, data point, regulation, product launch, or study driving it, REJECT it — do not soften it into a vague theme instead.

BANNED as topic titles or content_angle text — these are evasions, not trends. If your draft output resembles any of these patterns, reject the topic instead of publishing it softened:
- "The growing importance/rise/future of X"
- "Increasing demand/focus/adoption of X"
- "X is transforming/reshaping/revolutionizing the industry"
- "Leveraging AI/technology for X"
- "Why X matters in [year]"
- "The evolution of X"
- Any topic whose "summary" or "reason" could apply to this same industry in any random month — that is the tell of a generic theme wearing a trend costume.

REQUIRED INSTEAD: name the specific thing. Not "the rise of AI in manufacturing" but "Siemens' Jan 2026 partnership with [named AI vendor] to automate defect detection on production lines." Not "growing demand for water recycling" but "the new CPCB zero-liquid-discharge mandate taking effect [date] for [named sector]." A trend without a proper noun, a number, or a date attached is not a trend — reject it.

OUTPUT RULE: Do NOT include rejected topics in the topics array. Only include domain_trend, supertrend_exception, and monitor items. Count rejections in the summary only.

GUARDRAILS: never invent trend data, never treat virality as domain relevance, never force a brand connection, never exceed max_recommendations for domain_trend + supertrend combined. If a topic touches politics, health, finance, law, tragedy, or controversy, raise its risk and set needs_human_review = true.`;

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
  return signals.slice(0, 30).map((s, i) => {
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
  const max = Math.min(body.domain_profile?.max_recommendations ?? 5, 5);

  const signals = body.signals || [];
  const isAiOnly = signals.length > 0 && signals.every((s) => s.source === 'ai-suggested');
  const hasMixedSources = !isAiOnly && signals.some((s) => s.source === 'ai-suggested');

  const sourceNote = isAiOnly
    ? `\nSOURCE WARNING: ALL signals below are AI-generated hypotheses — not verified live data. Apply strict skepticism:\n- Subtract 15 points from every domain_relevance_score and trend_impact_score before classifying.\n- Only classify as domain_trend if adjusted scores still meet thresholds (domain_relevance >= 70, trend_impact >= 55).\n- Prefer monitor over domain_trend when evidence is thin.\n- Confidence scores should reflect the lack of verification (cap at 70 unless the topic is unambiguously timely).`
    : hasMixedSources
    ? `\nSOURCE NOTE: Some signals are AI-generated hypotheses (marked source: ai-suggested). Score these more conservatively than verified live signals.`
    : '';

  const prompt = `TODAY: ${new Date().toISOString().slice(0, 10)}
ACCOUNT: ${body.account_label || body.domain_profile?.business_name || 'General'}

DOMAIN PROFILE:
${profileBlock(body.domain_profile)}
${sourceNote}
RAW TREND SIGNALS (cluster duplicates — many overlap, be aggressive about merging):
${signalsBlock(signals)}

TASK: Supervise strictly. Deduplicate aggressively. Classify every clustered topic.
- Max ${max} topics may be classified as domain_trend or supertrend_exception combined.
- Max 3 topics may be classified as monitor (only genuinely promising, time-bound ones).
- Do NOT include rejected topics in the topics array — count them in summary only.
- Reject generic, evergreen, and non-time-bound topics without hesitation.
- Aim for quality: 2 strong domain_trend items beats 8 mediocre ones.

Return ONLY this JSON (no extra fields, no markdown):
{"analysis_date":"YYYY-MM-DD","summary":{"total_topics_reviewed":0,"domain_trends_sent":0,"supertrends_sent":0,"topics_monitored":0,"topics_rejected":0},"topics":[{"topic":"","summary":"","classification":"domain_trend|supertrend_exception|monitor","domain_relevance_score":0,"trend_impact_score":0,"adaptability_score":0,"risk_score":0,"confidence_score":0,"priority":"high|medium|low","trend_stage":"emerging|growing|peak|declining","estimated_lifespan":"","recommended_route":"","recommended_formats":[],"suggested_connection":"","content_angle":"One specific content piece this brand should make","related_keywords":[],"needs_human_review":false,"reason":""}]}`;
  const { content: raw } = await callLLM(SUPERVISOR_SYSTEM_PROMPT, prompt, { maxTokens: 3000, temperature: 0.2 });
  const parsed: any = extractJSON(raw);
  const rawTopics = Array.isArray(parsed) ? parsed : (parsed.topics || []);

  // Deterministic backstop: a model can ignore prompt instructions, so re-check
  // every surviving topic against the generic-phrase denylist and the
  // proper-noun/date/number anchor requirement. Anything that fails either
  // check is dropped here — not just asked nicely to be dropped upstream.
  let genericDropped = 0;
  const topics = rawTopics.filter((t: any) => {
    const isGeneric = isGenericText(t.topic, t.content_angle, t.summary);
    const hasAnchor = hasConcreteAnchor(t.topic, t.content_angle, t.summary, t.reason);
    if (isGeneric || !hasAnchor) {
      genericDropped++;
      return false;
    }
    return true;
  });

  const summary = parsed?.summary ? {
    ...parsed.summary,
    topics_rejected: (parsed.summary.topics_rejected ?? 0) + genericDropped,
    generic_filtered: genericDropped,
  } : (genericDropped > 0 ? { generic_filtered: genericDropped } : null);

  return { topics, summary, analysis_date: parsed?.analysis_date };
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
    content_angle: String(t.content_angle || ''),
    needs_human_review: !!t.needs_human_review,
    status,
  };
}
