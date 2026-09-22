-- ============================================================================
-- Privilege lockdown, second pass — and the reason there had to be one.
--
-- Migration …0023 revoked EXECUTE and granted back an allowlist, and its own
-- header says it must be the last migration in the series. Migrations …0024
-- and …0025 were then added after it in the same sitting. Everything …0024
-- created came back with PUBLIC execute:
--
--   audit_content_change()                  anon + authenticated
--   set_cohort_flag(uuid, text, boolean)    anon + authenticated
--
-- Neither is exploitable today — a trigger function raises when called
-- directly, and set_cohort_flag checks is_admin() in its body — but both
-- should be unreachable, and the next one might not be so lucky.
--
-- …0023 also set `alter default privileges … revoke execute on functions from
-- public` to stop this recurring. On this project that does NOT work: a
-- freshly created function still comes back with `=X/postgres`. So the comment
-- promising future safety was wrong, and the discipline it asked for failed
-- within the hour.
--
-- Two changes of approach:
--
--   1. This file is written to be RE-RUN. It revokes everything and grants the
--      allowlist back, so applying it after any future migration restores a
--      known state. It is not a one-time correction.
--   2. `scripts/verify-security.mjs` now enumerates what `anon` and
--      `authenticated` can actually execute and fails on anything outside the
--      allowlist. A rule a person has to remember is not a control; a failing
--      test is.
--
-- Also fixed here: the content audit trigger named a table that does not
-- exist, and the leaderboard returned a stable enrolment id it never needed.
-- ============================================================================

-- ------------------------------------------- 1. audit the right table ----
-- …0024 looped over 'sessions'. The table is `live_sessions`, so session
-- changes were never audited — and the `if to_regclass(...) is null then
-- continue` guard, added to make the loop safe, is exactly what swallowed the
-- typo. It now raises instead.
do $$
declare t text;
begin
  foreach t in array array[
    'program_weeks', 'modules', 'lessons', 'assignments', 'program_tasks',
    'learning_materials', 'live_sessions', 'announcements'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise exception 'audit trigger target does not exist: public.%', t;
    end if;
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.audit_content_change()', t, t);
  end loop;
end $$;

-- The trigger …0024 created against the non-existent name left nothing behind,
-- but drop the stale one if a re-run ever created it.
drop trigger if exists sessions_audit on public.live_sessions;

-- --------------------------------- 2. leaderboard sheds enrolment ids ----
-- `is_me` already tells the client which row is theirs, so the stable UUID was
-- returned to every participant for nothing. The board exposes display name,
-- points and streak only (AGENTS.md section 7).
-- Dropping a column from the OUT list changes the return type, so replace
-- will not do. The grant is reissued by the allowlist further down.
drop function if exists public.leaderboard(integer);

create function public.leaderboard(p_limit integer default 25)
returns table (rank bigint, display_name text, points_total integer,
               streak_weeks integer, weeks_completed integer, is_me boolean)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_enrollment_id() as id),
  ranked as (
    select
      e.id,
      coalesce(nullif(trim(e.name), ''), split_part(e.email::text, '@', 1)) as display_name,
      e.points_total,
      e.streak_weeks,
      e.weeks_completed,
      -- Ties break by the earliest last scoring event, then by enrolment
      -- (PRD F10.5).
      row_number() over (
        order by e.points_total desc,
                 (select max(pe.occurred_at) from public.points_events pe
                   where pe.enrollment_id = e.id) asc nulls last,
                 e.enrolled_at asc
      ) as rank
    from public.enrollments e
    left join public.users u on u.id = e.user_id
    where e.cohort_id = (select cohort_id from public.enrollments where id = (select id from me))
      and e.status = 'active'
      and (coalesce(u.leaderboard_opt_out, false) = false or e.id = (select id from me))
  )
  select r.rank, r.display_name, r.points_total, r.streak_weeks,
         r.weeks_completed, r.id = (select id from me)
    from ranked r
   where r.rank <= p_limit
      -- Always include the caller's own neighbourhood, even outside the top N
      or abs(r.rank - (select rank from ranked where id = (select id from me))) <= 2
   order by r.rank;
$$;

-- ------------------------------------------- 3. what the test reads ----
-- The verification suite has no SQL connection — it drives PostgREST with a
-- service-role key. This is how it sees the grant table. Defined before the
-- revoke loop below so the loop covers it; the service role gets it back with
-- everything else.
create or replace function public.function_privilege_report()
returns table (signature text, anon_can boolean, authenticated_can boolean)
language sql stable security definer set search_path = public as $$
  select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         has_function_privilege('anon', p.oid, 'execute'),
         has_function_privilege('authenticated', p.oid, 'execute')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     -- citext and friends are not ours to police.
     and not exists (
       select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
   order by 1;
$$;

-- ------------------------------------------------- 4. revoke, re-grant ----
-- Extension-owned functions are skipped: citext lives in `public`, and
-- `users.email` / `enrollments.email` are citext, so revoking citext_eq would
-- break every email comparison and take sign-in down with it.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (
         select 1 from pg_depend d
          where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

grant execute on all functions in schema public to service_role;

-- ------------------------------------------------------- the allowlist ----
-- Anything absent from this list is unreachable from a browser. Keep it in
-- step with the EXPECTED_AUTHENTICATED set in scripts/verify-security.mjs —
-- the test fails loudly when they drift, which is the point.

-- RLS policy expressions are evaluated as the querying role, so the policy
-- helpers must stay executable. All are safe by construction: they take no
-- caller-supplied identity and return only facts about the caller.
grant execute on function public.is_admin() to authenticated;
grant execute on function public.my_enrollment_id() to authenticated;
grant execute on function public.my_cohort_id() to authenticated;
grant execute on function public.module_is_released(uuid) to authenticated;
grant execute on function public.assert_enrollment_access(uuid) to authenticated;

-- Learning and progress.
grant execute on function public.start_module(uuid) to authenticated;
grant execute on function public.complete_module(uuid, text) to authenticated;
grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean)
  to authenticated;

-- Submissions. save_draft and submit_work are SECURITY INVOKER by design, so
-- RLS stays a second layer under the checks in the RPC — which means the
-- caller needs execute on what they call.
grant execute on function public.item_deadline(work_item_type, uuid) to authenticated;
grant execute on function public.save_draft(work_item_type, uuid, jsonb, text) to authenticated;
grant execute on function public.submit_work(work_item_type, uuid, jsonb, text) to authenticated;
grant execute on function public.assert_submittable(work_item_type, uuid, jsonb, text, boolean)
  to authenticated;

-- Denominators. No arguments, cohort-scoped internally.
grant execute on function public.program_item_count() to authenticated;
grant execute on function public.program_module_count() to authenticated;

-- Motivation surface. Cohort-scoped internally.
grant execute on function public.leaderboard(integer) to authenticated;
grant execute on function public.leaderboard_consistent(integer) to authenticated;
grant execute on function public.active_creator_count() to authenticated;

-- Own-enrolment recomputation, reachable from the RPCs above. Each one calls
-- assert_enrollment_access() in its own body.
grant execute on function public.recompute_progress(uuid) to authenticated;
grant execute on function public.recompute_week_progress(uuid) to authenticated;
grant execute on function public.recompute_points(uuid) to authenticated;
grant execute on function public.compute_health(uuid) to authenticated;
grant execute on function public.compute_streak(uuid) to authenticated;

-- Admin operations. Each checks is_admin() in its body; the grant lets a
-- reviewer reach it, the body decides whether they may.
grant execute on function public.mark_attendance(uuid, uuid, boolean) to authenticated;
grant execute on function public.review_submission(uuid, submission_status, text) to authenticated;
grant execute on function public.set_enrollment_status(uuid, enrollment_status, text)
  to authenticated;
grant execute on function public.set_admin_note(uuid, text) to authenticated;
grant execute on function public.set_cohort_flag(uuid, text, boolean) to authenticated;
grant execute on function public.refresh_cohort_health(uuid) to authenticated;
grant execute on function public.recompute_cohort(uuid) to authenticated;
grant execute on function public.reconcile_lateness(work_item_type, uuid) to authenticated;

-- Deliberately ungranted, and reachable only as a trigger or from inside a
-- SECURITY DEFINER body running as the owner:
--   handle_new_user, protect_user_columns, touch_updated_at,
--   audit_content_change, points_for, is_safe_url, assert_safe_urls,
--   submissions_are_open, work_item_for_caller, scorable_submissions
