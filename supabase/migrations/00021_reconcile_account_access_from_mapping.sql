-- Migration 00021: make email_account_assignments authoritative; reconcile on login
-- Applied via MCP 2026-07-17.
--
-- handle_new_auth_user() only ever INSERTed mapping rows; it never removed rows the
-- mapping did not grant. Legacy account_access rows (role='editor', seeded before the
-- team mapping existed) therefore survived and stacked on top of the correct rows.
-- 00017 cleaned this once, but as a one-shot DELETE it did nothing for anyone who
-- signed in afterwards -- vandhyashree.hs had 6 accounts where the mapping grants 2.
--
-- The trigger now reconciles: revoke what the mapping does not grant, then upsert what
-- it does, so every login self-heals. Org admins are skipped -- they see every account
-- via is_org_admin_for_account() and their account_access rows are not the source of
-- truth. Email comparisons are lower()ed; the old exact match would silently mis-key
-- on any case difference between auth.users and the mapping table.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id   uuid := '00000000-0000-0000-0000-000000000001';
  v_td_role  text;
  v_is_admin boolean;
BEGIN
  SELECT era.td_role, era.is_org_admin
    INTO v_td_role, v_is_admin
  FROM public.email_role_assignments era
  WHERE lower(era.email) = lower(new.email);

  v_is_admin := COALESCE(v_is_admin, false);

  INSERT INTO public.users (id, org_id, name, email, is_org_admin, td_role)
  VALUES (
    new.id,
    v_org_id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_is_admin,
    v_td_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email        = EXCLUDED.email,
    name         = COALESCE(EXCLUDED.name, users.name),
    is_org_admin = EXCLUDED.is_org_admin,
    td_role      = EXCLUDED.td_role;

  IF v_is_admin THEN
    RETURN new;
  END IF;

  -- Revoke anything the mapping does not grant (this is what was missing).
  DELETE FROM public.account_access aa
  WHERE aa.user_id = new.id
    AND NOT EXISTS (
      SELECT 1
      FROM public.email_account_assignments eaa
      JOIN public.accounts a
        ON a.name = eaa.account_name
       AND a.org_id = v_org_id
      WHERE lower(eaa.email) = lower(new.email)
        AND a.id = aa.account_id
    );

  INSERT INTO public.account_access (user_id, account_id, role)
  SELECT new.id, a.id, eaa.access_role
  FROM public.email_account_assignments eaa
  JOIN public.accounts a
    ON a.name = eaa.account_name
   AND a.org_id = v_org_id
  WHERE lower(eaa.email) = lower(new.email)
  ON CONFLICT (user_id, account_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN new;
END;
$function$;

-- One-time reconcile of everyone already in the table, using the same rule.
DELETE FROM public.account_access aa
USING public.users u
WHERE u.id = aa.user_id
  AND u.is_org_admin = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.email_account_assignments eaa
    JOIN public.accounts a
      ON a.name = eaa.account_name
     AND a.org_id = '00000000-0000-0000-0000-000000000001'
    WHERE lower(eaa.email) = lower(u.email)
      AND a.id = aa.account_id
  );

INSERT INTO public.account_access (user_id, account_id, role)
SELECT u.id, a.id, eaa.access_role
FROM public.users u
JOIN public.email_account_assignments eaa
  ON lower(eaa.email) = lower(u.email)
JOIN public.accounts a
  ON a.name = eaa.account_name
 AND a.org_id = '00000000-0000-0000-0000-000000000001'
WHERE u.is_org_admin = false
ON CONFLICT (user_id, account_id) DO UPDATE SET role = EXCLUDED.role;
