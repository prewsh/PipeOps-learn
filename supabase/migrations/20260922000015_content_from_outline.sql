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
