-- Migration: 00002_rls_policies.sql
-- Description: Enable RLS and create access policies for all content tables
--
-- Policy pattern:
--   READ  = user has account_access to row's account_id OR user is org_admin in same org
--   WRITE = same as read but role must be 'manager' or 'editor' (some tables require 'manager' only)
--   audit_log = insert-only for authenticated users with access

-- =============================================================================
-- Helper: check if auth.uid() has access to a given account
-- =============================================================================

create or replace function has_account_access(p_account_id uuid)
returns boolean as $$
begin
  return exists (
    select 1 from account_access
    where user_id = auth.uid()
      and account_id = p_account_id
  );
end;
$$ language plpgsql security definer stable;

create or replace function has_account_role(p_account_id uuid, p_roles text[])
returns boolean as $$
begin
  return exists (
    select 1 from account_access
    where user_id = auth.uid()
      and account_id = p_account_id
      and role = any(p_roles)
  );
end;
$$ language plpgsql security definer stable;

create or replace function is_org_admin_for_account(p_account_id uuid)
returns boolean as $$
begin
  return exists (
    select 1
    from users u
    join accounts a on a.org_id = u.org_id
    where u.id = auth.uid()
      and u.is_org_admin = true
      and a.id = p_account_id
  );
end;
$$ language plpgsql security definer stable;

-- =============================================================================
-- accounts
-- =============================================================================

alter table accounts enable row level security;

create policy "accounts_select" on accounts
  for select using (
    has_account_access(id) or is_org_admin_for_account(id)
  );

create policy "accounts_insert" on accounts
  for insert with check (
    -- Only org admins can create accounts
    exists (
      select 1 from users
      where id = auth.uid()
        and org_id = accounts.org_id
        and is_org_admin = true
    )
  );

create policy "accounts_update" on accounts
  for update using (
    has_account_role(id, array['manager']) or is_org_admin_for_account(id)
  );

create policy "accounts_delete" on accounts
  for delete using (
    is_org_admin_for_account(id)
  );

-- =============================================================================
-- account_access
-- =============================================================================

alter table account_access enable row level security;

create policy "account_access_select" on account_access
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "account_access_insert" on account_access
  for insert with check (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "account_access_update" on account_access
  for update using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "account_access_delete" on account_access
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- knowledge_files (manager only for writes)
-- =============================================================================

alter table knowledge_files enable row level security;

create policy "knowledge_files_select" on knowledge_files
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_files_insert" on knowledge_files
  for insert with check (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_files_update" on knowledge_files
  for update using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_files_delete" on knowledge_files
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- knowledge_chunks (manager only for writes)
-- =============================================================================

alter table knowledge_chunks enable row level security;

create policy "knowledge_chunks_select" on knowledge_chunks
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_chunks_insert" on knowledge_chunks
  for insert with check (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_chunks_update" on knowledge_chunks
  for update using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "knowledge_chunks_delete" on knowledge_chunks
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- analyses (manager + editor for writes)
-- =============================================================================

alter table analyses enable row level security;

create policy "analyses_select" on analyses
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "analyses_insert" on analyses
  for insert with check (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "analyses_update" on analyses
  for update using (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "analyses_delete" on analyses
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- opportunities (manager + editor for writes)
-- =============================================================================

alter table opportunities enable row level security;

create policy "opportunities_select" on opportunities
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "opportunities_insert" on opportunities
  for insert with check (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "opportunities_update" on opportunities
  for update using (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "opportunities_delete" on opportunities
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- assets (manager + editor for writes)
-- =============================================================================

alter table assets enable row level security;

create policy "assets_select" on assets
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "assets_insert" on assets
  for insert with check (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "assets_update" on assets
  for update using (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "assets_delete" on assets
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- calendar_items (manager + editor for writes)
-- =============================================================================

alter table calendar_items enable row level security;

create policy "calendar_items_select" on calendar_items
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "calendar_items_insert" on calendar_items
  for insert with check (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "calendar_items_update" on calendar_items
  for update using (
    has_account_role(account_id, array['manager','editor']) or is_org_admin_for_account(account_id)
  );

create policy "calendar_items_delete" on calendar_items
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- integrations (manager only for writes)
-- =============================================================================

alter table integrations enable row level security;

create policy "integrations_select" on integrations
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "integrations_insert" on integrations
  for insert with check (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "integrations_update" on integrations
  for update using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

create policy "integrations_delete" on integrations
  for delete using (
    has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)
  );

-- =============================================================================
-- audit_log (insert-only for authenticated users with access; select for access holders)
-- =============================================================================

alter table audit_log enable row level security;

create policy "audit_log_select" on audit_log
  for select using (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );

create policy "audit_log_insert" on audit_log
  for insert with check (
    has_account_access(account_id) or is_org_admin_for_account(account_id)
  );
