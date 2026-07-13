-- Migration: 00012_tighten_storage_rls.sql
-- Security: restrict knowledge-files storage to authenticated users who
-- have access to the account that owns the file.
-- The storage path convention is: {account_id}/{timestamp}_{filename}

-- Drop the overly permissive policies from 00006
drop policy if exists "knowledge_files_storage_select" on storage.objects;
drop policy if exists "knowledge_files_storage_insert" on storage.objects;
drop policy if exists "knowledge_files_storage_update" on storage.objects;
drop policy if exists "knowledge_files_storage_delete" on storage.objects;

-- Helper: extract account_id from the storage path (first segment)
create or replace function storage_account_id(object_name text)
returns uuid language sql immutable as $$
  select (split_part(object_name, '/', 1))::uuid
$$;

-- SELECT: user must have any role on the account
create policy "kb_storage_select" on storage.objects for select
using (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from account_access
    where account_access.user_id = auth.uid()
      and account_access.account_id = storage_account_id(name)
  )
);

-- INSERT: editor or manager
create policy "kb_storage_insert" on storage.objects for insert
with check (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from account_access
    where account_access.user_id = auth.uid()
      and account_access.account_id = storage_account_id(name)
      and account_access.role in ('manager', 'editor')
  )
);

-- UPDATE: editor or manager
create policy "kb_storage_update" on storage.objects for update
using (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from account_access
    where account_access.user_id = auth.uid()
      and account_access.account_id = storage_account_id(name)
      and account_access.role in ('manager', 'editor')
  )
);

-- DELETE: manager only
create policy "kb_storage_delete" on storage.objects for delete
using (
  bucket_id = 'knowledge-files'
  and exists (
    select 1 from account_access
    where account_access.user_id = auth.uid()
      and account_access.account_id = storage_account_id(name)
      and account_access.role = 'manager'
  )
);
