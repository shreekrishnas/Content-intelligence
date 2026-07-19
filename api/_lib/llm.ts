const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 2000; // 2s → 4s → 8s
const DEFAULT_TIMEOUT_MS = 90_000;
const FALLBACK_TIMEOUT_MS = 45_000;

export interface CallLLMOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  /** Internal: set when already running on the fallback model. */
  _isFallback?: boolean;
}

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
  model: string;
}

export interface CallLLMResult {
  content: string;
  usage: LLMUsage;
}

function isRetryableStatus(status: number): boolean {
  // 429 rate limit; 5xx transient upstream failures (incl. Anthropic 529
  // "overloaded" passed through by OpenRouter).
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 529;
}

export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  options: CallLLMOptions = {},
): Promise<CallLLMResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured. Add it in Vercel Environment Variables.');

  const primaryModel = process.env.LLM_MODEL ?? 'anthropic/claude-sonnet-4-5';
  const fallbackModel = process.env.LLM_FALLBACK_MODEL ?? 'anthropic/claude-haiku-4.5';
  const model = options._isFallback ? fallbackModel : primaryModel;
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;
  const timeoutMs = options.timeoutMs ?? (options._isFallback ? FALLBACK_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1)));
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(OPENROUTER_API_URL, {
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
      } finally {
        clearTimeout(timeout);
      }

      if (isRetryableStatus(response.status)) {
        lastError = new Error(
          response.status === 429
            ? 'Rate limit reached. Please wait a moment and try again.'
            : `LLM service temporarily unavailable (${response.status}).`,
        );
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
          msg = `LLM service error (${response.status})`;
        }
        throw new Error(msg);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content in LLM response');

      const usage: LLMUsage = {
        input_tokens: data.usage?.prompt_tokens ?? 0,
        output_tokens: data.usage?.completion_tokens ?? 0,
        model,
      };

      return { content, usage };
    } catch (error) {
      const isAbort = error instanceof Error && (error.name === 'AbortError' || /aborted/i.test(error.message));
      if (isAbort) {
        // Hard timeout hit. Rather than failing the whole request, retry once
        // on a smaller, faster model — a good answer late beats no answer.
        if (!options._isFallback && fallbackModel && fallbackModel !== primaryModel) {
          console.warn(`[llm] ${model} timed out after ${timeoutMs}ms — falling back to ${fallbackModel}`);
          return callLLM(systemPrompt, userPrompt, { ...options, _isFallback: true, timeoutMs: undefined });
        }
        throw new Error('The AI service timed out. Please try again — if it persists, the request may be too large.');
      }
      if (error instanceof Error && (error.message.includes('Rate limit') || error.message.includes('temporarily unavailable'))) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  // Retries exhausted on rate limits / transient errors. Try the fallback
  // model once before giving up — it usually sits in a different capacity
  // pool than the primary.
  if (!options._isFallback && fallbackModel && fallbackModel !== primaryModel) {
    console.warn(`[llm] ${model} exhausted retries (${lastError?.message}) — trying fallback ${fallbackModel}`);
    return callLLM(systemPrompt, userPrompt, { ...options, _isFallback: true, timeoutMs: undefined });
  }
  throw lastError ?? new Error('Failed to call LLM after retries');
}
