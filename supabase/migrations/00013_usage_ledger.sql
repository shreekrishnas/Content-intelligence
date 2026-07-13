-- Migration: 00013_usage_ledger.sql
-- Track API usage per account for billing and rate limiting.

create table usage_ledger (
  id bigint generated always as identity primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  endpoint text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  model text,
  created_at timestamptz not null default now()
);

create index idx_usage_ledger_account on usage_ledger(account_id, created_at desc);

alter table usage_ledger enable row level security;

create policy "usage_ledger_select" on usage_ledger for select
using (
  exists (
    select 1 from account_access
    where account_access.user_id = auth.uid()
      and account_access.account_id = usage_ledger.account_id
      and account_access.role = 'manager'
  )
);
