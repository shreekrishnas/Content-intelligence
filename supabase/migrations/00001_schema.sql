-- Migration: 00001_schema.sql
-- Description: Create all tables for Content Intelligence platform

-- Enable extensions
create extension if not exists "pgvector";
create extension if not exists "uuid-ossp";

-- =============================================================================
-- Tenancy & Identity
-- =============================================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active','paused','archived')),
  profile jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table users (
  id uuid primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  name text,
  email text not null,
  is_org_admin boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table account_access (
  user_id uuid not null references users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  role text not null check (role in ('manager','editor','viewer')),
  primary key (user_id, account_id)
);

-- =============================================================================
-- Knowledge Hub
-- =============================================================================

create table knowledge_files (
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

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references knowledge_files(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  chunk_text text not null,
  embedding vector(1536) not null,
  embed_model text not null,
  token_count int,
  position int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on knowledge_chunks using ivfflat (embedding vector_cosine_ops);
create index on knowledge_chunks (account_id);

-- =============================================================================
-- Workflow
-- =============================================================================

create table analyses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  source_text text not null,
  source_type text not null,
  result jsonb not null,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  analysis_id uuid references analyses(id) on delete cascade,
  title text not null,
  persona_file_id uuid references knowledge_files(id),
  content_angle text,
  format text,
  status text not null default 'open' check (status in ('open','in_studio','dropped')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table assets (
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

create table calendar_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  asset_id uuid references assets(id) on delete cascade,
  title text,
  format text,
  scheduled_for timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','published','cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table integrations (
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

create table audit_log (
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
-- Auto-update updated_at trigger
-- =============================================================================

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Apply the trigger to all tables that have an updated_at column
create trigger set_updated_at before update on organizations
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on accounts
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on users
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on knowledge_files
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on knowledge_chunks
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on analyses
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on opportunities
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on assets
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on calendar_items
  for each row execute function update_updated_at_column();

create trigger set_updated_at before update on integrations
  for each row execute function update_updated_at_column();
