import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildSourceGuidance, type SourceTypeContext } from '../lib/source-archetypes';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

// Brand-agnostic REPURPOSING strategist. The app runs across many
// verticals (finance, eyewear, 3D printing, water treatment, IT services)
// — brand specifics come from the KB and the source-type guidance block.
const GROUNDING_SYSTEM_PROMPT = `You are a senior content repurposing strategist. The user has ONE source piece — a video, blog, webinar, report, interview, whatever — and your job is to plan the derivative content pieces that can be created from it.

CORE MENTAL MODEL: One source → many outputs. You are not writing the pieces; you are designing the plan. Every output you propose must trace back to a specific moment, quote, stat, or argument in the source.

CRITICAL OUTPUT RULE: respond with ONLY raw JSON — no markdown fences, no prose before or after. Your entire response must be parseable by JSON.parse().

YOUR ROLE:
- Read the SOURCE TYPE guidance carefully — it defines how a strategist approaches THIS kind of source (a webinar is repurposed differently than a competitor blog).
- Extract the reusable raw material: quotable moments, load-bearing arguments, killer stats, contradiction points, verbatim customer language.
- Design a REPURPOSING PLAN: distinct derivative pieces across formats, audiences, and funnel stages — no two pieces should be the same idea reworded.
- Every derivative piece must name the exact source moment it repurposes (a quote, a stat, a section).
- Respect the SOURCE TYPE's allowed formats list — do not propose formats outside that list.
- Brand voice, compliance, and terminology come from the KB (when provided) — respect them. If a source moment conflicts with KB compliance, flag it in warnings.`;

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

    const fileContextSection = body.file_context?.length ? buildFileContextSection(body.file_context) : '';
    const knowledgeSection = body.knowledge_chunks?.length
      ? `\n\nKNOWLEDGE BASE CHUNKS:\n${body.knowledge_chunks.map((chunk, i) => `[KB-${i + 1}: ${chunk.id}]\n${chunk.content}`).join('\n\n')}`
      : '';

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
Return ONE JSON object with these fields. Every derivative piece MUST trace back to a specific moment/quote in the source above.

- "summary": 2-3 sentences describing what this source is about, what makes it repurposable, and any risk to flag.
- "topics": 3-6 specific topic strings extracted from the source (concrete, not generic).
- "insights": 4-6 acts of specific value from the source — surprising claims, sharp quotes, load-bearing arguments, or stats. "text" must be specific (not restated); "confidence" is high/medium/low; "source_reference" is a short direct quote from the source.
- "persona_matches": which listed persona each derivative angle serves best (or inferred if no personas were provided). "relevance_score" 0.0-1.0. "suggested_angle" must be a specific hook — not a topic.
- "depth_analysis": for each major topic, rate depth as surface/moderate/deep, list the specific points made, and list the gaps the source leaves open (each gap = a potential follow-up piece).
- "opportunities": 5-8 DERIVATIVE CONTENT PIECES repurposed from the source. Prioritise variety across format, funnel stage, and audience. Each piece:
    - "title": the exact publishable headline / caption (specific, compelling — a writer could use it verbatim)
    - "content_angle": what makes this piece distinct from the source and from the other pieces
    - "recommended_format": the output format.${formatsHint}
    - "priority": high/medium/low
    - "persona_match": which target persona this piece serves
    - "suggested_cta": specific next-action for the reader
    - "source_context": the exact moment (quote / stat / section) in the source this piece repurposes — this is the traceability link
- "quality_check": rate source_richness/actionability/uniqueness/completeness as high/medium/low
- "warnings": compliance concerns, factual risks, or brand-fit issues worth flagging (empty array if none)

Output ONLY the raw JSON object, no fences, no extra text.`;

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
