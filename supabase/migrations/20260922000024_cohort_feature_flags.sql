-- ============================================================================
-- Feature flags, and an audit trail for content changes.
--
-- The leaderboard and the sessions list are both built and both currently
-- show a "coming soon" page. That decision lived in the page source, which
-- meant switching either on required a code change and a deploy — and made
-- docs/TASKBOARD.md read as though neither existed.
--
-- They become cohort data instead. Default false, so nothing changes for
-- participants today; flipping one is an admin action with an audit row.
--
-- The second half closes a gap flagged in review: enrolment RPCs write to
-- audit_log, but content edits went straight to the tables and left no trace
-- of who moved a deadline or unpublished a task. A trigger records all of it
-- without every action having to remember to.
-- ============================================================================

alter table public.cohorts
  add column if not exists leaderboard_visible boolean not null default false,
  add column if not exists sessions_visible    boolean not null default false;

-- ------------------------------------------------------------- toggles ----
create or replace function public.set_cohort_flag(
  p_cohort_id uuid,
  p_flag      text,
  p_value     boolean
) returns void
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  if p_flag not in ('leaderboard_visible', 'sessions_visible', 'submissions_open') then
    raise exception 'unknown flag: %', p_flag;
  end if;

  select to_jsonb(c) into v_before from public.cohorts c where c.id = p_cohort_id;
  if v_before is null then raise exception 'no such cohort'; end if;

  execute format('update public.cohorts set %I = $1 where id = $2', p_flag)
    using p_value, p_cohort_id;

  insert into public.audit_log (actor_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), 'cohort.flag', 'cohort', p_cohort_id,
          jsonb_build_object(p_flag, v_before -> p_flag),
          jsonb_build_object(p_flag, p_value));
end $$;

-- ------------------------------------------------- content audit trail ----
-- Generic row-level record of who changed what. `before` is null on insert and
-- `after` is null on delete, which is how the reader tells them apart.
create or replace function public.audit_content_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  v_after  jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_id     uuid  := case when tg_op = 'DELETE' then old.id else new.id end;
begin
  -- An UPDATE that changes nothing is noise, not history.
  if tg_op = 'UPDATE' and v_before - 'updated_at' = v_after - 'updated_at' then
    return new;
  end if;

  insert into public.audit_log (actor_user_id, action, target_type, target_id, before, after)
  values (auth.uid(), lower(tg_table_name || '.' || tg_op), tg_table_name, v_id,
          v_before, v_after);

  return case when tg_op = 'DELETE' then old else new end;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'program_weeks', 'modules', 'lessons', 'assignments', 'program_tasks',
    'learning_materials', 'sessions', 'announcements'
  ]
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format(
      'create trigger %I_audit after insert or update or delete on public.%I
       for each row execute function public.audit_content_change()', t, t);
  end loop;
end $$;

-- Grants are centralised in the lockdown migration; this one is issued here
-- because it is created after it. audit_content_change is trigger-only and
-- deliberately stays ungranted.
grant execute on function public.set_cohort_flag(uuid, text, boolean) to authenticated;
