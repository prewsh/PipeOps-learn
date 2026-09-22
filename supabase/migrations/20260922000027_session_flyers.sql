-- ============================================================================
-- Session flyers.
--
-- A live session is announced with a flyer — speaker, topic, time, laid out as
-- an image the programme team already makes for social. The session row now
-- carries one.
--
-- Stored, not linked. A URL field would have been less work, but the flyers
-- live in the team's design tool and get re-exported; a pasted link rots and
-- takes the session card with it.
--
-- The bucket is private, like `submissions`, and served through short-lived
-- signed URLs (AGENTS.md section 7). Flyers are not secret, but "not secret"
-- is not a reason to open a public bucket path — and a signed URL costs one
-- call on a page that already makes several.
--
-- Only admins write. Participants read flyers for their own cohort's
-- published sessions, which is the same rule the session row itself follows.
-- ============================================================================

alter table public.live_sessions
  add column if not exists flyer_path text;

comment on column public.live_sessions.flyer_path is
  'Object path in the session-flyers bucket. Rendered via a signed URL; never a public path.';

-- ------------------------------------------------------------- bucket ----
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-flyers', 'session-flyers', false,
  5242880,  -- 5 MB; a flyer that does not fit is a poster, not a flyer
  array['image/png', 'image/jpeg', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <cohort_id>/<session_id>/<filename>
create policy "cohort reads session flyers"
  on storage.objects for select
  using (
    bucket_id = 'session-flyers'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = public.my_cohort_id()::text
    )
  );

create policy "admins upload session flyers"
  on storage.objects for insert
  with check (bucket_id = 'session-flyers' and public.is_admin());

create policy "admins replace session flyers"
  on storage.objects for update
  using (bucket_id = 'session-flyers' and public.is_admin());

create policy "admins remove session flyers"
  on storage.objects for delete
  using (bucket_id = 'session-flyers' and public.is_admin());
