-- ============================================================================
-- Fix: "task missing" was shown for weeks that have no task at all.
--
-- week_progress stored whether a task was submitted, but not whether one
-- exists — so a week with zero tasks was indistinguishable from a week with an
-- unsubmitted one. The admin drawer read that as six weeks of missed work.
-- ============================================================================

alter table public.week_progress add column if not exists tasks_total integer not null default 0;
alter table public.week_progress add column if not exists tasks_submitted integer not null default 0;

create or replace function public.recompute_week_progress(p_enrollment_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_cohort uuid;
begin
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
end $$;
