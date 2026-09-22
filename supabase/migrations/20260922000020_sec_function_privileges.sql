-- ============================================================================
-- Function execution privileges.
--
-- Postgres grants EXECUTE on every new function to PUBLIC. Supabase exposes
-- `public` over PostgREST, so every function in this schema — including the
-- SECURITY DEFINER helpers that run as the owner and bypass RLS — has been
-- callable by `anon` and `authenticated` since it was created.
--
-- Two of them leaked. `compute_health(uuid)` and `compute_streak(uuid)` take
-- an arbitrary enrolment id, run as owner, and RETURN a value: any signed-in
-- participant could read any other participant's health state and streak.
-- That breaks the invariant in AGENTS.md section 7 — participants read only
-- their own progress and activity.
--
-- This migration adds the ownership checks. The privilege lockdown itself is
-- the LAST migration in the series (…0023), because a revoke can only cover
-- functions that already exist — running it here would miss everything the
-- two migrations after it create.
--
-- The two function bodies below are reproduced from their current definitions
-- with ONE line added. Health and streak feed live cohort operations and the
-- points ledger; rewriting either from memory would corrupt real numbers
-- quietly (AGENTS.md section 6).
-- ============================================================================

-- ----------------------------------------------- ownership checks ----

-- Guard shared by every function that accepts an enrolment id. Admins may act
-- on anyone; a participant may act only on themselves. Raising (rather than
-- returning null) makes a probe fail loudly instead of looking like an empty
-- result.
create or replace function public.assert_enrollment_access(p_enrollment_id uuid)
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_enrollment_id is null then
    raise exception 'enrolment id is required';
  end if;
  -- No JWT means the service role, a migration or the nightly job — never a
  -- browser, because `anon` no longer holds EXECUTE on any of this. Same
  -- convention as protect_user_columns().
  if auth.uid() is null then return; end if;
  if public.is_admin() then return; end if;
  if p_enrollment_id = public.my_enrollment_id() then return; end if;
  raise exception 'not authorised for that enrolment';
end $$;

-- compute_health: unchanged from 20260922000006 except for the guard.
create or replace function public.compute_health(p_enrollment_id uuid)
returns health_state
language plpgsql stable security definer set search_path = public as $$
declare
  v_last     timestamptz;
  v_days     numeric;
  v_missed   integer;
  v_cohort   uuid;
  v_enrolled timestamptz;
  v_week1    timestamptz;
  v_baseline timestamptz;
begin
  perform public.assert_enrollment_access(p_enrollment_id);

  select e.last_active_at, e.cohort_id, e.enrolled_at
    into v_last, v_cohort, v_enrolled
    from public.enrollments e where e.id = p_enrollment_id;

  select min(w.release_at) into v_week1
    from public.program_weeks w where w.cohort_id = v_cohort;

  v_baseline := greatest(coalesce(v_week1, v_enrolled), v_enrolled);

  -- Never signed in: judge against the baseline, not against week 1 alone.
  if v_last is null then
    return case
      when now() > v_baseline + interval '14 days' then 'dormant'::health_state
      when now() > v_baseline + interval '7 days'  then 'at_risk'::health_state
      when now() > v_baseline + interval '4 days'  then 'needs_attention'::health_state
      else 'active'::health_state
    end;
  end if;

  v_days := extract(epoch from (now() - v_last)) / 86400.0;

  select count(*) into v_missed
    from (
      select t.id as item_id, coalesce(t.deadline_at, w.deadline_at) as due
        from public.program_tasks t
        join public.program_weeks w on w.id = t.week_id
       where w.cohort_id = v_cohort and t.is_required and t.status = 'published'
      union all
      select a.id, coalesce(a.deadline_at, w.deadline_at)
        from public.assignments a
        join public.week_modules wm on wm.module_id = a.module_id
        join public.program_weeks w on w.id = wm.week_id
       where w.cohort_id = v_cohort and a.is_required and a.status = 'published'
    ) items
   where items.due < now()
     and not exists (
       select 1 from public.submissions s
        where s.enrollment_id = p_enrollment_id
          and s.item_id = items.item_id
          and s.status <> 'draft');

  if v_days >= 14 then return 'dormant'; end if;
  if v_days >= 7 or v_missed >= 2 then return 'at_risk'; end if;
  if v_days >= 4 then return 'needs_attention'; end if;
  return 'active';
end $$;

-- compute_streak: unchanged from 20260922000011 except for the guard.
create or replace function public.compute_streak(p_enrollment_id uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  v_cohort uuid;
  r        record;
  v_run    integer := 0;
begin
  perform public.assert_enrollment_access(p_enrollment_id);

  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return 0; end if;

  for r in
    select w.number, coalesce(wp.is_complete, false) as done
      from public.program_weeks w
      left join public.week_progress wp
        on wp.week_id = w.id and wp.enrollment_id = p_enrollment_id
     where w.cohort_id = v_cohort and w.release_at <= now()
     order by w.number
  loop
    if r.done then v_run := v_run + 1; else v_run := 0; end if;
  end loop;

  return v_run;
end $$;

-- ------------------------------------------------ 3. mutable search_path ----
-- Both are flagged by the Supabase linter. Neither reads a table, so this is
-- hardening rather than a live hole — but a trigger function without a pinned
-- search_path is a standing invitation.
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.points_for(p_rule points_rule) returns integer
language sql immutable set search_path = public as $$
  select case p_rule
    when 'MODULE_COMPLETED'       then 10
    when 'ASSIGNMENT_SUBMITTED'   then 15
    when 'TASK_SUBMITTED'         then 20
    when 'ON_TIME_BONUS'          then 5
    when 'WEEK_MODULES_COMPLETE'  then 10
    when 'WEEK_COMPLETE'          then 10
    when 'SESSION_ATTENDED'       then 5
    when 'FINAL_PROJECT_APPROVED' then 30
  end;
$$;

