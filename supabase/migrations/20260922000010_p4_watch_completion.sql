-- ============================================================================
-- Completion is earned by watching, not by clicking.
--
-- record_video_progress already accumulates real playback ticks and ignores
-- scrubbing, so the 90% threshold means 90% actually watched. Completing the
-- module from inside that function makes watch time the single source of
-- truth and removes the self-declared button from the normal path.
--
-- The manual path is NOT deleted. If the IFrame API is blocked, tracking
-- yields nothing and a participant would otherwise be permanently stuck —
-- video tracking must never block completion (PRD F5.8). It becomes a
-- fallback, not the default.
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
  v_module     uuid;
  v_was_done   boolean;
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
    max_position_seconds = greatest(
      public.video_progress.max_position_seconds, excluded.max_position_seconds),
    watched_seconds = least(
      public.video_progress.watched_seconds + greatest(p_delta_seconds, 0),
      coalesce(p_duration_seconds, public.video_progress.duration_seconds, 2147483647)),
    duration_seconds = coalesce(p_duration_seconds, public.video_progress.duration_seconds),
    last_seen_at = now()
  returning * into v_row;

  v_was_done := v_row.completed_at is not null;
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

  -- Crossing the threshold completes the module, once.
  if v_row.completed_at is not null and not v_was_done then
    select l.module_id into v_module from public.lessons l where l.id = p_lesson_id;
    if v_module is not null then
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
  end if;

  return query select v_row.percentage_watched, v_row.completed_at is not null;
end $$;

grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean) to authenticated;
