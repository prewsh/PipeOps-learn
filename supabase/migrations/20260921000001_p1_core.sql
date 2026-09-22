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
