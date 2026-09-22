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
