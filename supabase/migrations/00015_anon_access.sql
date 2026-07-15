-- ============================================================
-- Auth was removed from the front-end for internal use.
-- Grant anon role read/write access to all app tables so
-- the client (running with the anon key, no JWT) can query
-- and mutate data directly from the browser.
--
-- This migration is safe for an internal-only deployment.
-- Re-enable auth + drop these policies when multi-tenant
-- access control is needed again.
-- ============================================================

-- accounts
CREATE POLICY "anon_accounts_select" ON accounts FOR SELECT TO anon USING (true);
CREATE POLICY "anon_accounts_insert" ON accounts FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_accounts_update" ON accounts FOR UPDATE TO anon USING (true);

-- account_access
CREATE POLICY "anon_account_access_select" ON account_access FOR SELECT TO anon USING (true);
CREATE POLICY "anon_account_access_insert" ON account_access FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_account_access_update" ON account_access FOR UPDATE TO anon USING (true);

-- knowledge_files
CREATE POLICY "anon_knowledge_files_select" ON knowledge_files FOR SELECT TO anon USING (true);
CREATE POLICY "anon_knowledge_files_insert" ON knowledge_files FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_knowledge_files_update" ON knowledge_files FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_knowledge_files_delete" ON knowledge_files FOR DELETE TO anon USING (true);

-- knowledge_chunks
CREATE POLICY "anon_knowledge_chunks_select" ON knowledge_chunks FOR SELECT TO anon USING (true);
CREATE POLICY "anon_knowledge_chunks_insert" ON knowledge_chunks FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_knowledge_chunks_update" ON knowledge_chunks FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_knowledge_chunks_delete" ON knowledge_chunks FOR DELETE TO anon USING (true);

-- analyses
CREATE POLICY "anon_analyses_select" ON analyses FOR SELECT TO anon USING (true);
CREATE POLICY "anon_analyses_insert" ON analyses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_analyses_update" ON analyses FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_analyses_delete" ON analyses FOR DELETE TO anon USING (true);

-- opportunities
CREATE POLICY "anon_opportunities_select" ON opportunities FOR SELECT TO anon USING (true);
CREATE POLICY "anon_opportunities_insert" ON opportunities FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_opportunities_update" ON opportunities FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_opportunities_delete" ON opportunities FOR DELETE TO anon USING (true);

-- assets
CREATE POLICY "anon_assets_select" ON assets FOR SELECT TO anon USING (true);
CREATE POLICY "anon_assets_insert" ON assets FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_assets_update" ON assets FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_assets_delete" ON assets FOR DELETE TO anon USING (true);

-- calendar_items
CREATE POLICY "anon_calendar_items_select" ON calendar_items FOR SELECT TO anon USING (true);
CREATE POLICY "anon_calendar_items_insert" ON calendar_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_calendar_items_update" ON calendar_items FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_calendar_items_delete" ON calendar_items FOR DELETE TO anon USING (true);

-- integrations
CREATE POLICY "anon_integrations_select" ON integrations FOR SELECT TO anon USING (true);
CREATE POLICY "anon_integrations_insert" ON integrations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_integrations_update" ON integrations FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_integrations_delete" ON integrations FOR DELETE TO anon USING (true);

-- audit_log
CREATE POLICY "anon_audit_log_select" ON audit_log FOR SELECT TO anon USING (true);
CREATE POLICY "anon_audit_log_insert" ON audit_log FOR INSERT TO anon WITH CHECK (true);

-- trend_scans
CREATE POLICY "anon_trend_scans_select" ON trend_scans FOR SELECT TO anon USING (true);
CREATE POLICY "anon_trend_scans_insert" ON trend_scans FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_trend_scans_delete" ON trend_scans FOR DELETE TO anon USING (true);

-- trend_records
CREATE POLICY "anon_trend_records_select" ON trend_records FOR SELECT TO anon USING (true);
CREATE POLICY "anon_trend_records_insert" ON trend_records FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_trend_records_update" ON trend_records FOR UPDATE TO anon USING (true);
CREATE POLICY "anon_trend_records_delete" ON trend_records FOR DELETE TO anon USING (true);

-- usage_ledger
CREATE POLICY "anon_usage_ledger_select" ON usage_ledger FOR SELECT TO anon USING (true);
CREATE POLICY "anon_usage_ledger_insert" ON usage_ledger FOR INSERT TO anon WITH CHECK (true);
