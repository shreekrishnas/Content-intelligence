-- Migration 00020: replace USING(true) with account-scoped RLS on data tables
-- Applied via MCP 2026-07-17.
--
-- Every data table carried USING(true)/WITH CHECK(true) for the `public` role,
-- which covers `authenticated`. Isolation depended entirely on the client
-- remembering .eq('account_id', ...). Any missed filter, stale account id or
-- hand-crafted request returned another account's rows. The account dropdown was
-- scoped correctly (accounts_select uses has_account_access), so the leak was
-- invisible in the UI while the data underneath was fully readable.
--
-- Service role bypasses RLS, so api/* ingestion routes are unaffected.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'analyses','assets','calendar_items','integrations',
    'knowledge_chunks','knowledge_files','opportunities','source_types'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
      USING (public.has_account_access(account_id)
             OR public.is_org_admin_for_account(account_id))
    $f$, t || '_select', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
      WITH CHECK (public.has_account_access(account_id)
                  OR public.is_org_admin_for_account(account_id))
    $f$, t || '_insert', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (public.has_account_access(account_id)
             OR public.is_org_admin_for_account(account_id))
      WITH CHECK (public.has_account_access(account_id)
                  OR public.is_org_admin_for_account(account_id))
    $f$, t || '_update', t);

    EXECUTE format($f$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
      USING (public.has_account_access(account_id)
             OR public.is_org_admin_for_account(account_id))
    $f$, t || '_delete', t);
  END LOOP;
END $$;

-- audit_log is append-only: insert + read, never update/delete.
DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;

CREATE POLICY audit_log_select ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_account_access(account_id)
         OR public.is_org_admin_for_account(account_id));

CREATE POLICY audit_log_insert ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_account_access(account_id)
              OR public.is_org_admin_for_account(account_id));

-- match_chunks runs as the caller (not SECURITY DEFINER), so RLS on
-- knowledge_chunks now constrains it too: passing another account's uuid
-- returns zero rows instead of that account's chunks.
