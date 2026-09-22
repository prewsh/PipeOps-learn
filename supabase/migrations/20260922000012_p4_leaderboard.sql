-- ============================================================================
-- Leaderboard access + wiring points into the single recompute entry point.
--
-- The board exposes display name, points and streak only — never submissions
-- or email addresses (AGENTS.md section 7). Participants who opt out are
-- excluded from other people's view but still see their own standing.
-- ============================================================================

create or replace function public.recompute_progress(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cohort uuid;
  v_total  integer;
  v_done   integer;
begin
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
    + (select count(distinct s.item_id) from public.submissions s
        where s.enrollment_id = p_enrollment_id and s.status <> 'draft')
  into v_done;

  update public.enrollments
     set progress_pct = case when v_total = 0 then 0
                        else round((least(v_done, v_total)::numeric / v_total) * 100, 2) end,
         health = public.compute_health(p_enrollment_id)
   where id = p_enrollment_id;

  -- Week progress first: the week bonuses read from it.
  perform public.recompute_week_progress(p_enrollment_id);
  perform public.recompute_points(p_enrollment_id);
end $$;

-- ---------------------------------------------------------- leaderboard ----
create or replace function public.leaderboard(p_limit integer default 25)
returns table (
  rank            bigint,
  enrollment_id   uuid,
  display_name    text,
  points_total    integer,
  streak_weeks    integer,
  weeks_completed integer,
  is_me           boolean
)
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
  select r.rank, r.id, r.display_name, r.points_total, r.streak_weeks,
         r.weeks_completed, r.id = (select id from me)
    from ranked r
   where r.rank <= p_limit
      -- Always include the caller's own neighbourhood, even outside the top N
      or abs(r.rank - (select rank from ranked where id = (select id from me))) <= 2
   order by r.rank;
$$;

-- "Most consistent" ranks by completed weeks, then on-time submission rate —
-- behaviour, not reach (PRD F10.8).
create or replace function public.leaderboard_consistent(p_limit integer default 10)
returns table (
  rank            bigint,
  display_name    text,
  weeks_completed integer,
  on_time_rate    numeric,
  is_me           boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_enrollment_id() as id)
  select
    row_number() over (
      order by e.weeks_completed desc,
               coalesce(
                 (select avg(case when s.is_late then 0 else 1 end)::numeric
                    from public.submissions s
                   where s.enrollment_id = e.id and s.status <> 'draft'), 0) desc,
               e.enrolled_at asc
    ) as rank,
    coalesce(nullif(trim(e.name), ''), split_part(e.email::text, '@', 1)),
    e.weeks_completed,
    round(coalesce(
      (select avg(case when s.is_late then 0 else 1 end)::numeric
         from public.submissions s
        where s.enrollment_id = e.id and s.status <> 'draft'), 0) * 100, 0),
    e.id = (select id from me)
  from public.enrollments e
  left join public.users u on u.id = e.user_id
  where e.cohort_id = (select cohort_id from public.enrollments where id = (select id from me))
    and e.status = 'active'
    and (coalesce(u.leaderboard_opt_out, false) = false or e.id = (select id from me))
  order by rank
  limit p_limit;
$$;

-- "Active creators" for the "#12 of 87" denominator (PRD F10.10).
create or replace function public.active_creator_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.enrollments e
   where e.cohort_id = (select cohort_id from public.enrollments where id = public.my_enrollment_id())
     and e.status = 'active'
     and e.last_active_at > now() - interval '14 days';
$$;

grant execute on function public.leaderboard(integer) to authenticated;
grant execute on function public.leaderboard_consistent(integer) to authenticated;
grant execute on function public.active_creator_count() to authenticated;
