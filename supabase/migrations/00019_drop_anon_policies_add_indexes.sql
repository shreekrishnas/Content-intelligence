-- Migration 00019: drop anon USING(true) policies + add account_id indexes
-- Applied via MCP 2026-07-17.
--
-- Every anon policy from 00015 was USING(true)/WITH CHECK(true), so any
-- unauthenticated request could read, insert, update and delete every table.
-- 00015 added them because login had been removed at the time; auth is back,
-- so authenticated users are covered by the `public`-role policies and the
-- anon grants are pure exposure.
--
-- Also adds the account_id indexes the RLS predicates and per-account queries
-- need as data grows across 46 accounts.

DO $$
DECLARE t text; p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'account_access','accounts','analyses','assets','audit_log','calendar_items',
    'integrations','knowledge_chunks','knowledge_files','opportunities',
    'trend_records','trend_scans','usage_ledger'
  ] LOOP
    FOREACH p IN ARRAY ARRAY['select','insert','update','delete'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'anon_' || t || '_' || p, t);
    END LOOP;
  END LOOP;
END $$;

DROP POLICY IF EXISTS accounts_anon_select ON public.accounts;

CREATE INDEX IF NOT EXISTS idx_analyses_account_id       ON public.analyses(account_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id  ON public.opportunities(account_id);
CREATE INDEX IF NOT EXISTS idx_assets_account_id         ON public.assets(account_id);
CREATE INDEX IF NOT EXISTS idx_calendar_items_account_id ON public.calendar_items(account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_files_account_id ON public.knowledge_files(account_id);
CREATE INDEX IF NOT EXISTS idx_account_access_account_id ON public.account_access(account_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_account_id      ON public.audit_log(account_id);
CREATE INDEX IF NOT EXISTS idx_trend_scans_account_id    ON public.trend_scans(account_id);
CREATE INDEX IF NOT EXISTS idx_integrations_account_id   ON public.integrations(account_id);
