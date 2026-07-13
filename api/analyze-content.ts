import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callLLM } from './_lib/llm';
import { extractJSON } from './_lib/json';
import { handleOptions, sendError } from './_lib/http';
import { requireAuth } from './_lib/auth';
import { logUsage } from './_lib/usage';
import type { FileContext } from './_lib/types';

// ---- Source-archetype rules ----

type Archetype =
  | 'video' | 'blog' | 'webinar' | 'event' | 'trending' | 'research'
  | 'interview' | 'launch' | 'competitor' | 'recurring' | 'weekly_expert_reflection' | 'generic';

interface SourceTypeContext {
  name?: string;
  slug?: string;
  description?: string;
  formats?: string[];
  analysis_guidance?: string;
}

const ARCHETYPE_RULES: Record<Archetype, { focus: string; insight_style: string; format_bias: string; gotchas: string }> = {
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
    gotchas: "Never put words in the customer's mouth. If they gave permission to be quoted, note it; if not, anonymise. Do not exaggerate outcomes.",
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
  weekly_expert_reflection: {
    focus: 'Identify the voice owner (Anil or Rachana). Determine the content shape: is it a single reflection built around one story/metaphor (treat as one connected idea) or a list of distinct observations (treat as multiple points). Extract the core takeaway stripped of the narrative device in one sentence BEFORE touching formats. Check if there is already a companion asset — if the original story/metaphor is being published elsewhere, downstream formats must NOT retell the story, they extract the LESSON only.',
    insight_style: 'Separate the narrative device (puzzle, anecdote, client conversation) from the underlying investing/business point. Write the lesson in one sentence. Every insight must be the extracted lesson, NOT a retelling of the metaphor. Translate any metaphor-specific imagery into direct language. Preserve the original conversational, human sentence rhythm — short sentences, occasional fragments.',
    format_bias: 'Primary formats (almost always use): Voice Page (near-original form, always default), Single-Image Post (only if there is one line that stands alone as a quote without needing context), Carousel (only if the takeaway breaks into 5-8 sequential standalone points — use pointers only, no story retell if story is published elsewhere). Conditional formats (exception, not routine): SEO Blog 600-700 words (only if topic is broad enough to expand with market context, not just stretching the same reflection), Q&A (only if content naturally poses and answers a question). Always schedule into the weekly Social Calendar slot. Do NOT propose Short/Reel, B-roll Video, Conversational Blog, Guide/E-book, or Lead Magnet — this source lacks the depth those formats need.',
    gotchas: 'BIGGEST FAILURE MODE: repeating the metaphor instead of pulling the insight out of it. If the original story is being published as-is on a Voice page or LinkedIn, the carousel/single-image MUST NOT re-narrate the same story. TONE RULES: Plain Indian/British English, no jargon, no filler adjectives. Declarative headlines only, never questions ("Why the hardest part of investing is also the most rewarding" not "Is patience the key to investing?"). No em-dashes — use full stops or commas. BANNED WORDS: Revolutionize, Unlock, Boost, Harness, Elevate, Enhance, Deep Dive, Explore, Delve, Unparalleled, Game changer, Say goodbye. SEBI-compliant disclaimer required ONLY on Blog format and lead-gen-adjacent assets, NOT on single-image or carousel unless it makes a specific return/product claim. Never fabricate stats or numbers not in the source. CAROUSEL METHOD: Each slide must stand alone without needing the previous slide, be 1-2 short lines max, and move the argument forward (setup, tension, resolution, close). Working shape: 1) Hook — core claim stripped of story, 2) Common/easy behaviour, 3) Harder less obvious truth, 4) What that truth looks like in practice, 5) Why sitting through it matters, 6) Payoff/reframe, 7) Close — one memorable quotable line. Default to 6-7 slide tight version.',
  },
  generic: {
    focus: "Follow the source type's description as the primary guide for what to extract.",
    insight_style: 'Ground every insight in a specific line from the source. Prefer specificity over volume.',
    format_bias: "Use the source type's allowed formats list.",
    gotchas: 'Since the archetype is unknown, be conservative: prefer fewer, higher-confidence insights.',
  },
};

const ARCHETYPE_PATTERNS: Array<[Archetype, RegExp]> = [
  ['weekly_expert_reflection', /weekly[_ -]?anil|weekly[_ -]?rachana|anil[_ -]?rachana|anil[_ -]sir|rachana[_ -]?ma'?a?m|weekly[_ -]?expert[_ -]?reflection|anil[_ -]?content|rachana[_ -]?content/i],
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

function detectArchetype(ctx: SourceTypeContext): Archetype {
  const haystack = `${ctx.slug ?? ''} ${ctx.name ?? ''}`.toLowerCase();
  if (!haystack.trim()) return 'generic';
  for (const [arch, pattern] of ARCHETYPE_PATTERNS) if (pattern.test(haystack)) return arch;
  return 'generic';
}

function buildSourceGuidance(ctx: SourceTypeContext): { archetype: Archetype; block: string } {
  const archetype = detectArchetype(ctx);
  const rule = ARCHETYPE_RULES[archetype];
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
  if (archetype === 'weekly_expert_reflection') {
    lines.push('');
    lines.push('WEEKLY ANIL/RACHANA CONTENT PLAYBOOK — MANDATORY RULES:');
    lines.push('');
    lines.push('FORMAT ELIGIBILITY (apply strictly):');
    lines.push('- Voice Page: PRIMARY — almost always used. Publish near-original form. Skip only if explicitly told.');
    lines.push('- Single-Image Post: PRIMARY — use ONLY when one line stands alone as a quote/thought without context. Skip when the core idea needs setup.');
    lines.push('- Carousel: PRIMARY — use ONLY when takeaway breaks into 5-8 sequential standalone points. If original story is published elsewhere, carousel uses straight pointers only (no story retell). Skip when content is one continuous idea that does not survive being chopped.');
    lines.push('- SEO Blog (600-700 words): CONDITIONAL — only when topic is broad enough for market context/examples/data beyond the personal reflection. Most weeks this does NOT apply.');
    lines.push('- Q&A: CONDITIONAL — only when content naturally poses a question and answers it. Most weeks this does NOT apply.');
    lines.push('- Social Calendar slot: ALWAYS — schedule whatever format is chosen.');
    lines.push('- Short/Reel, B-roll Video, Conversational Blog, Guide/E-book, Lead Magnet: NOT STANDARD — only if explicitly requested.');
    lines.push('');
    lines.push('RULE OF THUMB: most weeks = Voice Page + one of (Single Image OR Carousel). Blog and Q&A are the exception.');
    lines.push('');
    lines.push('DECISION FLOW:');
    lines.push('1. Identify voice owner (Anil or Rachana)');
    lines.push('2. Publish to Voice Page (near-original) — always');
    lines.push('3. Extract one-line core lesson (separate from story device)');
    lines.push('4. Is there one quotable standalone line? → Single-Image Post');
    lines.push('5. Can the lesson break into 5-8 sequential points? → Carousel (pointers only, no story retell)');
    lines.push('6. Is topic broad enough for market context beyond the reflection? → Blog (rare)');
    lines.push('7. Schedule chosen format(s) into weekly Social Calendar slot');
    lines.push('');
    lines.push('CAROUSEL SLIDE STRUCTURE (when applicable):');
    lines.push('Slide 1: Hook — core claim, stripped of story');
    lines.push('Slide 2: The common/easy behaviour (what most people do)');
    lines.push('Slide 3: The harder, less obvious truth');
    lines.push('Slide 4: What that harder truth looks like in practice');
    lines.push('Slide 5: Why sitting through that stage matters');
    lines.push('Slide 6: The payoff / reframe');
    lines.push('Slide 7: Close — one memorable line, quotable on its own');
    lines.push('Default to 6-7 slides tight. Each slide: 1-2 short lines, stands alone, moves argument forward.');
  }
  if (ctx.analysis_guidance && ctx.analysis_guidance.trim()) {
    lines.push('');
    lines.push('USER-DEFINED GUIDANCE for this source type (takes priority over the defaults above):');
    lines.push(ctx.analysis_guidance.trim());
  }
  return { archetype, block: lines.join('\n') };
}
// ---- End archetype rules ----

// Brand-agnostic REPURPOSING strategist with STRICT KB grounding.
const GROUNDING_SYSTEM_PROMPT = `You are a senior content repurposing strategist. The user has ONE source piece — a video, blog, webinar, report, interview, whatever — and your job is to plan the derivative content pieces that can be created from it.

CORE MENTAL MODEL: One source → many outputs. You do not invent content; you extract it from the source and shape it using the Knowledge Base.

STRICT KB GROUNDING RULE:
- Every insight, every persona angle, every derivative piece MUST cite the specific KB chunk ID(s) it draws from — in a "kb_reference" array on that item.
- The KB chunks you receive may include: persona/ICP profiles (WHO to target), brand voice (HOW to write), compliance rules (what to AVOID), expert transcripts (authority angles), terminology (exact words to use), and more. ALL of these are relevant — a persona file tells you how to angle the content for a specific audience, even if it is not about the same topic as the source.
- Use EVERY type of KB chunk as grounding: personas/ICPs define the audience angle, brand docs define tone, compliance defines guardrails, expert content provides authority quotes, terminology provides approved language. They ALL ground the output.
- Do NOT fabricate KB content. Do NOT ground in your own training data. Do NOT invent chunk IDs — use only the KB-chunk IDs provided in the KNOWLEDGE BASE CHUNKS section below.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR ROLE (when KB grounding is possible):
- Read the SOURCE TYPE guidance carefully — it defines how a strategist approaches THIS kind of source.
- Extract the reusable raw material FROM THE SOURCE (quotable moments, arguments, stats).
- Shape the repurposing plan using the KB (brand voice, compliance, personas, terminology).
- Every derivative piece must name the exact source moment it repurposes AND cite the KB chunk IDs that back it.
- Respect the SOURCE TYPE's allowed formats list — do not propose formats outside that list.`;

/** Extended FileContext with optional structured metadata used by this endpoint. */
interface AnalyzeFileContext extends FileContext {
  file_id?: string;
  structured?: Record<string, unknown>;
}

interface AnalyzeRequest {
  source_text: string;
  source_type: string;
  source_type_context?: SourceTypeContext;
  source_title: string;
  source_owner?: string;
  source_url?: string;
  marketing_notes?: string;
  knowledge_chunks?: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  file_context?: AnalyzeFileContext[];
  personas?: Array<{ name: string; description: string; pain_points?: string[]; goals?: string[] }>;
  account_id: string;
}

function buildFileContextSection(files: AnalyzeFileContext[]): string {
  if (!files?.length) return '';
  const lines = files.map((f, i) => {
    const s = f.structured as any;
    const summary = s?.summary ? `\n   Summary: ${s.summary}` : '';
    const topics = s?.main_topics?.length ? `\n   Topics: ${s.main_topics.join(', ')}` : '';
    const messages = s?.key_messages?.length ? `\n   Key messages: ${s.key_messages.slice(0, 3).join(' | ')}` : '';
    return `[KB-File-${i + 1}] "${f.file_name}" (${f.category})${summary}${topics}${messages}`;
  });
  return `\n\nKNOWLEDGE BASE FILES:\n${lines.join('\n')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const body: AnalyzeRequest = req.body;
    body.account_id = auth.accountId;

    if (!body.source_text || !body.source_type || !body.source_title || !body.account_id) {
      return res.status(400).json({
        error: 'Missing required fields: source_text, source_type, source_title, and account_id are required.',
      });
    }

    // Strict KB grounding: refuse cleanly if the client sent no chunks.
    // The client already filters for relevance — an empty array means
    // "the KB has nothing relevant to this source".
    if (!body.knowledge_chunks?.length) {
      return res.status(200).json({
        success: true,
        analysis: {
          refused: true,
          summary: "I don't have that idea in the knowledge base.",
          reason: "Add relevant knowledge files (persona, brand, guidelines, expert, or terminology) that cover this source's topic. I can only generate content that is grounded in your KB.",
          topics: [],
          insights: [],
          persona_matches: [],
          depth_analysis: [],
          opportunities: [],
          quality_check: {},
          warnings: ["Analysis refused: no relevant knowledge base content."],
        },
        id: null,
      });
    }

    const fileContextSection = body.file_context?.length ? buildFileContextSection(body.file_context) : '';
    const knowledgeSection = `\n\nKNOWLEDGE BASE CHUNKS (the ONLY grounding source you may use — cite these IDs in kb_reference on every output item):\n${body.knowledge_chunks.map((chunk, i) => `[KB-${i + 1}: ${chunk.id}]\n${chunk.content}`).join('\n\n')}`;

    const personaSection = body.personas?.length
      ? `\n\nTARGET PERSONAS:\n${body.personas.map((p) => `- ${p.name}: ${p.description}${p.pain_points?.length ? `\n  Pain points: ${p.pain_points.join(', ')}` : ''}${p.goals?.length ? `\n  Goals: ${p.goals.join(', ')}` : ''}`).join('\n')}`
      : '';

    const marketingSection = body.marketing_notes
      ? `\n\nMARKETING NOTES:\n${body.marketing_notes}`
      : '';

    const guidance = buildSourceGuidance(body.source_type_context ?? { name: body.source_type });
    const formatsHint = body.source_type_context?.formats?.length
      ? ` Choose "recommended_format" from: ${body.source_type_context.formats.join(', ')}.`
      : '';

    const userPrompt = `Design a repurposing plan for this one source piece.

SOURCE: "${body.source_title}" — ${body.source_type} by ${body.source_owner ?? 'Unknown'}

${guidance.block}
${marketingSection}${fileContextSection}${knowledgeSection}${personaSection}

SOURCE CONTENT:
${String(body.source_text).slice(0, 12000)}

---
Return ONE JSON object. Every insight, persona angle, and derivative piece MUST cite the KB chunk IDs (from the list above) that ground it, in a "kb_reference" array.

The KB chunks above may include personas, ICPs, brand voice, compliance rules, expert transcripts, or terminology. ALL are valid grounding — a persona file grounds your AUDIENCE ANGLE, a brand file grounds your TONE, compliance grounds your GUARDRAILS. Use them all.

Use these fields:

- "summary": 2-3 sentences describing what this source is about, what makes it repurposable, and any risk to flag.
- "topics": 3-6 specific topic strings extracted from the source (concrete, not generic).
- "insights": 4-6 items. Each: "text" (specific, not restated), "confidence" (high/medium/low), "source_reference" (short direct quote from the SOURCE), "kb_reference" (array of KB chunk IDs from above that ground this insight — MUST NOT be empty).
- "persona_matches": one per persona, or inferred. Each: "persona_name", "relevance_score" (0.0-1.0), "matching_points" (array), "suggested_angle" (specific hook, not a topic), "kb_reference" (array of KB chunk IDs from above — MUST NOT be empty).
- "depth_analysis": for each major topic — "topic", "depth" (surface/moderate/deep), "key_points" (array), "gaps" (array of what the source doesn't cover — each gap is a potential follow-up piece).
- "opportunities": 5-8 DERIVATIVE CONTENT PIECES repurposed from the source. Vary format, funnel stage, audience. Each piece must be PRODUCTION-READY — a marketer should be able to open it and start writing.
    - "title": the exact publishable headline / caption. A writer uses this verbatim. Not a topic label. (max ~90 chars)
    - "hook": the exact opening sentence of the piece — the first line the reader sees. Specific, punchy, no clichés. (max 200 chars)
    - "structure": array of 3-6 short strings, each describing ONE beat/section of the piece in order. Example for a blog: ["Cold open with the counter-intuitive stat", "Contrast: what most people believe", "The evidence: 3 examples from source", "What to do differently this week", "CTA"]. Not summary sentences — beat labels a writer can turn into paragraphs.
    - "content_angle": one sentence — what makes this piece distinct from the source and from the other pieces in this plan.
    - "recommended_format": the output format.${formatsHint}
    - "priority": high/medium/low — how important is this piece in the plan?
    - "sequence_rank": integer 1-N. 1 = ship this FIRST. Rank by (a) timeliness and (b) production readiness — a quick-turn hero piece ranks above a deep case study.
    - "effort": one of "quick" (under 1 hour), "half-day", "full-day" — realistic production time.
    - "persona_match": target persona name.
    - "suggested_cta": one specific next-action for the reader (verb + object + destination, e.g., "Book a 20-min portfolio review at rh.com/review").
    - "kpi": the ONE metric that tells you this piece worked (e.g., "3+ replies from HNI segment", "click-through rate > 4%", "5 booked calls within 7 days"). Be specific, not "engagement".
    - "prerequisites": array of things that must be true before publishing. Empty array if ready to ship. Examples: "Upload approved disclaimer for AIF claims", "Get founder quote for the second beat", "Design team confirms carousel template exists".
    - "source_context": the exact moment (quote/stat/section) in the source this piece repurposes. This is the traceability link.
    - "kb_reference": array of KB chunk IDs from above that ground this piece — MUST NOT be empty.
- "quality_check": rate source_richness/actionability/uniqueness/completeness as high/medium/low.
- "warnings": compliance concerns, factual risks, or brand-fit issues worth flagging (empty array if none).

Rules that make the plan usable:
- No two opportunities may share the same hook or the same structure — every piece is materially different.
- Every hook must be publishable AS-IS. If you can't write a specific hook, don't include the piece.
- The "prerequisites" field is honest — if a piece needs an approval or asset you can't see, list it. Empty array only when the writer could truly ship today.
- Sequence must reflect real priority — do not rank arbitrarily.
- Every item MUST cite at least one KB chunk. Persona/ICP chunks count — they ground WHO the piece is for.

Output ONLY raw JSON.`;

    const { content: raw, usage } = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8192,
      temperature: 0.35,
    });
    logUsage(auth, 'analyze-content', usage);

    let analysis;
    try {
      analysis = extractJSON(raw);
    } catch {
      const preview = raw.slice(0, 300).replace(/\n/g, ' ');
      return res.status(502).json({
        error: `Analysis failed: the model returned an unexpected response. Try with shorter content or fewer knowledge files. Preview: "${preview}..."`,
      });
    }

    return res.status(200).json({ success: true, analysis, id: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
