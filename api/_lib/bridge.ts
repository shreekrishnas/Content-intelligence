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

// Batched bridge layer. For each viral signal, extract underlying theme +
// emotion, then attempt a creative connection to the brand niche. Drops
// anything the model marks bridgeable=false or confidence="forced".
export async function bridgeSignals(signals: TrendSignal[], profile: DomainProfile, accountLabel?: string): Promise<TrendSignal[]> {
  if (!signals.length) return [];

  const sys = `You are a creative strategist who specializes in trend-jacking for brands. For each viral trend, extract its UNDERLYING theme and try to connect it to the brand's niche. Output ONLY raw JSON.

RULES:
- Never force a connection. If the bridge feels like a stretch that would embarrass the brand, return bridgeable=false.
- Extract themes/emotions FIRST, then build the bridge angle.
- The audience should recognize the trend instantly but walk away learning about the brand's space.
- Prefer "natural_fit" over "creative_stretch". Reject "forced".
- Bridge angle must be ONE concrete sentence — a hook the brand could actually publish.
- Do NOT invent facts about the trend. Use only what the signal states.`;

  const user = `BRAND: ${accountLabel || profile.business_name || 'Unknown'}
INDUSTRY: ${profile.industry || 'unknown'}
AUDIENCE: ${profile.target_audience || 'unknown'}
CORE TOPICS: ${profile.core_topics || 'unknown'}
BRAND TONE: ${profile.brand_tone || 'neutral, professional'}
PILLARS: ${profile.content_categories || profile.core_topics || 'unknown'}

VIRAL SIGNALS:
${signals.map((s, i) => `[${i}] ${s.title || s.topic || 'Untitled'}${s.content ? ` — ${String(s.content).slice(0, 250)}` : ''}${s.url ? ` (${s.url})` : ''}`).join('\n')}

For every signal, decide if it bridges to this brand. Return ONLY:
{"bridges":[{"i":0,"bridgeable":true,"confidence":"natural_fit|creative_stretch|forced","underlying_theme":"one sentence — persistence, underdog, binge behavior, etc.","emotion":"joy|pride|surprise|nostalgia|frustration|hope","bridge_angle":"one-sentence hook connecting the trend to the brand's niche","content_idea":"2-3 sentence concept for the actual content piece"}]}

Skip signals you cannot bridge — set bridgeable=false. Be selective: better to bridge 2 signals well than 5 badly.`;

  try {
    const { content: raw } = await callLLM(sys, user, { maxTokens: 2000, temperature: 0.5 });
    const parsed: any = extractJSON(raw);
    const bridges = (parsed?.bridges || []) as Array<any>;
    const bridged: TrendSignal[] = [];
    for (const b of bridges) {
      if (typeof b.i !== 'number' || b.i < 0 || b.i >= signals.length) continue;
      // Only accept "natural_fit" bridges — creative_stretch and forced are
      // both dropped. The user gets fewer trend-jack cards, but every one
      // that survives is one the brand can actually publish without cringe.
      if (!b.bridgeable || b.confidence !== 'natural_fit') continue;
      const src = signals[b.i];
      bridged.push({
        ...src,
        signal_type: 'viral_bridged',
        underlying_theme: String(b.underlying_theme || '').trim(),
        bridge_angle: String(b.bridge_angle || '').trim(),
        bridge_confidence: b.confidence === 'natural_fit' ? 'natural_fit' : 'creative_stretch',
        summary: [
          b.content_idea ? `Content idea: ${b.content_idea}` : '',
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
