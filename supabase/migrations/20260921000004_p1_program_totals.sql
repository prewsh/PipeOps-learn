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
