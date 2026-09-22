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
