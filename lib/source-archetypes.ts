// ============================================================
// Source archetype detection + per-archetype analysis rules.
// Used by /api/analyze-content to tailor extraction to the kind
// of source the user is analysing.
// ============================================================

export type Archetype =
  | 'video'
  | 'blog'
  | 'webinar'
  | 'event'
  | 'trending'
  | 'research'
  | 'interview'
  | 'launch'
  | 'competitor'
  | 'recurring'
  | 'generic';

export interface SourceTypeContext {
  name?: string;
  slug?: string;
  description?: string;
  formats?: string[];
  analysis_guidance?: string;
}

interface ArchetypeRule {
  focus: string;
  insight_style: string;
  format_bias: string;
  gotchas: string;
}

const RULES: Record<Archetype, ArchetypeRule> = {
  video: {
    focus: 'Quotable soundbites, speaker attribution, moments of tension or contradiction between speakers, and any counter-intuitive claims made on camera.',
    insight_style: 'Attribute every insight to the specific speaker who said it. Prefer verbatim short quotes over paraphrases. Flag any moment where a guest disagreed with the host — those are the most repurposable clips.',
    format_bias: 'Short-form video clips, quote carousels, tweet-length pull-quotes, and a summary blog post organised by speaker.',
    gotchas: 'Do not include filler/greetings/sponsor reads as insights. Do not attribute a host statement to a guest or vice versa.',
  },
  blog: {
    focus: "The author's core thesis, the arguments used to support it, the data or examples they cite, and the angles they leave unaddressed.",
    insight_style: 'State the thesis in one sentence. Then list the load-bearing arguments. Then explicitly call out the strongest counter-argument the author ignored — that gap is a content opportunity.',
    format_bias: 'A LinkedIn amplification post from the author, a response/extension article that fills the gap, a carousel breaking down the thesis, a short image post with the money quote.',
    gotchas: "Don't restate the article — extract the thesis and the gaps. Do not treat the author's opinion as fact.",
  },
  webinar: {
    focus: 'Session-by-session takeaways, live audience questions (highest signal), speaker credentials that make the content re-quotable, and any promised follow-ups or resources.',
    insight_style: 'Structure insights around the agenda. Call out the top 3 audience questions verbatim — those reveal the actual buyer pain. Note any speaker who has a differentiated POV vs. the market.',
    format_bias: 'Recap blog with timestamps, quote carousel of the best moments, a lead-magnet guide summarising the session, replay-teaser reels, and a Q&A follow-up post.',
    gotchas: 'Do not treat every speaker slide as insightful — only the ones with a specific claim or data point. Do not invent audience questions.',
  },
  event: {
    focus: 'Notable attendees, the most repeated themes across sessions, memorable stage moments, and follow-up commitments the brand made publicly.',
    insight_style: 'Identify the 2-3 dominant themes across the event, not per-session summaries. Call out the moment that got the most audience reaction. Note who the brand was seen with (partnership angles).',
    format_bias: 'Event recap blog, highlights carousel, thank-you post tagging attendees, quote graphics, a post-event lead-magnet.',
    gotchas: 'Do not summarise every session — pick the moments that will resonate outside the room. Do not name attendees unless they are clearly public.',
  },
  trending: {
    focus: 'The unique brand-appropriate POV on the trend, the virality window (how many days does this matter?), and whether the topic overlaps with any restricted/sensitive areas from the KB.',
    insight_style: 'Do NOT explain the trend — commodity commentary is worthless. Frame every insight as "the angle only we can take" grounded in the brand voice from KB. Explicitly rate topic risk.',
    format_bias: 'Fast-turnaround single image, short carousel, one lean opinion blog. Avoid deep formats — the window closes.',
    gotchas: 'If the trend touches politics, health, finance, tragedy, or controversy: raise the risk flag and add a compliance warning. Do not force a brand tie-in that is not natural.',
  },
  research: {
    focus: 'Counter-intuitive statistics, methodology quality (sample size, source, date), the single most quotable number, and gaps between the data and how it is commonly interpreted.',
    insight_style: 'Every insight leads with a specific number and its context. Flag any stat where the popular reading is actually wrong. Note methodology weaknesses honestly.',
    format_bias: 'Infographic, data-storytelling blog, quote-worthy stat carousel, a myth-vs-data post series.',
    gotchas: 'Do not round numbers when precision matters. Do not present correlations as causation. If sample size is small, flag it.',
  },
  interview: {
    focus: 'Verbatim customer pain points (their language, not yours), the specific workflow / before-state described, the moment things changed for them, and quantifiable outcomes.',
    insight_style: 'Use direct customer quotes as evidence. Preserve their vocabulary — that is the SEO/messaging gold. Distinguish stated needs from underlying jobs-to-be-done.',
    format_bias: 'Case study, testimonial social post, quote graphic with attribution, a founder-note reflection post, sales enablement one-pager.',
    gotchas: 'Never put words in the customer\'s mouth. If they gave permission to be quoted, note it; if not, anonymise. Do not exaggerate outcomes.',
  },
  launch: {
    focus: 'What actually changed for the user (not the feature list), who benefits most, the migration path from the old way, and any pricing / access changes.',
    insight_style: 'Translate every feature into a specific user benefit ("save 3 hours per week" not "faster processing"). Identify the single biggest reason to switch. Note what is NOT changing (reassurance angle).',
    format_bias: 'Launch announcement email, hero social post, before/after comparison carousel, changelog / release notes blog, sales-team enablement doc.',
    gotchas: 'Do not overpromise capabilities. Do not describe roadmap items as if they are shipping today. Include any compliance / migration disclaimers.',
  },
  competitor: {
    focus: 'Competitor positioning (how they describe themselves), messaging gaps we can attack, claims that are weakly-supported, and audience segments they under-serve.',
    insight_style: 'Extract their positioning verbatim. Then map our sharpest differentiators against it. Identify the 1-2 places their claim is a stretch — those are counter-position opportunities.',
    format_bias: 'Counter-position blog (not a hit piece — a better argument), comparison carousel, a "here is what nobody else covers" thought-leadership post.',
    gotchas: 'Never disparage the competitor — argue the alternative. Do not make specific factual claims about competitor internals we cannot verify. Stay compliance-safe.',
  },
  recurring: {
    focus: 'What is uniquely NEW in this edition vs the recurring format, the one hook that would make a non-subscriber care, and the evergreen angle worth compiling.',
    insight_style: 'Split insights into "this week only" (news) and "always true" (evergreen). Note format changes vs prior editions if apparent.',
    format_bias: 'Newsletter fit as-is, a single hero social post, a monthly compilation carousel across editions.',
    gotchas: 'Do not repeat insights that appear in every edition — the audience has seen them. Do not manufacture urgency where the content is evergreen.',
  },
  generic: {
    focus: "Follow the source type's description as the primary guide for what to extract.",
    insight_style: 'Ground every insight in a specific line from the source. Prefer specificity over volume.',
    format_bias: "Use the source type's allowed formats list.",
    gotchas: 'Since the archetype is unknown, be conservative: prefer fewer, higher-confidence insights.',
  },
};

// Ordered — most specific patterns first so "webinar" beats "video".
const PATTERNS: Array<[Archetype, RegExp]> = [
  ['interview', /interview|testimonial|customer[_ -]story|case[_ -]study|cx|voice[_ -]of[_ -]customer/i],
  ['webinar', /webinar|masterclass|workshop/i],
  ['event', /event|conference|summit|panel|expo|meetup|gala/i],
  ['launch', /launch|announcement|release|product[_ -]update|changelog|feature[_ -]drop/i],
  ['competitor', /competitor|rival|alternative[_ -]to/i],
  ['research', /research|report|whitepaper|study|survey|benchmark|state[_ -]of|market[_ -]analysis|data/i],
  ['trending', /trend|news|breaking|hot[_ -]topic|current|viral/i],
  ['recurring', /weekly|monthly|daily|newsletter|digest|roundup|recap[_ -]series/i],
  ['video', /video|podcast|transcript|episode|reel|short|youtube|clip|et[_ -]video|voice[_ -]page/i],
  ['blog', /blog|article|op[_ -]ed|essay|column|post|substack|medium|author/i],
];

export function detectArchetype(ctx: SourceTypeContext): Archetype {
  const haystack = `${ctx.slug ?? ''} ${ctx.name ?? ''}`.toLowerCase();
  if (!haystack.trim()) return 'generic';
  for (const [arch, pattern] of PATTERNS) {
    if (pattern.test(haystack)) return arch;
  }
  return 'generic';
}

export interface SourceGuidance {
  archetype: Archetype;
  block: string;
}

// Build the guidance block that goes into the user prompt.
export function buildSourceGuidance(ctx: SourceTypeContext): SourceGuidance {
  const archetype = detectArchetype(ctx);
  const rule = RULES[archetype];

  const lines: string[] = [];
  lines.push(`SOURCE TYPE: ${ctx.name ?? ctx.slug ?? 'Unknown'} (archetype: ${archetype})`);
  if (ctx.description) lines.push(`Description: ${ctx.description}`);
  lines.push('');
  lines.push('HOW TO ANALYSE THIS KIND OF SOURCE:');
  lines.push(`- Focus: ${rule.focus}`);
  lines.push(`- Insight style: ${rule.insight_style}`);
  lines.push(`- Format bias: ${rule.format_bias}`);
  lines.push(`- Avoid: ${rule.gotchas}`);

  if (ctx.formats?.length) {
    lines.push('');
    lines.push(`ALLOWED OUTPUT FORMATS for opportunities (choose from these — do not invent others): ${ctx.formats.join(', ')}`);
  }

  if (ctx.analysis_guidance && ctx.analysis_guidance.trim()) {
    lines.push('');
    lines.push('USER-DEFINED GUIDANCE for this source type (takes priority over the defaults above):');
    lines.push(ctx.analysis_guidance.trim());
  }

  return { archetype, block: lines.join('\n') };
}
