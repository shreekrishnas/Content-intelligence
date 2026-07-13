-- Migration: 00011_remove_default_access_trigger.sql
-- Security: remove the trigger that auto-grants editor access to account
-- 00000000-0000-0000-0000-000000000001 for every new user.
-- Access is now granted explicitly by an org admin.

drop trigger if exists grant_default_account_access on public.users;
drop function if exists handle_default_account_access();
