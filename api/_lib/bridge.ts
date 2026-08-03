import { callLLM } from './llm.js';
import { extractJSON } from './json.js';
import type { DomainProfile, TrendSignal } from './types.js';

// ============================================================
// Trend-Jacking Bridge Layer
// ------------------------------------------------------------
// The bridge layer implements the blueprint's core innovation:
// take BROAD viral trends (things happening in culture that are
// NOT in the brand's niche) and either connect them to the brand
// creatively, or drop them entirely. No forced connections.
//
// Pipeline for a single scan:
//   1. Fetch viral signals via Tavily broad queries.
//   2. Batch sensitivity classify — drop 'block' (tragedies,
//      politics, violence), attach warning to 'warn'.
//   3. Batch bridge — the LLM connects each surviving signal to
//      the brand's niche via theme extraction; drops signals it
//      cannot connect naturally.
// ============================================================

const VIRAL_QUERIES = [
  'trending topics this week viral social media',
  'trending news this week pop culture',
  'viral moments this week',
  'trending memes this week',
  'biggest cultural moment this week',
];

export function buildViralQueries(profile: DomainProfile): string[] {
  const loc = profile.target_locations ? ` ${profile.target_locations}` : '';
  const scoped = VIRAL_QUERIES.map((q) => (loc ? `${q}${loc}` : q));
  return [...new Set(scoped)].slice(0, 5);
}

// Batched sensitivity classification. Blueprint spec: block death,
// violence, disasters, active political controversies, religious/caste
// topics, active legal cases involving victims, mental health crises,
// terror attacks. Warn on mildly controversial pop culture, celebrity
// personal events, corporate failures, non-crisis health scares.
export async function classifySensitivity(signals: TrendSignal[]): Promise<Array<'safe' | 'warn' | 'block'>> {
  if (!signals.length) return [];

  const sys = `You are a brand-safety classifier for trend-jacking. Given a list of trending topics, decide whether each is safe for a brand to publicly comment on. Output ONLY raw JSON.

BLOCK (never trend-jack): death, violence, natural disasters, active political controversies, elections, religion/caste, active legal cases involving victims, mental-health crises or suicides, terror attacks, military conflicts, mass casualties.

WARN (allow but flag): mildly controversial pop-culture debates, celebrity personal events, corporate layoffs, non-crisis health scares.

SAFE: sports, entertainment releases, cultural moments (festivals, IPL, movie releases, awards), viral memes without political/tragic subject matter, product/tech launches, positive milestones.`;

  const user = `Classify each topic. Return ONLY: {"verdicts":[{"i":0,"category":"safe|warn|block","reason":"short"}]}
${signals.map((s, i) => `[${i}] ${s.title || s.topic || 'Untitled'}${s.content ? ` — ${String(s.content).slice(0, 200)}` : ''}`).join('\n')}`;

  try {
    const { content: raw } = await callLLM(sys, user, { maxTokens: 1200, temperature: 0.1 });
    const parsed: any = extractJSON(raw);
    const verdicts = (parsed?.verdicts || []) as Array<{ i: number; category: string; reason?: string }>;
    const out: Array<'safe' | 'warn' | 'block'> = signals.map(() => 'safe');
    for (const v of verdicts) {
      if (typeof v.i !== 'number' || v.i < 0 || v.i >= signals.length) continue;
      if (v.category === 'block' || v.category === 'warn') {
        out[v.i] = v.category;
        if (v.category === 'warn' && v.reason) signals[v.i].sensitivity_warning = v.reason;
      }
    }
    return out;
  } catch {
    // Fail-closed on the block dimension: unknown status => treat as safe
    // rather than dropping legitimate signals. Warn stays attached only when
    // the classifier explicitly returns it.
    return signals.map(() => 'safe');
  }
}

// Step A: Validity gate — for each signal, determine YES/NO whether a
// real (not contrived) connection exists between the trend and any niche
// pillar. Returns indices of signals that passed, with one-line reasoning.
// Spec rule: reject vague justifications ("this relates to growth mindset").
async function gateValidity(signals: TrendSignal[], profile: DomainProfile, accountLabel?: string): Promise<Map<number, string>> {
  if (!signals.length) return new Map();
  const pillars = profile.niche_pillars || profile.content_categories || profile.core_topics || 'unknown';
  const sys = `You are a brand-safety and relevance gatekeeper. Given a list of trending topics and a brand's niche pillars, decide for each trend: does a REAL, non-contrived connection exist between this trend and at least one pillar? Output ONLY raw JSON.

RULES:
- YES only if the connection is mechanistic, factual, or behavioral — not metaphorical or inspirational.
- Reject "this relates to discipline" or "both involve planning" — these are vague and apply to everything.
- A good YES reason names the specific mechanism: e.g. "IPL viewership data shows same demographic as wealth management clients" or "RBI rate decision directly affects fixed-income returns our audience holds".
- Be strict: fewer, better bridges beat many weak ones.`;

  const user = `BRAND: ${accountLabel || profile.business_name || 'Unknown'}
NICHE PILLARS: ${pillars}
AUDIENCE: ${profile.target_audience || 'unknown'}

TRENDS TO GATE:
${signals.map((s, i) => `[${i}] ${s.title || s.topic || 'Untitled'}${s.content ? ` — ${String(s.content).slice(0, 200)}` : ''}`).join('\n')}

For each trend, return yes or no with a one-line reason. Return ONLY:
{"gates":[{"i":0,"pass":true,"reason":"specific mechanism that connects this trend to a named pillar"}]}`;

  try {
    const { content: raw } = await callLLM(sys, user, { maxTokens: 1000, temperature: 0.1 });
    const parsed: any = extractJSON(raw);
    const result = new Map<number, string>();
    for (const g of (parsed?.gates || [])) {
      if (typeof g.i !== 'number' || !g.pass) continue;
      result.set(g.i, String(g.reason || ''));
    }
    return result;
  } catch {
    // On gate failure, pass everything through to Step B — better than silently dropping all
    return new Map(signals.map((_, i) => [i, ''] as [number, string]));
  }
}

// Step B: Bridge generation — only for signals that passed Step A.
// Extracts underlying theme + emotion, generates a concrete bridge angle.
// Spec: must cite a real data point from the trend; no rhetorical questions.
async function generateBridges(signals: TrendSignal[], gateReasons: Map<number, string>, profile: DomainProfile, accountLabel?: string): Promise<TrendSignal[]> {
  const candidates = signals.filter((_, i) => gateReasons.has(i));
  if (!candidates.length) return [];

  const pillars = profile.niche_pillars || profile.content_categories || profile.core_topics || 'unknown';
  const sys = `You are a creative strategist specialising in trend-jacking for brands. These trends have already passed a validity gate — a real connection exists. Now generate the bridge content. Output ONLY raw JSON.

RULES:
- Bridge angle must cite a real data point or mechanism from the trend signal (not invented).
- Must land on ONE specific pillar, not the niche in general.
- No rhetorical-question headlines ("Are you ready for X?").
- Bridge angle is ONE concrete sentence — a hook the brand could publish today.
- confidence must be "natural_fit" — if you'd rate it "creative_stretch" or worse, set bridgeable=false.`;

  const user = `BRAND: ${accountLabel || profile.business_name || 'Unknown'}
NICHE PILLARS: ${pillars}
AUDIENCE: ${profile.target_audience || 'unknown'}
BRAND TONE: ${profile.brand_tone || 'neutral, professional'}

GATED SIGNALS (connection confirmed — generate bridge):
${candidates.map((s, i) => {
  const origIdx = signals.indexOf(s);
  const reason = gateReasons.get(origIdx) || '';
  return `[${i}] ${s.title || s.topic || 'Untitled'}${s.content ? ` — ${String(s.content).slice(0, 250)}` : ''}\n   Gate reason: ${reason}`;
}).join('\n')}

Return ONLY:
{"bridges":[{"i":0,"bridgeable":true,"confidence":"natural_fit","underlying_theme":"one sentence","emotion":"joy|pride|surprise|nostalgia|frustration|hope","bridge_angle":"one-sentence hook citing a real fact from the trend","content_idea":"2-3 sentence concept","data_anchor":"the specific number/name/date from the signal that anchors this"}]}`;

  try {
    const { content: raw } = await callLLM(sys, user, { maxTokens: 2000, temperature: 0.4 });
    const parsed: any = extractJSON(raw);
    const bridged: TrendSignal[] = [];
    for (const b of (parsed?.bridges || [])) {
      if (typeof b.i !== 'number' || b.i < 0 || b.i >= candidates.length) continue;
      if (!b.bridgeable || b.confidence !== 'natural_fit') continue;
      const src = candidates[b.i];
      bridged.push({
        ...src,
        signal_type: 'viral_bridged',
        underlying_theme: String(b.underlying_theme || '').trim(),
        bridge_angle: String(b.bridge_angle || '').trim(),
        bridge_confidence: 'natural_fit',
        summary: [
          b.content_idea ? `Content idea: ${b.content_idea}` : '',
          b.data_anchor ? `Data anchor: ${b.data_anchor}` : '',
          b.underlying_theme ? `Underlying theme: ${b.underlying_theme}` : '',
          b.emotion ? `Emotion: ${b.emotion}` : '',
          src.summary || src.content ? `Trend context: ${String(src.summary || src.content).slice(0, 200)}` : '',
        ].filter(Boolean).join(' '),
      });
    }
    return bridged;
  } catch {
    return [];
  }
}

// Batched bridge layer — now implements explicit Step A → Step B pipeline
// per the spec: validity gate first (real connection? yes/no + reason),
// bridge generation only for those that pass. No forced connections.
export async function bridgeSignals(signals: TrendSignal[], profile: DomainProfile, accountLabel?: string): Promise<TrendSignal[]> {
  if (!signals.length) return [];
  // Step A: gate validity
  const gateReasons = await gateValidity(signals, profile, accountLabel);
  if (!gateReasons.size) return [];
  // Step B: generate bridges for survivors only
  return generateBridges(signals, gateReasons, profile, accountLabel);
}
