-- PipeOps Learn — complete schema + seed.

-- >>> supabase/migrations/20260921000001_p1_core.sql
-- ============================================================================
-- PipeOps Learn — Prototype 1: identity, cohorts, content, weeks, progress.
-- PRD: F1 auth · F2 cohorts · F3 weeks · F4 modules · F5 video · F6 materials
-- ============================================================================

create extension if not exists "citext";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----
create type user_role         as enum ('participant', 'reviewer', 'admin');
create type cohort_status     as enum ('draft', 'active', 'completed', 'archived');
create type enrollment_status as enum ('active', 'paused', 'withdrawn', 'revoked');
create type health_state      as enum ('active', 'needs_attention', 'at_risk', 'dormant');
create type publish_status    as enum ('draft', 'published');
create type progress_status   as enum ('not_started', 'in_progress', 'completed');
create type material_owner    as enum ('module', 'week', 'session', 'library');
create type material_type     as enum ('pdf', 'doc', 'sheet', 'link', 'template', 'video', 'image');

-- --------------------------------------------------------------- users ----
-- Mirrors auth.users. Created by the handle_new_user trigger on first sign-in.
create table public.users (
  id                  uuid primary key references auth.users(id) on delete cascade,
  email               citext not null unique,
  name                text,
  avatar_url          text,
  timezone            text not null default 'Africa/Lagos',
  role                user_role not null default 'participant',
  socials             jsonb not null default '{}'::jsonb,
  email_prefs         jsonb not null default '{}'::jsonb,
  leaderboard_opt_out boolean not null default false,
  onboarded_at        timestamptz,
  last_login_at       timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ------------------------------------------------- programs and cohorts ----
create table public.programs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

create table public.cohorts (
  id          uuid primary key default gen_random_uuid(),
  program_id  uuid not null references public.programs(id) on delete restrict,
  name        text not null,
  code        text not null unique,
  starts_on   date not null,
  ends_on     date not null,
  timezone    text not null default 'Africa/Lagos',
  status      cohort_status not null default 'draft',
  discord_url text,
  branding    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Enrolment is by EMAIL: participants are imported before they ever sign in.
-- user_id is backfilled by handle_new_user() on first login (F1.2).
create table public.enrollments (
  id             uuid primary key default gen_random_uuid(),
  cohort_id      uuid not null references public.cohorts(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  email          citext not null,
  name           text,
  status         enrollment_status not null default 'active',
  status_reason  text,
  enrolled_at    timestamptz not null default now(),
  -- cached rollups (PRD F8.6) — derived, never authoritative
  progress_pct     numeric(5,2) not null default 0,
  points_total     integer not null default 0,
  streak_weeks     integer not null default 0,
  weeks_completed  integer not null default 0,
  health           health_state not null default 'active',
  last_active_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (cohort_id, email)
);
create index on public.enrollments (user_id);
create index on public.enrollments (cohort_id, status);

-- ------------------------------------------------------------- content ----
create table public.courses (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text
);

create table public.course_parts (
  id        uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  "order"   integer not null,
  title     text not null,
  unique (course_id, "order")
);

create table public.modules (
  id                   uuid primary key default gen_random_uuid(),
  course_id            uuid not null references public.courses(id) on delete cascade,
  part_id              uuid references public.course_parts(id) on delete set null,
  "order"              integer not null,
  number               integer not null,
  slug                 text not null unique,
  title                text not null,
  summary              text,
  what_you_will_learn  jsonb not null default '[]'::jsonb,
  estimated_minutes    integer,
  status               publish_status not null default 'published',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (course_id, number)
);

-- V1 seeds exactly one lesson per module (PRD F4.3).
create table public.lessons (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  "order"          integer not null default 1,
  title            text,
  video_provider   text not null default 'youtube',
  video_ref        text,           -- YouTube video id, NOT a full URL
  duration_seconds integer,
  body             text,
  unique (module_id, "order")
);

create table public.learning_materials (
  id           uuid primary key default gen_random_uuid(),
  owner_type   material_owner not null,
  owner_id     uuid not null,
  "order"      integer not null default 0,
  title        text not null,
  description  text,
  type         material_type not null default 'link',
  url          text,
  storage_path text,
  is_required  boolean not null default false,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  check (url is not null or storage_path is not null)
);
create index on public.learning_materials (owner_type, owner_id);

-- ---------------------------------------------------- program schedule ----
create table public.program_weeks (
  id         uuid primary key default gen_random_uuid(),
  cohort_id  uuid not null references public.cohorts(id) on delete cascade,
  number     integer not null,
  title      text not null,
  theme      text,
  overview   text,
  release_at timestamptz not null,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, number)
);
create index on public.program_weeks (cohort_id, release_at);

create table public.week_modules (
  id        uuid primary key default gen_random_uuid(),
  week_id   uuid not null references public.program_weeks(id) on delete cascade,
  module_id uuid not null references public.modules(id) on delete cascade,
  "order"   integer not null default 0,
  unique (week_id, module_id)
);

-- ------------------------------------------------------------ progress ----
create table public.video_progress (
  id                   uuid primary key default gen_random_uuid(),
  enrollment_id        uuid not null references public.enrollments(id) on delete cascade,
  lesson_id            uuid not null references public.lessons(id) on delete cascade,
  max_position_seconds integer not null default 0,
  watched_seconds      integer not null default 0,
  duration_seconds     integer,
  percentage_watched   numeric(5,2) not null default 0,
  started_at           timestamptz,
  completed_at         timestamptz,
  last_seen_at         timestamptz not null default now(),
  unique (enrollment_id, lesson_id)
);

create table public.module_progress (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  module_id     uuid not null references public.modules(id) on delete cascade,
  status        progress_status not null default 'not_started',
  started_at    timestamptz,
  completed_at  timestamptz,
  completed_via text check (completed_via in ('auto', 'manual')),
  unique (enrollment_id, module_id)
);

create table public.activity_events (
  id          bigserial primary key,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  type        text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index on public.activity_events (enrollment_id, occurred_at desc);
create index on public.activity_events (type, occurred_at desc);

-- ------------------------------------------------------------ triggers ----
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['users','cohorts','enrollments','modules','program_weeks']
  loop
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- On first sign-in: mirror auth.users into public.users and link the pending
-- enrolment row by email (PRD F1.2).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  update public.enrollments
     set user_id = new.id
   where email = new.email
     and user_id is null;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- >>> supabase/migrations/20260921000002_p1_rls.sql
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

-- >>> supabase/migrations/20260921000003_p1_progress_fns.sql
-- ============================================================================
-- Progress writes.
--
-- These are RPCs rather than table writes because the invariants are not
-- expressible as constraints (AGENTS.md section 6):
--   * progress is MONOTONIC — a lower incoming position never lowers a maximum
--   * watched_seconds ACCUMULATES and is not max_position_seconds; scrubbing
--     to the end is not watching
--   * completion at >= 90% watched, or on the player's ENDED event
-- ============================================================================

create or replace function public.record_video_progress(
  p_lesson_id        uuid,
  p_position_seconds integer,
  p_delta_seconds    integer default 0,
  p_duration_seconds integer default null,
  p_ended            boolean default false
) returns table (percentage numeric, completed boolean)
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
  v_duration   integer;
  v_row        public.video_progress;
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;

  insert into public.video_progress (
    enrollment_id, lesson_id, max_position_seconds, watched_seconds,
    duration_seconds, started_at, last_seen_at
  )
  values (
    v_enrollment, p_lesson_id, greatest(p_position_seconds, 0),
    greatest(p_delta_seconds, 0), p_duration_seconds, now(), now()
  )
  on conflict (enrollment_id, lesson_id) do update set
    -- monotonic: greatest() is the whole point of this function
    max_position_seconds = greatest(
      public.video_progress.max_position_seconds, excluded.max_position_seconds),
    watched_seconds = least(
      public.video_progress.watched_seconds + greatest(p_delta_seconds, 0),
      coalesce(p_duration_seconds, public.video_progress.duration_seconds, 2147483647)),
    duration_seconds = coalesce(p_duration_seconds, public.video_progress.duration_seconds),
    last_seen_at = now()
  returning * into v_row;

  v_duration := nullif(coalesce(v_row.duration_seconds, 0), 0);

  update public.video_progress vp
     set percentage_watched = case
           when v_duration is null then 0
           else least(round((v_row.watched_seconds::numeric / v_duration) * 100, 2), 100)
         end,
         completed_at = case
           when vp.completed_at is not null then vp.completed_at
           when p_ended then now()
           when v_duration is not null
                and (v_row.watched_seconds::numeric / v_duration) >= 0.90 then now()
           else null
         end
   where vp.enrollment_id = v_enrollment and vp.lesson_id = p_lesson_id
  returning * into v_row;

  return query select v_row.percentage_watched, v_row.completed_at is not null;
end $$;

-- ---------------------------------------------------------------------------
-- Module completion. Always available manually: video tracking must never be
-- able to block completion (PRD F5.8).
-- ---------------------------------------------------------------------------
create or replace function public.complete_module(
  p_module_id uuid,
  p_via       text default 'manual'
) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;

  insert into public.module_progress (
    enrollment_id, module_id, status, started_at, completed_at, completed_via
  )
  values (v_enrollment, p_module_id, 'completed', now(), now(), p_via)
  on conflict (enrollment_id, module_id) do update set
    status = 'completed',
    -- idempotent: re-completing never moves the original timestamp
    completed_at = coalesce(public.module_progress.completed_at, now()),
    completed_via = coalesce(public.module_progress.completed_via, p_via);

  perform public.recompute_progress(v_enrollment);
end $$;

create or replace function public.start_module(p_module_id uuid) returns void
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
begin
  if v_enrollment is null then return; end if;

  insert into public.module_progress (enrollment_id, module_id, status, started_at)
  values (v_enrollment, p_module_id, 'in_progress', now())
  on conflict (enrollment_id, module_id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- recompute_progress — the escape hatch (PRD section 11.6).
--
-- Rebuilds every cached rollup from source tables. Idempotent and safe to run
-- in bulk. Prototype 2 extends the denominator with assignments and tasks; the
-- denominator is FIXED across the whole programme, never released-so-far, so
-- the number only ever rises (PRD F8.4).
-- ---------------------------------------------------------------------------
create or replace function public.recompute_progress(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cohort    uuid;
  v_total     integer;
  v_completed integer;
begin
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  select count(*) into v_total
    from public.week_modules wm
    join public.program_weeks w on w.id = wm.week_id
   where w.cohort_id = v_cohort;

  select count(*) into v_completed
    from public.module_progress mp
    join public.week_modules wm on wm.module_id = mp.module_id
    join public.program_weeks w on w.id = wm.week_id and w.cohort_id = v_cohort
   where mp.enrollment_id = p_enrollment_id
     and mp.status = 'completed';

  update public.enrollments
     set progress_pct = case when v_total = 0 then 0
                        else round((v_completed::numeric / v_total) * 100, 2) end
   where id = p_enrollment_id;
end $$;

grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean) to authenticated;
grant execute on function public.complete_module(uuid, text) to authenticated;
grant execute on function public.start_module(uuid) to authenticated;

-- >>> supabase/migrations/20260921000004_p1_program_totals.sql
-- ============================================================================
-- Fix: programme progress must use a FIXED denominator (PRD F8.4).
--
-- The client cannot count programme items itself, because RLS correctly hides
-- modules in locked weeks — so a week-1 participant would compute "0/2" and the
-- percentage would appear to fall as weeks unlock. The denominator is the whole
-- programme and must only ever rise.
--
-- SECURITY DEFINER returns a COUNT only. No titles, no ids, no content — it
-- does not weaken the week gate.
-- ============================================================================

create or replace function public.program_module_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.week_modules wm
    join public.program_weeks w on w.id = wm.week_id
   where w.cohort_id = public.my_cohort_id();
$$;

grant execute on function public.program_module_count() to authenticated;

-- >>> supabase/migrations/20260921000005_p1_video_refs.sql
-- ============================================================================
-- Cohort 01 video ids (YouTube unlisted, ADR 0001).
-- Stored as the 11-character video id, never a full URL — the player builds
-- the embed and the id is what the IFrame API takes.
-- ============================================================================

update public.lessons l
   set video_ref = v.ref
  from (values
    ( 1, 'w0EC3Cuw4yo'),
    ( 2, 'YyDKpbX7wXI'),
    ( 3, 'LpB5F9p007g'),
    ( 4, '1dzGFraSW-8'),
    ( 5, 'uTe7WlRnCI0'),
    ( 6, 'YyJG72KfVcw'),
    ( 7, 'eZ8cfJLqDSI'),
    ( 8, 'pRmNCQqR-Jg'),
    ( 9, 'P-bvqj5eylw'),
    (10, '0No7h9s9KBk'),
    (11, 'CSNdWp6vLwE'),
    (12, 'ms-pq3YJtvU')
  ) as v(module_number, ref)
  join public.modules m on m.number = v.module_number
 where l.module_id = m.id and l."order" = 1;

-- >>> supabase/migrations/20260921000006_p1_bonus_modules.sql
-- ============================================================================
-- Module 10 splits into two parts, plus a bonus module for Success Metrics.
--
-- Two schema additions this needs:
--
--   `code`     — display label, decoupled from `number`. "M10a"/"M10b" cannot
--                be expressed as an integer, and `number` still drives ordering.
--
--   `is_bonus` — a bonus module is watchable but NOT required. It must be
--                excluded from the progress denominator, or nobody can ever
--                reach 100% and the fixed-denominator invariant (F8.4) becomes
--                a lie.
-- ============================================================================

alter table public.modules add column if not exists code text;
alter table public.modules add column if not exists is_bonus boolean not null default false;

update public.modules set code = 'M' || lpad(number::text, 2, '0') where code is null;

-- Module 10 becomes part A.
update public.modules
   set code = 'M10a', title = 'Captions & Graphics'
 where number = 10;

-- Shift 11 and 12 up to make room for 10b. Descending order matters: doing
-- 11 -> 12 first would collide with the existing 12 under the unique index.
update public.modules set number = 13, "order" = 13 where number = 12 and code = 'M12';
update public.modules set number = 12, "order" = 12 where number = 11 and code = 'M11';

insert into public.modules
  (course_id, part_id, "order", number, code, slug, title, summary, what_you_will_learn, estimated_minutes)
select
  m.course_id, m.part_id, 11, 11, 'M10b', 'captions-and-graphics-part-2',
  'Captions & Graphics, Part 2',
  'The second half of the captions and graphics workflow.',
  '["Advanced caption styling","On-screen graphics that earn their place","Finishing a polished edit"]',
  12
from public.modules m where m.number = 10
on conflict (slug) do nothing;

-- Bonus: not required, does not count toward programme progress.
insert into public.modules
  (course_id, part_id, "order", number, code, slug, title, summary, what_you_will_learn, estimated_minutes, is_bonus)
select
  m.course_id, null, 99, 99, 'BONUS', 'success-metrics',
  'Success Metrics',
  'How your work in this programme is measured — read this in Week 1, not Week 6.',
  '["What we actually measure","What good looks like week to week","How to tell if you are on track"]',
  10, true
from public.modules m where m.number = 1
on conflict (slug) do nothing;

insert into public.lessons (module_id, "order", video_provider, video_ref, duration_seconds)
select m.id, 1, 'youtube', v.ref, v.secs
  from (values ('captions-and-graphics-part-2', 'yOam-qi9I08', 720),
               ('success-metrics',             'ObGTNRsPyvw', 600)) as v(slug, ref, secs)
  join public.modules m on m.slug = v.slug
on conflict (module_id, "order") do update set video_ref = excluded.video_ref;

-- 10b joins Week 5 alongside 10a. Success Metrics is a Week 1 bonus.
insert into public.week_modules (week_id, module_id, "order")
select w.id, m.id, 3
  from public.program_weeks w, public.modules m
 where w.cohort_id = '22222222-2222-2222-2222-222222222222'
   and w.number = 5 and m.slug = 'captions-and-graphics-part-2'
on conflict (week_id, module_id) do nothing;

insert into public.week_modules (week_id, module_id, "order")
select w.id, m.id, 9
  from public.program_weeks w, public.modules m
 where w.cohort_id = '22222222-2222-2222-2222-222222222222'
   and w.number = 1 and m.slug = 'success-metrics'
on conflict (week_id, module_id) do nothing;

-- Denominator counts REQUIRED modules only.
create or replace function public.program_module_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.week_modules wm
    join public.program_weeks w on w.id = wm.week_id
    join public.modules m on m.id = wm.module_id
   where w.cohort_id = public.my_cohort_id()
     and m.is_bonus = false;
$$;

create or replace function public.recompute_progress(p_enrollment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cohort    uuid;
  v_total     integer;
  v_completed integer;
begin
  select cohort_id into v_cohort from public.enrollments where id = p_enrollment_id;
  if v_cohort is null then return; end if;

  select count(*) into v_total
    from public.week_modules wm
    join public.program_weeks w on w.id = wm.week_id
    join public.modules m on m.id = wm.module_id
   where w.cohort_id = v_cohort and m.is_bonus = false;

  select count(*) into v_completed
    from public.module_progress mp
    join public.week_modules wm on wm.module_id = mp.module_id
    join public.program_weeks w on w.id = wm.week_id and w.cohort_id = v_cohort
    join public.modules m on m.id = mp.module_id and m.is_bonus = false
   where mp.enrollment_id = p_enrollment_id
     and mp.status = 'completed';

  update public.enrollments
     set progress_pct = case when v_total = 0 then 0
                        else round((v_completed::numeric / v_total) * 100, 2) end
   where id = p_enrollment_id;
end $$;

-- >>> supabase/migrations/20260922000001_p2_submissions.sql
-- ============================================================================
-- Prototype 2 — assignments, programme tasks, submissions.
-- PRD: F7 submissions · F8 progress · F13 review queue
--
-- Two objects, one submission engine:
--   assignments    — attached to a module, from the curriculum
--   program_tasks  — attached to a week, authored by the PipeOps team
-- ============================================================================

create type submission_status as enum
  ('draft', 'submitted', 'under_review', 'approved', 'needs_revision');

create type work_item_type as enum ('assignment', 'program_task');

-- ---------------------------------------------------------- assignments ----
create table public.assignments (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references public.modules(id) on delete cascade,
  cohort_id        uuid references public.cohorts(id) on delete cascade, -- null = all cohorts
  title            text not null,
  brief            text not null,
  submission_types jsonb not null default '["text"]'::jsonb,
  text_min         integer,
  text_max         integer,
  file_extensions  text[] not null default '{}',
  max_files        integer not null default 5,
  is_required      boolean not null default true,
  requires_review  boolean not null default false,
  points           integer not null default 15,
  deadline_at      timestamptz,  -- null = inherit the week's deadline
  status           publish_status not null default 'published',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (jsonb_array_length(submission_types) > 0)
);
create index on public.assignments (module_id);

-- -------------------------------------------------------- programme tasks --
create table public.program_tasks (
  id                uuid primary key default gen_random_uuid(),
  week_id           uuid not null references public.program_weeks(id) on delete cascade,
  title             text not null,
  brief             text not null,
  submission_types  jsonb not null default '["url"]'::jsonb,
  allowed_platforms text[] not null default '{}',
  text_min          integer,
  text_max          integer,
  file_extensions   text[] not null default '{}',
  max_files         integer not null default 5,
  is_required       boolean not null default true,
  requires_review   boolean not null default true,
  points            integer not null default 20,
  deadline_at       timestamptz,
  is_final_project  boolean not null default false,
  status            publish_status not null default 'published',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (jsonb_array_length(submission_types) > 0)
);
create index on public.program_tasks (week_id);

-- ----------------------------------------------------------- submissions ----
-- Each resubmission is a new VERSION. History is never overwritten (F7.8).
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.enrollments(id) on delete cascade,
  item_type      work_item_type not null,
  item_id        uuid not null,
  version        integer not null default 1,
  status         submission_status not null default 'draft',
  -- Frozen at submit time. Only deadline-change reconciliation may touch it (F7.7).
  is_late        boolean not null default false,
  urls           jsonb not null default '[]'::jsonb,
  text_response  text,
  submitted_at   timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    uuid references public.users(id) on delete set null,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (enrollment_id, item_type, item_id, version)
);
create index on public.submissions (enrollment_id, item_type, item_id);
create index on public.submissions (status, submitted_at);

create table public.submission_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  storage_path  text not null,
  filename      text not null,
  mime_type     text,
  size_bytes    bigint,
  created_at    timestamptz not null default now()
);
create index on public.submission_files (submission_id);

do $$
declare t text;
begin
  foreach t in array array['assignments','program_tasks','submissions']
  loop
    execute format(
      'create trigger %I_touch before update on public.%I
       for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- >>> supabase/migrations/20260922000002_p2_rls_and_rpc.sql
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

-- >>> supabase/migrations/20260922000003_p2_storage.sql
-- ============================================================================
-- Private storage for submission files.
--
-- The bucket is private: files are reachable only through short-lived signed
-- URLs (AGENTS.md section 7). Paths are namespaced by enrolment id, and the
-- policies below make a participant's own folder the only one they can touch.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions', 'submissions', false,
  26214400,  -- 25 MB (PRD F7.4)
  array[
    'application/pdf','image/png','image/jpeg','image/webp','video/mp4',
    'video/quicktime','text/plain','text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <enrollment_id>/<submission_id>/<filename>
create policy "participants read own submission files"
  on storage.objects for select
  using (
    bucket_id = 'submissions'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_enrollment_id()::text)
  );

create policy "participants upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.my_enrollment_id()::text
  );

create policy "participants replace own files"
  on storage.objects for update
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.my_enrollment_id()::text
  );

-- >>> supabase/migrations/20260922000004_p3_cohort_ops.sql
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

-- >>> supabase/migrations/20260922000005_p3_rls_and_rpc.sql
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

-- >>> supabase/migrations/20260922000006_p3_health_baseline.sql
-- ============================================================================
-- Fix: a participant cannot be "dormant" before they could possibly have
-- signed in.
--
-- The F14 rule reads "never logged in after Week 1 release", but enrolment can
-- happen after that release — as it did for Cohort 01, where the whole list was
-- imported on day two. Measuring from week 1 alone flagged 112 people as
-- dormant the moment they were imported, before a single invite had gone out.
--
-- The baseline is therefore the LATER of week 1's release and the participant's
-- own enrolment, plus a day's grace.
-- ============================================================================

create or replace function public.compute_health(p_enrollment_id uuid)
returns health_state
language plpgsql stable security definer set search_path = public as $$
declare
  v_last     timestamptz;
  v_days     numeric;
  v_missed   integer;
  v_cohort   uuid;
  v_enrolled timestamptz;
  v_week1    timestamptz;
  v_baseline timestamptz;
begin
  select e.last_active_at, e.cohort_id, e.enrolled_at
    into v_last, v_cohort, v_enrolled
    from public.enrollments e where e.id = p_enrollment_id;

  select min(w.release_at) into v_week1
    from public.program_weeks w where w.cohort_id = v_cohort;

  v_baseline := greatest(coalesce(v_week1, v_enrolled), v_enrolled);

  -- Never signed in: judge against the baseline, not against week 1 alone.
  if v_last is null then
    return case
      when now() > v_baseline + interval '14 days' then 'dormant'::health_state
      when now() > v_baseline + interval '7 days'  then 'at_risk'::health_state
      when now() > v_baseline + interval '4 days'  then 'needs_attention'::health_state
      else 'active'::health_state
    end;
  end if;

  v_days := extract(epoch from (now() - v_last)) / 86400.0;

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

-- >>> supabase/migrations/20260922000007_p3_week_task_total.sql
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

-- >>> supabase/migrations/20260922000008_p3_daily_health_job.sql
-- ============================================================================
-- Daily health refresh (PRD F14: "computed daily and on activity").
--
-- Activity-driven recomputation already happens inside recompute_progress, but
-- health also changes through the mere passage of time — someone who stops
-- logging in generates no event to trigger a recompute. This job covers that.
--
-- 05:00 UTC = 06:00 WAT, before the team looks at the dashboard.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

select cron.unschedule('refresh-cohort-health')
 where exists (select 1 from cron.job where jobname = 'refresh-cohort-health');

select cron.schedule(
  'refresh-cohort-health',
  '0 5 * * *',
  $$ select public.refresh_cohort_health(null); $$
);

-- >>> supabase/migrations/20260922000009_p4_week7_and_freeze.sql
-- ============================================================================
-- Programme restructure + submission freeze.
--
--   Week 5      M09, M10
--   Week 6      M10.1, M11
--   Week 7      M12, Success Metrics      (new "extra week")
--
-- Success Metrics moves out of Week 1 and becomes part of the extra week, and
-- stops being a bonus: it is now part of the taught programme.
--
-- Submissions are frozen at the cohort level while the portal flow is held
-- back. A freeze must be a data flag, not commented-out UI — the API has to
-- refuse too, or a crafted request still writes.
-- ============================================================================

alter table public.cohorts
  add column if not exists submissions_open boolean not null default true;

update public.cohorts set submissions_open = false where code = 'ugc-01';

-- ------------------------------------------------------------- week 7 ----
insert into public.program_weeks (id, cohort_id, number, title, theme, release_at, deadline_at, overview)
values (
  '77777777-0000-0000-0000-000000000007',
  '22222222-2222-2222-2222-222222222222',
  7,
  'Growth system & success metrics',
  'Measure',
  '2026-11-02 00:00+01',
  '2026-11-08 23:59+01',
  'Turn six weeks of work into a system you keep using, and learn how your progress is actually measured.'
)
on conflict (cohort_id, number) do update set
  title = excluded.title, theme = excluded.theme, overview = excluded.overview,
  release_at = excluded.release_at, deadline_at = excluded.deadline_at;

-- --------------------------------------------------------- module codes ----
update public.modules set code = 'M10'   where slug = 'captions-and-graphics';
update public.modules set code = 'M10.1' where slug = 'captions-and-graphics-part-2';

-- Success Metrics is taught content now, not an optional extra.
update public.modules
   set is_bonus = false,
       code = 'M13',
       summary = 'How your work in this programme is measured, and how to read your own numbers honestly.'
 where slug = 'success-metrics';

-- --------------------------------------------------- re-map weeks 5-7 ----
-- Move a module to a week by slug, replacing any existing placement.
create or replace function pg_temp.place(p_slug text, p_week integer, p_order integer)
returns void language plpgsql as $$
declare v_module uuid; v_week uuid;
begin
  select id into v_module from public.modules where slug = p_slug;
  select id into v_week from public.program_weeks
   where cohort_id = '22222222-2222-2222-2222-222222222222' and number = p_week;
  if v_module is null or v_week is null then return; end if;

  delete from public.week_modules where module_id = v_module;
  insert into public.week_modules (week_id, module_id, "order") values (v_week, v_module, p_order);
end $$;

select pg_temp.place('editing',                      5, 1);
select pg_temp.place('captions-and-graphics',        5, 2);
select pg_temp.place('captions-and-graphics-part-2', 6, 1);
select pg_temp.place('publishing',                   6, 2);
select pg_temp.place('growth-system',                7, 1);
select pg_temp.place('success-metrics',              7, 2);

-- ------------------------------------------- open weeks 1 and 2 (F3.7) ----
update public.program_weeks
   set release_at = least(release_at, now() - interval '1 minute')
 where cohort_id = '22222222-2222-2222-2222-222222222222'
   and number in (1, 2);

-- >>> supabase/migrations/20260922000010_p4_watch_completion.sql
-- ============================================================================
-- Completion is earned by watching, not by clicking.
--
-- record_video_progress already accumulates real playback ticks and ignores
-- scrubbing, so the 90% threshold means 90% actually watched. Completing the
-- module from inside that function makes watch time the single source of
-- truth and removes the self-declared button from the normal path.
--
-- The manual path is NOT deleted. If the IFrame API is blocked, tracking
-- yields nothing and a participant would otherwise be permanently stuck —
-- video tracking must never block completion (PRD F5.8). It becomes a
-- fallback, not the default.
-- ============================================================================

create or replace function public.record_video_progress(
  p_lesson_id        uuid,
  p_position_seconds integer,
  p_delta_seconds    integer default 0,
  p_duration_seconds integer default null,
  p_ended            boolean default false
) returns table (percentage numeric, completed boolean)
language plpgsql security invoker set search_path = public as $$
declare
  v_enrollment uuid := public.my_enrollment_id();
  v_duration   integer;
  v_row        public.video_progress;
  v_module     uuid;
  v_was_done   boolean;
begin
  if v_enrollment is null then
    raise exception 'no active enrollment';
  end if;

  insert into public.video_progress (
    enrollment_id, lesson_id, max_position_seconds, watched_seconds,
    duration_seconds, started_at, last_seen_at
  )
  values (
    v_enrollment, p_lesson_id, greatest(p_position_seconds, 0),
    greatest(p_delta_seconds, 0), p_duration_seconds, now(), now()
  )
  on conflict (enrollment_id, lesson_id) do update set
    max_position_seconds = greatest(
      public.video_progress.max_position_seconds, excluded.max_position_seconds),
    watched_seconds = least(
      public.video_progress.watched_seconds + greatest(p_delta_seconds, 0),
      coalesce(p_duration_seconds, public.video_progress.duration_seconds, 2147483647)),
    duration_seconds = coalesce(p_duration_seconds, public.video_progress.duration_seconds),
    last_seen_at = now()
  returning * into v_row;

  v_was_done := v_row.completed_at is not null;
  v_duration := nullif(coalesce(v_row.duration_seconds, 0), 0);

  update public.video_progress vp
     set percentage_watched = case
           when v_duration is null then 0
           else least(round((v_row.watched_seconds::numeric / v_duration) * 100, 2), 100)
         end,
         completed_at = case
           when vp.completed_at is not null then vp.completed_at
           when p_ended then now()
           when v_duration is not null
                and (v_row.watched_seconds::numeric / v_duration) >= 0.90 then now()
           else null
         end
   where vp.enrollment_id = v_enrollment and vp.lesson_id = p_lesson_id
  returning * into v_row;

  -- Crossing the threshold completes the module, once.
  if v_row.completed_at is not null and not v_was_done then
    select l.module_id into v_module from public.lessons l where l.id = p_lesson_id;
    if v_module is not null then
      insert into public.module_progress (
        enrollment_id, module_id, status, started_at, completed_at, completed_via
      )
      values (v_enrollment, v_module, 'completed', now(), now(), 'auto')
      on conflict (enrollment_id, module_id) do update set
        status = 'completed',
        completed_at = coalesce(public.module_progress.completed_at, now()),
        completed_via = coalesce(public.module_progress.completed_via, 'auto');

      perform public.recompute_progress(v_enrollment);
    end if;
  end if;

  return query select v_row.percentage_watched, v_row.completed_at is not null;
end $$;

grant execute on function public.record_video_progress(uuid, integer, integer, integer, boolean) to authenticated;

-- >>> supabase/migrations/20260922000011_p4_points.sql
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

-- >>> supabase/migrations/20260922000012_p4_leaderboard.sql
-- ============================================================================
-- Leaderboard access + wiring points into the single recompute entry point.
--
-- The board exposes display name, points and streak only — never submissions
-- or email addresses (AGENTS.md section 7). Participants who opt out are
-- excluded from other people's view but still see their own standing.
-- ============================================================================

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

  -- Week progress first: the week bonuses read from it.
  perform public.recompute_week_progress(p_enrollment_id);
  perform public.recompute_points(p_enrollment_id);
end $$;

-- ---------------------------------------------------------- leaderboard ----
create or replace function public.leaderboard(p_limit integer default 25)
returns table (
  rank            bigint,
  enrollment_id   uuid,
  display_name    text,
  points_total    integer,
  streak_weeks    integer,
  weeks_completed integer,
  is_me           boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_enrollment_id() as id),
  ranked as (
    select
      e.id,
      coalesce(nullif(trim(e.name), ''), split_part(e.email::text, '@', 1)) as display_name,
      e.points_total,
      e.streak_weeks,
      e.weeks_completed,
      -- Ties break by the earliest last scoring event, then by enrolment
      -- (PRD F10.5).
      row_number() over (
        order by e.points_total desc,
                 (select max(pe.occurred_at) from public.points_events pe
                   where pe.enrollment_id = e.id) asc nulls last,
                 e.enrolled_at asc
      ) as rank
    from public.enrollments e
    left join public.users u on u.id = e.user_id
    where e.cohort_id = (select cohort_id from public.enrollments where id = (select id from me))
      and e.status = 'active'
      and (coalesce(u.leaderboard_opt_out, false) = false or e.id = (select id from me))
  )
  select r.rank, r.id, r.display_name, r.points_total, r.streak_weeks,
         r.weeks_completed, r.id = (select id from me)
    from ranked r
   where r.rank <= p_limit
      -- Always include the caller's own neighbourhood, even outside the top N
      or abs(r.rank - (select rank from ranked where id = (select id from me))) <= 2
   order by r.rank;
$$;

-- "Most consistent" ranks by completed weeks, then on-time submission rate —
-- behaviour, not reach (PRD F10.8).
create or replace function public.leaderboard_consistent(p_limit integer default 10)
returns table (
  rank            bigint,
  display_name    text,
  weeks_completed integer,
  on_time_rate    numeric,
  is_me           boolean
)
language sql stable security definer set search_path = public as $$
  with me as (select public.my_enrollment_id() as id)
  select
    row_number() over (
      order by e.weeks_completed desc,
               coalesce(
                 (select avg(case when s.is_late then 0 else 1 end)::numeric
                    from public.submissions s
                   where s.enrollment_id = e.id and s.status <> 'draft'), 0) desc,
               e.enrolled_at asc
    ) as rank,
    coalesce(nullif(trim(e.name), ''), split_part(e.email::text, '@', 1)),
    e.weeks_completed,
    round(coalesce(
      (select avg(case when s.is_late then 0 else 1 end)::numeric
         from public.submissions s
        where s.enrollment_id = e.id and s.status <> 'draft'), 0) * 100, 0),
    e.id = (select id from me)
  from public.enrollments e
  left join public.users u on u.id = e.user_id
  where e.cohort_id = (select cohort_id from public.enrollments where id = (select id from me))
    and e.status = 'active'
    and (coalesce(u.leaderboard_opt_out, false) = false or e.id = (select id from me))
  order by rank
  limit p_limit;
$$;

-- "Active creators" for the "#12 of 87" denominator (PRD F10.10).
create or replace function public.active_creator_count() returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::integer
    from public.enrollments e
   where e.cohort_id = (select cohort_id from public.enrollments where id = public.my_enrollment_id())
     and e.status = 'active'
     and e.last_active_at > now() - interval '14 days';
$$;

grant execute on function public.leaderboard(integer) to authenticated;
grant execute on function public.leaderboard_consistent(integer) to authenticated;
grant execute on function public.active_creator_count() to authenticated;

-- >>> supabase/migrations/20260922000013_p5_sessions.sql
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

-- >>> supabase/migrations/20260922000014_sec_privilege_escalation.sql
-- ============================================================================
-- SECURITY FIX — privilege escalation via self-update.
--
-- The `users_update_self` policy allowed a participant to update their own row
-- with no restriction on WHICH columns. Row-level security answers "which
-- rows", never "which columns", so a participant could run:
--
--     update users set role = 'admin' where id = auth.uid();
--
-- …and is_admin() would then return true. Everything downstream is gated on
-- that function, so a single UPDATE granted: every participant's submissions
-- and email address, the audit log, the ability to approve work, post
-- announcements, and revoke other people's enrolments.
--
-- Two layers, because either alone can be undone by a later migration:
--   1. column-level privileges — Postgres refuses the write outright
--   2. a trigger — protected columns are restored even if a grant is restored
--
-- `email` is protected for the same reason: enrolment is keyed on it, so a
-- self-service change is an account-takeover primitive.
-- ============================================================================

-- 1. Column-level privileges. A participant may change only presentation and
--    preference columns on their own row.
revoke update on public.users from authenticated;
grant update (name, avatar_url, timezone, socials, email_prefs,
              leaderboard_opt_out, onboarded_at)
  on public.users to authenticated;

-- 2. Trigger backstop. Anything a non-admin tries to change outside that set is
--    silently restored to its previous value rather than erroring, so a
--    malformed client cannot brick a legitimate profile save.
create or replace function public.protect_user_columns() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_actor_role user_role;
begin
  select role into v_actor_role from public.users where id = auth.uid();

  -- The service role has no auth.uid(); admin tooling and migrations pass
  -- through untouched.
  if auth.uid() is null or v_actor_role = 'admin' then
    return new;
  end if;

  new.id    := old.id;
  new.role  := old.role;
  new.email := old.email;
  return new;
end $$;

drop trigger if exists users_protect_columns on public.users;
create trigger users_protect_columns
  before update on public.users
  for each row execute function public.protect_user_columns();

-- >>> supabase/migrations/20260922000015_content_from_outline.sql
-- ============================================================================
-- Authoritative course content, from the official outline in Drive:
--   "Pipeops_Creator_Foundation_Course_12_Module_Outline.pdf"
--
-- The module titles, focus lines and bullets previously in the seed were my
-- own paraphrase. These are the real ones. Each module's MODULE OUTCOME from
-- the outline becomes its assignment brief.
--
-- The Drive ASSESMENTS and KEY POINTS folders are empty, so nothing could be
-- imported from them — see the note to the programme team.
-- ============================================================================

update public.modules m set
  title = v.title, summary = v.focus, what_you_will_learn = v.bullets::jsonb
from (values
  ('creator-economy', 'Understanding the Creator Economy',
   'Creator mindset and the creator economy.',
   '["What content creation really is: value, packaging, distribution and consumption","Creators vs. influencers vs. brands","Why audiences follow: education, entertainment, inspiration and connection","Attention as the currency of the creator economy","Building transferable creator skills"]'),

  ('finding-your-niche', 'Finding Your Niche',
   'Niche discovery and content positioning.',
   '["The Niche Triangle: passion, expertise and market demand","Writing a clear WHO + WHAT niche statement","Defining 3-5 content pillars","Using niche clarity to build consistency"]'),

  ('algorithms', 'Understanding Social Media Algorithms',
   'How platforms distribute and reward content.',
   '["Instagram test audiences and distribution","TikTok''s For You Page: testing and scaling","YouTube Shorts: discovery windows and session time","Watch time, retention, shares, saves, comments and replays","Creating for viewer behaviour rather than vanity metrics"]'),

  ('research-and-ideas', 'Content Research & Idea Generation',
   'Finding validated ideas and building a content bank.',
   '["Researching high-performing content in your niche","Competitor research: hook, format and emotional payoff","Spotting and adapting trends quickly","Using AI as an idea accelerator","Building and maintaining a 20-idea content bank"]'),

  ('planning-and-scripting', 'Content Planning & Scripting',
   'Turning ideas into film-ready scripts.',
   '["Short-form content structure","Hook to Interest to Value to Action framework","Starting with value and reverse-engineering the hook","Writing bodies in bullet points for natural delivery","Timing and tightening scripts"]'),

  ('hooks', 'Hooks That Stop The Scroll',
   'Attention psychology and high-performing openings.',
   '["The importance of the first three seconds","Threat-based hooks","Reward-based hooks","Anomaly and pattern-interruption hooks","Avoiding slow introductions","Visual and verbal pattern interruption"]'),

  ('filming', 'Digital Camera / Smartphone Filming & Shooting Styles',
   'Practical camera setup and shot composition.',
   '["Resolution, focus and exposure settings","Frame rates and vertical 9:16 content","Smartphone positioning and eye-level framing","Wide, medium and close-up shots","B-roll, POV and over-the-shoulder shots","Creating intentional visual variety"]'),

  ('lighting-and-audio', 'Lighting & Audio Fundamentals',
   'Making content clear, well-lit and easy to hear.',
   '["Natural window lighting","Avoiding silhouettes and harsh shadows","Ring-light and two-point lighting concepts","Lapel microphones and room acoustics","Audio testing and monitoring","Beginner, intermediate and professional setup levels"]'),

  ('editing', 'Mobile Editing Fundamentals',
   'Turning raw footage into a finished short-form video.',
   '["Five-stage workflow: import, rough cut, tighten, enhance, review/export","Removing dead space","Clean jump cuts","Pacing and visual rhythm","Retention editing: pattern breaks, open loops and silence removal","CapCut workflow for the course"]'),

  ('captions-and-graphics', 'Captions, Graphics & Visual Enhancement',
   'The finishing layer for sound-off viewing.',
   '["Why captions improve accessibility and comprehension","Auto-captioning and manual proofreading","Safe text placement and typography consistency","Motion graphics and key-point callouts","Progress indicators and subtle sound design","Music balanced underneath the voice"]'),

  ('publishing', 'Publishing Strategy & Content Distribution',
   'Packaging, publishing and cross-platform distribution.',
   '["Sustainable posting consistency","Using analytics to identify peak posting times","Focused hashtag strategy","Search-friendly captions and on-screen language","Strong thumbnail/cover selection","Cross-posting to Instagram Reels, TikTok and YouTube Shorts"]'),

  ('growth-system', 'Creator Growth System',
   'Analytics, content audits and continuous improvement.',
   '["Retention, saves, shares and follower conversion","48-hour and 7-day performance reviews","Monthly content audits","Identifying top and bottom performers","Iteration instead of reinvention","Weekly growth tracker: create, measure, learn, improve, repeat"]')
) as v(slug, title, focus, bullets)
where m.slug = v.slug;

-- ----------------------------------------------------- module outcomes ----
-- Each module's MODULE OUTCOME from the outline, as its assignment.
insert into public.assignments
  (module_id, title, brief, submission_types, text_min, text_max, is_required, points)
select m.id, v.title, v.brief, v.types::jsonb, v.tmin, v.tmax, true, 15
from (values
  ('creator-economy', 'Where you fit as a creator',
   'Define what content creation means to you, and identify where you fit. Who are you creating for, and which of education, entertainment, inspiration or connection is your primary value?',
   '["text"]', 150, 1500),
  ('finding-your-niche', 'Your niche statement and content pillars',
   E'Write a finalised niche statement using the Niche Triangle (passion, expertise, market demand), then list three to five content pillars.\n\nYour statement should complete: "I help ___ do ___ so they can ___."\n\nFor each pillar, give the pillar name and one example post.',
   '["text"]', 200, 2000),
  ('algorithms', 'Read one platform''s distribution logic',
   'Pick Instagram, TikTok or YouTube Shorts. Explain in your own words how it decides what to show, and name two things you will change about your content because of it.',
   '["text"]', 150, 1500),
  ('research-and-ideas', 'Your 20-idea content bank',
   'Build a content bank of at least 20 ideas in your niche. For each, give the idea in one line and which pillar it belongs to. Paste it as text or attach your document.',
   '["text","file"]', 0, 5000),
  ('planning-and-scripting', 'One complete script',
   'Produce one complete short-form script using Hook, Interest, Value, Action. Write the body in bullet points for natural delivery, and keep it tight.',
   '["text","file"]', 200, 4000),
  ('hooks', 'Lock your opening hook',
   'Write five alternative opening hooks for your Module 5 script, using at least two different types (threat, reward, anomaly). Then say which one you are locking in, and why.',
   '["text"]', 150, 2000),
  ('filming', 'Film the scripted piece',
   'Film your scripted piece using correct camera settings and a deliberate shot plan. Include at least one wide, one medium and one close-up. Submit the raw footage or a link to it.',
   '["url","file"]', 0, 500),
  ('lighting-and-audio', 'Your recording setup',
   'Build a usable beginner setup and demonstrate it: show your lighting position and your audio source, and say what you fixed to get there.',
   '["url","file","text"]', 0, 1000),
  ('editing', 'A clean rough edit',
   'Produce a clean rough edit ready for captions: dead space removed, jump cuts tidy, pacing deliberate. Submit a link to the cut.',
   '["url","file"]', 0, 500),
  ('captions-and-graphics', 'Fully captioned and enhanced',
   'Submit a fully captioned and graphics-enhanced video, ready for publishing. Captions proofread, text placed safely, music balanced under the voice.',
   '["url","file"]', 0, 500),
  ('publishing', 'Publish it properly',
   'Publish the finished video using the full distribution checklist: posting time, hashtags, search-friendly caption, strong cover. Paste the public link.',
   '["url"]', 0, 500),
  ('growth-system', 'Your first content audit',
   'Complete a first content audit using the weekly growth tracker. Report retention, saves, shares and follower conversion, then identify the next version of your strongest piece.',
   '["text","file"]', 200, 4000)
) as v(slug, title, brief, types, tmin, tmax)
join public.modules m on m.slug = v.slug
on conflict do nothing;

-- The existing Module 2 assignment predates this; align it with the outline.
update public.assignments a set
  title = 'Your niche statement and content pillars',
  brief = E'Write a finalised niche statement using the Niche Triangle (passion, expertise, market demand), then list three to five content pillars.\n\nYour statement should complete: "I help ___ do ___ so they can ___."\n\nFor each pillar, give the pillar name and one example post.'
from public.modules m
where m.id = a.module_id and m.slug = 'finding-your-niche';

-- --------------------------------------------------- final course project --
insert into public.program_tasks
  (week_id, title, brief, submission_types, text_min, text_max,
   is_required, requires_review, points, is_final_project)
select w.id,
  'Final course project',
  E'Everything the programme has been building toward, in one submission.\n\n1. Your niche, chosen with the Module 2 framework\n2. Your 3-5 content pillars\n3. Ten content ideas\n4. Five scripts using Hook, Interest, Value, Action\n5. Five videos filmed with the lighting and audio principles\n6. All five edited and subtitled\n7. All five published on at least one platform\n8. Your analytics and lessons learned, using the Module 12 tracker\n\nPaste the public links to all five published videos, and write up what the numbers taught you.',
  '["url","text"]'::jsonb, 300, 6000, true, true, 30, true
from public.program_weeks w
where w.cohort_id = '22222222-2222-2222-2222-222222222222' and w.number = 7
on conflict do nothing;

-- ------------------------------------------------------ library resources --
-- Drive links: these are private to the PipeOps Drive today. They must be set
-- to "anyone with the link" or re-hosted before participants can open them.
insert into public.learning_materials
  (id, owner_type, owner_id, "order", title, description, type, url, is_required)
values
  ('88888888-0000-0000-0000-000000000010', 'library',
   '22222222-2222-2222-2222-222222222222', 1,
   'Free creative resources guide',
   'Tools and free websites for creators, collected by the PipeOps team.',
   'pdf', 'https://drive.google.com/file/d/1VPfXUE7aQQgsPCiYfJVYCPsinroBaMNT/view', false),
  ('88888888-0000-0000-0000-000000000011', 'library',
   '22222222-2222-2222-2222-222222222222', 2,
   'Course outline — all 12 modules',
   'The full module-by-module roadmap, including the final project brief.',
   'pdf', 'https://drive.google.com/file/d/1cxkf5-EeDwcZfCRA6LTDK1Fi5xdJdsY7/view', false)
on conflict (id) do update set url = excluded.url, description = excluded.description;

-- >>> supabase/migrations/20260922000016_assignment_unique.sql
-- ============================================================================
-- One assignment per module.
--
-- The outline import created a second assignment on Module 2 because nothing
-- stopped it: `on conflict do nothing` needs a constraint to conflict against.
-- A duplicate inflates the progress denominator for every participant, so this
-- is a data-integrity problem, not a cosmetic one.
-- ============================================================================

-- Keep the oldest row per module; delete later duplicates and anything
-- referencing them.
delete from public.submissions s
 using (
   select a.id from public.assignments a
    where a.id <> (
      select a2.id from public.assignments a2
       where a2.module_id = a.module_id
       order by a2.created_at, a2.id
       limit 1)
 ) dupes
 where s.item_type = 'assignment' and s.item_id = dupes.id;

delete from public.assignments a
 where a.id <> (
   select a2.id from public.assignments a2
    where a2.module_id = a.module_id
    order by a2.created_at, a2.id
    limit 1);

alter table public.assignments
  add constraint assignments_one_per_module unique (module_id);

-- >>> supabase/migrations/20260922000017_module01_authentic.sql
-- ============================================================================
-- Module 01's real assignment, from the workbook PDF in Drive
-- ("Module_01_Understanding_the_Creator_Economy.pdf", PART 1 / ASSESMENTS).
--
-- That file is the ONLY module workbook the Drive API returns. The other 23
-- expected files (modules 02-12, plus KEY POINTS) are not reachable — see the
-- note to the programme team. The remaining assignments are still derived from
-- the module outcomes in the course outline and should be replaced as the real
-- workbooks become available.
-- ============================================================================

update public.assignments a set
  title = 'Why you want to create',
  brief = E'Submit a one-paragraph reflection:\n\n"Why do I want to become a content creator, and which of the four audience motivators do I naturally create best?"\n\nThe four motivators are education, entertainment, inspiration and connection.\n\nBefore you write it, do the in-lesson classwork in the module workbook: list three accounts you follow and which motivator you follow them for, write a two-sentence definition of "content" using the words value, package and audience, and name one creator, one influencer and one brand with the difference between them.',
  text_min = 150,
  text_max = 2000
from public.modules m
where m.id = a.module_id and m.slug = 'creator-economy';

-- The workbook itself, attached to the module it belongs to.
insert into public.learning_materials
  (id, owner_type, owner_id, "order", title, description, type, url, is_required)
select '88888888-0000-0000-0000-000000000020', 'module', m.id, 1,
       'Module 01 workbook',
       'In-lesson classwork and the assignment, as a printable workbook.',
       'pdf', 'https://drive.google.com/file/d/1cV82nI9HMPwbCVslODto9vW8rU0lKxC6/view', false
from public.modules m where m.slug = 'creator-economy'
on conflict (id) do update set url = excluded.url, title = excluded.title;

-- >>> supabase/migrations/20260922000018_admin_content_write.sql
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

-- >>> supabase/migrations/20260922000019_week_images.sql
-- ============================================================================
-- A cover image per week, for the Learn grid.
--
-- Editable from /admin/content like everything else — these are placeholders
-- chosen to reflect each week's subject, not brand assets.
-- ============================================================================

alter table public.program_weeks add column if not exists image_url text;

update public.program_weeks w set image_url = v.url
from (values
  (1, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=900&q=80&auto=format&fit=crop'),
  (2, 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80&auto=format&fit=crop'),
  (3, 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=80&auto=format&fit=crop'),
  (4, 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=900&q=80&auto=format&fit=crop'),
  (5, 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=900&q=80&auto=format&fit=crop'),
  (6, 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&q=80&auto=format&fit=crop'),
  (7, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&q=80&auto=format&fit=crop')
) as v(number, url)
where w.number = v.number
  and w.cohort_id = '22222222-2222-2222-2222-222222222222';

-- >>> supabase/seed.sql
-- ============================================================================
-- Cohort 01 seed. Idempotent — safe to re-run after editing.
--
-- TODO(content): replace every 'REPLACE_ME' video_ref with the real YouTube
-- video id (the 11-character id, NOT the full URL). Modules without a video id
-- still render; the player shows a "video coming soon" state.
-- ============================================================================

insert into public.programs (id, slug, name, description) values
  ('11111111-1111-1111-1111-111111111111', 'ugc', 'PipeOps UGC Program',
   'Six-week creator programme: learn, create, submit, publish, measure, improve.')
on conflict (slug) do update set name = excluded.name;

insert into public.cohorts (id, program_id, name, code, starts_on, ends_on, timezone, status, discord_url) values
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'Cohort 01', 'ugc-01', '2026-09-21', '2026-11-01', 'Africa/Lagos', 'active', null)
on conflict (code) do update set status = excluded.status, ends_on = excluded.ends_on;

insert into public.courses (id, slug, title, description) values
  ('33333333-3333-3333-3333-333333333333', 'ugc-creator-course',
   'The Complete UGC Creator Course',
   'From creator mindset to a repeatable growth system.')
on conflict (slug) do update set title = excluded.title;

insert into public.course_parts (id, course_id, "order", title) values
  ('44444444-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 1, 'Creator Mindset & Content Strategy'),
  ('44444444-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 2, 'Content Production'),
  ('44444444-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 3, 'Editing, Publishing & Growth')
on conflict (id) do update set title = excluded.title;

-- ------------------------------------------------------------- modules ----
insert into public.modules (id, course_id, part_id, "order", number, slug, title, summary, what_you_will_learn, estimated_minutes) values
  ('55555555-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000001',1,1,'creator-economy','The Creator Economy','Why developer-creators are in demand, and what the opportunity actually looks like.','["How the creator economy pays","Why developers have an unfair advantage","What to expect from the next six weeks"]',12),
  ('55555555-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000001',2,2,'finding-your-niche','Finding Your Niche','Choose the lane you will publish in for the rest of the programme.','["How to pick a niche you will not abandon","Writing a niche statement","Choosing three to five content pillars"]',14),
  ('55555555-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000001',3,3,'algorithms','How Algorithms Actually Work','What each platform rewards, and what it quietly punishes.','["Watch time, retention and shares","Why the first three seconds decide everything","Platform-by-platform differences"]',13),
  ('55555555-0000-0000-0000-000000000004','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000001',4,4,'research-and-ideas','Research & Idea Generation','Build an idea bank you can pull from every week.','["Where to find proven ideas","Turning research into an idea bank","Never staring at a blank page again"]',15),
  ('55555555-0000-0000-0000-000000000005','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000002',5,5,'planning-and-scripting','Content Planning & Scripting','The Hook, Interest, Value, Action framework.','["Structuring a short-form script","The HIVA framework","Writing for the ear, not the page"]',14),
  ('55555555-0000-0000-0000-000000000006','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000002',6,6,'hooks','Hooks That Stop the Scroll','The first three seconds, and how to write ten of them fast.','["Hook patterns that work","Writing five hooks per idea","Testing hooks before you film"]',11),
  ('55555555-0000-0000-0000-000000000007','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000002',7,7,'filming','Filming on a Phone','Everything you need is already in your pocket.','["Framing and composition","Shooting to edit","Common filming mistakes"]',16),
  ('55555555-0000-0000-0000-000000000008','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000002',8,8,'lighting-and-audio','Lighting & Audio','The two things viewers notice before your content.','["Free lighting that works","Audio on a budget","Fixing a bad room"]',13),
  ('55555555-0000-0000-0000-000000000009','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000003',9,9,'editing','Editing That Keeps Attention','Pace, cuts and the rhythm of a watchable video.','["Cutting for retention","Pacing and silence","A repeatable edit workflow"]',18),
  ('55555555-0000-0000-0000-000000000010','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000003',10,10,'captions-and-graphics','Captions & Graphics','Most people watch on mute.','["Caption styles that read fast","On-screen text hierarchy","Simple motion that adds meaning"]',12),
  ('55555555-0000-0000-0000-000000000011','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000003',11,11,'publishing','Publishing & Distribution','Posting is a skill, not an afterthought.','["Platform-native publishing","Titles, descriptions and tags","Repurposing one idea across platforms"]',14),
  ('55555555-0000-0000-0000-000000000012','33333333-3333-3333-3333-333333333333','44444444-0000-0000-0000-000000000003',12,12,'growth-system','Your Growth System','Turning six weeks into a habit that outlives the programme.','["Reading your analytics honestly","The weekly improvement loop","Building a system you will keep"]',17)
on conflict (id) do update set
  title = excluded.title, summary = excluded.summary,
  what_you_will_learn = excluded.what_you_will_learn,
  estimated_minutes = excluded.estimated_minutes;

-- One lesson per module (PRD F4.3). Fill in video_ref.
insert into public.lessons (module_id, "order", video_provider, video_ref, duration_seconds)
select m.id, 1, 'youtube', null, m.estimated_minutes * 60
from public.modules m
on conflict (module_id, "order") do nothing;

-- --------------------------------------------------------------- weeks ----
-- Africa/Lagos is UTC+1 year-round. Releases Monday 00:00, deadlines Sunday 23:59.
insert into public.program_weeks (id, cohort_id, number, title, theme, release_at, deadline_at, overview) values
  ('77777777-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',1,'Creator economy & niche','Strategy','2026-09-21 00:00+01','2026-09-27 23:59+01','Decide what you are going to be known for. By Sunday you should have a niche statement and three to five content pillars.'),
  ('77777777-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',2,'Algorithms & research','Strategy','2026-09-28 00:00+01','2026-10-04 23:59+01','Understand what the platforms reward, then build an idea bank you can pull from every week.'),
  ('77777777-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222',3,'Planning, scripting & hooks','Production','2026-10-05 00:00+01','2026-10-11 23:59+01','Turn ideas into scripts, and scripts into hooks that stop the scroll.'),
  ('77777777-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222',4,'Filming','Production','2026-10-12 00:00+01','2026-10-18 23:59+01','Record real content with the phone you already own.'),
  ('77777777-0000-0000-0000-000000000005','22222222-2222-2222-2222-222222222222',5,'Editing & captions','Post-production','2026-10-19 00:00+01','2026-10-25 23:59+01','Cut for retention, caption for mute, and finish something you are proud of.'),
  ('77777777-0000-0000-0000-000000000006','22222222-2222-2222-2222-222222222222',6,'Publishing & growth','Launch','2026-10-26 00:00+01','2026-11-01 23:59+01','Publish, measure honestly, and leave with a system you will keep using.')
on conflict (cohort_id, number) do update set
  title = excluded.title, theme = excluded.theme, overview = excluded.overview,
  release_at = excluded.release_at, deadline_at = excluded.deadline_at;

-- Two modules per week, in order.
insert into public.week_modules (week_id, module_id, "order")
select w.id, m.id, case when m.number % 2 = 1 then 1 else 2 end
  from public.program_weeks w
  join public.modules m on m.number in (w.number * 2 - 1, w.number * 2)
 where w.cohort_id = '22222222-2222-2222-2222-222222222222'
on conflict (week_id, module_id) do nothing;

-- ----------------------------------------------- Week 1 bonus resources ----
insert into public.learning_materials (id, owner_type, owner_id, "order", title, description, type, url, is_required) values
  ('88888888-0000-0000-0000-000000000001','week','77777777-0000-0000-0000-000000000001',1,'Niche statement worksheet','Fill this in as you watch Module 2.','template','https://pipeops.io','false'),
  ('88888888-0000-0000-0000-000000000002','week','77777777-0000-0000-0000-000000000001',2,'Content pillar examples','Twelve real developer-creator pillar sets.','doc','https://pipeops.io','false')
on conflict (id) do update set title = excluded.title, url = excluded.url;

-- >>> supabase/seed_p2.sql
-- ============================================================================
-- Week 1 work items. Idempotent.
--
-- TODO(content): weeks 2-6 briefs still needed from the programme team.
-- ============================================================================

-- Course assignment: attached to M02 (Finding Your Niche), which is where the
-- niche statement and content pillars are taught.
insert into public.assignments
  (id, module_id, title, brief, submission_types, text_min, text_max, is_required, points)
select
  '99999999-0000-0000-0000-000000000001',
  m.id,
  'Your niche statement and content pillars',
  E'Write a single clear niche statement, then list three to five content pillars you will publish against for the rest of the programme.\n\nYour niche statement should finish this sentence: "I help ___ do ___ so they can ___."\n\nFor each pillar, give the pillar name and one example of a post you could make under it.',
  '["text"]'::jsonb,
  200, 2000, true, 15
from public.modules m where m.slug = 'finding-your-niche'
on conflict (id) do update set
  title = excluded.title, brief = excluded.brief,
  submission_types = excluded.submission_types;

-- Weekly programme task: the thing that replaces Discord links.
insert into public.program_tasks
  (id, week_id, title, brief, submission_types, allowed_platforms,
   text_min, text_max, is_required, requires_review, points)
select
  'aaaaaaaa-0000-0000-0000-000000000001',
  w.id,
  'Introduce yourself as a creator',
  E'Publish one short piece of content introducing yourself as a developer-creator: who you are, what you build, and what you are going to be posting about for the next six weeks.\n\nPost it on LinkedIn, X, TikTok, Instagram, Facebook or YouTube, then paste the public link below.\n\nKeep it short. Done beats perfect — this one exists to get you publishing.',
  '["url","text"]'::jsonb,
  array['linkedin.com','x.com','twitter.com','tiktok.com','instagram.com','facebook.com','youtube.com','youtu.be'],
  0, 500, true, true, 20
from public.program_weeks w
where w.cohort_id = '22222222-2222-2222-2222-222222222222' and w.number = 1
on conflict (id) do update set
  title = excluded.title, brief = excluded.brief,
  allowed_platforms = excluded.allowed_platforms;

