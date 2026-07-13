import type { AuthContext } from './auth';
import type { LLMUsage } from './llm';

export async function logUsage(
  auth: AuthContext,
  endpoint: string,
  usage: LLMUsage,
): Promise<void> {
  try {
    const { getServiceClient } = await import('./supabase');
    const admin = getServiceClient();
    await admin.from('usage_ledger').insert({
      account_id: auth.accountId,
      user_id: auth.userId,
      endpoint,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      model: usage.model,
    });
  } catch {
    // best-effort — never fail the request over usage logging
  }
}
