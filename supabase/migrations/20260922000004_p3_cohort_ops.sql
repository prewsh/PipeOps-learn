-- ============================================================================
-- Prototype 3 — cohort operations.
-- PRD: F11 overview · F12 participants · F14 health · F15 announcements
--      F13.6 audit log
-- ============================================================================

-- Admin-only free-text notes on a participant (F12.5).
alter table public.enrollments add column if not exists admin_notes text;

-- ------------------------------------------------------- week progress ----
-- Derived cache. Every value is rebuildable from source by recompute_progress.
create table if not exists public.week_progress (
  id                    uuid primary key default gen_random_uuid(),
  enrollment_id         uuid not null references public.enrollments(id) on delete cascade,
  week_id               uuid not null references public.program_weeks(id) on delete cascade,
  modules_completed     integer not null default 0,
  modules_total         integer not null default 0,
  assignments_submitted integer not null default 0,
  assignments_total     integer not null default 0,
  task_submitted        boolean not null default false,
  is_complete           boolean not null default false,
  completed_at          timestamptz,
  updated_at            timestamptz not null default now(),
  unique (enrollment_id, week_id)
);

-- -------------------------------------------------------- announcements ----
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  cohort_id   uuid not null references public.cohorts(id) on delete cascade,
  title       text not null,
  body        text not null,
  link_url    text,
  is_pinned   boolean not null default false,
  publish_at  timestamptz not null default now(),
  send_email  boolean not null default false,
  audience    jsonb not null default '{"type":"all"}'::jsonb,
  created_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists announcements_cohort_publish_idx
  on public.announcements (cohort_id, publish_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  enrollment_id   uuid not null references public.enrollments(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, enrollment_id)
);

-- ------------------------------------------------------------ audit log ----
create table if not exists public.audit_log (
  id            bigserial primary key,
  actor_user_id uuid references public.users(id) on delete set null,
  action        text not null,
  target_type   text,
  target_id     uuid,
  before        jsonb,
  after         jsonb,
  occurred_at   timestamptz not null default now()
);
create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);

-- ------------------------------------------------------ engagement health --
-- Rules from PRD F14. Derived from activity_events and missed deadlines only —
-- never hand-edited.
create or replace function public.compute_health(p_enrollment_id uuid)
returns health_state
language plpgsql stable security definer set search_path = public as $$
declare
  v_last     timestamptz;
  v_days     numeric;
  v_missed   integer;
  v_cohort   uuid;
  v_started  timestamptz;
begin
  select e.last_active_at, e.cohort_id into v_last, v_cohort
    from public.enrollments e where e.id = p_enrollment_id;

  select min(w.release_at) into v_started
    from public.program_weeks w where w.cohort_id = v_cohort;

  -- Never signed in, and week 1 has been out for a day or more.
  if v_last is null then
    return case when v_started is not null and now() > v_started + interval '1 day'
                then 'dormant'::health_state else 'active'::health_state end;
  end if;

  v_days := extract(epoch from (now() - v_last)) / 86400.0;

  -- Required items whose deadline has passed with nothing submitted.
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

-- Refresh the cached health for a whole cohort. Safe to run repeatedly; this
-- is what the daily job calls.
create or replace function public.refresh_cohort_health(p_cohort_id uuid default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  update public.enrollments e
     set health = public.compute_health(e.id)
   where (p_cohort_id is null or e.cohort_id = p_cohort_id)
     and e.status = 'active';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- --------------------------------------------------- week progress cache ---
create or replace function public.recompute_week_progress(p_enrollment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid;
begin
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  insert into public.week_progress (
    enrollment_id, week_id, modules_completed, modules_total,
    assignments_submitted, assignments_total, task_submitted, is_complete,
    completed_at, updated_at
  )
  select
    p_enrollment_id,
    w.id,
    coalesce(mods.done, 0),
    coalesce(mods.total, 0),
    coalesce(asg.done, 0),
    coalesce(asg.total, 0),
    coalesce(tsk.done, 0) >= coalesce(tsk.total, 0) and coalesce(tsk.total, 0) > 0,
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
    task_submitted = excluded.task_submitted,
    is_complete = excluded.is_complete,
    completed_at = coalesce(public.week_progress.completed_at, excluded.completed_at),
    updated_at = now();

  update public.enrollments
     set weeks_completed = (
       select count(*) from public.week_progress
        where enrollment_id = p_enrollment_id and is_complete)
   where id = p_enrollment_id;
end $$;
