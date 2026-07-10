import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supervise, type DomainProfile, type TrendSignal } from '../lib/trend-core';

interface SupervisorRequest {
  domain_profile?: DomainProfile;
  signals?: TrendSignal[];
  account_label?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body: SupervisorRequest = req.body || {};
    if (!body.signals?.length) {
      return res.status(400).json({ error: 'No trend signals provided. Add candidate topics or run a live scan first.' });
    }

    const { topics, summary, analysis_date } = await supervise(body);
    return res.status(200).json({ success: true, topics, summary, analysis_date });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return res.status(502).json({ error: message });
    return res.status(500).json({ error: message });
  }
}
