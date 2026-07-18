import { callLLM } from './llm.js';
import { extractJSON } from './json.js';
import { isGenericText, hasConcreteAnchor } from './generic-filter.js';
import type { DomainProfile, TrendSignal } from './types.js';

export const SUPERVISOR_SYSTEM_PROMPT = `You are an AI Trend Supervisor. You review raw news signals and select the best few for a brand to publish content around.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR JOB:
- Cluster signals that describe the same underlying story into ONE topic. Multiple outlets covering the same event = one topic, not three.
- Score each clustered topic on four 0-100 scales: domain_relevance, trend_impact, adaptability, risk (higher risk = more dangerous).
- Classify each into: domain_trend, supertrend_exception, monitor, or reject.
- Assign priority, trend_stage, estimated_lifespan, time_horizon (always "reactive"), and confidence_score.
- Always tag time_horizon = "reactive" — every surviving topic is a specific, dated thing happening now/this week.

MANDATORY MINIMUM OUTPUT: you MUST return at least one topic if the input contains any real news signals. If nothing meets the domain_trend bar, promote the top 1-2 candidates to "monitor" instead. Returning an empty topics array when signals were provided is a failure — the user needs SOMETHING to react to.

CLASSIFICATION RULES (soft guidelines — use judgment, not rigid arithmetic):
- domain_trend: clearly relevant to this brand's industry/audience with a workable content angle. Aim for domain_relevance around 65+ and trend_impact around 55+.
- supertrend_exception: culturally huge but off-niche, with a natural (not forced) brand angle. High trend_impact (~80+), decent adaptability.
- monitor: promising but early — worth watching, not yet worth publishing. Also the fallback for when nothing crosses the domain_trend bar.
- reject: only for truly generic, off-brand, duplicated, or actively risky content.

SPECIFICITY: prefer topics anchored to a real event, name, or date. If the source signal is a real news article with a headline, that's your anchor — cite it in the topic and reason.

AVOID (rephrase or reject) these evasion patterns:
- "The rise/future/evolution of X", "growing importance of X", "why X matters", "leveraging AI for X", "top N tips" — these are blog-post titles, not trends.
- Rephrase into a specific news-anchored form when possible: don't reject a real signal just because your draft title was generic — write a better title.

OUTPUT RULE: only include domain_trend / supertrend_exception / monitor items in the topics array. Count rejects in the summary.

GUARDRAILS: never invent trend data. Never force a brand connection. If a topic touches politics, health, finance, law, tragedy, or controversy, raise its risk and set needs_human_review = true. Never exceed max_recommendations for domain_trend + supertrend combined.`;

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
      s.signal_type === 'viral_bridged' ? `[type: viral_bridged | bridge: ${s.bridge_confidence || 'unknown'}]` : '',
      s.underlying_theme ? `theme: ${s.underlying_theme}` : '',
      s.bridge_angle ? `bridge_angle: ${s.bridge_angle}` : '',
      s.source ? `source: ${s.source}` : '',
      s.published_at ? `date: ${s.published_at}` : '',
      s.summary || s.content ? `note: ${String(s.summary || s.content).slice(0, 300)}` : '',
      s.url ? `url: ${s.url}` : '',
    ].filter(Boolean);
    return parts.join('\n   ');
  }).join('\n');
}

export async function supervise(body: { domain_profile?: DomainProfile; signals?: TrendSignal[]; account_label?: string }) {
  // Cap max recommendations at 3 hard — quality feed, not volume.
  const max = Math.min(body.domain_profile?.max_recommendations ?? 3, 3);

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
- Max ${max} topics may be classified as domain_trend or supertrend_exception COMBINED.
- Max 2 topics may be classified as monitor (only genuinely promising, time-bound ones).
- Do NOT include rejected topics in the topics array — count them in summary only.
- Reject generic, non-time-bound, and duplicate-phrased topics without hesitation.
- Tag every surviving topic's time_horizon as "reactive".
- Aim for quality: 2 strong domain_trend items beats 8 mediocre ones.

TREND-JACKED SIGNALS: signals tagged [type: viral_bridged] came from broad viral culture and were pre-connected to this brand by the bridge layer. For those, PRESERVE the bridge_angle, underlying_theme, and signal_type=viral_bridged fields on the output topic — they are the whole point of the trend-jack. Still enforce specificity (a named event/date/number must anchor the trend) and safety. Use suggested_connection for the bridge angle when you accept one.

Return ONLY this JSON (no extra fields, no markdown):
{"analysis_date":"YYYY-MM-DD","summary":{"total_topics_reviewed":0,"domain_trends_sent":0,"supertrends_sent":0,"topics_monitored":0,"topics_rejected":0},"topics":[{"topic":"","summary":"","classification":"domain_trend|supertrend_exception|monitor","time_horizon":"reactive|strategic","signal_type":"niche|viral_bridged","bridge_angle":"","underlying_theme":"","bridge_confidence":"natural_fit|creative_stretch|","domain_relevance_score":0,"trend_impact_score":0,"adaptability_score":0,"risk_score":0,"confidence_score":0,"priority":"high|medium|low","trend_stage":"emerging|growing|peak|declining","estimated_lifespan":"","recommended_route":"","recommended_formats":[],"suggested_connection":"","content_angle":"One specific content piece this brand should make","related_keywords":[],"needs_human_review":false,"reason":""}]}`;
  const { content: raw } = await callLLM(SUPERVISOR_SYSTEM_PROMPT, prompt, { maxTokens: 3000, temperature: 0.2 });
  const parsed: any = extractJSON(raw);
  const rawTopics = Array.isArray(parsed) ? parsed : (parsed.topics || []);

  // Deterministic backstop: catch obvious blog-post-title junk the LLM
  // might have sneaked through. ONLY drop for the generic-phrase denylist
  // — the anchor check is now advisory (used as a penalty, not a kill).
  // A high-scored real news article without a proper-noun match still
  // deserves to reach the user; the LLM already saw the source article.
  let genericDropped = 0;
  const specific = rawTopics.filter((t: any) => {
    if (isGenericText(t.topic, t.content_angle, t.summary)) {
      genericDropped++;
      return false;
    }
    return true;
  });
  // Soft demotion: topics with no concrete anchor drop to monitor even if
  // the LLM classified them higher.
  specific.forEach((t: any) => {
    if (!hasConcreteAnchor(t.topic, t.content_angle, t.summary, t.reason)
      && t.classification !== 'monitor') {
      t.classification = 'monitor';
    }
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
  let topics = specific.filter((_: any, i: number) => !dupDropped.has(i));

  // Guaranteed floor: if we had real signals to work with but everything
  // got rejected — by the LLM's own reject verdict or by our backstops —
  // rescue the top 2 raw topics as monitor items. Empty output on a
  // non-empty scan is a UX failure; the user needs SOMETHING to react to.
  const hadRealSignals = (body.signals || []).length > 0;
  if (!topics.length && hadRealSignals && rawTopics.length > 0) {
    const ranked = [...rawTopics].sort(
      (a: any, b: any) => (Number(b.trend_impact_score) || 0) - (Number(a.trend_impact_score) || 0),
    );
    topics = ranked.slice(0, 2).map((t: any) => ({
      ...t,
      classification: 'monitor',
      needs_human_review: true,
      reason: (t.reason || '') + ' [Auto-promoted to monitor: no topic cleared the domain_trend bar this scan.]',
    }));
  }

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
    signal_type: t.signal_type === 'viral_bridged' ? 'viral_bridged' : 'niche',
    bridge_angle: String(t.bridge_angle || ''),
    underlying_theme: String(t.underlying_theme || ''),
    bridge_confidence: t.bridge_confidence === 'natural_fit' || t.bridge_confidence === 'creative_stretch'
      ? t.bridge_confidence : '',
    sensitivity_warning: String(t.sensitivity_warning || ''),
    status,
  };
}
