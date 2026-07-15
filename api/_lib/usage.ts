import type { LLMUsage } from './llm.js';

export async function logUsage(
  ctx: { accountId?: string; userId?: string } | null | undefined,
  endpoint: string,
  usage: LLMUsage,
): Promise<void> {
  try {
    const { getServiceClient } = await import('./supabase.js');
    const admin = getServiceClient();
    await admin.from('usage_ledger').insert({
      account_id: ctx?.accountId || null,
      user_id: ctx?.userId || null,
      endpoint,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      model: usage.model,
    });
  } catch {
    // best-effort — never fail the request over usage logging
  }
}
