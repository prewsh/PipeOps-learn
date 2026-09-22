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
