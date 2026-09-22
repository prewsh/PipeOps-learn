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
