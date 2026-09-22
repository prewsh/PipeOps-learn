-- ============================================================================
-- Module 01's real assignment, from the workbook PDF in Drive
-- ("Module_01_Understanding_the_Creator_Economy.pdf", PART 1 / ASSESMENTS).
--
-- That file is the ONLY module workbook the Drive API returns. The other 23
-- expected files (modules 02-12, plus KEY POINTS) are not reachable — see the
-- note to the programme team. The remaining assignments are still derived from
-- the module outcomes in the course outline and should be replaced as the real
-- workbooks become available.
-- ============================================================================

update public.assignments a set
  title = 'Why you want to create',
  brief = E'Submit a one-paragraph reflection:\n\n"Why do I want to become a content creator, and which of the four audience motivators do I naturally create best?"\n\nThe four motivators are education, entertainment, inspiration and connection.\n\nBefore you write it, do the in-lesson classwork in the module workbook: list three accounts you follow and which motivator you follow them for, write a two-sentence definition of "content" using the words value, package and audience, and name one creator, one influencer and one brand with the difference between them.',
  text_min = 150,
  text_max = 2000
from public.modules m
where m.id = a.module_id and m.slug = 'creator-economy';

-- The workbook itself, attached to the module it belongs to.
insert into public.learning_materials
  (id, owner_type, owner_id, "order", title, description, type, url, is_required)
select '88888888-0000-0000-0000-000000000020', 'module', m.id, 1,
       'Module 01 workbook',
       'In-lesson classwork and the assignment, as a printable workbook.',
       'pdf', 'https://drive.google.com/file/d/1cV82nI9HMPwbCVslODto9vW8rU0lKxC6/view', false
from public.modules m where m.slug = 'creator-economy'
on conflict (id) do update set url = excluded.url, title = excluded.title;
