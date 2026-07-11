import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

// ---- Inlined source-archetype rules (previously imported from
// ../lib/source-archetypes.ts). Inlined so Vercel definitely bundles it. ----

type Archetype =
  | 'video' | 'blog' | 'webinar' | 'event' | 'trending' | 'research'
  | 'interview' | 'launch' | 'competitor' | 'recurring' | 'generic';

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
  generic: {
    focus: "Follow the source type's description as the primary guide for what to extract.",
    insight_style: 'Ground every insight in a specific line from the source. Prefer specificity over volume.',
    format_bias: "Use the source type's allowed formats list.",
    gotchas: 'Since the archetype is unknown, be conservative: prefer fewer, higher-confidence insights.',
  },
};

const ARCHETYPE_PATTERNS: Array<[Archetype, RegExp]> = [
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
  if (ctx.analysis_guidance && ctx.analysis_guidance.trim()) {
    lines.push('');
    lines.push('USER-DEFINED GUIDANCE for this source type (takes priority over the defaults above):');
    lines.push(ctx.analysis_guidance.trim());
  }
  return { archetype, block: lines.join('\n') };
}
// ---- End inlined archetype rules ----

// Brand-agnostic REPURPOSING strategist with STRICT KB grounding.
const GROUNDING_SYSTEM_PROMPT = `You are a senior content repurposing strategist. The user has ONE source piece — a video, blog, webinar, report, interview, whatever — and your job is to plan the derivative content pieces that can be created from it.

CORE MENTAL MODEL: One source → many outputs. You do not invent content; you extract it from the source and shape it using the Knowledge Base.

STRICT KB GROUNDING RULE:
- Every insight, every persona angle, every derivative piece MUST cite the specific KB chunk ID(s) it draws from — in a "kb_reference" array on that item.
- If the KB has NO relevant chunks that support an item, DO NOT include that item.
- If the KB has NO relevant chunks that support ANY item (the source topic is not covered by this account's KB), return this exact refusal object and nothing else:
  {"refused": true, "reason": "I don't have that idea in the knowledge base. Add relevant knowledge files that cover this source's topic — I can only generate content that is grounded in your KB."}
- Do NOT fabricate KB content. Do NOT ground in your own training data. Do NOT invent chunk IDs — use only the KB-chunk IDs provided in the KNOWLEDGE BASE CHUNKS section below.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR ROLE (when KB grounding is possible):
- Read the SOURCE TYPE guidance carefully — it defines how a strategist approaches THIS kind of source.
- Extract the reusable raw material FROM THE SOURCE (quotable moments, arguments, stats).
- Shape the repurposing plan using the KB (brand voice, compliance, personas, terminology).
- Every derivative piece must name the exact source moment it repurposes AND cite the KB chunk IDs that back it.
- Respect the SOURCE TYPE's allowed formats list — do not propose formats outside that list.`;

function extractJSON(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json|javascript|js)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* try brace extraction */ }
  const s = stripped.indexOf('{');
  const e = stripped.lastIndexOf('}');
  if (s !== -1 && e > s) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* fall through */ }
  }
  throw new Error('LLM returned a response that could not be parsed as JSON. Please try again.');
}

interface FileContext {
  file_id: string;
  file_name: string;
  category: string;
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
  file_context?: FileContext[];
  personas?: Array<{ name: string; description: string; pain_points?: string[]; goals?: string[] }>;
  account_id: string;
}

function buildFileContextSection(files: FileContext[]): string {
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

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');
  }

  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

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
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.status === 429) {
        lastError = new Error('Rate limit reached. Please wait a moment and try again.');
        continue;
      }
      if (!response.ok) {
        let msg: string;
        try {
          const body = await response.json();
          const detail = body?.error?.message || 'Unknown error';
          if (response.status === 401) msg = 'Invalid API key. Check your OPENROUTER_API_KEY in Vercel Environment Variables.';
          else if (response.status === 402) msg = 'OpenRouter account has insufficient credits. Add credits at openrouter.ai.';
          else if (response.status === 404) msg = `Model not found on OpenRouter. Set a valid LLM_MODEL in Vercel Environment Variables. Detail: ${detail}`;
          else msg = `LLM service error (${response.status}): ${detail}`;
        } catch {
          msg = `LLM service error (${response.status}). Please try again.`;
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in LLM response');
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.includes('Rate limited')) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Failed to call LLM after retries');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body: AnalyzeRequest = req.body;

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

If the KB chunks above do not cover the source topic in any meaningful way, return this exact refusal and nothing else:
{"refused": true, "reason": "I don't have that idea in the knowledge base. Add relevant knowledge files that cover this source's topic — I can only generate content that is grounded in your KB."}

Otherwise, use these fields:

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
- Do NOT include any item you cannot cite a KB chunk for. If you cannot cite ANYTHING, return the refusal object above.

Output ONLY raw JSON.`;

    const result = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8192,
      temperature: 0.35,
    });

    let analysis;
    try {
      analysis = extractJSON(result);
    } catch {
      const preview = result.slice(0, 300).replace(/\n/g, ' ');
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
