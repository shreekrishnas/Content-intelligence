-- ============================================================
-- AI Trend Supervisor — trend_scans + trend_records, with RLS
-- ============================================================

-- A scan run (manual or scheduled) that produced a batch of trend records.
CREATE TABLE IF NOT EXISTS public.trend_scans (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  source            text NOT NULL DEFAULT 'manual',   -- tavily | serper | suggest | manual | cron
  total_reviewed    integer NOT NULL DEFAULT 0,
  domain_sent       integer NOT NULL DEFAULT 0,
  supertrends_sent  integer NOT NULL DEFAULT 0,
  monitored         integer NOT NULL DEFAULT 0,
  rejected          integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trend_scans_account ON public.trend_scans(account_id, created_at DESC);

-- A single supervised trend record.
CREATE TABLE IF NOT EXISTS public.trend_records (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  scan_id                uuid REFERENCES public.trend_scans(id) ON DELETE SET NULL,
  topic                  text NOT NULL,
  summary                text NOT NULL DEFAULT '',
  classification         text NOT NULL DEFAULT 'monitor',   -- domain_trend | supertrend_exception | monitor | reject
  domain_relevance_score integer NOT NULL DEFAULT 0,
  trend_impact_score     integer NOT NULL DEFAULT 0,
  adaptability_score     integer NOT NULL DEFAULT 0,
  risk_score             integer NOT NULL DEFAULT 0,
  confidence_score       integer NOT NULL DEFAULT 0,
  priority               text NOT NULL DEFAULT 'low',        -- critical | high | medium | low | experimental
  trend_stage            text NOT NULL DEFAULT 'emerging',   -- emerging | growing | peak | declining | seasonal | evergreen
  estimated_lifespan     text NOT NULL DEFAULT '',
  recommended_route      text NOT NULL DEFAULT 'monitor',
  reason                 text NOT NULL DEFAULT '',
  suggested_connection   text NOT NULL DEFAULT '',           -- for supertrend exceptions
  recommended_formats    jsonb NOT NULL DEFAULT '[]'::jsonb,
  related_keywords       jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_signals         jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{title,url,source}]
  status                 text NOT NULL DEFAULT 'new',        -- new | accepted | monitoring | rejected | actioned
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trend_records_account ON public.trend_records(account_id, created_at DESC);
CREATE INDEX idx_trend_records_status ON public.trend_records(account_id, status);

ALTER TABLE public.trend_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trend_records ENABLE ROW LEVEL SECURITY;

-- ---- trend_scans policies ----
CREATE POLICY trend_scans_select ON public.trend_scans
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid())
  );

CREATE POLICY trend_scans_insert ON public.trend_scans
  FOR INSERT WITH CHECK (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid() AND role IN ('manager', 'editor'))
  );

CREATE POLICY trend_scans_delete ON public.trend_scans
  FOR DELETE USING (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid() AND role IN ('manager', 'editor'))
  );

-- ---- trend_records policies ----
CREATE POLICY trend_records_select ON public.trend_records
  FOR SELECT USING (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid())
  );

CREATE POLICY trend_records_insert ON public.trend_records
  FOR INSERT WITH CHECK (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid() AND role IN ('manager', 'editor'))
  );

CREATE POLICY trend_records_update ON public.trend_records
  FOR UPDATE USING (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid() AND role IN ('manager', 'editor'))
  );

CREATE POLICY trend_records_delete ON public.trend_records
  FOR DELETE USING (
    account_id IN (SELECT account_id FROM public.account_access WHERE user_id = auth.uid() AND role IN ('manager', 'editor'))
  );

-- NOTE: The scheduled (cron) scan runs server-side with the Supabase
-- service-role key, which bypasses RLS. Manual scans from the browser use the
-- signed-in user's session and are governed by the policies above.
