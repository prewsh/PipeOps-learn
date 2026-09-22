-- ============================================================================
-- SECURITY FIX — privilege escalation via self-update.
--
-- The `users_update_self` policy allowed a participant to update their own row
-- with no restriction on WHICH columns. Row-level security answers "which
-- rows", never "which columns", so a participant could run:
--
--     update users set role = 'admin' where id = auth.uid();
--
-- …and is_admin() would then return true. Everything downstream is gated on
-- that function, so a single UPDATE granted: every participant's submissions
-- and email address, the audit log, the ability to approve work, post
-- announcements, and revoke other people's enrolments.
--
-- Two layers, because either alone can be undone by a later migration:
--   1. column-level privileges — Postgres refuses the write outright
--   2. a trigger — protected columns are restored even if a grant is restored
--
-- `email` is protected for the same reason: enrolment is keyed on it, so a
-- self-service change is an account-takeover primitive.
-- ============================================================================

-- 1. Column-level privileges. A participant may change only presentation and
--    preference columns on their own row.
revoke update on public.users from authenticated;
grant update (name, avatar_url, timezone, socials, email_prefs,
              leaderboard_opt_out, onboarded_at)
  on public.users to authenticated;

-- 2. Trigger backstop. Anything a non-admin tries to change outside that set is
--    silently restored to its previous value rather than erroring, so a
--    malformed client cannot brick a legitimate profile save.
create or replace function public.protect_user_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor_role user_role;
begin
  select role into v_actor_role from public.users where id = auth.uid();

  -- The service role has no auth.uid(); admin tooling and migrations pass
  -- through untouched.
  if auth.uid() is null or v_actor_role = 'admin' then
    return new;
  end if;

  new.id    := old.id;
  new.role  := old.role;
  new.email := old.email;
  return new;
end $$;

drop trigger if exists users_protect_columns on public.users;
create trigger users_protect_columns
  before update on public.users
  for each row execute function public.protect_user_columns();
