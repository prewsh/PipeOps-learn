-- ============================================================================
-- A cover image per week, for the Learn grid.
--
-- Editable from /admin/content like everything else — these are placeholders
-- chosen to reflect each week's subject, not brand assets.
-- ============================================================================

alter table public.program_weeks add column if not exists image_url text;

update public.program_weeks w set image_url = v.url
from (values
  (1, 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=900&q=80&auto=format&fit=crop'),
  (2, 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=900&q=80&auto=format&fit=crop'),
  (3, 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=900&q=80&auto=format&fit=crop'),
  (4, 'https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?w=900&q=80&auto=format&fit=crop'),
  (5, 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=900&q=80&auto=format&fit=crop'),
  (6, 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=900&q=80&auto=format&fit=crop'),
  (7, 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=900&q=80&auto=format&fit=crop')
) as v(number, url)
where w.number = v.number
  and w.cohort_id = '22222222-2222-2222-2222-222222222222';
