import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

const GROUNDING_SYSTEM_PROMPT = `You are a content intelligence analyst. You MUST follow these grounding rules strictly:

GROUNDING CONTRACT:
1. Every claim, insight, or recommendation you make MUST be directly traceable to the provided source material or knowledge base chunks.
2. You MUST NOT use any world knowledge, assumptions, or information not present in the provided inputs.
3. Every claim must be cited using [Source: <source_title>] for the primary source or [KB: <chunk_reference>] for knowledge base chunks.
4. If the source material is insufficient to support a finding, say so explicitly rather than filling gaps with assumptions.
5. If you are unsure whether a claim is supported, flag it in the warnings array.
6. Do NOT hallucinate statistics, quotes, or facts. Only reference what is explicitly stated in the inputs.

You analyze source content and return structured JSON. Your output must be valid JSON with no markdown wrapping.`;

interface FileContext {
  file_id: string;
  file_name: string;
  category: string;
  structured?: Record<string, unknown>;
}

interface AnalyzeRequest {
  source_text: string;
  source_type: string;
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

    const userPrompt = `Analyze the following source content and return a structured JSON analysis.

SOURCE METADATA:
- Title: ${body.source_title}
- Type: ${body.source_type}
- Owner: ${body.source_owner ?? 'Unknown'}
- URL: ${body.source_url ?? 'N/A'}
${marketingSection}${fileContextSection}${knowledgeSection}${personaSection}

SOURCE CONTENT:
${body.source_text}

Return a JSON object with this exact structure (no markdown code fences, just raw JSON):
{
  "summary": "A concise summary of the source content, citing key points with [Source: ${body.source_title}]",
  "topics": ["topic1", "topic2"],
  "insights": [
    {
      "text": "The insight text with citation [Source: ${body.source_title}]",
      "confidence": "high|medium|low",
      "source_reference": "The specific part of the source that supports this"
    }
  ],
  "persona_matches": [
    {
      "persona_name": "Name of matched persona",
      "relevance_score": 0.0,
      "matching_points": ["point1 [Source: ${body.source_title}]"],
      "suggested_angle": "How to approach content for this persona"
    }
  ],
  "depth_analysis": [
    {
      "topic": "Topic name",
      "depth": "surface|moderate|deep",
      "key_points": ["point with citation"],
      "gaps": ["What the source does not cover"]
    }
  ],
  "opportunities": [
    {
      "title": "Content opportunity title",
      "content_angle": "The specific angle to take, grounded in source [Source: ${body.source_title}]",
      "recommended_format": "blog_post|whitepaper|social_post|email|case_study|infographic|video_script",
      "priority": "high|medium|low",
      "persona_match": "Name of best-fit persona or 'general'",
      "suggested_cta": "Call to action suggestion grounded in source insights",
      "source_context": "Direct quote or paraphrase from source that supports this opportunity"
    }
  ],
  "quality_check": {
    "source_richness": "high|medium|low",
    "actionability": "high|medium|low",
    "uniqueness": "high|medium|low",
    "completeness": "high|medium|low"
  },
  "warnings": ["Any concerns about source quality, potential bias, unsupported claims, or insufficient data"]
}

Remember: every claim must cite [Source: ${body.source_title}] or [KB: chunk_id]. Do not invent or assume anything not in the provided content.`;

    const result = await callLLM(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    let analysis;
    try {
      const cleaned = result.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
      analysis = JSON.parse(cleaned);
    } catch {
      return res.status(502).json({
        error: 'Failed to parse analysis response as JSON',
        raw_response: result,
      });
    }

    return res.status(200).json({ success: true, analysis, id: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    return res.status(500).json({ error: message });
  }
}
