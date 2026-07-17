import { callLLM } from './llm.js';
import { extractJSON } from './json.js';
import { isGenericText, hasConcreteAnchor } from './generic-filter.js';
import type { DomainProfile, TrendSignal } from './types.js';

export const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You sit between raw trend signals and a content Action Layer. You are a strict gatekeeper — most signals should be rejected. Only forward the few that are genuinely strong.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Deduplicate and cluster signals that describe the same underlying topic into ONE record. If three signals are the same story from three outlets, or three angles on the same underlying shift, that is ONE topic — never publish it twice under different headlines.
- Score each clustered topic on four independent 0-100 scales: domain_relevance, trend_impact, adaptability, and risk (higher = more dangerous).
- Classify each into exactly one of: domain_trend, supertrend_exception, monitor, reject.
- Assign priority, trend_stage, estimated_lifespan, time_horizon, and a confidence_score (0-100).
- Write a specific, concrete reason for every classification.
- Be ruthless: if in doubt, reject. A lean, high-quality output beats a bloated one.

TIME HORIZON — every surviving topic must be tagged "reactive" or "strategic":
- "reactive": a specific, dated thing happening now/this week — good for immediate newsjacking. estimated_lifespan will be short (days to a couple weeks). Signals marked [horizon: reactive] below lean this way, but judge each on its own merit.
- "strategic": a durable, structural shift with legs for a quarter or more — a regulatory phase-in, an industry outlook finding, a multi-phase market shift, a recurring seasonal category. estimated_lifespan should read in months. Signals marked [horizon: strategic] below lean this way. This does NOT mean vaguer or more generic — a strategic trend still needs the same concrete anchor (a named regulation, a dated phase-in, a cited report finding) as a reactive one. "Digital transformation is growing" is not strategic, it's just generic; reject it. "SEBI's T+0 settlement cycle completing nationwide rollout by [date]" is strategic — durable AND specific.
- Prefer surfacing at least one strategic trend per scan when the signals support it — a feed of only reactive news-of-the-day items doesn't give the brand anything to plan a content calendar around.

ROUTING RULES (all conditions must be met — not suggestions, requirements):
- domain_trend: domain_relevance >= 70 AND trend_impact >= 55 AND risk <= 55. Must have a clear, direct content angle for this brand.
- supertrend_exception: domain_relevance < 70 AND trend_impact >= 85 AND adaptability >= 70 AND risk <= 35. Only when there is an obvious, natural brand connection — do not force it.
- monitor: genuinely emerging signal with real potential but insufficient evidence yet. Maximum 3 monitor items — pick only the most promising.
- reject: everything else. When topics overlap — even if phrased differently, sourced from different outlets, or given different headlines — keep only the single strongest version and reject the rest as duplicates. Reject anything generic, speculative, off-brand, risky, or outdated.

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
      s.horizon ? `[horizon: ${s.horizon}]` : '',
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

TASK: Supervise strictly. Deduplicate aggressively — collapse near-duplicate signals (same underlying story or shift, different headline/outlet) into ONE topic before scoring, never emit the same underlying topic twice. Classify every clustered topic.
- Max ${max} topics may be classified as domain_trend or supertrend_exception combined.
- Max 3 topics may be classified as monitor (only genuinely promising, time-bound ones).
- Do NOT include rejected topics in the topics array — count them in summary only.
- Reject generic, non-time-bound, and duplicate-phrased topics without hesitation.
- Tag every surviving topic's time_horizon as "reactive" or "strategic" per the definitions above. Prefer including at least one strategic trend when the signals support it.
- Aim for quality: 2 strong domain_trend items beats 8 mediocre ones.

Return ONLY this JSON (no extra fields, no markdown):
{"analysis_date":"YYYY-MM-DD","summary":{"total_topics_reviewed":0,"domain_trends_sent":0,"supertrends_sent":0,"topics_monitored":0,"topics_rejected":0},"topics":[{"topic":"","summary":"","classification":"domain_trend|supertrend_exception|monitor","time_horizon":"reactive|strategic","domain_relevance_score":0,"trend_impact_score":0,"adaptability_score":0,"risk_score":0,"confidence_score":0,"priority":"high|medium|low","trend_stage":"emerging|growing|peak|declining","estimated_lifespan":"","recommended_route":"","recommended_formats":[],"suggested_connection":"","content_angle":"One specific content piece this brand should make","related_keywords":[],"needs_human_review":false,"reason":""}]}`;
  const { content: raw } = await callLLM(SUPERVISOR_SYSTEM_PROMPT, prompt, { maxTokens: 3000, temperature: 0.2 });
  const parsed: any = extractJSON(raw);
  const rawTopics = Array.isArray(parsed) ? parsed : (parsed.topics || []);

  // Deterministic backstop: a model can ignore prompt instructions, so re-check
  // every surviving topic against the generic-phrase denylist and the
  // proper-noun/date/number anchor requirement. Anything that fails either
  // check is dropped here — not just asked nicely to be dropped upstream.
  let genericDropped = 0;
  const specific = rawTopics.filter((t: any) => {
    const isGeneric = isGenericText(t.topic, t.content_angle, t.summary);
    const hasAnchor = hasConcreteAnchor(t.topic, t.content_angle, t.summary, t.reason);
    if (isGeneric || !hasAnchor) {
      genericDropped++;
      return false;
    }
    return true;
  });

  // Deterministic backstop #2: the model is told to cluster duplicates before
  // scoring, but at temperature 0.2 across ~30 signals it sometimes emits the
  // same underlying story twice under different headlines. Catch what the
  // prompt missed by comparing topic+content_angle token overlap pairwise;
  // keep only the highest-scored version of each near-duplicate cluster.
  const dupDropped: Set<number> = new Set();
  const tokenSets = specific.map((t: any) => tokenize(`${t.topic || ''} ${t.content_angle || ''}`));
  const scoreOf = (t: any) => (Number(t.domain_relevance_score) || 0) + (Number(t.trend_impact_score) || 0);
  for (let i = 0; i < specific.length; i++) {
    if (dupDropped.has(i)) continue;
    for (let j = i + 1; j < specific.length; j++) {
      if (dupDropped.has(j)) continue;
      if (jaccard(tokenSets[i], tokenSets[j]) >= 0.5) {
        const loser = scoreOf(specific[i]) >= scoreOf(specific[j]) ? j : i;
        dupDropped.add(loser);
      }
    }
  }
  const topics = specific.filter((_: any, i: number) => !dupDropped.has(i));

  const genericFiltered = genericDropped;
  const duplicatesMerged = dupDropped.size;
  const summary = parsed?.summary ? {
    ...parsed.summary,
    topics_rejected: (parsed.summary.topics_rejected ?? 0) + genericFiltered + duplicatesMerged,
    generic_filtered: genericFiltered,
    duplicates_merged: duplicatesMerged,
  } : (genericFiltered + duplicatesMerged > 0 ? { generic_filtered: genericFiltered, duplicates_merged: duplicatesMerged } : null);

  return { topics, summary, analysis_date: parsed?.analysis_date };
}

const STOPWORDS = new Set(['the','a','an','of','for','to','in','on','with','and','or','is','are','this','that','by','at','as','be','it','its','their','from','into','how','what','why']);

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
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
    time_horizon: t.time_horizon === 'strategic' ? 'strategic' : 'reactive',
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
