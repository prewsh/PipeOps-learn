-- ============================================================================
-- Submission and scoring integrity.
--
-- `submissions.item_id` is polymorphic, so it carries no foreign key. Nothing
-- downstream checked that it pointed at a real thing:
--
--   submit_work(p_type => 'program_task', p_item_id => gen_random_uuid())
--
-- inserted a submission for an item that does not exist, and recompute_points
-- then awarded TASK_SUBMITTED + ON_TIME_BONUS for it, because it grouped
-- submissions by item_id without ever joining back to a task. Repeat in a
-- loop for an arbitrary score.
--
-- The submissions freeze had the same shape of hole. `submissions_open` was
-- checked in the server action only, so a direct RPC call wrote straight past
-- the freeze the cohort is currently under.
--
-- Three fixes, all in the database, because "which client called this" is not
-- a security boundary:
--
--   1. resolve the item for the CALLER before writing — it must exist, be
--      published, belong to their cohort, and sit in a released week;
--   2. enforce the item's own rules (accepted types, text bounds, link
--      protocol) and the cohort freeze in the same transaction;
--   3. award points only for submissions that join back to a real item.
--
-- Point 3 also cleans up: any award already sitting in the ledger for a
-- fabricated item is reversed by a compensating row on the next recompute.
-- The ledger stays append-only (AGENTS.md section 6) — nothing is deleted.
-- ============================================================================

-- ------------------------------------------------------------ helpers ----

-- Is the caller's cohort accepting submissions? A freeze is cohort data, not
-- a UI state.
create or replace function public.submissions_are_open()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.submissions_open
       from public.cohorts c
      where c.id = public.my_cohort_id()),
    false);
$$;

-- Link policy (PRD F7.3). Zod's z.url() accepts `javascript:` and `data:`;
-- these links are rendered as anchors in the review queue, so the protocol
-- has to be checked where it cannot be bypassed.
create or replace function public.is_safe_url(p_url text)
returns boolean
language sql immutable set search_path = public as $$
  select p_url ~ '^https?://[^[:space:]<>"]+$' and length(p_url) between 8 and 2000;
$$;

create or replace function public.assert_safe_urls(p_urls jsonb)
returns void
language plpgsql immutable set search_path = public as $$
declare v_url text;
begin
  if p_urls is null or jsonb_typeof(p_urls) <> 'array' then
    raise exception 'links must be a list';
  end if;
  if jsonb_array_length(p_urls) > 10 then
    raise exception 'at most 10 links';
  end if;

  for v_url in select jsonb_array_elements_text(p_urls) loop
    if not public.is_safe_url(v_url) then
      raise exception 'link must start with http:// or https://: %', left(v_url, 60);
    end if;
  end loop;
end $$;

-- The item, resolved for the caller. Returns no row when the item does not
-- exist, is not published, belongs to another cohort, or sits in a week that
-- has not released — which is exactly the set of things submit_work must
-- refuse. One definition, used by both write paths.
create or replace function public.work_item_for_caller(
  p_type    work_item_type,
  p_item_id uuid
)
returns table (
  submission_types jsonb,
  text_min         integer,
  text_max         integer,
  max_files        integer,
  file_extensions  text[],
  deadline_at      timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.submission_types, a.text_min, a.text_max, a.max_files,
         a.file_extensions, coalesce(a.deadline_at, w.deadline_at)
    from public.assignments a
    join public.week_modules wm on wm.module_id = a.module_id
    join public.program_weeks w on w.id = wm.week_id
   where p_type = 'assignment'
     and a.id = p_item_id
     and a.status = 'published'
     and (a.cohort_id is null or a.cohort_id = public.my_cohort_id())
     and w.cohort_id = public.my_cohort_id()
     and w.release_at <= now()
  union all
  select t.submission_types, t.text_min, t.text_max, t.max_files,
         t.file_extensions, coalesce(t.deadline_at, w.deadline_at)
    from public.program_tasks t
    join public.program_weeks w on w.id = t.week_id
   where p_type = 'program_task'
     and t.id = p_item_id
     and t.status = 'published'
     and w.cohort_id = public.my_cohort_id()
     and w.release_at <= now()
  limit 1;
$$;

-- Shared gate for save_draft and submit_work. `p_final` distinguishes a draft
-- (which may be incomplete) from a submission (which may not).
create or replace function public.assert_submittable(
  p_type    work_item_type,
  p_item_id uuid,
  p_urls    jsonb,
  p_text    text,
  p_final   boolean
)
returns void
language plpgsql stable security definer set search_path = public as $$
declare
  v_item   record;
  v_types  text[];
  v_len    integer := coalesce(length(btrim(coalesce(p_text, ''))), 0);
  v_links  integer := case when p_urls is null then 0 else jsonb_array_length(p_urls) end;
begin
  if not public.submissions_are_open() then
    raise exception 'submissions are closed for this cohort';
  end if;

  select * into v_item from public.work_item_for_caller(p_type, p_item_id);
  if not found then
    raise exception 'no such item in this cohort, or it has not been released';
  end if;

  perform public.assert_safe_urls(coalesce(p_urls, '[]'::jsonb));

  select array_agg(value) into v_types
    from jsonb_array_elements_text(v_item.submission_types);

  if v_links > 0 and not ('url' = any(v_types)) then
    raise exception 'this item does not accept links';
  end if;
  if v_len > 0 and not ('text' = any(v_types)) then
    raise exception 'this item does not accept a written response';
  end if;
  if v_item.text_max is not null and v_len > v_item.text_max then
    raise exception 'response is longer than the % character limit', v_item.text_max;
  end if;

  -- Required fields are a submit-time rule. A draft is allowed to be empty —
  -- that is what autosave produces on the first keystroke.
  if p_final then
    if 'url' = any(v_types) and v_links = 0 then
      raise exception 'a public link is required';
    end if;
    if 'text' = any(v_types) and v_item.text_min is not null and v_len < v_item.text_min then
      raise exception 'response must be at least % characters', v_item.text_min;
    end if;
  end if;
end $$;

-- ------------------------------------------------- save_draft, guarded ----
-- Body unchanged from 20260922000002 except for the gate.
create or replace function public.save_draft(
  p_type work_item_type,
  p_item_id uuid,
  p_urls jsonb default '[]'::jsonb,
  p_text text default null
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
  v_latest     public.submissions;
  v_id         uuid;
begin
  if v_enrollment is null then raise exception 'no active enrollment'; end if;
  perform public.assert_submittable(p_type, p_item_id, p_urls, p_text, false);

  select * into v_latest
    from public.submissions
   where enrollment_id = v_enrollment and item_type = p_type and item_id = p_item_id
   order by version desc limit 1;

  -- Reuse an open draft; otherwise start the next version.
  if v_latest.id is not null and v_latest.status = 'draft' then
    update public.submissions
       set urls = p_urls, text_response = p_text
     where id = v_latest.id
    returning id into v_id;
  else
    insert into public.submissions
      (enrollment_id, item_type, item_id, version, status, urls, text_response)
    values
      (v_enrollment, p_type, p_item_id, coalesce(v_latest.version, 0) + 1, 'draft', p_urls, p_text)
    returning id into v_id;
  end if;

  return v_id;
end $$;

-- ------------------------------------------------ submit_work, guarded ----
-- Body unchanged from 20260922000002 except for the gate. Lateness is still
-- computed here and frozen on this version (F7.7).
create or replace function public.submit_work(
  p_type work_item_type,
  p_item_id uuid,
  p_urls jsonb default '[]'::jsonb,
  p_text text default null
) returns table (submission_id uuid, version integer, is_late boolean)
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
  v_deadline   timestamptz;
  v_latest     public.submissions;
  v_row        public.submissions;
begin
  if v_enrollment is null then raise exception 'no active enrollment'; end if;
  perform public.assert_submittable(p_type, p_item_id, p_urls, p_text, true);

  select * into v_latest
    from public.submissions
   where enrollment_id = v_enrollment and item_type = p_type and item_id = p_item_id
   order by version desc limit 1;

  -- Idempotent under a double-click: an identical submission within 5 seconds
  -- returns the existing row rather than opening a new version.
  if v_latest.id is not null
     and v_latest.status <> 'draft'
     and v_latest.submitted_at > now() - interval '5 seconds'
     and coalesce(v_latest.text_response, '') = coalesce(p_text, '')
     and v_latest.urls = p_urls then
    return query select v_latest.id, v_latest.version, v_latest.is_late;
    return;
  end if;

  v_deadline := public.item_deadline(p_type, p_item_id);

  if v_latest.id is not null and v_latest.status = 'draft' then
    update public.submissions
       set urls = p_urls,
           text_response = p_text,
           status = 'submitted',
           submitted_at = now(),
           -- computed at submit time and frozen on this version (F7.7)
           is_late = (v_deadline is not null and now() > v_deadline)
     where id = v_latest.id
    returning * into v_row;
  else
    insert into public.submissions
      (enrollment_id, item_type, item_id, version, status, urls, text_response,
       submitted_at, is_late)
    values
      (v_enrollment, p_type, p_item_id, coalesce(v_latest.version, 0) + 1, 'submitted',
       p_urls, p_text, now(), (v_deadline is not null and now() > v_deadline))
    returning * into v_row;
  end if;

  perform public.recompute_progress(v_enrollment);

  return query select v_row.id, v_row.version, v_row.is_late;
end $$;

-- --------------------------------------------- scoring: real items only ----
-- Submissions that join back to an item that actually exists in the
-- enrolment's cohort. Deliberately does NOT test release_at: released weeks
-- never re-lock, and moving a release date is display-only (AGENTS.md
-- section 6), so a schedule edit must never reverse points already earned.
create or replace function public.scorable_submissions(p_enrollment_id uuid)
returns table (item_type work_item_type, item_id uuid, first_submitted_at timestamptz,
               on_time boolean)
language sql stable security definer set search_path = public as $$
  with cohort as (
    select e.cohort_id from public.enrollments e where e.id = p_enrollment_id
  ),
  real_items as (
    select 'assignment'::work_item_type as t, a.id
      from public.assignments a
      join public.week_modules wm on wm.module_id = a.module_id
      join public.program_weeks w on w.id = wm.week_id
      join cohort c on c.cohort_id = w.cohort_id
     where a.status = 'published'
       and (a.cohort_id is null or a.cohort_id = c.cohort_id)
    union all
    select 'program_task'::work_item_type, t.id
      from public.program_tasks t
      join public.program_weeks w on w.id = t.week_id
      join cohort c on c.cohort_id = w.cohort_id
     where t.status = 'published'
  )
  select s.item_type, s.item_id, min(s.submitted_at), bool_and(s.is_late) = false
    from public.submissions s
    join real_items ri on ri.t = s.item_type and ri.id = s.item_id
   where s.enrollment_id = p_enrollment_id
     and s.status <> 'draft'
   group by s.item_type, s.item_id;
$$;

-- recompute_points, with sections 2 and 4 joined to real items. Everything
-- else is unchanged from 20260922000011.
create or replace function public.recompute_points(p_enrollment_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_cohort uuid;
  v_total  integer;
begin
  perform public.assert_enrollment_access(p_enrollment_id);

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

  -- 2. submitted work, and the on-time bonus that goes with it — for items
  --    that exist. A fabricated item_id earns nothing.
  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id,
         case when sc.item_type = 'assignment' then 'ASSIGNMENT_SUBMITTED'::points_rule
              else 'TASK_SUBMITTED'::points_rule end,
         sc.item_type::text, sc.item_id,
         case when sc.item_type = 'assignment'
              then public.points_for('ASSIGNMENT_SUBMITTED')
              else public.points_for('TASK_SUBMITTED') end,
         sc.first_submitted_at
    from public.scorable_submissions(p_enrollment_id) sc
  on conflict do nothing;

  insert into public.points_events (enrollment_id, rule, target_type, target_id, points, occurred_at)
  select p_enrollment_id, 'ON_TIME_BONUS', sc.item_type::text, sc.item_id,
         public.points_for('ON_TIME_BONUS'), sc.first_submitted_at
    from public.scorable_submissions(p_enrollment_id) sc
   where sc.on_time
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

  -- 4. reversals — an award whose source no longer holds is cancelled, once.
  --    The submission clause now tests SCORABLE submissions, so an award made
  --    against a fabricated item before this migration is reversed here.
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
          select 1 from public.scorable_submissions(e.enrollment_id) sc
           where sc.item_id = e.target_id))
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

-- Execute grants for everything in this file are issued by the lockdown
-- migration (…0023), which runs last and revokes before it grants. Granting
-- here as well would be dead code that reads like a second source of truth.
