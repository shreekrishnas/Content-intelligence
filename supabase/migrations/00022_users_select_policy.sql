-- Migration 00022: allow authenticated users to read their own profile
-- Applied via MCP 2026-07-17.
--
-- public.users had RLS enabled with zero policies, which denies every read --
-- including a user's own row. AccountContext reads is_org_admin/td_role from it, so
-- `profile` was always null: isAdmin defaulted to false for everyone (the admin panel
-- never appeared for td_management) and the Topbar role badge never rendered.
--
-- The app only ever SELECTs from users (AccountContext + AdminPage) and never writes,
-- so SELECT is the only grant needed. Writes stay closed: handle_new_auth_user() is
-- SECURITY DEFINER and maintains the row. Leaving UPDATE closed also means a user
-- cannot set their own is_org_admin = true.

-- SECURITY DEFINER so a policy on `users` can consult `users` without recursing.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT org_id FROM public.users WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.current_user_is_org_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE((SELECT is_org_admin FROM public.users WHERE id = auth.uid()), false) $$;

DROP POLICY IF EXISTS users_select ON public.users;
CREATE POLICY users_select ON public.users FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR (org_id = public.current_user_org_id() AND public.current_user_is_org_admin())
);

-- accounts_insert tested EXISTS (SELECT 1 FROM users ...). Subqueries inside a policy
-- honour the referenced table's RLS, so with users locked that EXISTS was always false
-- and no client could ever create an account. Use the definer helper instead.
DROP POLICY IF EXISTS accounts_insert ON public.accounts;
CREATE POLICY accounts_insert ON public.accounts FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_user_org_id() AND public.current_user_is_org_admin());
