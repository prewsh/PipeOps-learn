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
