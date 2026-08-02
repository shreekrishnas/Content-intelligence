import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm.js';
import { extractJSON } from './_lib/json.js';
import { handleOptions, sendError } from './_lib/http.js';
import { logUsage } from './_lib/usage.js';
import { isGenericText } from './_lib/generic-filter.js';
import type { KnowledgeChunk } from './_lib/types.js';

// Brand-agnostic content strategist. This app is multi-account (finance,
// eyewear, water treatment, etc.), so the DNA stays generic and leans on the
// brief + knowledge base for brand specifics rather than hardcoding a vertical.
const IDEAS_SYSTEM_PROMPT = `You are a senior content strategist writing a repurposing plan an experienced marketing lead would sign off on. Output feels like a professional plan, not a brainstorm dump.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON - no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

WRITING RULE - NO EM DASHES: Never use em dashes (-) anywhere in titles, hooks, angles, or any other text you write. Use a hyphen (-), a colon, or restructure the sentence instead.

QUALITY BAR - every idea must clear all of these:
- Fewer, stronger ideas beats a padded list. If you only have 3 defensible ideas, return 3. Never invent an idea just to hit a count.
- Anchored in the source material. If a knowledge base is provided, every idea must lean on a specific fact, quote, framework, data point, or POV drawn from it. Name what you used in "source_support".
- Fits THIS account, THIS speaker/brand voice, THIS audience, THIS industry. Reject any idea that would work equally well for a random other brand - that's the tell for generic.
- Has a real point of view. Every idea states its core insight or thesis in one line - not a topic label ("we'll talk about X"), a claim ("X is wrong because Y").
- Different format for different ideas. Choose from: LinkedIn post, LinkedIn carousel, short video / Reel, blog article, email, FAQ, thought-leadership essay, quote card. Vary formats across the batch so it reads like a real content plan.
- Honest about verification. If a claim needs a stat, a source, or a legal check, call it out in "claims_to_verify" - don't launder it into the copy as if it were confirmed.

TITLES AND HOOKS MUST BE SPECIFIC - not category labels dressed as headlines. Reject and rewrite any title matching:
- "The Ultimate/Complete Guide to X"
- "Everything You Need to Know About X"
- "Top N Tips/Ways/Reasons for X"
- "The Growing Importance/Rise/Future of X"
- "Why X Matters" / "Understanding X" / "Navigating X"
A specific title names a fact, a number, a named product/feature, a real objection, or a concrete scenario - something a reader could not have predicted before seeing the source. If the source doesn't give you enough to hook into for a slot, drop that slot instead of padding.`;

interface IdeasRequest {
  task: 'generate' | 'webinar' | 'seo' | 'seasonal' | 'expand';
  account_label?: string;
  topic?: string;
  audience?: string;
  content_type?: string;
  goal?: string;
  source?: string;
  context?: string;
  text?: string;
  keywords?: string;
  month?: string;
  idea?: Record<string, unknown>;
  output_type?: 'brief' | 'carousel' | 'blog' | 'caption';
  avoid_titles?: string[];
  knowledge_chunks?: KnowledgeChunk[];
  account_id?: string;
}

function kbSection(chunks?: KnowledgeChunk[]): string {
  if (!chunks?.length) return '\nNo knowledge base files provided - use the brief and your expertise.';
  const trimmed = chunks.slice(0, 10).map((c) => ({ ...c, content: c.content.slice(0, 1500) }));
  return `\nKNOWLEDGE BASE (ground brand voice, facts, and compliance in these):\n${trimmed.map((c, i) => `[KB-${i + 1}]\n${c.content}`).join('\n\n')}`;
}

function avoidSection(titles?: string[]): string {
  if (!titles?.length) return '';
  return `\n\nDO NOT REPEAT these past ideas - produce all-new angles, numbers, and segments:\n${titles.slice(0, 40).map((t) => `- ${t}`).join('\n')}`;
}

const IDEA_CARD_SCHEMA = `Each idea object must have EXACTLY these fields. Every field must be specific enough that a writer opens the card and can start producing - no vague labels, no topic strings.

{
  "title": "The exact publishable headline (writer uses verbatim, max ~90 chars). Specific - not a category label.",
  "core_insight": "One sentence stating the point of view or thesis. A real claim, not a topic. E.g. 'Most X onboarding fails because Y, not Z.' - not 'A guide to onboarding.'",
  "why_it_matters": "One or two sentences on why THIS specific audience needs to hear this now - the concrete pain, decision, or moment it speaks to.",
  "format": "Pick the format that best fits the insight: LinkedIn post | LinkedIn carousel | Short video / Reel | Blog article | Email | FAQ | Thought-leadership essay | Quote card",
  "group": "Social | Video | Blog | Email | Seasonal",
  "audience": "The specific target segment (persona name, role, or precise segment - not 'business owners')",
  "hook": "The exact first sentence of the piece. Specific number, tension, or insight. No clichés. Max 200 chars.",
  "structure": ["Beat 1 label", "Beat 2 label", "Beat 3 label", "..."],
  "source_support": "Which source material this leans on. Reference the KB chunk or webinar section, and quote or paraphrase the specific fact/quote/framework you're using. If no KB was provided, name the brief element you're anchored to.",
  "claims_to_verify": ["Any statistic, benchmark, legal claim, or attribution in this idea that needs fact-check or source before publishing. Empty array if everything is directly from the source."],
  "slide_flow": ["For carousels/videos/reels ONLY: per-slide/scene script line. Empty array for single-post formats."],
  "angle": "Data-backed | Myth-buster | Contrarian | Case study | Framework | FAQ | Story | Comparison | ...",
  "why_it_works": "One sentence - the strategic reason this lands with THIS audience.",
  "cta": "One specific next-action: verb + object + destination. Not 'Learn more'.",
  "visual_direction": "One sentence a designer can execute directly.",
  "compliance_reminder": "Any disclaimer or claim risk to watch (empty string if none)",
  "effort": "quick | half-day | full-day",
  "sequence_rank": 1,
  "kpi": "The ONE metric that tells you this piece worked. Specific number where possible. Not 'engagement'.",
  "prerequisites": ["Anything that must be true before publishing - assets, approvals, KB gaps. Empty array if ready to ship."],
  "content_pillar": "The theme/pillar this belongs to",
  "platform_notes": "Format/timing/algorithm tips for the chosen platform",
  "score": 0,
  "scores": { "audience_fit": 0, "clarity": 0, "platform_fit": 0, "conversion_potential": 0, "compliance_safety": 0 }
}

All score values are integers 0-100.

Structure rules:
- "structure" is the beat-by-beat outline of the piece (3-6 beats). Beat labels, not summary sentences.
- "sequence_rank" is 1..N - 1 = ship this FIRST. Rank by timeliness and production readiness.
- No two ideas share the same hook, structure, format, OR angle. Vary the mix.
- Every hook must be publishable AS-IS. If you cannot write a specific hook, don't include the idea.
- "prerequisites" and "claims_to_verify" are honest - empty arrays only when truly nothing needs it.`;

function buildGenerate(b: IdeasRequest): string {
  return `Brand/Account: ${b.account_label || 'General'}
Core topic: ${b.topic || '(none given - infer strong topics from the knowledge base and brief)'}
Target audience: ${b.audience || '(infer the most valuable audience)'}
Preferred format: ${b.content_type || 'Mixed'}
Campaign goal: ${b.goal || 'Awareness'}
Idea source: ${b.source || 'Manual topic'}
Extra direction: ${b.context || 'none'}
${kbSection(b.knowledge_chunks)}${avoidSection(b.avoid_titles)}

Generate UP TO 4 content ideas - fewer if the source or brief can only honestly support fewer. Each must clear the quality bar. Better to return 3 sharp ideas than 4 with one padded.

Diversity requirement: across the batch, span at least 3 different formats from {LinkedIn post, LinkedIn carousel, Short video / Reel, Blog article, Email, FAQ, Thought-leadership essay, Quote card}. Don't return 4 blog posts.

${IDEA_CARD_SCHEMA}

Return ONLY: {"ideas": [ ...ideas... ]}`;
}

function buildWebinar(b: IdeasRequest): string {
  return `Build a professional content repurposing plan from the source below. You are the senior strategist - the deliverable should read like a plan you'd present to the client, not a brainstorm list.

Account/brand: ${b.account_label || 'General'}
${kbSection(b.knowledge_chunks)}

SOURCE CONTENT (webinar / long-form):
${String(b.text || '').slice(0, 12000)}

PLAN RULES:
- Produce 6 to 10 ideas. Fewer if the source honestly only supports fewer. Never invent an idea just to hit a count.
- Every idea must anchor to a SPECIFIC moment, quote, framework, statistic, or example from the source above. Reference it explicitly in "source_support".
- Vary formats across the plan - include a mix from {LinkedIn post, LinkedIn carousel, Short video / Reel, Blog article, Email, FAQ, Thought-leadership essay, Quote card}. Choose the format that best fits each insight; don't force-fit.
- Ideas must fit THIS speaker's POV, THIS audience, THIS industry. If it would work for any random brand, it's generic - drop it.
- Every idea has a real point of view - a claim, not a topic label.
- Flag anything that needs verification in "claims_to_verify".

Each idea object must have these fields:
{
  "title": "Specific, publishable headline. Not a category label.",
  "core_insight": "One sentence stating the POV / thesis. A claim, not a topic.",
  "why_it_matters": "One or two sentences on why THIS audience needs this now - the concrete decision, pain, or moment it addresses.",
  "format": "LinkedIn post | LinkedIn carousel | Short video / Reel | Blog article | Email | FAQ | Thought-leadership essay | Quote card",
  "group": "Social | Video | Blog | Email",
  "funnel_stage": "TOFU | MOFU | BOFU",
  "priority": "high | medium | low",
  "effort": "quick | moderate | substantial",
  "audience": "The specific target segment (persona/role - not 'business owners')",
  "hook": "The exact first line, publishable as-is. Specific - number, tension, or insight.",
  "structure": ["3-6 beat labels for how this piece flows"],
  "source_support": "The specific webinar moment/quote/framework this leans on. Quote or paraphrase the source snippet and (if applicable) name the KB chunk that backs the brand voice or facts.",
  "claims_to_verify": ["Any statistic, benchmark, legal or attribution claim that must be fact-checked before publishing. Empty array if the source directly supports everything."],
  "key_insight": "One-sentence takeaway a reader walks away with",
  "compliance_reminder": "Claim/disclaimer risk (empty string if none)",
  "content_pillar": "Theme"
}

Return ONLY: {"ideas": [ ... ]}`;
}

function buildSeo(b: IdeasRequest): string {
  const kws = String(b.keywords || '').split('\n').map((k) => k.trim()).filter(Boolean).slice(0, 25);
  return `Build an SEO-driven content plan for these target keywords:
${kws.map((k) => `- ${k}`).join('\n')}
${kbSection(b.knowledge_chunks)}

Produce one strong content idea per keyword (or per keyword cluster). Each idea object must have:
{
  "title": "SEO-optimized, click-worthy title",
  "format": "Blog post | Pillar page | Guide | Comparison | FAQ",
  "group": "Blog",
  "keyword": "The primary target keyword",
  "search_intent": "informational | commercial | transactional | navigational",
  "difficulty_tier": "easy | moderate | hard",
  "funnel_stage": "TOFU | MOFU | BOFU",
  "audience": "Who is searching this",
  "description": "100+ words describing the article with suggested H2/H3 structure",
  "long_tail_keywords": ["related long-tail 1", "related long-tail 2"],
  "meta_description": "Under 160 chars",
  "cta": "Specific call-to-action",
  "estimated_word_count": 0,
  "content_pillar": "Theme"
}

Return ONLY: {"ideas": [ ... ]}`;
}

function buildSeasonal(b: IdeasRequest): string {
  const month = b.month || new Date().toISOString().slice(0, 7);
  return `Generate 10 seasonal / timely content ideas for the 3 months starting ${month}.
Account/brand: ${b.account_label || 'General'}. Extra context: ${b.context || 'none'}.
Consider relevant calendar moments for the audience - festivals, financial/tax deadlines, industry events, seasonal buying cycles, and life-stage timing. Prefer India-relevant timing where applicable.
${kbSection(b.knowledge_chunks)}

Each idea object must have:
{
  "title": "Specific, timely headline",
  "format": "Best format for the moment",
  "group": "Seasonal",
  "occasion": "The event / season / deadline this ties to",
  "timing": "Exact publishing window (e.g. 'Publish 2-3 days before Diwali')",
  "audience": "Target segment",
  "description": "What the piece says and why now",
  "urgency": "high | medium | low",
  "content_pillar": "Theme"
}

Return ONLY: {"ideas": [ ... ]}`;
}

function buildExpand(b: IdeasRequest): string {
  const idea = JSON.stringify(b.idea ?? {}, null, 2);
  const type = b.output_type || 'brief';

  const instructions: Record<string, string> = {
    brief: `Produce a production brief a strategist would hand off to a writer and designer. Be specific - no vague direction.
Rules:
- content_structure must list concrete sections with one-line descriptions of what each covers
- success_metrics must be specific and measurable (e.g. "300+ LinkedIn reactions in 48h", not "engagement")
- distribution_plan must name platform, timing, and any cross-posting or repurposing sequence
- seo_notes: primary keyword, 3–5 secondary keywords, and one featured-snippet target question

Return ONLY:
{
  "overview": "2–3 sentences: the core argument + why this audience needs it now",
  "target_audience": "Specific persona: role, situation, pain point",
  "key_messages": ["Message 1 - a specific claim", "Message 2", "Message 3"],
  "content_structure": ["Section 1: what it covers and why", "Section 2: ...", "..."],
  "hook": "The exact first line of the piece (publishable as-is)",
  "visual_mood": "One sentence a designer can execute: colours, imagery style, layout feel",
  "distribution_plan": "Platform(s), publish timing, cross-post or repurpose sequence",
  "success_metrics": ["Specific metric 1", "Specific metric 2"],
  "seo_notes": "Primary keyword, secondary keywords, featured-snippet target"
}`,

    carousel: `Produce a complete, ready-to-design LinkedIn carousel.
Rules:
- Slide 1 is the HOOK: bold claim or problem statement that stops the scroll. Max 15 words headline. 1 sentence body.
- Slides 2–8: exactly ONE insight per slide. Headline (8–12 words) + body (max 40 words). No slide covers two ideas.
- Final slide: CTA. Clear verb + destination. No "like and follow" - give them a reason.
- Caption: 100–200 words. Restate the hook, add 1–2 lines of context, end with CTA. 3–5 hashtags at end.
- design_system: colours, typography style, layout pattern (e.g. "dark background, white headline, indigo accent, centered layout").
- speaker_note: optional voiceover text if the carousel is also a video.

Return ONLY:
{
  "caption": "Full post caption with hashtags",
  "slides": [
    { "slide_number": 1, "type": "hook|insight|cta", "headline": "Slide headline", "body": "Slide body copy (max 40 words)", "visual_note": "What to show on this slide", "speaker_note": "Optional voiceover line" }
  ],
  "design_system": "Specific design direction: colours, type style, layout pattern"
}`,

    blog: `Produce a complete blog/article outline with all on-page SEO assets.
Rules:
- meta_title: under 60 characters, primary keyword near the front
- meta_description: under 160 characters, includes primary keyword and clear value prop
- outline: 4–6 H2 sections + intro + conclusion. One of the H2s MUST be a FAQ section (label it "Frequently Asked Questions") with 5–8 Q&As
- Each H2 heading must be a specific claim or question - NOT a generic label like "Introduction" or "Benefits"
- subpoints: 2–4 concrete bullet points per H2, one idea each
- internal_links: 3–5 topic suggestions where in-content links would fit
- featured_snippet_target: the exact question this article should rank for in Google's featured snippet / AI overview

Return ONLY:
{
  "meta_title": "Under 60 chars with primary keyword",
  "meta_description": "Under 160 chars with keyword and value prop",
  "estimated_word_count": 0,
  "outline": [
    { "heading": "H2 heading - a specific claim or question", "subpoints": ["Concrete bullet 1", "Concrete bullet 2"] }
  ],
  "faq_schema": [
    { "question": "Question targeting a PAA result", "answer": "Concise answer (50–80 words)" }
  ],
  "internal_links": ["Topic suggestion where a link fits naturally", "..."],
  "featured_snippet_target": "The exact question to win in AI overviews / featured snippets",
  "cta": "Specific end-of-article CTA (verb + object)"
}`,

    caption: `Produce ready-to-post captions for each platform. Respect each platform's format and character constraints.
Rules:
- linkedin: 150–300 words. Hook first line. Line break after every 1–2 sentences. Specific CTA last. Max 3 hashtags at end.
- instagram: Under 2,200 characters. Hook first line (appears before "more" cutoff - keep it under 125 chars). 5–10 relevant hashtags at end.
- twitter: Under 280 characters for the opening tweet. Suggest 2–3 thread continuation tweets if the idea warrants it.
- email_subject_lines: 3 options. Each under 50 characters. Vary the angle (curiosity, benefit, urgency). No clickbait.
- email_preheaders: matching preheader (40–80 chars) for each subject line

Return ONLY:
{
  "linkedin": "Full LinkedIn caption with hook, insights, and CTA",
  "instagram": "Full Instagram caption with hook and hashtags",
  "twitter": "Opening tweet (≤280 chars) + optionally 2–3 thread tweets as an array",
  "email_subject_lines": ["Subject line 1 (<50 chars)", "Subject line 2", "Subject line 3"],
  "email_preheaders": ["Preheader matching subject 1 (40–80 chars)", "Preheader 2", "Preheader 3"]
}`,
  };

  return `Expand this content idea into a production-ready ${type} asset.
${kbSection(b.knowledge_chunks)}

IDEA:
${idea}

${instructions[type] || instructions.brief}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  try {
    const body: IdeasRequest = req.body;
    if (!body?.task) return sendError(res, 400, 'missing_task', 'Missing required field: task.');

    let userPrompt: string;
    let maxTokens = 3500;
    let temperature = 0.8;

    switch (body.task) {
      case 'generate': userPrompt = buildGenerate(body); maxTokens = 3000; temperature = 0.85; break;
      case 'webinar':
        if (!body.text?.trim()) return sendError(res, 400, 'missing_text', 'Webinar repurposing requires source text.');
        userPrompt = buildWebinar(body); maxTokens = 3500; temperature = 0.75; break;
      case 'seo':
        if (!body.keywords?.trim()) return sendError(res, 400, 'missing_keywords', 'SEO ideas require at least one keyword.');
        userPrompt = buildSeo(body); maxTokens = 3500; temperature = 0.7; break;
      case 'seasonal': userPrompt = buildSeasonal(body); maxTokens = 3000; temperature = 0.8; break;
      case 'expand':
        if (!body.idea) return sendError(res, 400, 'missing_idea', 'Expand requires an idea object.');
        userPrompt = buildExpand(body); maxTokens = 3500; temperature = 0.6; break;
      default:
        return sendError(res, 400, 'invalid_task', `Invalid task: ${body.task}`);
    }

    const { content: raw, usage } = await callLLM(IDEAS_SYSTEM_PROMPT, userPrompt, { maxTokens, temperature });
    logUsage({ accountId: body.account_id }, 'ideas-lab', usage);

    let parsed: any;
    try {
      parsed = extractJSON(raw);
    } catch {
      const preview = raw.slice(0, 300).replace(/\n/g, ' ');
      return sendError(res, 502, 'parse_error', `Idea generation failed: the model returned an unexpected response. Try again or shorten the input. Preview: "${preview}..."`);
    }

    if (body.task === 'expand') {
      return res.status(200).json({ success: true, task: body.task, output: parsed });
    }

    // Normalize: accept {ideas:[...]}, {items:[...]}, or a bare array
    const rawIdeas = Array.isArray(parsed)
      ? parsed
      : (parsed.ideas || parsed.items || []);

    // Deterministic backstop: a model can ignore the prompt's anti-generic
    // instructions, so re-check every returned idea's title/hook against the
    // same denylist used for Trends. Dropped rather than softened - a
    // shorter batch of real ideas beats a full batch padded with templates.
    const ideas = rawIdeas.filter((idea: any) => !isGenericText(idea?.title, idea?.hook));

    return res.status(200).json({ success: true, task: body.task, ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return sendError(res, 500, 'internal_error', message);
  }
}
