-- ============================================================================
-- Row-level security.
--
-- Two invariants this file exists to enforce (AGENTS.md section 7):
--   * Week gating happens HERE, not in the UI. A locked week yields no modules,
--     no lessons and no materials even to a crafted request (PRD F3.3).
--   * activity_events is server-write-only. There is no insert policy, so only
--     the service role can write them.
-- ============================================================================

-- ---------------------------------------------------- helper functions ----
-- SECURITY DEFINER so policies can read these tables without recursing
-- through the very policies being evaluated.

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
     where id = auth.uid() and role in ('admin', 'reviewer')
  );
$$;

-- The caller's current enrolment: active, most recently started cohort (F2.2).
create or replace function public.my_enrollment_id() returns uuid
language sql stable security definer set search_path = public as $$
  select e.id
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
   where e.user_id = auth.uid()
     and e.status = 'active'
     and c.status in ('active', 'completed')
   order by c.starts_on desc
   limit 1;
$$;

create or replace function public.my_cohort_id() returns uuid
language sql stable security definer set search_path = public as $$
  select e.cohort_id
    from public.enrollments e
    join public.cohorts c on c.id = e.cohort_id
   where e.user_id = auth.uid()
     and e.status = 'active'
     and c.status in ('active', 'completed')
   order by c.starts_on desc
   limit 1;
$$;

-- True when the module sits in a week of my cohort that has already released.
create or replace function public.module_is_released(p_module_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.week_modules wm
      join public.program_weeks w on w.id = wm.week_id
     where wm.module_id = p_module_id
       and w.cohort_id = public.my_cohort_id()
       and w.release_at <= now()
  );
$$;

-- ------------------------------------------------------- enable + deny ----
alter table public.users              enable row level security;
alter table public.programs           enable row level security;
alter table public.cohorts            enable row level security;
alter table public.enrollments        enable row level security;
alter table public.courses            enable row level security;
alter table public.course_parts       enable row level security;
alter table public.modules            enable row level security;
alter table public.lessons            enable row level security;
alter table public.learning_materials enable row level security;
alter table public.program_weeks      enable row level security;
alter table public.week_modules       enable row level security;
alter table public.video_progress     enable row level security;
alter table public.module_progress    enable row level security;
alter table public.activity_events    enable row level security;

-- ------------------------------------------------------------- identity ----
create policy users_select_self on public.users
  for select using (id = auth.uid() or public.is_admin());

create policy users_update_self on public.users
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy enrollments_select_own on public.enrollments
  for select using (user_id = auth.uid() or public.is_admin());

create policy cohorts_select_mine on public.cohorts
  for select using (id = public.my_cohort_id() or public.is_admin());

create policy programs_select_all on public.programs
  for select using (auth.uid() is not null);

-- --------------------------------------------------------------- weeks ----
-- All six weeks of my cohort are visible so the rail can render locked cards,
-- but a locked week carries no content: week_modules below is release-gated.
create policy weeks_select_mine on public.program_weeks
  for select using (cohort_id = public.my_cohort_id() or public.is_admin());

create policy week_modules_select_released on public.week_modules
  for select using (
    public.is_admin() or exists (
      select 1 from public.program_weeks w
       where w.id = week_modules.week_id
         and w.cohort_id = public.my_cohort_id()
         and w.release_at <= now()
    )
  );

-- ------------------------------------------------------------- content ----
create policy courses_select on public.courses
  for select using (auth.uid() is not null);

create policy course_parts_select on public.course_parts
  for select using (auth.uid() is not null);

create policy modules_select_released on public.modules
  for select using (
    public.is_admin()
    or (status = 'published' and public.module_is_released(id))
  );

create policy lessons_select_released on public.lessons
  for select using (
    public.is_admin() or public.module_is_released(module_id)
  );

-- Module materials follow their module's release; week materials follow the
-- week's; library materials are always available (PRD F17.3).
create policy materials_select_released on public.learning_materials
  for select using (
    public.is_admin()
    or (owner_type = 'library')
    or (owner_type = 'module' and public.module_is_released(owner_id))
    or (owner_type = 'week' and exists (
          select 1 from public.program_weeks w
           where w.id = learning_materials.owner_id
             and w.cohort_id = public.my_cohort_id()
             and w.release_at <= now()))
  );

-- ------------------------------------------------------------ progress ----
create policy video_progress_own on public.video_progress
  for all
  using (enrollment_id = public.my_enrollment_id() or public.is_admin())
  with check (enrollment_id = public.my_enrollment_id());

create policy module_progress_own on public.module_progress
  for all
  using (enrollment_id = public.my_enrollment_id() or public.is_admin())
  with check (enrollment_id = public.my_enrollment_id());

-- Read-only to participants. No insert policy: only the service role writes.
create policy activity_select_own on public.activity_events
  for select using (enrollment_id = public.my_enrollment_id() or public.is_admin());
