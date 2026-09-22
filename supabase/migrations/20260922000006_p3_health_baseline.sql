-- ============================================================================
-- Fix: a participant cannot be "dormant" before they could possibly have
-- signed in.
--
-- The F14 rule reads "never logged in after Week 1 release", but enrolment can
-- happen after that release — as it did for Cohort 01, where the whole list was
-- imported on day two. Measuring from week 1 alone flagged 112 people as
-- dormant the moment they were imported, before a single invite had gone out.
--
-- The baseline is therefore the LATER of week 1's release and the participant's
-- own enrolment, plus a day's grace.
-- ============================================================================

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
