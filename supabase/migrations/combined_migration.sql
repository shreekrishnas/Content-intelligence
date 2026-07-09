-- ============================================================
-- COMBINED MIGRATION: Run this in Supabase SQL Editor
-- Content Intelligence Platform — Full Schema
-- ============================================================

-- Enable extensions
create extension if not exists "vector";
create extension if not exists "uuid-ossp";

-- =============================================================================
-- 00001: Create all tables
-- =============================================================================

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  email text not null,
  is_org_admin boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists account_access (
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role text not null check (role in ('manager','editor','viewer')),
  primary key (user_id, account_id)
);

create table if not exists knowledge_files (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  file_name text not null,
  category text not null check (category in ('persona','brand','compliance','terminology','expert','guidelines','raw_notes','data','idea')),
  priority text not null default 'standard' check (priority in ('critical','high','standard','low')),
  source_type text not null check (source_type in ('file','paste','url')),
  storage_url text,
  active boolean not null default true,
  version int not null default 1,
  structured jsonb default '{}'::jsonb,
  ingest_status text not null default 'pending' check (ingest_status in ('pending','processing','ready','failed')),
  uploaded_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references knowledge_files(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  chunk_text text not null,
  embedding vector(1536),
  embed_model text not null,
  token_count int,
  position int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists knowledge_chunks_account_idx on knowledge_chunks (account_id);

create table if not exists analyses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  source_text text not null,
  source_type text not null,
  result jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  analysis_id uuid references analyses(id) on delete cascade,
  title text not null,
  persona_file_id uuid references knowledge_files(id),
  content_angle text,
  format text,
  status text not null default 'open' check (status in ('open','in_studio','dropped')),
  priority text default 'standard',
  persona_name text,
  persona_relevance_score numeric,
  recommendation_reason text,
  timeliness text default 'standard',
  suggested_cta text,
  source_context text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  opportunity_id uuid references opportunities(id) on delete cascade,
  stage text not null default 'outline' check (stage in ('outline','draft','approved','scheduled','published')),
  body text,
  quality jsonb default '{}'::jsonb,
  grounded_chunk_ids uuid[] not null default '{}',
  confirmed_source_ids uuid[] not null default '{}',
  feedback_log jsonb default '[]'::jsonb,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists calendar_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  title text,
  format text,
  scheduled_for timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','published','cancelled')),
  body text,
  quality jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  type text not null,
  provider text,
  credentials_ref text,
  status text not null default 'not_connected',
  config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references users(id),
  action text not null,
  target_type text,
  target_id uuid,
  detail jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- =============================================================================
-- Auto-update trigger
-- =============================================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$ begin
  create trigger set_updated_at before update on organizations for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on accounts for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on users for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on knowledge_files for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on knowledge_chunks for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on analyses for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on opportunities for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on assets for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on calendar_items for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;
do $$ begin
  create trigger set_updated_at before update on integrations for each row execute function update_updated_at_column();
exception when duplicate_object then null;
end $$;

-- =============================================================================
-- 00002: RLS policies
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

alter table accounts enable row level security;
alter table account_access enable row level security;
alter table knowledge_files enable row level security;
alter table knowledge_chunks enable row level security;
alter table analyses enable row level security;
alter table opportunities enable row level security;
alter table assets enable row level security;
alter table calendar_items enable row level security;
alter table integrations enable row level security;
alter table audit_log enable row level security;

-- Accounts
do $$ begin create policy "accounts_select" on accounts for select using (has_account_access(id) or is_org_admin_for_account(id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "accounts_insert" on accounts for insert with check (exists (select 1 from users where id = auth.uid() and org_id = accounts.org_id and is_org_admin = true)); exception when duplicate_object then null; end $$;
do $$ begin create policy "accounts_update" on accounts for update using (has_account_role(id, array['manager']) or is_org_admin_for_account(id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "accounts_delete" on accounts for delete using (is_org_admin_for_account(id)); exception when duplicate_object then null; end $$;

-- Allow anon read for the app to fetch account by ID (needed before auth)
do $$ begin create policy "accounts_anon_select" on accounts for select using (true); exception when duplicate_object then null; end $$;

-- Account Access
do $$ begin create policy "account_access_select" on account_access for select using (has_account_access(account_id) or is_org_admin_for_account(account_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "account_access_insert" on account_access for insert with check (has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "account_access_update" on account_access for update using (has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)); exception when duplicate_object then null; end $$;
do $$ begin create policy "account_access_delete" on account_access for delete using (has_account_role(account_id, array['manager']) or is_org_admin_for_account(account_id)); exception when duplicate_object then null; end $$;

-- Knowledge Files — allow anon CRUD for the app (RLS is soft until auth is enforced)
do $$ begin create policy "knowledge_files_select" on knowledge_files for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_files_insert" on knowledge_files for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_files_update" on knowledge_files for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_files_delete" on knowledge_files for delete using (true); exception when duplicate_object then null; end $$;

-- Knowledge Chunks
do $$ begin create policy "knowledge_chunks_select" on knowledge_chunks for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_chunks_insert" on knowledge_chunks for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_chunks_update" on knowledge_chunks for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "knowledge_chunks_delete" on knowledge_chunks for delete using (true); exception when duplicate_object then null; end $$;

-- Analyses
do $$ begin create policy "analyses_select" on analyses for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "analyses_insert" on analyses for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "analyses_update" on analyses for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "analyses_delete" on analyses for delete using (true); exception when duplicate_object then null; end $$;

-- Opportunities
do $$ begin create policy "opportunities_select" on opportunities for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "opportunities_insert" on opportunities for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "opportunities_update" on opportunities for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "opportunities_delete" on opportunities for delete using (true); exception when duplicate_object then null; end $$;

-- Assets
do $$ begin create policy "assets_select" on assets for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "assets_insert" on assets for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "assets_update" on assets for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "assets_delete" on assets for delete using (true); exception when duplicate_object then null; end $$;

-- Calendar Items
do $$ begin create policy "calendar_items_select" on calendar_items for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "calendar_items_insert" on calendar_items for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "calendar_items_update" on calendar_items for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "calendar_items_delete" on calendar_items for delete using (true); exception when duplicate_object then null; end $$;

-- Integrations
do $$ begin create policy "integrations_select" on integrations for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "integrations_insert" on integrations for insert with check (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "integrations_update" on integrations for update using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "integrations_delete" on integrations for delete using (true); exception when duplicate_object then null; end $$;

-- Audit Log
do $$ begin create policy "audit_log_select" on audit_log for select using (true); exception when duplicate_object then null; end $$;
do $$ begin create policy "audit_log_insert" on audit_log for insert with check (true); exception when duplicate_object then null; end $$;

-- =============================================================================
-- 00004: Auth user trigger
-- =============================================================================

create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, org_id, name, email, is_org_admin)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001',
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    false
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(excluded.name, users.name);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

create or replace function grant_default_account_access()
returns trigger as $$
begin
  insert into public.account_access (user_id, account_id, role) values
    (new.id, '00000000-0000-0000-0000-000000000001', 'editor'),
    (new.id, '00000000-0000-0000-0000-000000000002', 'editor'),
    (new.id, '00000000-0000-0000-0000-000000000003', 'editor'),
    (new.id, '00000000-0000-0000-0000-000000000004', 'editor'),
    (new.id, '00000000-0000-0000-0000-000000000005', 'editor')
  on conflict (user_id, account_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_user_created_grant_access on public.users;
create trigger on_user_created_grant_access
  after insert on public.users
  for each row execute function grant_default_account_access();

-- =============================================================================
-- Seed data
-- =============================================================================

insert into organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Trilliant Media')
on conflict (id) do nothing;

insert into accounts (id, org_id, name) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Right Horizons'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Hoya Vision'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Wipro 3D'),
  ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Wipro Water'),
  ('00000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'Wepsol')
on conflict (id) do update set name = excluded.name;

-- =============================================================================
-- Storage bucket (run manually in Supabase Dashboard > Storage > New Bucket)
-- Bucket name: knowledge-files
-- Set to: Private
-- =============================================================================
