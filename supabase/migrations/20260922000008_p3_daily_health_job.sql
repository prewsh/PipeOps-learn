-- ============================================================================
-- Daily health refresh (PRD F14: "computed daily and on activity").
--
-- Activity-driven recomputation already happens inside recompute_progress, but
-- health also changes through the mere passage of time — someone who stops
-- logging in generates no event to trigger a recompute. This job covers that.
--
-- 05:00 UTC = 06:00 WAT, before the team looks at the dashboard.
-- ============================================================================

create extension if not exists pg_cron with schema extensions;

select cron.unschedule('refresh-cohort-health')
 where exists (select 1 from cron.job where jobname = 'refresh-cohort-health');

select cron.schedule(
  'refresh-cohort-health',
  '0 5 * * *',
  $$ select public.refresh_cohort_health(null); $$
);
