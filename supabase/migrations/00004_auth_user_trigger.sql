-- Auto-create a user row when someone signs up via Supabase Auth
create or replace function handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, org_id, name, email, is_org_admin)
  values (
    new.id,
    '00000000-0000-0000-0000-000000000001', -- default org
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

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- Also auto-grant access to the default account for new users
create or replace function grant_default_account_access()
returns trigger as $$
begin
  insert into public.account_access (user_id, account_id, role)
  values (new.id, '00000000-0000-0000-0000-000000000001', 'editor')
  on conflict (user_id, account_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_user_created_grant_access
  after insert on public.users
  for each row execute function grant_default_account_access();
