-- ============================================================================
-- Progress writes.
--
-- These are RPCs rather than table writes because the invariants are not
-- expressible as constraints (AGENTS.md section 6):
--   * progress is MONOTONIC — a lower incoming position never lowers a maximum
--   * watched_seconds ACCUMULATES and is not max_position_seconds; scrubbing
--     to the end is not watching
--   * completion at >= 90% watched, or on the player's ENDED event
-- ============================================================================

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
  v_duration   integer;
  v_row        public.video_progress;
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;

  insert into public.video_progress (
    enrollment_id, lesson_id, max_position_seconds, watched_seconds,
    duration_seconds, started_at, last_seen_at
  )
  values (
    v_enrollment, p_lesson_id, greatest(p_position_seconds, 0),
    greatest(p_delta_seconds, 0), p_duration_seconds, now(), now()
  )
  on conflict (enrollment_id, lesson_id) do update set
    -- monotonic: greatest() is the whole point of this function
    max_position_seconds = greatest(
      public.video_progress.max_position_seconds, excluded.max_position_seconds),
    watched_seconds = least(
      public.video_progress.watched_seconds + greatest(p_delta_seconds, 0),
      coalesce(p_duration_seconds, public.video_progress.duration_seconds, 2147483647)),
    duration_seconds = coalesce(p_duration_seconds, public.video_progress.duration_seconds),
    last_seen_at = now()
  returning * into v_row;

  v_duration := nullif(coalesce(v_row.duration_seconds, 0), 0);

  update public.video_progress vp
     set percentage_watched = case
           when v_duration is null then 0
           else least(round((v_row.watched_seconds::numeric / v_duration) * 100, 2), 100)
         end,
         completed_at = case
           when vp.completed_at is not null then vp.completed_at
           when p_ended then now()
           when v_duration is not null
                and (v_row.watched_seconds::numeric / v_duration) >= 0.90 then now()
           else null
         end
   where vp.enrollment_id = v_enrollment and vp.lesson_id = p_lesson_id
  returning * into v_row;

  return query select v_row.percentage_watched, v_row.completed_at is not null;
end $$;

-- ---------------------------------------------------------------------------
-- Module completion. Always available manually: video tracking must never be
-- able to block completion (PRD F5.8).
-- ---------------------------------------------------------------------------
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

  insert into public.module_progress (enrollment_id, module_id, status, started_at)
  values (v_enrollment, p_module_id, 'in_progress', now())
  on conflict (enrollment_id, module_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- recompute_progress — the escape hatch (PRD section 11.6).
--
-- Rebuilds every cached rollup from source tables. Idempotent and safe to run
-- in bulk. Prototype 2 extends the denominator with assignments and tasks; the
-- denominator is FIXED across the whole programme, never released-so-far, so
-- the number only ever rises (PRD F8.4).
-- ---------------------------------------------------------------------------
create or replace function public.recompute_progress(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cohort    uuid;
  v_total     integer;
  v_completed integer;
begin
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  select count(*) into v_total
    from public.week_modules wm
    join public.program_weeks w on w.id = wm.week_id
   where w.cohort_id = v_cohort;

  select count(*) into v_completed
    from public.module_progress mp
    join public.week_modules wm on wm.module_id = mp.module_id
    join public.program_weeks w on w.id = wm.week_id and w.cohort_id = v_cohort
   where mp.enrollment_id = p_enrollment_id
     and mp.status = 'completed';

  update public.enrollments
     set progress_pct = case when v_total = 0 then 0
                        else round((v_completed::numeric / v_total) * 100, 2) end
   where id = p_enrollment_id;
end $$;

grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean) to authenticated;
grant execute on function public.complete_module(uuid, text) to authenticated;
grant execute on function public.start_module(uuid) to authenticated;
