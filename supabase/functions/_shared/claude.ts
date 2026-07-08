const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1000;

interface CallClaudeOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Calls the Claude API with retry logic for rate limits.
 * Returns the text content from the first text block in the response.
 */
export async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  options: CallClaudeOptions = {},
): Promise<string> {
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured. Set it in your Supabase Edge Function secrets.');
  }

  const model = options.model ?? Deno.env.get('LLM_MODEL') ?? 'claude-sonnet-4-20250514';
  const maxTokens = options.maxTokens ?? 4096;
  const temperature = options.temperature ?? 0.3;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt },
          ],
        }),
      });

      if (response.status === 429) {
        lastError = new Error(`Rate limited by Anthropic API (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        continue;
      }

      if (response.status === 529) {
        lastError = new Error(`Anthropic API overloaded (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errorBody}`);
      }

      const data = await response.json();

      const textBlock = data.content?.find(
        (block: { type: string }) => block.type === 'text',
      );

      if (!textBlock) {
        throw new Error('No text content in Claude response');
      }

      return textBlock.text;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes('Rate limited') || error.message.includes('overloaded'))
      ) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError ?? new Error('Failed to call Claude API after retries');
}
