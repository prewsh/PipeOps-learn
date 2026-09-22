-- ============================================================================
-- Cohort 01 video ids (YouTube unlisted, ADR 0001).
-- Stored as the 11-character video id, never a full URL — the player builds
-- the embed and the id is what the IFrame API takes.
-- ============================================================================

update public.lessons l
   set video_ref = v.ref
  from (values
    ( 1, 'w0EC3Cuw4yo'),
    ( 2, 'YyDKpbX7wXI'),
    ( 3, 'LpB5F9p007g'),
    ( 4, '1dzGFraSW-8'),
    ( 5, 'uTe7WlRnCI0'),
    ( 6, 'YyJG72KfVcw'),
    ( 7, 'eZ8cfJLqDSI'),
    ( 8, 'pRmNCQqR-Jg'),
    ( 9, 'P-bvqj5eylw'),
    (10, '0No7h9s9KBk'),
    (11, 'CSNdWp6vLwE'),
    (12, 'ms-pq3YJtvU')
  ) as v(module_number, ref)
  join public.modules m on m.number = v.module_number
 where l.module_id = m.id and l."order" = 1;
