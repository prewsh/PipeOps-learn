-- ============================================================================
-- P3 — RLS for the new tables, admin RPCs, and wiring week progress into the
-- single recompute entry point.
-- ============================================================================

alter table public.week_progress      enable row level security;
alter table public.announcements      enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.audit_log          enable row level security;

create policy week_progress_own on public.week_progress
  for select using (enrollment_id = public.my_enrollment_id() or public.is_admin());

-- A participant sees an announcement once it is published, and only if it is
-- addressed to them (whole cohort, or an explicit list).
create policy announcements_select on public.announcements
  for select using (
    public.is_admin()
    or (
      cohort_id = public.my_cohort_id()
      and publish_at <= now()
      and (
        audience->>'type' = 'all'
        or (audience->>'type' = 'ids'
            and audience->'ids' ? public.my_enrollment_id()::text)
      )
    )
  );

create policy announcements_admin_write on public.announcements
  for all using (public.is_admin()) with check (public.is_admin());

create policy announcement_reads_own on public.announcement_reads
  for all
  using (enrollment_id = public.my_enrollment_id() or public.is_admin())
  with check (enrollment_id = public.my_enrollment_id());

-- Audit log is readable by admins and written only by SECURITY DEFINER
-- functions. There is deliberately no insert policy.
create policy audit_log_admin_read on public.audit_log
  for select using (public.is_admin());

-- ------------------------------------------------- single recompute entry --
-- recompute_progress is the escape hatch (PRD section 11.6): everything
-- derived must be rebuildable from it, so week progress belongs inside.
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

  perform public.recompute_week_progress(p_enrollment_id);
end $$;

-- Rebuild everything for a cohort. The bulk escape hatch.
create or replace function public.recompute_cohort(p_cohort_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  for r in select id from public.enrollments where cohort_id = p_cohort_id loop
    perform public.recompute_progress(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ------------------------------------------------------- admin mutations --
-- Every one writes an audit row (F13.6).
create or replace function public.set_enrollment_status(
  p_enrollment_id uuid,
  p_status enrollment_status,
  p_reason text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to change enrolment status';
  end if;

  select to_jsonb(e) into v_before from public.enrollments e where e.id = p_enrollment_id;

  update public.enrollments
     set status = p_status, status_reason = p_reason
   where id = p_enrollment_id;

  insert into public.audit_log (actor_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'enrollment.status', 'enrollment', p_enrollment_id, v_before,
          jsonb_build_object('status', p_status, 'reason', p_reason));
end $$;

create or replace function public.set_admin_note(p_enrollment_id uuid, p_note text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;

  update public.enrollments set admin_notes = p_note where id = p_enrollment_id;

  insert into public.audit_log (actor_user_id, action, target_type, target_id, after)
  values (auth.uid(), 'enrollment.note', 'enrollment', p_enrollment_id,
          jsonb_build_object('note', p_note));
end $$;

grant execute on function public.refresh_cohort_health(uuid) to authenticated;
grant execute on function public.recompute_cohort(uuid) to authenticated;
grant execute on function public.set_enrollment_status(uuid, enrollment_status, text) to authenticated;
grant execute on function public.set_admin_note(uuid, text) to authenticated;
grant execute on function public.compute_health(uuid) to authenticated;
