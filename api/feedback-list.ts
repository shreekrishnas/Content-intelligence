import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { handleOptions, sendError, cors } from './_lib/http.js';

// ============================================================
// Returns the feedback log. Server-side gated to a single admin
// email so no one else can enumerate submissions. RLS on the
// feedback table also enforces this at the row level.
// ============================================================

const ADMIN_EMAILS = [
  'shreekrishna.basri@trilliantdigital.com',
  'shreekrishnabhasri07@gmail.com',
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'POST') {
    return sendError(res, 405, 'method_not_allowed', 'Method not allowed');
  }
  cors(res);

  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return sendError(res, 401, 'missing_token', 'You must be signed in.');
  }
  const jwt = header.slice(7);

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return sendError(res, 500, 'config_error', 'Server auth is not configured.');
  }

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: { user }, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !user) {
    return sendError(res, 401, 'invalid_token', 'Your session has expired. Please sign in again.');
  }
  const callerEmail = (user.email || '').toLowerCase();
  const isAdmin = ADMIN_EMAILS.some((e) => e.toLowerCase() === callerEmail);
  if (!isAdmin) {
    return sendError(res, 403, 'not_admin', 'Only the feedback admin can view submissions.');
  }

  const { data, error } = await admin
    .from('feedback')
    .select('id, sender_email, sender_name, account_label, page, message, delivered, deliver_error, created_at')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return sendError(res, 500, 'db_error', error.message);
  }

  return res.status(200).json({ success: true, items: data || [] });
}
