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
