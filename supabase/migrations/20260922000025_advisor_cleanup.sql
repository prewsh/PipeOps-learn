-- ============================================================================
-- Supabase advisor cleanup: unindexed foreign keys, and per-row auth.uid().
--
-- Neither is a vulnerability. Both become one kind of problem or another once
-- 114 people are generating rows, and both are cheap to fix now and awkward to
-- fix during a live cohort.
--
-- 1. Sixteen foreign keys had no covering index. The cost shows up on the
--    admin screens that join across them and, more sharply, on any cascading
--    delete — removing an enrolment has to scan every referencing table.
--
-- 2. Six policies called auth.uid() directly. Postgres re-evaluates that for
--    every candidate row; wrapping it in a scalar subquery makes it an
--    InitPlan, evaluated once per statement. On a 114-row enrolment table the
--    difference is invisible; on points_events and activity_events, which grow
--    without bound, it is not.
--
-- Deliberately NOT done: moving `citext` out of `public`. Two live columns
-- (users.email, enrollments.email) are citext, so relocating the extension
-- means dropping and recreating types that real data depends on. The advisor
-- flags it as hygiene; the migration to fix it is riskier than the finding.
-- Recorded in docs/DEPLOYMENT.md as accepted.
-- ============================================================================

-- ------------------------------------------------- 1. foreign key indexes ----
create index if not exists activity_events_user_idx      on public.activity_events (user_id);
create index if not exists announcement_reads_enr_idx    on public.announcement_reads (enrollment_id);
create index if not exists announcements_created_by_idx  on public.announcements (created_by);
create index if not exists assignments_cohort_idx        on public.assignments (cohort_id);
create index if not exists audit_log_actor_idx           on public.audit_log (actor_user_id);
create index if not exists cohorts_program_idx           on public.cohorts (program_id);
create index if not exists live_sessions_week_idx        on public.live_sessions (week_id);
create index if not exists module_progress_module_idx    on public.module_progress (module_id);
create index if not exists modules_part_idx              on public.modules (part_id);
create index if not exists points_events_reversal_idx    on public.points_events (reversal_of);
create index if not exists session_attendance_enr_idx    on public.session_attendance (enrollment_id);
create index if not exists session_attendance_marked_idx on public.session_attendance (marked_by);
create index if not exists submissions_reviewed_by_idx   on public.submissions (reviewed_by);
create index if not exists video_progress_lesson_idx     on public.video_progress (lesson_id);
create index if not exists week_modules_module_idx       on public.week_modules (module_id);
create index if not exists week_progress_week_idx        on public.week_progress (week_id);

-- ------------------------------------------------ 2. auth.uid() init plan ----
-- Rewrites `auth.uid()` to `(select auth.uid())` in every policy that calls it
-- directly. Done as a loop over pg_policies rather than by hand so that it
-- cannot miss one, and so re-running it is a no-op.
do $$
declare
  r      record;
  v_qual text;
  v_chk  text;
begin
  for r in
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
       and coalesce(qual, '') not like '%( SELECT auth.uid()%'
       and coalesce(with_check, '') not like '%( SELECT auth.uid()%'
  loop
    v_qual := replace(r.qual, 'auth.uid()', '(select auth.uid())');
    v_chk  := replace(r.with_check, 'auth.uid()', '(select auth.uid())');

    if v_qual is not null then
      execute format('alter policy %I on %I.%I using (%s)',
                     r.policyname, r.schemaname, r.tablename, v_qual);
    end if;

    if v_chk is not null then
      execute format('alter policy %I on %I.%I with check (%s)',
                     r.policyname, r.schemaname, r.tablename, v_chk);
    end if;
  end loop;
end $$;
