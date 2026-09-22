-- ============================================================================
-- P2 — RLS, the submission RPCs, and the corrected progress denominator.
-- ============================================================================

alter table public.assignments      enable row level security;
alter table public.program_tasks    enable row level security;
alter table public.submissions      enable row level security;
alter table public.submission_files enable row level security;

-- Assignments follow their module's release gate (F3.3).
create policy assignments_select on public.assignments
  for select using (
    public.is_admin()
    or (status = 'published' and public.module_is_released(module_id)
        and (cohort_id is null or cohort_id = public.my_cohort_id()))
  );

-- Tasks follow their week's release gate.
create policy tasks_select on public.program_tasks
  for select using (
    public.is_admin()
    or (status = 'published' and exists (
          select 1 from public.program_weeks w
           where w.id = program_tasks.week_id
             and w.cohort_id = public.my_cohort_id()
             and w.release_at <= now()))
  );

-- A participant reads and writes only their own submissions. Reviewers read all
-- and are the only ones who may set a review outcome (enforced in the RPC).
create policy submissions_own on public.submissions
  for select using (enrollment_id = public.my_enrollment_id() or public.is_admin());

create policy submissions_write_own on public.submissions
  for insert with check (enrollment_id = public.my_enrollment_id());

create policy submissions_update_own on public.submissions
  for update using (enrollment_id = public.my_enrollment_id() or public.is_admin());

create policy submission_files_own on public.submission_files
  for all
  using (exists (
    select 1 from public.submissions s
     where s.id = submission_files.submission_id
       and (s.enrollment_id = public.my_enrollment_id() or public.is_admin())))
  with check (exists (
    select 1 from public.submissions s
     where s.id = submission_files.submission_id
       and s.enrollment_id = public.my_enrollment_id()));

-- --------------------------------------------------- effective deadline ----
-- An item's own deadline, else the deadline of the week it belongs to (F7.7).
create or replace function public.item_deadline(p_type work_item_type, p_item_id uuid)
returns timestamptz
language sql stable security definer set search_path = public as $$
  select case p_type
    when 'assignment' then coalesce(
      (select a.deadline_at from public.assignments a where a.id = p_item_id),
      (select w.deadline_at
         from public.assignments a
         join public.week_modules wm on wm.module_id = a.module_id
         join public.program_weeks w on w.id = wm.week_id
        where a.id = p_item_id and w.cohort_id = public.my_cohort_id()
        limit 1))
    else coalesce(
      (select t.deadline_at from public.program_tasks t where t.id = p_item_id),
      (select w.deadline_at
         from public.program_tasks t
         join public.program_weeks w on w.id = t.week_id
        where t.id = p_item_id))
  end;
$$;

-- --------------------------------------------------------- save a draft ----
-- A draft is NOT a submission. Autosave lands here and never sets submitted_at.
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

-- ------------------------------------------------------------- submit ----
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

-- ------------------------------------------------------------- review ----
-- Reviewers only. A participant cannot approve their own work.
create or replace function public.review_submission(
  p_submission_id uuid,
  p_status submission_status,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_enrollment uuid;
begin
  if not public.is_admin() then raise exception 'not authorised to review'; end if;
  if p_status not in ('approved', 'needs_revision', 'under_review') then
    raise exception 'invalid review outcome: %', p_status;
  end if;

  update public.submissions
     set status = p_status,
         review_note = p_note,
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_submission_id
  returning enrollment_id into v_enrollment;

  if v_enrollment is not null then
    perform public.recompute_progress(v_enrollment);
  end if;
end $$;

-- ------------------------------------------- progress denominator, v2 ----
-- Required items = required modules + required assignments + required tasks.
-- FIXED across the programme: it counts every week, released or not, so the
-- number only ever rises (PRD F8.4).
create or replace function public.program_item_count() returns integer
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from public.week_modules wm
       join public.program_weeks w on w.id = wm.week_id
       join public.modules m on m.id = wm.module_id
      where w.cohort_id = public.my_cohort_id() and m.is_bonus = false)
  + (select count(*) from public.assignments a
       join public.week_modules wm on wm.module_id = a.module_id
       join public.program_weeks w on w.id = wm.week_id
      where w.cohort_id = public.my_cohort_id()
        and a.is_required and a.status = 'published'
        and (a.cohort_id is null or a.cohort_id = public.my_cohort_id()))
  + (select count(*) from public.program_tasks t
       join public.program_weeks w on w.id = t.week_id
      where w.cohort_id = public.my_cohort_id()
        and t.is_required and t.status = 'published');
$$;

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
                        else round((least(v_done, v_total)::numeric / v_total) * 100, 2) end
   where id = p_enrollment_id;
end $$;

grant execute on function public.save_draft(work_item_type, uuid, jsonb, text) to authenticated;
grant execute on function public.submit_work(work_item_type, uuid, jsonb, text) to authenticated;
grant execute on function public.review_submission(uuid, submission_status, text) to authenticated;
grant execute on function public.program_item_count() to authenticated;
grant execute on function public.item_deadline(work_item_type, uuid) to authenticated;
