-- ============================================================================
-- Privilege lockdown. This migration runs LAST on purpose.
--
-- Postgres grants EXECUTE on every new function to PUBLIC, and a Supabase
-- project additionally carries a default privilege granting functions to
-- `anon` and `authenticated`. Together that means every function in `public`
-- — including the SECURITY DEFINER helpers that run as the owner and bypass
-- RLS — is callable from a browser the moment it is created.
--
-- A revoke can only cover functions that exist when it runs, so this has to be
-- the final migration in the security series. The ownership checks it relies
-- on are added in …0020, …0021 and …0022.
-- ============================================================================

-- ------------------------------------------------------- 1. revoke all ----
-- NOT `revoke execute on all functions in schema public`. The citext extension
-- installs its operator functions into `public`, and `users.email` /
-- `enrollments.email` are citext columns — revoking execute on citext_eq would
-- make every email comparison fail with a permission error, which is to say it
-- would take sign-in down. Extension-owned functions (pg_depend.deptype = 'e')
-- are therefore skipped; only functions this project created are revoked.
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

-- The default has to name the role that creates the objects, and has to name
-- anon and authenticated explicitly — the Supabase project default grants to
-- both, so revoking from PUBLIC alone leaves them. This is what stops the next
-- migration quietly reopening the hole.
alter default privileges for role postgres in schema public
  revoke execute on functions from public;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from authenticated;

-- The service role keeps everything: admin scripts, the nightly health job and
-- the verification suites all run through it, and it is never reachable from a
-- browser.
grant execute on all functions in schema public to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- -------------------------------------------------------- grant back ----
-- The participant RPC surface. Anything not listed here is unreachable from
-- a browser, including every trigger function and every internal helper.

-- RLS policy expressions are evaluated as the querying role, so the policy
-- helpers must stay executable. All four are safe by construction: they take
-- no caller-supplied identity and return only facts about the caller.
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

-- Submissions. item_deadline is reachable only through these two, but
-- submit_work is SECURITY INVOKER — deliberately, so RLS stays a second layer
-- under the checks in the RPC — which means the caller needs execute on it.
-- A deadline is not sensitive: it is printed on the locked week card.
grant execute on function public.item_deadline(work_item_type, uuid) to authenticated;
grant execute on function public.save_draft(work_item_type, uuid, jsonb, text) to authenticated;
grant execute on function public.submit_work(work_item_type, uuid, jsonb, text) to authenticated;

-- The validation gate those two call. Everything IT calls in turn runs inside a
-- SECURITY DEFINER body as the owner and stays unreachable from a browser:
-- submissions_are_open, is_safe_url, assert_safe_urls, work_item_for_caller
-- and scorable_submissions are all deliberately ungranted.
grant execute on function public.assert_submittable(work_item_type, uuid, jsonb, text, boolean)
  to authenticated;

-- Denominators. No arguments, cohort-scoped internally.
grant execute on function public.program_item_count() to authenticated;
grant execute on function public.program_module_count() to authenticated;

-- Motivation surface. Cohort-scoped internally; exposes display name, points
-- and streak only.
grant execute on function public.leaderboard(integer) to authenticated;
grant execute on function public.leaderboard_consistent(integer) to authenticated;
grant execute on function public.active_creator_count() to authenticated;

-- Own-enrolment recomputation, reachable from the RPCs above. Ownership is
-- enforced inside each one by 20260922000022.
grant execute on function public.recompute_progress(uuid) to authenticated;
grant execute on function public.recompute_week_progress(uuid) to authenticated;
grant execute on function public.recompute_points(uuid) to authenticated;
grant execute on function public.compute_health(uuid) to authenticated;
grant execute on function public.compute_streak(uuid) to authenticated;

-- Admin operations. Each one already checks is_admin() in its body; the grant
-- lets a reviewer reach it, the body decides whether they may.
-- mark_attendance is admin-only and stays that way: it writes SESSION_ATTENDED
-- into the points ledger, so self-service would be self-scoring.
grant execute on function public.mark_attendance(uuid, uuid, boolean) to authenticated;
grant execute on function public.review_submission(uuid, submission_status, text) to authenticated;
grant execute on function public.set_enrollment_status(uuid, enrollment_status, text)
  to authenticated;
grant execute on function public.set_admin_note(uuid, text) to authenticated;
grant execute on function public.refresh_cohort_health(uuid) to authenticated;
grant execute on function public.recompute_cohort(uuid) to authenticated;
grant execute on function public.reconcile_lateness(work_item_type, uuid) to authenticated;

-- Deliberately NOT granted, and each is reachable only as a trigger or from
-- inside another function running as owner:
--   handle_new_user()        auth.users trigger
--   protect_user_columns()   public.users trigger
--   touch_updated_at()       updated_at trigger on every content table
--   points_for(points_rule)  called by recompute_points as owner
