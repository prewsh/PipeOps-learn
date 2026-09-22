-- ============================================================================
-- Progress integrity.
--
-- Three ways to earn completion without watching anything:
--
--   1. record_video_progress trusted `p_ended`, so a single call with
--      p_ended => true completed the module instantly;
--   2. it trusted `p_duration_seconds` from the caller, so a claimed duration
--      of 10 made any delta 100% of the video;
--   3. it trusted `p_delta_seconds`, so one call could claim an hour of watch
--      time in the same second.
--
-- And complete_module took any module id, released or not — a participant
-- could complete all of weeks 3 to 7 today and take the points.
--
-- The fixes lean on facts the server already holds. Duration comes from
-- `lessons.duration_seconds` (populated for every lesson). Watch time is
-- capped by the wall clock: you cannot accumulate more seconds of viewing
-- than have actually elapsed. `p_ended` stops being a completion signal in
-- its own right and becomes an allowance for tracking loss near the end.
--
-- What does NOT change: watched_seconds still accumulates and is still not
-- the playhead, max_position is still monotonic, and manual completion still
-- exists, because video tracking must never block completion (PRD F5.8).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recompute_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cohort uuid;
  v_total  integer;
  v_done   integer;
begin
  perform public.assert_enrollment_access(p_enrollment_id);
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  select
      (select count(*) from public.week_modules wm
         join public.program_weeks w on w.id = wm.week_id
         join public.modules m on m.id = wm.module_id
        where w.cohort_id = v_cohort and m.is_bonus = false)
    + (select count(*) from public.assignments a
         join public.week_modules wm on wm.module_id = a.module_id
         join public.program_weeks w on w.id = wm.week_id
        where w.cohort_id = v_cohort and a.is_required and a.status = 'published'
          and (a.cohort_id is null or a.cohort_id = v_cohort))
    + (select count(*) from public.program_tasks t
         join public.program_weeks w on w.id = t.week_id
        where w.cohort_id = v_cohort and t.is_required and t.status = 'published')
  into v_total;

  select
      (select count(*) from public.module_progress mp
         join public.week_modules wm on wm.module_id = mp.module_id
         join public.program_weeks w on w.id = wm.week_id and w.cohort_id = v_cohort
         join public.modules m on m.id = mp.module_id and m.is_bonus = false
        where mp.enrollment_id = p_enrollment_id and mp.status = 'completed')
    + (select count(*) from public.scorable_submissions(p_enrollment_id))
  into v_done;

  update public.enrollments
     set progress_pct = case when v_total = 0 then 0
                        else round((least(v_done, v_total)::numeric / v_total) * 100, 2) end,
         health = public.compute_health(p_enrollment_id)
   where id = p_enrollment_id;

  -- Week progress first: the week bonuses read from it.
  perform public.recompute_week_progress(p_enrollment_id);
  perform public.recompute_points(p_enrollment_id);
end $function$;

CREATE OR REPLACE FUNCTION public.recompute_week_progress(p_enrollment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cohort uuid;
begin
  perform public.assert_enrollment_access(p_enrollment_id);
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  insert into public.week_progress (
    enrollment_id, week_id, modules_completed, modules_total,
    assignments_submitted, assignments_total, tasks_submitted, tasks_total,
    task_submitted, is_complete, completed_at, updated_at
  )
  select
    p_enrollment_id,
    w.id,
    coalesce(mods.done, 0),
    coalesce(mods.total, 0),
    coalesce(asg.done, 0),
    coalesce(asg.total, 0),
    coalesce(tsk.done, 0),
    coalesce(tsk.total, 0),
    coalesce(tsk.total, 0) > 0 and coalesce(tsk.done, 0) >= coalesce(tsk.total, 0),
    coalesce(mods.done, 0) >= coalesce(mods.total, 0)
      and coalesce(asg.done, 0) >= coalesce(asg.total, 0)
      and coalesce(tsk.done, 0) >= coalesce(tsk.total, 0),
    case when coalesce(mods.done, 0) >= coalesce(mods.total, 0)
              and coalesce(asg.done, 0) >= coalesce(asg.total, 0)
              and coalesce(tsk.done, 0) >= coalesce(tsk.total, 0)
         then now() end,
    now()
  from public.program_weeks w
  left join lateral (
    select count(*) filter (where m.is_bonus = false) as total,
           count(*) filter (where m.is_bonus = false and mp.status = 'completed') as done
      from public.week_modules wm
      join public.modules m on m.id = wm.module_id
      left join public.module_progress mp
        on mp.module_id = m.id and mp.enrollment_id = p_enrollment_id
     where wm.week_id = w.id
  ) mods on true
  left join lateral (
    select count(*) as total,
           count(*) filter (where s.id is not null) as done
      from public.assignments a
      join public.week_modules wm on wm.module_id = a.module_id
      left join public.submissions s
        on s.item_id = a.id and s.enrollment_id = p_enrollment_id and s.status <> 'draft'
     where wm.week_id = w.id and a.is_required and a.status = 'published'
  ) asg on true
  left join lateral (
    select count(*) as total,
           count(*) filter (where s.id is not null) as done
      from public.program_tasks t
      left join public.submissions s
        on s.item_id = t.id and s.enrollment_id = p_enrollment_id and s.status <> 'draft'
     where t.week_id = w.id and t.is_required and t.status = 'published'
  ) tsk on true
  where w.cohort_id = v_cohort
  on conflict (enrollment_id, week_id) do update set
    modules_completed = excluded.modules_completed,
    modules_total = excluded.modules_total,
    assignments_submitted = excluded.assignments_submitted,
    assignments_total = excluded.assignments_total,
    tasks_submitted = excluded.tasks_submitted,
    tasks_total = excluded.tasks_total,
    task_submitted = excluded.task_submitted,
    is_complete = excluded.is_complete,
    completed_at = coalesce(public.week_progress.completed_at, excluded.completed_at),
    updated_at = now();

  update public.enrollments
     set weeks_completed = (
       select count(*) from public.week_progress
        where enrollment_id = p_enrollment_id and is_complete)
   where id = p_enrollment_id;
end $function$;

-- ------------------------------------------------- video, honest clock ----
-- The grace allowance above the measured gap. The player flushes every 15s
-- (components/VideoPlayer.tsx), so a legitimate call never carries more than
-- that plus a little jitter; 20s leaves room for a slow network without
-- leaving room to fabricate a viewing.
create or replace function public.record_video_progress(
  p_lesson_id        uuid,
  p_position_seconds integer,
  p_delta_seconds    integer default 0,
  p_duration_seconds integer default null,
  p_ended            boolean default false
) returns table (percentage numeric, completed boolean)
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
  v_module     uuid;
  v_stored_dur integer;
  v_duration   integer;
  v_prev       public.video_progress;
  v_elapsed    integer;
  v_delta      integer;
  v_row        public.video_progress;
  v_was_done   boolean;
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;

  -- The lesson must belong to a module released for THIS caller. Without
  -- this, progress could be banked against week 7 in week 1.
  select l.module_id, l.duration_seconds into v_module, v_stored_dur
    from public.lessons l where l.id = p_lesson_id;
  if v_module is null then
    raise exception 'no such lesson';
  end if;
  if not public.module_is_released(v_module) then
    raise exception 'that module has not been released';
  end if;

  -- The stored duration wins. A caller-supplied one is only a fallback for a
  -- lesson whose length has not been recorded yet.
  v_duration := nullif(coalesce(v_stored_dur, p_duration_seconds, 0), 0);

  select * into v_prev
    from public.video_progress
   where enrollment_id = v_enrollment and lesson_id = p_lesson_id;

  -- You cannot watch more seconds than have passed. On the first flush the
  -- gap is measured from now, so the allowance alone applies.
  v_elapsed := case
    when v_prev.lesson_id is null then 0
    else greatest(0, ceil(extract(epoch from (now() - v_prev.last_seen_at))))::integer
  end;
  v_delta := least(greatest(coalesce(p_delta_seconds, 0), 0), v_elapsed + 20);

  insert into public.video_progress (
    enrollment_id, lesson_id, max_position_seconds, watched_seconds,
    duration_seconds, started_at, last_seen_at
  )
  values (
    v_enrollment, p_lesson_id, greatest(p_position_seconds, 0),
    v_delta, v_duration, now(), now()
  )
  on conflict (enrollment_id, lesson_id) do update set
    -- monotonic: a late flush with a lower position never lowers the maximum
    max_position_seconds = greatest(
      public.video_progress.max_position_seconds, excluded.max_position_seconds),
    watched_seconds = least(
      public.video_progress.watched_seconds + v_delta,
      coalesce(v_duration, public.video_progress.duration_seconds, 2147483647)),
    duration_seconds = coalesce(v_duration, public.video_progress.duration_seconds),
    last_seen_at = now()
  returning * into v_row;

  v_was_done := v_prev.completed_at is not null;
  v_duration := nullif(coalesce(v_row.duration_seconds, 0), 0);

  update public.video_progress vp
     set percentage_watched = case
           when v_duration is null then 0
           else least(round((v_row.watched_seconds::numeric / v_duration) * 100, 2), 100)
         end,
         completed_at = case
           when vp.completed_at is not null then vp.completed_at
           when v_duration is null then null
           -- 90% genuinely watched completes. `p_ended` no longer completes on
           -- its own — it lowers the bar to 75%, which covers playback the
           -- tracker lost without covering a scrub to the end.
           when (v_row.watched_seconds::numeric / v_duration) >= 0.90 then now()
           when p_ended and (v_row.watched_seconds::numeric / v_duration) >= 0.75 then now()
           else null
         end
   where vp.enrollment_id = v_enrollment and vp.lesson_id = p_lesson_id
  returning * into v_row;

  -- Crossing the threshold completes the module, once.
  if v_row.completed_at is not null and not v_was_done then
    insert into public.module_progress (
      enrollment_id, module_id, status, started_at, completed_at, completed_via
    )
    values (v_enrollment, v_module, 'completed', now(), now(), 'auto')
    on conflict (enrollment_id, module_id) do update set
      status = 'completed',
      completed_at = coalesce(public.module_progress.completed_at, now()),
      completed_via = coalesce(public.module_progress.completed_via, 'auto');

    perform public.recompute_progress(v_enrollment);
  end if;

  return query select v_row.percentage_watched, v_row.completed_at is not null;
end $$;

-- ------------------------------------------ manual completion, gated ----
-- Still available — if the IFrame API is blocked, tracking yields nothing and
-- the participant would otherwise be stuck forever (F5.8). But it is now
-- limited to modules that have actually been released to them.
create or replace function public.complete_module(
  p_module_id uuid,
  p_via       text default 'manual'
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;
  if not public.module_is_released(p_module_id) then
    raise exception 'that module has not been released';
  end if;

  insert into public.module_progress (
    enrollment_id, module_id, status, started_at, completed_at, completed_via
  )
  values (v_enrollment, p_module_id, 'completed', now(), now(), p_via)
  on conflict (enrollment_id, module_id) do update set
    status = 'completed',
    -- idempotent: re-completing never moves the original timestamp
    completed_at = coalesce(public.module_progress.completed_at, now()),
    completed_via = coalesce(public.module_progress.completed_via, p_via);

  perform public.recompute_progress(v_enrollment);
end $$;

create or replace function public.start_module(p_module_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
begin
  if v_enrollment is null then return; end if;
  if not public.module_is_released(p_module_id) then return; end if;

  insert into public.module_progress (enrollment_id, module_id, status, started_at)
  values (v_enrollment, p_module_id, 'in_progress', now())
  on conflict (enrollment_id, module_id) do nothing;
end $$;

grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean)
  to authenticated;
grant execute on function public.complete_module(uuid, text) to authenticated;
grant execute on function public.start_module(uuid) to authenticated;
