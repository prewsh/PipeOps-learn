-- ============================================================================
-- Prototype 5 — live sessions and attendance (PRD F16).
-- ============================================================================

create table if not exists public.live_sessions (
  id               uuid primary key default gen_random_uuid(),
  cohort_id        uuid not null references public.cohorts(id) on delete cascade,
  week_id          uuid references public.program_weeks(id) on delete set null,
  speaker_name     text not null,
  speaker_title    text,
  topic            text not null,
  description      text,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60,
  join_url         text,
  replay_url       text,
  status           publish_status not null default 'published',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists live_sessions_cohort_idx on public.live_sessions (cohort_id, starts_at);

create table if not exists public.session_attendance (
  session_id    uuid not null references public.live_sessions(id) on delete cascade,
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  attended      boolean not null default true,
  marked_by     uuid references public.users(id) on delete set null,
  marked_at     timestamptz not null default now(),
  primary key (session_id, enrollment_id)
);

alter table public.live_sessions      enable row level security;
alter table public.session_attendance enable row level security;

create policy sessions_select on public.live_sessions
  for select using (
    public.is_admin() or (status = 'published' and cohort_id = public.my_cohort_id())
  );

create policy sessions_admin_write on public.live_sessions
  for all using (public.is_admin()) with check (public.is_admin());

create policy attendance_select on public.session_attendance
  for select using (enrollment_id = public.my_enrollment_id() or public.is_admin());

create policy attendance_admin_write on public.session_attendance
  for all using (public.is_admin()) with check (public.is_admin());

-- Marking attendance awards the session's points through the ledger, so it
-- obeys the same idempotency and reversal rules as everything else (F16.4).
create or replace function public.mark_attendance(
  p_session_id uuid,
  p_enrollment_id uuid,
  p_attended boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;

  insert into public.session_attendance (session_id, enrollment_id, attended, marked_by)
  values (p_session_id, p_enrollment_id, p_attended, auth.uid())
  on conflict (session_id, enrollment_id) do update set
    attended = excluded.attended, marked_by = excluded.marked_by, marked_at = now();

  if p_attended then
    insert into public.points_events
      (enrollment_id, rule, target_type, target_id, points, occurred_at)
    values (p_enrollment_id, 'SESSION_ATTENDED', 'session', p_session_id,
            public.points_for('SESSION_ATTENDED'), now())
    on conflict do nothing;
  else
    -- Un-marking writes a compensating row; the award itself is never deleted.
    insert into public.points_events
      (enrollment_id, rule, target_type, target_id, points, reversal_of, note)
    select e.enrollment_id, e.rule, e.target_type, e.target_id, -e.points, e.id,
           'attendance withdrawn'
      from public.points_events e
     where e.enrollment_id = p_enrollment_id
       and e.rule = 'SESSION_ATTENDED'
       and e.target_id = p_session_id
       and e.reversal_of is null
       and not exists (select 1 from public.points_events r where r.reversal_of = e.id);
  end if;

  update public.enrollments
     set points_total = (
       select coalesce(sum(points), 0) from public.points_events
        where enrollment_id = p_enrollment_id)
   where id = p_enrollment_id;
end $$;

create trigger live_sessions_touch before update on public.live_sessions
  for each row execute function public.touch_updated_at();

grant execute on function public.mark_attendance(uuid, uuid, boolean) to authenticated;
