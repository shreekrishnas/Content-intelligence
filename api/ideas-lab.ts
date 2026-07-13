import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

// Brand-agnostic content strategist. This app is multi-account (finance,
// eyewear, water treatment, etc.), so the DNA stays generic and leans on the
// brief + knowledge base for brand specifics rather than hardcoding a vertical.
const IDEAS_SYSTEM_PROMPT = `You are a senior content strategist and ideation engine for a marketing team. You turn a brief into specific, production-ready content ideas that a team can execute immediately.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

HOW YOU WORK:
- Every idea must be specific and concrete — a real headline, a real angle, a real hook. Never generic templates.
- Ground brand voice, product facts, and compliance in the provided knowledge base when available; otherwise use the brief and your expertise.
- Vary format, angle, funnel stage, and audience segment across the batch — no two ideas should feel like the same idea reworded.
- Write hooks that lead with a specific number, tension, or insight — not a vague promise.
- Be honest about compliance: flag risky claims rather than making them.`;

function extractJSON(text: string): unknown {
  const stripped = text
    .replace(/^```(?:json|javascript|js)?\s*\n?/gim, '')
    .replace(/\n?```\s*$/gim, '')
    .trim();
  try { return JSON.parse(stripped); } catch { /* try array/object extraction */ }
  // Try both object and array bounds
  const candidates: Array<[number, number]> = [];
  const ob = stripped.indexOf('{'); const cb = stripped.lastIndexOf('}');
  if (ob !== -1 && cb > ob) candidates.push([ob, cb]);
  const oa = stripped.indexOf('['); const ca = stripped.lastIndexOf(']');
  if (oa !== -1 && ca > oa) candidates.push([oa, ca]);
  for (const [s, e] of candidates) {
    try { return JSON.parse(stripped.slice(s, e + 1)); } catch { /* next */ }
  }
  throw new Error('The model returned a response that could not be parsed as JSON. Please try again.');
}

interface KnowledgeChunk { id: string; content: string }

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
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: { maxTokens?: number; temperature?: number } = {},
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');

  const model = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  const maxTokens = options.maxTokens ?? 6000;
  const temperature = options.temperature ?? 0.8;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000);
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
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 429) { lastError = new Error('Rate limit reached. Please wait a moment and try again.'); continue; }
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
      if (error instanceof Error && error.message.includes('Rate limited')) { lastError = error; continue; }
      throw error;
    }
  }
  throw lastError ?? new Error('Failed to call LLM after retries');
}

function kbSection(chunks?: KnowledgeChunk[]): string {
  if (!chunks?.length) return '\nNo knowledge base files provided — use the brief and your expertise.';
  const trimmed = chunks.slice(0, 10).map((c) => ({ ...c, content: c.content.slice(0, 1500) }));
  return `\nKNOWLEDGE BASE (ground brand voice, facts, and compliance in these):\n${trimmed.map((c, i) => `[KB-${i + 1}]\n${c.content}`).join('\n\n')}`;
}

function avoidSection(titles?: string[]): string {
  if (!titles?.length) return '';
  return `\n\nDO NOT REPEAT these past ideas — produce all-new angles, numbers, and segments:\n${titles.slice(0, 40).map((t) => `- ${t}`).join('\n')}`;
}

const IDEA_CARD_SCHEMA = `Each idea object must have EXACTLY these fields. Every field must be specific enough that a writer opens the card and can start producing — no vague labels, no topic strings.

{
  "title": "The exact publishable headline (a writer uses this verbatim, max ~90 chars)",
  "format": "One concrete format: LinkedIn carousel | Instagram Reel | Blog post | Email | Short video | Quote card | ...",
  "group": "Social | Video | Blog | Email | Seasonal",
  "audience": "The specific target segment (persona name or precise segment — not 'business owners')",
  "hook": "The exact first sentence of the piece. Specific number, tension, or insight. No clichés. Max 200 chars.",
  "structure": ["Beat 1 label", "Beat 2 label", "Beat 3 label", "..."],
  "slide_flow": ["For carousels/videos ONLY: per-slide script line. Empty array for single-post formats."],
  "angle": "Data-backed | Myth-buster | Contrarian | Case study | Framework | FAQ | Story | Comparison | ...",
  "why_it_works": "One sentence — the psychological or strategic reason this lands with THIS audience.",
  "cta": "One specific next-action: verb + object + destination. Not 'Learn more'.",
  "visual_direction": "One sentence a designer can execute directly.",
  "compliance_reminder": "Any disclaimer or claim risk to watch (empty string if none)",
  "effort": "quick | half-day | full-day",
  "sequence_rank": 1,
  "kpi": "The ONE metric that tells you this piece worked. Specific number where possible. Not 'engagement'.",
  "prerequisites": ["Anything that must be true before publishing — assets, approvals, KB gaps. Empty array if ready to ship."],
  "content_pillar": "The theme/pillar this belongs to",
  "platform_notes": "Format/timing/algorithm tips for the chosen platform",
  "score": 0,
  "scores": { "audience_fit": 0, "clarity": 0, "platform_fit": 0, "conversion_potential": 0, "compliance_safety": 0 }
}

All score values are integers 0-100.

Structure rules:
- "structure" is the beat-by-beat outline of the piece (3-6 beats). Beat labels, not summary sentences.
- "sequence_rank" is 1..N — 1 = ship this FIRST. Rank by timeliness and production readiness.
- No two ideas may share the same hook or the same structure. Every idea is materially different.
- Every hook must be publishable AS-IS. If you cannot write a specific hook, don't include the idea.
- "prerequisites" is honest — empty array only when the writer could truly ship today.`;

function buildGenerate(b: IdeasRequest): string {
  return `Brand/Account: ${b.account_label || 'General'}
Core topic: ${b.topic || '(none given — infer strong topics from the knowledge base and brief)'}
Target audience: ${b.audience || '(infer the most valuable audience)'}
Preferred format: ${b.content_type || 'Mixed'}
Campaign goal: ${b.goal || 'Awareness'}
Idea source: ${b.source || 'Manual topic'}
Extra direction: ${b.context || 'none'}
${kbSection(b.knowledge_chunks)}${avoidSection(b.avoid_titles)}

Generate 6 diverse, production-ready content ideas. ${IDEA_CARD_SCHEMA}

Return ONLY: {"ideas": [ ...6 idea objects... ]}`;
}

function buildWebinar(b: IdeasRequest): string {
  return `Repurpose the following webinar/long-form content into 15-18 diverse content pieces spanning the funnel.
Aim for a mix: ~4 LinkedIn posts, ~3 carousels, ~3 short videos, ~2 blog articles, ~2 email sequences, ~2 quote cards.
${kbSection(b.knowledge_chunks)}

SOURCE CONTENT:
${String(b.text || '').slice(0, 12000)}

Each idea object must have these fields:
{
  "title": "Specific headline",
  "format": "LinkedIn post | Carousel | Short video | Blog article | Email sequence | Quote card",
  "group": "Social | Video | Blog | Email",
  "funnel_stage": "TOFU | MOFU | BOFU",
  "priority": "high | medium | low",
  "effort": "quick | moderate | substantial",
  "audience": "Target segment",
  "hook": "Scroll-stopping opener",
  "description": "80+ words on what this piece is and how to make it",
  "key_insight": "The core takeaway drawn from the source",
  "compliance_reminder": "Claim/disclaimer risk (empty if none)",
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
Consider relevant calendar moments for the audience — festivals, financial/tax deadlines, industry events, seasonal buying cycles, and life-stage timing. Prefer India-relevant timing where applicable.
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
  const schemas: Record<string, string> = {
    brief: `{
  "overview": "2-3 sentences",
  "target_audience": "Detailed persona",
  "key_messages": ["msg1", "msg2", "msg3"],
  "content_structure": ["section 1", "section 2", "..."],
  "visual_mood": "Design/mood direction",
  "distribution_plan": "Where and how to publish",
  "success_metrics": ["metric1", "metric2"],
  "seo_notes": "Keywords / on-page notes"
}`,
    carousel: `{
  "caption": "The post caption",
  "slides": [ { "headline": "Slide headline", "body": "Slide body copy", "visual_note": "What to show", "speaker_note": "Optional voiceover" } ],
  "design_system": "Colors, type, layout guidance"
}`,
    blog: `{
  "meta_title": "Under 60 chars",
  "meta_description": "Under 160 chars",
  "outline": [ { "heading": "H2", "subpoints": ["H3 or bullet", "..."] } ],
  "faq_schema": [ { "question": "Q", "answer": "A" } ],
  "internal_links": ["suggested topic 1", "suggested topic 2"],
  "featured_snippet_target": "The question/snippet to win"
}`,
    caption: `{
  "linkedin": "Ready-to-post LinkedIn caption",
  "instagram": "Ready-to-post Instagram caption",
  "twitter": "Ready-to-post X/Twitter post or thread opener",
  "email_subject_lines": ["subject 1", "subject 2", "subject 3"]
}`,
  };
  return `Expand this content idea into a full ${type} asset.
${kbSection(b.knowledge_chunks)}

IDEA:
${idea}

Return ONLY a JSON object with this shape:
${schemas[type] || schemas.brief}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: IdeasRequest = req.body;
    if (!body?.task) return res.status(400).json({ error: 'Missing required field: task.' });

    let userPrompt: string;
    let maxTokens = 6000;
    let temperature = 0.8;

    switch (body.task) {
      case 'generate': userPrompt = buildGenerate(body); maxTokens = 5000; temperature = 0.85; break;
      case 'webinar':
        if (!body.text?.trim()) return res.status(400).json({ error: 'Webinar repurposing requires source text.' });
        userPrompt = buildWebinar(body); maxTokens = 6000; temperature = 0.75; break;
      case 'seo':
        if (!body.keywords?.trim()) return res.status(400).json({ error: 'SEO ideas require at least one keyword.' });
        userPrompt = buildSeo(body); maxTokens = 7000; temperature = 0.7; break;
      case 'seasonal': userPrompt = buildSeasonal(body); maxTokens = 5000; temperature = 0.8; break;
      case 'expand':
        if (!body.idea) return res.status(400).json({ error: 'Expand requires an idea object.' });
        userPrompt = buildExpand(body); maxTokens = 6000; temperature = 0.6; break;
      default:
        return res.status(400).json({ error: `Invalid task: ${body.task}` });
    }

    const result = await callLLM(IDEAS_SYSTEM_PROMPT, userPrompt, { maxTokens, temperature });

    let parsed: any;
    try {
      parsed = extractJSON(result);
    } catch {
      const preview = result.slice(0, 300).replace(/\n/g, ' ');
      return res.status(502).json({
        error: `Idea generation failed: the model returned an unexpected response. Try again or shorten the input. Preview: "${preview}..."`,
      });
    }

    if (body.task === 'expand') {
      return res.status(200).json({ success: true, task: body.task, output: parsed });
    }

    // Normalize: accept {ideas:[...]}, {items:[...]}, or a bare array
    const ideas = Array.isArray(parsed)
      ? parsed
      : (parsed.ideas || parsed.items || []);
    return res.status(200).json({ success: true, task: body.task, ideas });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
