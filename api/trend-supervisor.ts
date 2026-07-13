import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions, sendError } from './_lib/http';
import { requireAuth } from './_lib/auth';
import { supervise } from './_lib/trends';
import type { DomainProfile, TrendSignal } from './_lib/types';

interface SupervisorRequest {
  domain_profile?: DomainProfile;
  signals?: TrendSignal[];
  account_label?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed', 'Method not allowed');

  const auth = await requireAuth(req, res);
  if (!auth) return;

  try {
    const body: SupervisorRequest = req.body || {};
    if (!body.signals?.length) {
      return sendError(res, 400, 'missing_signals', 'No trend signals provided. Add candidate topics or run a live scan first.');
    }
    const { topics, summary, analysis_date } = await supervise(body);
    return res.status(200).json({ success: true, topics, summary, analysis_date });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return sendError(res, 502, 'parse_error', message);
    return sendError(res, 500, 'internal_error', message);
  }
}
