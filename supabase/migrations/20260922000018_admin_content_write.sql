-- ============================================================================
-- Admin write access to content.
--
-- These tables had SELECT policies only, so content could be read but never
-- changed through the API — every edit was a migration. That is fine for
-- schema, wrong for copy and dates, which the programme team must be able to
-- fix themselves mid-cohort.
--
-- Writes are admin-only. Participants keep read-only, release-gated access.
-- ============================================================================

create policy weeks_admin_write on public.program_weeks
  for all using (public.is_admin()) with check (public.is_admin());

create policy modules_admin_write on public.modules
  for all using (public.is_admin()) with check (public.is_admin());

create policy lessons_admin_write on public.lessons
  for all using (public.is_admin()) with check (public.is_admin());

create policy materials_admin_write on public.learning_materials
  for all using (public.is_admin()) with check (public.is_admin());

create policy assignments_admin_write on public.assignments
  for all using (public.is_admin()) with check (public.is_admin());

create policy tasks_admin_write on public.program_tasks
  for all using (public.is_admin()) with check (public.is_admin());

create policy week_modules_admin_write on public.week_modules
  for all using (public.is_admin()) with check (public.is_admin());

create policy cohorts_admin_write on public.cohorts
  for all using (public.is_admin()) with check (public.is_admin());

-- Changing a deadline must reconcile lateness on submissions already made
-- against it (PRD F13.5) — otherwise moving a date silently re-judges work.
create or replace function public.reconcile_lateness(p_item_type work_item_type, p_item_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_deadline timestamptz;
  v_changed  integer;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;

  select case p_item_type
    when 'assignment' then coalesce(
      (select a.deadline_at from public.assignments a where a.id = p_item_id),
      (select w.deadline_at from public.assignments a
         join public.week_modules wm on wm.module_id = a.module_id
         join public.program_weeks w on w.id = wm.week_id
        where a.id = p_item_id limit 1))
    else coalesce(
      (select t.deadline_at from public.program_tasks t where t.id = p_item_id),
      (select w.deadline_at from public.program_tasks t
         join public.program_weeks w on w.id = t.week_id
        where t.id = p_item_id))
  end into v_deadline;

  update public.submissions s
     set is_late = (v_deadline is not null and s.submitted_at > v_deadline)
   where s.item_type = p_item_type
     and s.item_id = p_item_id
     and s.submitted_at is not null
     and s.is_late is distinct from (v_deadline is not null and s.submitted_at > v_deadline);

  get diagnostics v_changed = row_count;

  -- On-time bonuses follow lateness, so the ledger has to be rebuilt for
  -- everyone affected.
  perform public.recompute_points(e.id)
     from public.enrollments e
    where exists (
      select 1 from public.submissions s
       where s.enrollment_id = e.id and s.item_type = p_item_type and s.item_id = p_item_id);

  return v_changed;
end $$;

grant execute on function public.reconcile_lateness(work_item_type, uuid) to authenticated;
