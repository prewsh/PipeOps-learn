-- ============================================================================
-- Private storage for submission files.
--
-- The bucket is private: files are reachable only through short-lived signed
-- URLs (AGENTS.md section 7). Paths are namespaced by enrolment id, and the
-- policies below make a participant's own folder the only one they can touch.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions', 'submissions', false,
  26214400,  -- 25 MB (PRD F7.4)
  array[
    'application/pdf','image/png','image/jpeg','image/webp','video/mp4',
    'video/quicktime','text/plain','text/markdown',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path convention: <enrollment_id>/<submission_id>/<filename>
create policy "participants read own submission files"
  on storage.objects for select
  using (
    bucket_id = 'submissions'
    and (public.is_admin() or (storage.foldername(name))[1] = public.my_enrollment_id()::text)
  );

create policy "participants upload to own folder"
  on storage.objects for insert
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.my_enrollment_id()::text
  );

create policy "participants replace own files"
  on storage.objects for update
  using (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.my_enrollment_id()::text
  );
