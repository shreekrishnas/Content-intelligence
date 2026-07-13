import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { cors, sendError } from './http';

export interface AuthContext {
  userId: string;
  email: string;
  accountId: string;
  role: 'manager' | 'editor' | 'viewer';
}

function getSupabaseUrl(): string {
  return process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
}

export async function requireAuth(
  req: VercelRequest,
  res: VercelResponse,
): Promise<AuthContext | null> {
  cors(res);

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    sendError(res, 401, 'missing_token', 'Authorization header with Bearer token is required.');
    return null;
  }
  const jwt = header.slice(7);

  const url = getSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    sendError(res, 500, 'config_error', 'Server auth is not configured.');
    return null;
  }

  const admin = createClient(url, serviceKey);
  const { data: { user }, error } = await admin.auth.getUser(jwt);
  if (error || !user) {
    sendError(res, 401, 'invalid_token', 'Invalid or expired token.');
    return null;
  }

  const accountId =
    (req.body as any)?.account_id ||
    req.headers['x-account-id'] as string;
  if (!accountId) {
    sendError(res, 400, 'missing_account', 'account_id is required (body or X-Account-Id header).');
    return null;
  }

  const { data: access } = await admin
    .from('account_access')
    .select('role')
    .eq('user_id', user.id)
    .eq('account_id', accountId)
    .single();

  if (!access) {
    sendError(res, 403, 'no_access', 'You do not have access to this account.');
    return null;
  }

  return {
    userId: user.id,
    email: user.email || '',
    accountId,
    role: access.role as AuthContext['role'],
  };
}

export function requireRole(ctx: AuthContext, allowed: AuthContext['role'][]): boolean {
  return allowed.includes(ctx.role);
}
