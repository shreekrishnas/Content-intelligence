import { corsHeaders } from '../_shared/cors.ts';
import { callClaude } from '../_shared/claude.ts';

const GROUNDING_SYSTEM_PROMPT = `You are a content intelligence analyst. You MUST follow these grounding rules strictly:

GROUNDING CONTRACT:
1. Every claim, insight, or recommendation you make MUST be directly traceable to the provided source material or knowledge base chunks.
2. You MUST NOT use any world knowledge, assumptions, or information not present in the provided inputs.
3. Every claim must be cited using [Source: <source_title>] for the primary source or [KB: <chunk_reference>] for knowledge base chunks.
4. If the source material is insufficient to support a finding, say so explicitly rather than filling gaps with assumptions.
5. If you are unsure whether a claim is supported, flag it in the warnings array.
6. Do NOT hallucinate statistics, quotes, or facts. Only reference what is explicitly stated in the inputs.

You analyze source content and return structured JSON. Your output must be valid JSON with no markdown wrapping.`;

interface AnalyzeRequest {
  source_text: string;
  source_type: string;
  source_title: string;
  source_owner?: string;
  source_url?: string;
  marketing_notes?: string;
  knowledge_chunks?: Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  personas?: Array<{ name: string; description: string; pain_points?: string[]; goals?: string[] }>;
  account_id: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body: AnalyzeRequest = await req.json();

    // Validate required fields
    if (!body.source_text || !body.source_type || !body.source_title || !body.account_id) {
      return new Response(
        JSON.stringify({
          error: 'Missing required fields: source_text, source_type, source_title, and account_id are required.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Build the user prompt with all available context
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
${marketingSection}${knowledgeSection}${personaSection}

SOURCE CONTENT:
${body.source_text}

Return a JSON object with this exact structure (no markdown code fences, just raw JSON):
{
  "summary": "A concise summary of the source content, citing key points with [Source: ${body.source_title}]",
  "topics": ["topic1", "topic2", ...],
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
      "relevance_score": 0.0-1.0,
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

    const result = await callClaude(GROUNDING_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 8192,
      temperature: 0.2,
    });

    // Parse the JSON response from Claude
    let analysis;
    try {
      // Strip markdown code fences if Claude included them despite instructions
      const cleaned = result.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
      analysis = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({
          error: 'Failed to parse analysis response as JSON',
          raw_response: result,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, analysis }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    const status = message.includes('Missing required fields') ? 400 : 500;

    return new Response(
      JSON.stringify({ error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
