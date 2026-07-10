import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  collectTavilySignals,
  suggestCandidateSignals,
  supervise,
  topicToRecord,
  type DomainProfile,
  type TrendSignal,
} from './_shared/trend-core';

// ============================================================
// Trend scan:
//  - POST (browser, signed-in user): collect signals + supervise,
//    return results. The client persists them under its own session
//    (RLS). No DB access here.
//  - GET  (Vercel Cron): service-role. Iterates accounts that have
//    trend monitoring enabled, collects + supervises + persists.
//    Gated behind SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL.
// ============================================================

interface ScanBody {
  account_label?: string;
  profile?: DomainProfile;
  mode?: 'live' | 'suggest';
}

// Collect signals (live via Tavily, else fall back to AI-suggested candidates).
async function collect(profile: DomainProfile, accountLabel: string | undefined, mode: 'live' | 'suggest'): Promise<{ signals: TrendSignal[]; source: string; note?: string }> {
  if (mode === 'suggest') {
    const signals = await suggestCandidateSignals(profile, accountLabel);
    return { signals, source: 'suggest' };
  }
  const live = await collectTavilySignals(profile);
  if (live.length) return { signals: live, source: 'tavily' };
  // No live source configured or nothing found — fall back so the run is useful.
  const signals = await suggestCandidateSignals(profile, accountLabel);
  return { signals, source: 'suggest', note: 'No live results (TAVILY_API_KEY not set or no matches) — used AI-suggested candidate topics instead.' };
}

async function handleManual(req: VercelRequest, res: VercelResponse) {
  const body: ScanBody = req.body || {};
  const profile = body.profile || {};
  const mode = body.mode === 'suggest' ? 'suggest' : 'live';

  const { signals, source, note } = await collect(profile, body.account_label, mode);
  if (!signals.length) {
    return res.status(200).json({ success: true, topics: [], summary: null, source, note: note || 'No candidate signals were found for this profile. Add more core topics or keywords.' });
  }

  const { topics, summary, analysis_date } = await supervise({ domain_profile: profile, signals, account_label: body.account_label });
  return res.status(200).json({ success: true, topics, summary, analysis_date, source, signals_reviewed: signals.length, note });
}

async function handleCron(req: VercelRequest, res: VercelResponse) {
  // Verify the request is from Vercel Cron when a secret is configured.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(200).json({
      skipped: true,
      reason: 'Scheduled scan needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel Environment Variables. Manual scans still work without them.',
    });
  }

  const admin = createClient(url, serviceKey);
  const { data: accounts, error } = await admin.from('accounts').select('id, name, profile');
  if (error) return res.status(500).json({ error: error.message });

  const enabled = (accounts || []).filter((a: any) => a?.profile?.trend_profile?.enabled === true).slice(0, 10);
  const results: Array<{ account: string; inserted: number; source: string }> = [];

  for (const acc of enabled) {
    try {
      const tp = (acc.profile?.trend_profile || {}) as DomainProfile;
      const profile: DomainProfile = { ...tp, business_name: tp.business_name || acc.name };
      const { signals, source } = await collect(profile, acc.name, 'live');
      if (!signals.length) { results.push({ account: acc.name, inserted: 0, source }); continue; }

      const { topics, summary } = await supervise({ domain_profile: profile, signals, account_label: acc.name });
      const counts = { domain: 0, superts: 0, mon: 0, rej: 0 };
      topics.forEach((t: any) => {
        const c = t.classification;
        if (c === 'domain_trend') counts.domain++;
        else if (c === 'supertrend_exception') counts.superts++;
        else if (c === 'reject') counts.rej++;
        else counts.mon++;
      });

      const { data: scan } = await admin.from('trend_scans').insert({
        account_id: acc.id,
        source: `cron:${source}`,
        total_reviewed: summary?.total_topics_reviewed ?? topics.length,
        domain_sent: counts.domain,
        supertrends_sent: counts.superts,
        monitored: counts.mon,
        rejected: counts.rej,
      }).select('id').single();

      const rows = topics.map((t: any) => ({ ...topicToRecord(t), account_id: acc.id, scan_id: scan?.id ?? null }));
      if (rows.length) await admin.from('trend_records').insert(rows);
      results.push({ account: acc.name, inserted: rows.length, source });
    } catch (e) {
      results.push({ account: acc.name, inserted: 0, source: `error: ${e instanceof Error ? e.message : 'failed'}` });
    }
  }

  return res.status(200).json({ success: true, scanned_accounts: enabled.length, results });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') return await handleCron(req, res);
    if (req.method === 'POST') return await handleManual(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    if (message.includes('could not be parsed')) return res.status(502).json({ error: message });
    return res.status(500).json({ error: message });
  }
}
