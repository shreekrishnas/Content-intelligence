import { supabase, supabaseConfigured } from '@/lib/supabase';

export async function auditLog(params: {
  accountId: string;
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  detail?: Record<string, any>;
}) {
  if (!supabaseConfigured) return;

  try {
    await supabase.from('audit_log').insert({
      account_id: params.accountId,
      user_id: params.userId ?? null,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      detail: params.detail ?? {},
    });
  } catch {
    // Audit failures must not break the app
  }
}
