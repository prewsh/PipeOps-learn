-- ============================================================================
-- Prototype 4 — points, streaks, leaderboard.
-- PRD F10. Rewards behaviour, never audience size: no follower counts, likes
-- or views appear anywhere in scoring.
--
-- The ledger is the authority. Totals are a cache, and if the two disagree the
-- ledger is right (AGENTS.md section 6).
-- ============================================================================

create type points_rule as enum (
  'MODULE_COMPLETED',
  'ASSIGNMENT_SUBMITTED',
  'TASK_SUBMITTED',
  'ON_TIME_BONUS',
  'WEEK_MODULES_COMPLETE',
  'WEEK_COMPLETE',
  'SESSION_ATTENDED',
  'FINAL_PROJECT_APPROVED'
);

create table public.points_events (
  id           bigserial primary key,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  rule         points_rule not null,
  target_type  text not null,
  target_id    uuid not null,
  points       integer not null,
  occurred_at  timestamptz not null default now(),
  note         text,
  -- A reversal references the row it cancels. Rows are never updated or
  -- deleted; undoing something writes a negative row instead.
  reversal_of  bigint references public.points_events(id) on delete restrict
);

-- Idempotency: one award per (enrollment, rule, target). Reversals are exempt
-- because they carry reversal_of, and the partial index leaves them alone.
create unique index points_events_award_key
  on public.points_events (enrollment_id, rule, target_type, target_id)
  where reversal_of is null;

create index points_events_enrollment_idx on public.points_events (enrollment_id);

alter table public.points_events enable row level security;

-- Read-only to participants, and only their own. No insert policy: awards are
-- written by SECURITY DEFINER functions, never by a client.
create policy points_events_own on public.points_events
  for select using (enrollment_id = public.my_enrollment_id() or public.is_admin());

-- ---------------------------------------------------------- rule points ----
create or replace function public.points_for(p_rule points_rule) returns integer
language sql immutable as $$
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

-- ---------------------------------------------------- recompute_points ----
-- Derives the whole ledger from source state. Awards what is missing, and
-- writes a compensating negative row for anything whose source has gone away.
-- Idempotent, and safe to run in bulk — this is the escape hatch for any
-- scoring bug during a live cohort (PRD section 11.6).
create or replace function public.recompute_points(p_enrollment_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cohort uuid;
  v_total  integer;
begin
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return 0; end if;

  -- 1. completed modules
  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id, 'MODULE_COMPLETED', 'module', mp.module_id,
         public.points_for('MODULE_COMPLETED'), mp.completed_at
    from public.module_progress mp
    join public.week_modules wm on wm.module_id = mp.module_id
    join public.program_weeks w on w.id = wm.week_id and w.cohort_id = v_cohort
    join public.modules m on m.id = mp.module_id and m.is_bonus = false
   where mp.enrollment_id = p_enrollment_id and mp.status = 'completed'
  on conflict do nothing;

  -- 2. submitted work, and the on-time bonus that goes with it
  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id,
         case when s.item_type = 'assignment' then 'ASSIGNMENT_SUBMITTED'::points_rule
              else 'TASK_SUBMITTED'::points_rule end,
         s.item_type::text, s.item_id,
         case when s.item_type = 'assignment'
              then public.points_for('ASSIGNMENT_SUBMITTED')
              else public.points_for('TASK_SUBMITTED') end,
         min(s.submitted_at)
    from public.submissions s
   where s.enrollment_id = p_enrollment_id and s.status <> 'draft'
   group by s.item_type, s.item_id
  on conflict do nothing;

  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id, 'ON_TIME_BONUS', s.item_type::text, s.item_id,
         public.points_for('ON_TIME_BONUS'), min(s.submitted_at)
    from public.submissions s
   where s.enrollment_id = p_enrollment_id
     and s.status <> 'draft'
   group by s.item_type, s.item_id
  having bool_and(s.is_late) = false
  on conflict do nothing;

  -- 3. week bonuses
  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id, 'WEEK_MODULES_COMPLETE', 'week', wp.week_id,
         public.points_for('WEEK_MODULES_COMPLETE'), now()
    from public.week_progress wp
   where wp.enrollment_id = p_enrollment_id
     and wp.modules_total > 0
     and wp.modules_completed >= wp.modules_total
  on conflict do nothing;

  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id, 'WEEK_COMPLETE', 'week', wp.week_id,
         public.points_for('WEEK_COMPLETE'), coalesce(wp.completed_at, now())
    from public.week_progress wp
   where wp.enrollment_id = p_enrollment_id and wp.is_complete
  on conflict do nothing;

  -- 4. reversals — an award whose source no longer holds is cancelled, once
  insert into public.points_events
    (enrollment_id, rule, target_type, target_id, points, reversal_of, note)
  select e.enrollment_id, e.rule, e.target_type, e.target_id, -e.points, e.id,
         'source no longer satisfies the rule'
    from public.points_events e
   where e.enrollment_id = p_enrollment_id
     and e.reversal_of is null
     and not exists (
       select 1 from public.points_events r where r.reversal_of = e.id)
     and (
       (e.rule = 'MODULE_COMPLETED' and not exists (
          select 1 from public.module_progress mp
           where mp.enrollment_id = e.enrollment_id
             and mp.module_id = e.target_id and mp.status = 'completed'))
       or (e.rule in ('ASSIGNMENT_SUBMITTED', 'TASK_SUBMITTED', 'ON_TIME_BONUS')
           and not exists (
          select 1 from public.submissions s
           where s.enrollment_id = e.enrollment_id
             and s.item_id = e.target_id and s.status <> 'draft'))
       or (e.rule = 'WEEK_COMPLETE' and not exists (
          select 1 from public.week_progress wp
           where wp.enrollment_id = e.enrollment_id
             and wp.week_id = e.target_id and wp.is_complete))
     );

  select coalesce(sum(points), 0) into v_total
    from public.points_events where enrollment_id = p_enrollment_id;

  update public.enrollments
     set points_total = v_total,
         streak_weeks = public.compute_streak(p_enrollment_id)
   where id = p_enrollment_id;

  return v_total;
end $$;

-- --------------------------------------------------------------- streak ----
-- Consecutive completed weeks ending at the current one. A week that has not
-- released cannot break a streak; an unfinished current week simply is not
-- counted yet (PRD section 11.4).
create or replace function public.compute_streak(p_enrollment_id uuid) returns integer
language plpgsql stable security definer set search_path = public as $$
declare
  v_cohort uuid;
  r        record;
  v_run    integer := 0;
begin
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

grant execute on function public.recompute_points(uuid) to authenticated;
grant execute on function public.compute_streak(uuid) to authenticated;
