-- ============================================================================
-- Course materials from the Creator Foundation workbooks, the Week 1 task,
-- and the final six-week structure.
--
-- Source: the programme team's Drive folders — one "In-lesson classwork +
-- assignment" workbook and one "Key points" sheet per module, M01–M12. Every
-- assignment brief and every resource description below is copied from those
-- documents, not written here (AGENTS.md section 12: never invent
-- participant-facing copy). Where a brief previously came from the course
-- outline and disagreed with the workbook — M03 most of all — the workbook
-- wins.
--
-- The two kinds of document are deliberately kept apart, because mixing them
-- up is the confusion the programme team asked to avoid:
--
--   workbook    -> assignments.document_url   (it IS the assessment)
--   key points  -> learning_materials         (it is the module's resource)
--
-- M10.1 (Captions & Graphics, Part 2) and M13 (Success Metrics) have no
-- workbook of their own, so they carry neither.
-- ============================================================================

-- --------------------------------------------------------------- schema ----

alter table public.assignments
  add column if not exists document_url text
    check (document_url is null or document_url ~ '^https?://');

comment on column public.assignments.document_url is
  'The assignment workbook (in-lesson classwork + assignment). Linked from the assignment itself, never listed as a resource.';

-- A weekly task can be submitted somewhere other than the portal — for now,
-- a Discord channel. The platform cannot see those submissions, so such a
-- task must not count toward progress, week completion or cohort health:
-- counting it would mark every participant as having missed it the moment the
-- deadline passed. The constraint makes that impossible rather than a rule
-- someone has to remember when editing the task.
alter table public.program_tasks
  add column if not exists external_submission_url text
    check (external_submission_url is null or external_submission_url ~ '^https?://'),
  add column if not exists external_submission_note text;

alter table public.program_tasks
  drop constraint if exists program_tasks_external_not_tracked;
alter table public.program_tasks
  add constraint program_tasks_external_not_tracked
  check (external_submission_url is null or is_required = false);

comment on column public.program_tasks.external_submission_url is
  'Where participants submit when it is not the portal (e.g. a Discord channel). When set, the task is untracked: is_required must be false.';

-- ------------------------------------------------ six weeks, 3 + 3 at the end
-- Week 5: M09, M10, M10.1 · Week 6: M11, M12, Success Metrics. Week 7 existed
-- only to hold M12 and Success Metrics; with both moved it would be an empty
-- locked card, so it goes. Nothing referenced it but derived week_progress
-- rows (rebuilt below) — no tasks, sessions, materials or points.
--
-- Released weeks never re-lock and progress uses a fixed denominator, so
-- moving modules between two unreleased weeks changes nobody's numbers.
create or replace function pg_temp.place(p_code text, p_week integer, p_order integer)
returns void language plpgsql as $$
declare v_module uuid; v_week uuid;
begin
  select id into v_module from public.modules where code = p_code;
  select w.id into v_week
    from public.program_weeks w
    join public.cohorts c on c.id = w.cohort_id
   where c.code = 'ugc-01' and w.number = p_week;
  if v_module is null or v_week is null then
    raise exception 'cannot place % in week %: module or week missing', p_code, p_week;
  end if;

  delete from public.week_modules where module_id = v_module;
  insert into public.week_modules (week_id, module_id, "order") values (v_week, v_module, p_order);
end $$;

select pg_temp.place('M09',   5, 1);
select pg_temp.place('M10',   5, 2);
select pg_temp.place('M10.1', 5, 3);
select pg_temp.place('M11',   6, 1);
select pg_temp.place('M12',   6, 2);
select pg_temp.place('M13',   6, 3);

delete from public.program_weeks w
 using public.cohorts c
 where c.id = w.cohort_id and c.code = 'ugc-01' and w.number = 7
   and not exists (select 1 from public.week_modules wm where wm.week_id = w.id)
   and not exists (select 1 from public.program_tasks t where t.week_id = w.id);

-- ----------------------------------------------------- open weeks 1 to 4 ----
-- So participants can watch ahead. Deadlines are untouched: opening a week
-- early does not change when its work is due. `least` keeps any week that is
-- already open exactly as it was.
update public.program_weeks w
   set release_at = least(w.release_at, now())
  from public.cohorts c
 where c.id = w.cohort_id and c.code = 'ugc-01' and w.number between 1 and 4;

-- ------------------------------------------------------------ Discord ----
update public.cohorts set discord_url = 'https://discord.gg/CsJdJZyfEc' where code = 'ugc-01';

-- --------------------------------------------------------- assignments ----
-- Existing rows are updated in place, never replaced, so their ids — and any
-- submission that points at them — survive.
--
-- text_min is cleared on M02 and M05: their deliverable is a document (the
-- niche statement "in the format provided (PDF)", the script "using the
-- provided template"). With a minimum set, the submission gate requires text,
-- and a PDF-only submission would be refused.
create or replace function pg_temp.assign(
  p_code text, p_title text, p_brief text, p_drive_id text
) returns void language plpgsql as $$
begin
  update public.assignments a
     set title = p_title,
         brief = p_brief,
         document_url = 'https://drive.google.com/file/d/' || p_drive_id || '/view'
    from public.modules m
   where m.id = a.module_id and m.code = p_code;
  if not found then raise exception 'no assignment for %', p_code; end if;
end $$;

select pg_temp.assign('M01', 'Why you want to create',
  'Submit a 1-paragraph reflection: “Why do I want to become a content creator, and which of the 4 audience motivators do I naturally create best?”',
  '1cV82nI9HMPwbCVslODto9vW8rU0lKxC6');

select pg_temp.assign('M02', 'Your niche statement and 5 content pillars',
  'Submit your finalized niche statement and 5 content pillars in the format provided (PDF). This will be used as your identity for the Final Course Project.',
  '1dGJwMB1GF3-SpCmZh4WSrsd0gXz00JJy');

select pg_temp.assign('M03', 'Compare Reels and TikTok distribution',
  'Write a short analysis (5–7 sentences) comparing how Instagram Reels and TikTok distribution differ, using your own words — no copy-pasting from the internet.',
  '1GcZNv3qrkeQV67DTta7mHaSQdit_ueNX');

select pg_temp.assign('M04', 'Your 20-idea content bank',
  'Submit a content bank with a minimum of 20 ideas, each tagged to one of your 5 content pillars from Module 2.',
  '1m13OyQK543rmYJ_abGB0r3ddPDMS4x0n');

select pg_temp.assign('M05', 'One fully written script',
  'Submit one fully written script (using the provided template) that you will actually film in Module 7.',
  '1OqbApNjturUZTmEij0SwdteeemZh32sh');

select pg_temp.assign('M06', 'Lock your opening hook',
  'Finalize your script’s opening hook line and lock it into your Module 5 script — this is the version you will film.',
  '1ExidG9QzKLY2WyB8CWtpf-L3UHJ93teG');

select pg_temp.assign('M07', 'Film a 30-second practice clip',
  'Film a 30-second practice clip using at least 3 of the 5 shot types covered in this lesson, using your Module 5/6 script as the basis.',
  '1N-Ywaauf2bYtK940v6IoaJbdMxhu5aML');

select pg_temp.assign('M08', 'A 15-second lighting and audio test',
  'Submit a 15-second test clip demonstrating correct lighting (no silhouette, no harsh shadow) and clear audio.',
  '1kCzD0Y_kyOZ4vCPLvzL7SNUA6SApKZY6');

select pg_temp.assign('M09', 'A clean rough edit',
  'Submit a fully cut (but not yet captioned/graphics) rough edit of your Module 5–8 video.',
  '1Fe1CgWNRyV4zEKzT8lbVSiiYDkHiW0vj');

select pg_temp.assign('M10', 'Fully captioned and enhanced',
  'Submit your fully captioned and graphics-enhanced video ready for the publishing stage.',
  '1eoWnWefRCGDvSx-Fzj7B1SsHXAAQGoTY');

select pg_temp.assign('M11', 'Publish your finished video',
  'Publish your finished video (from Module 10) across at least one platform, following the full checklist covered in this lesson.',
  '1ioy_G--I5gIlMRTXMa3NDUITFta90ioP');

select pg_temp.assign('M12', 'Your first content audit',
  'Submit your first completed content audit (minimum 3 posts, even if only test posts) with a written 3-sentence insight on what you’ll do differently next.',
  '1AwytL1GEmA8JU94RIK_Vn-21zaGYoMSU');

update public.assignments a
   set submission_types = '["text", "file"]'::jsonb, text_min = null
  from public.modules m
 where m.id = a.module_id and m.code = 'M02';

update public.assignments a
   set text_min = null
  from public.modules m
 where m.id = a.module_id and m.code = 'M05';

-- ---------------------------------------------------- module resources ----
-- The M01 workbook was listed as a resource. It is the assessment, so it now
-- lives on the assignment (above) and leaves the resource list.
delete from public.learning_materials lm
 using public.modules m
 where lm.owner_type = 'module' and lm.owner_id = m.id and m.code = 'M01'
   and lm.url like '%1cV82nI9HMPwbCVslODto9vW8rU0lKxC6%';

-- One key-points sheet per module. The description is the sheet's own
-- "Module focus" line. Tagged so the module page can point the assignment at
-- it without matching on a title a person might later edit.
create or replace function pg_temp.keypoints(
  p_code text, p_focus text, p_drive_id text
) returns void language plpgsql as $$
declare v_module uuid; v_url text := 'https://drive.google.com/file/d/' || p_drive_id || '/view';
begin
  select id into v_module from public.modules where code = p_code;
  if v_module is null then raise exception 'no module %', p_code; end if;

  -- Idempotent on re-run: the same file is never attached twice.
  if exists (select 1 from public.learning_materials
              where owner_type = 'module' and owner_id = v_module and url = v_url) then
    return;
  end if;

  insert into public.learning_materials
    (owner_type, owner_id, "order", title, description, type, url, is_required, tags)
  values
    ('module', v_module, 1,
     'Module ' || replace(p_code, 'M', '') || ' key points',
     p_focus, 'pdf', v_url, false, array['key-points']);
end $$;

select pg_temp.keypoints('M01',
  'Build the right mental model of content creation before moving into production.',
  '1aJSeGnvJVGW7N6PGhP-6_ZeqD4CElOWL');
select pg_temp.keypoints('M02',
  'Define a specific creator lane and create a repeatable structure for the content you will make.',
  '16I-q-QpB0Wrn2iIMmKOxKJlPAReYyXuo');
select pg_temp.keypoints('M03',
  'Understand the distribution logic described in the course and focus on the signals platforms reward.',
  '1Lh28MWHHSlAYVT9V3Mh7kDzAIvTMD_27');
select pg_temp.keypoints('M04',
  'Build a repeatable system for finding validated ideas, spotting trends, using AI responsibly, and maintaining a content bank.',
  '1JK__a0QFgOGQszo9nFRhGWYMuObTUiF0');
select pg_temp.keypoints('M05',
  'Turn a content idea into a structured, natural-sounding script that is ready to film.',
  '1s138u7nRA19l7p-DzbzTNc34AlQ-lTzh');
select pg_temp.keypoints('M06',
  'Understand the psychology of attention and create openings that earn the next few seconds.',
  '1NymR_cvngGvG9VgDC0VJMJ7KOaLiBLoQ');
select pg_temp.keypoints('M07',
  'Use a phone or camera intentionally by controlling settings, framing, format, and shot variety.',
  '1RzLnoJCZ-UhFXJbysTKwRrv74gZ_kz_6');
select pg_temp.keypoints('M08',
  'Create footage that is clear, well-lit, and easy to listen to without requiring expensive equipment.',
  '1V6zY-y3NSVi1NdmBzxK82b0XlhTrqXjY');
select pg_temp.keypoints('M09',
  'Turn raw footage into a concise, watchable video using a repeatable editing workflow.',
  '1M_EHOiN8ogh0yDVor3cb1ytmOyiGVSNh');
select pg_temp.keypoints('M10',
  'Add the finishing layer that makes short-form content understandable and engaging even when sound is off.',
  '1ZQ0HBPRQUz3uxkHmE4w57gATn2-h9ZFY');
select pg_temp.keypoints('M11',
  'Publish consistently, make content searchable, package it well, and distribute it correctly across platforms.',
  '1gSatiDAY1s3jHug9pAWzF6CqRsOPqhdM');
select pg_temp.keypoints('M12',
  'Turn individual posts into a repeatable improvement system using analytics, audits, and iteration.',
  '1nCDlMpOACIZQP8pUQ69IS_AJb9tuxtz1');

-- ------------------------------------------- Week 1 placeholder extras ----
-- "Niche statement worksheet" and "Content pillar examples" were seed data:
-- both linked to https://pipeops.io and described files that do not exist.
delete from public.learning_materials
 where owner_type = 'week' and url = 'https://pipeops.io';

-- ------------------------------------------------------ course library ----
-- Already present and correctly linked; descriptions now come from the
-- documents themselves, and the outline sorts first.
update public.learning_materials
   set description = 'A structured roadmap from creator mindset and niche discovery to production, publishing and a repeatable growth system — including the Final Course Project.',
       "order" = 1
 where owner_type = 'library' and url like '%1cxkf5-EeDwcZfCRA6LTDK1Fi5xdJdsY7%';

update public.learning_materials
   set description = '10 free websites for creators: fonts, stock images, stock videos, music and sound effects — with a licence note for each.',
       "order" = 2
 where owner_type = 'library' and url like '%1VPfXUE7aQQgsPCiYfJVYCPsinroBaMNT%';

-- ------------------------------------------------------ Week 1 task ----
-- Copy supplied by the programme team, verbatim. Submitted on Discord for now,
-- so it is untracked (see the constraint above).
insert into public.program_tasks (
  week_id, title, brief, submission_types, deadline_at, is_required, status,
  external_submission_url, external_submission_note
)
select w.id,
       'Make a public commitment',
       'Make a public commitment to create and publish at least one piece of content every week for the next six weeks.

You can make your commitment as:
• A short video
• A LinkedIn post
• An X post/thread
• An Instagram post
• A TikTok
• Or another format that works for the platform you use

Tell your audience that you have joined the PipeOps UGC Program and that, for the next six weeks, you are committing to creating and sharing something every week.

It does not need to be complicated or overly polished. We want you to make the commitment publicly and start showing up.',
       '["url"]'::jsonb,
       '2026-09-27 23:59:00+01',
       false,
       'published',
       'https://discord.gg/CsJdJZyfEc',
       'Once your post is live, drop the link in the Week 1 submission channel on Discord.

Please make sure your post is public so other members of the cohort can view and engage with it.

We also encourage you to check the submission channel, support other participants, leave genuine comments, and engage with the work people are putting out.'
  from public.program_weeks w
  join public.cohorts c on c.id = w.cohort_id
 where c.code = 'ugc-01' and w.number = 1
   and not exists (
     select 1 from public.program_tasks t
      where t.week_id = w.id and t.title = 'Make a public commitment');

-- ------------------------------------------------------------ rebuild ----
-- Week membership changed, so week_progress and everything derived from it is
-- rebuilt through the sanctioned path (AGENTS.md section 6). The denominator
-- is unchanged — 14 modules, 12 assignments, and an untracked Week 1 task.
do $$
declare r record;
begin
  for r in
    select e.id from public.enrollments e
      join public.cohorts c on c.id = e.cohort_id
     where c.code = 'ugc-01'
  loop
    perform public.recompute_progress(r.id);
  end loop;
end $$;
