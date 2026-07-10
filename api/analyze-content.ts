import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSourceGuidance, type SourceTypeContext } from '../lib/source-archetypes';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

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
- "opportunities": 5-8 DERIVATIVE CONTENT PIECES repurposed from the source. Vary format, funnel stage, audience. Each piece:
    - "title": exact publishable headline/caption (a writer could use it verbatim)
    - "content_angle": what makes this piece distinct from the source and from the other pieces
    - "recommended_format": the output format.${formatsHint}
    - "priority": high/medium/low
    - "persona_match": target persona
    - "suggested_cta": specific next-action for the reader
    - "source_context": the exact moment (quote/stat/section) in the source this piece repurposes
    - "kb_reference": array of KB chunk IDs from above that ground this piece — MUST NOT be empty
- "quality_check": rate source_richness/actionability/uniqueness/completeness as high/medium/low.
- "warnings": compliance concerns, factual risks, or brand-fit issues worth flagging (empty array if none).

Do NOT include any item you cannot cite a KB chunk for. If you cannot cite ANYTHING, return the refusal object above. Output ONLY raw JSON.`;

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
